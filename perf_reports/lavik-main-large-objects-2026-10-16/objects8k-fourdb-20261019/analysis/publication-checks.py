#!/usr/bin/env python3
"""Offline publication checks; never run a benchmark or change Git content."""
from __future__ import annotations
import argparse
import copy
import importlib.util
import json
import tempfile
from pathlib import Path

WORK=Path(__file__).resolve().parent
SPEC=importlib.util.spec_from_file_location('objects8k_publish_validation',WORK/'publish.py')
p=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(p)


def metadata_subset(old,new,extras):
    p.require(set(new)==set(old)|set(extras),'Unexpected historical metadata keys changed')
    p.require({k:new[k] for k in old}==old,'Historical metadata values changed')


def validate_staged(stage,old):
    stage,old=Path(stage),Path(old)
    sums=p.verify_sums(stage);prior=p.verify_sums(old)
    source,original_source=p.load(stage/'SOURCE.json'),p.load(old/'SOURCE.json')
    formal,original_formal=p.load(stage/'formal-points.json'),p.load(old/'formal-points.json')
    metadata_subset(original_source,source,('objects8k_fourdb','total_selected_formal_points'))
    metadata_subset(original_formal,formal,('objects8k_fourdb','total_selected_points'))
    p.require(source['total_selected_formal_points']==formal['total_selected_points']==115,'Combined point count differs')
    p.require(formal['points']==original_formal['points'] and len(formal['points'])==59,'Historical formal points changed')
    for name,digest in prior.items():
        if name not in p.GENERATED_OLD:p.require(sums.get(name)==digest,'Historical raw file changed: '+name)
    section=source['objects8k_fourdb'];new=formal['objects8k_fourdb']
    p.require(section['main_revision']==new['main_revision']==p.MAIN and section['canonical_main_points']==new['canonical_main_points']==14,'8 KiB main identity/count mismatch')
    rows=new['points'];expected={f'{product}/8k/{op}/c80' for product in p.PRODUCTS for op in p.OPS}
    p.require(len(rows)==56 and {row['id'] for row in rows}==expected,'8 KiB IDs missing or duplicated')
    old_ids={row['id'] for row in formal['points']};p.require(not old_ids&expected,'Dataset ID collision')
    p.require(sum(row['canonical_main'] for row in rows)==14,'Wrong 8 KiB canonical selection')
    for row in rows:
        p.relative_safe(row['raw_path']);raw=p.load(stage/row['raw_path'])
        p.require(row['source']['sha256']==p.sha(stage/row['raw_path']),'Published raw SHA mismatch')
        p.require(row['metrics']==raw['metrics'] and row['data_shape']==raw['data_shape'],'Published row differs from raw')
        p.require(row['conditions']=={'client_threads':16,'formal_seconds':60,'warm_seconds':90,'load_seed':101,'warm_seed':10180,'formal_seed':20180,'pipeline':1,'fresh_per_workload':True},'Published conditions changed')
        for field in ('command_path','warm_command_path'):
            p.relative_safe(row[field]);p.require((stage/row[field]).is_file(),'Missing linked command')
        p.require(row['version']==p.VERSIONS[row['product']],'Published version changed')
        p.require(row['unit']==('pairs/s' if row['op'] in p.PAIRED else 'QPS'),'Pair throughput unit changed')
    for name,digest in section['raw_file_sha256'].items():
        p.require(sums.get(name)==digest,'8 KiB source manifest differs: '+name)
    comparison=stage/section['comparison'];p.require(p.sha(comparison)==section['comparison_sha256'],'Analyzed comparison SHA mismatch')
    p.require(p.sha(stage/p.NAME/'analysis/analyze.py')==section['analysis_sha256'],'Analyzer source SHA mismatch')
    readme=(stage/'README.md').read_text();old_text=(old/'README.md').read_text()
    p.require(old_text.split('\n',1)[1].rstrip() in readme,'Historical prose/table was rewritten')
    p.require(readme.count('## 8 KiB 四库读写对比（2026-10-19）')==1,'Missing/duplicated 8 KiB report section')
    p.require(p.table(rows) in readme,'8 KiB table does not match formal points')
    p.require('{{TABLE}}' not in readme,'Unfilled report template')
    chart=p.load(stage/p.NAME/'chart-receipt.json')
    p.require(chart['complete'] is True and chart['source_sha256']==p.sha(stage/p.NAME/'reviewed_rows.json'),'Published chart source receipt differs')
    p.require(chart['plot_script_sha256']==p.sha(stage/p.NAME/'analysis/plot.py'),'Published chart script differs')
    expected_values={(row['product'],row['op']):(row['metrics']['OPERATIONS']['qps'],row['metrics']['OPERATIONS']['p999_ms'],'pairs/s' if row['op'] in p.PAIRED else 'ops/s') for row in rows}
    p.require(len(chart['values'])==56 and {(v['product'],v['op']):(v['qps'],v['p999_ms'],v['unit']) for v in chart['values']}==expected_values,'Published chart values differ from formal points')
    for name in ('objects8k-reads.svg','objects8k-writes.svg'):
        p.svg(stage/name);p.require(']('+name+')' in readme,'Chart not linked in report')
        p.require(chart['figures'][name]==p.sha(stage/name),'Published chart figure SHA differs')
    for path in stage.rglob('*'):
        if not path.is_file() and not path.is_symlink():continue
        p.require(p.exclusion(path) is None,'Excluded file was staged: '+str(path))
        if path.is_relative_to(stage/p.NAME):p.require('.template.' not in path.name,'Unused template scaffolding was staged')
        p.scan_private(path)
    omissions=p.load(stage/'omitted-state-files.json');previous=p.load(old/'omitted-state-files.json')
    p.require(omissions[:len(previous)]==previous,'Historical omitted-state identities changed')
    for item in omissions[len(previous):]:
        p.require(item['retained_locally'] is True and len(item['sha256'])==64 and item['bytes']>0,'Incomplete omission receipt')
        p.require(not (stage/item['archive_path']).exists(),'Omitted file present in staged archive')
    receipt=p.load(stage/'objects8k-publication-receipt.json')
    p.require(receipt['historical_file_sha256']==prior and receipt['old_SHA256SUMS_sha256']==p.sha(old/'SHA256SUMS'),'Historical checksum receipt differs')
    p.require(receipt['new_points']==56 and receipt['historical_points_preserved']==59 and receipt['combined_points']==115,'Publication receipt counts differ')
    return {'status':'passed','historical_files_preserved':len(prior)-len(p.GENERATED_OLD & prior.keys()),'historical_formal_points':59,'new_formal_points':56,'combined_formal_points':115,'published_files':len(sums)}


def selftest():
    """Small failure fixtures only; do not create synthetic report results."""
    passed=[]
    with tempfile.TemporaryDirectory(prefix='objects8k-publication-checks-') as td:
        d=Path(td);f=d/'raw.json';f.write_text('{"value":1}\n')
        (d/'SHA256SUMS').write_text(p.sha(f)+'  raw.json\n');p.verify_sums(d);passed.append('checksum-valid')
        f.write_text('{"value":2}\n')
        try:p.verify_sums(d)
        except ValueError:passed.append('checksum-reject-mutated-raw')
        else:raise AssertionError('Checksum accepted changed raw')
        p.require(p.exclusion(f) is None,'JSON incorrectly excluded')
        for name,data in [('state-before.bin',b'\0'*16),('chart.png',b'PNG'),('client',b'\x7fELF'+b'\0'*10),('key.txt',b'-----BEGIN '+b'OPENSSH PRIVATE KEY-----\n')]:
            path=d/name;path.write_bytes(data);p.require(p.exclusion(path) is not None,'Unsafe file allowed: '+name)
        passed.append('exclude-state-png-binary-key')
        collection=d/'collection';(collection/'client/clients').mkdir(parents=True);(collection/'server').mkdir()
        template=collection/'client/clients/client-build-manifest.template.json';template.write_text('{"status":"PENDING"}\n')
        final=collection/'client/client-build-manifest.json';final.write_text('{"status":"complete"}\n')
        copied,omitted=p.inventory(collection)
        p.require(p.NAME+'/client/client-build-manifest.json' in copied and len(copied)==1 and len(omitted)==1 and omitted[0]['reason']=='unused template scaffolding','Template exclusion altered authoritative build manifest')
        p.require(template.exists(),'Local template scaffolding was deleted')
        passed.append('omit-unused-template-preserve-real-manifest-and-local-source')
        old={'main_revision':p.OLD_MAIN,'points':[{'id':'lavik/zincr/c80'}]};new=copy.deepcopy(old);new['objects8k_fourdb']={'main_revision':p.MAIN}
        metadata_subset(old,new,('objects8k_fourdb',));passed.append('preserve-historical-metadata')
        new['main_revision']=p.MAIN
        try:metadata_subset(old,new,('objects8k_fourdb',))
        except ValueError:passed.append('reject-historical-relabel')
        else:raise AssertionError('Historical main was silently relabeled')
        bad=d/'comparison.json';p.write(bad,{'schema_version':1,'experiment':p.NAME,'complete':False,'completed_points':4,'expected_points':56,'pending':['remaining'],'points':[]})
        try:p.complete_analysis(d,bad)
        except ValueError:passed.append('reject-partial-56-point-analysis')
        else:raise AssertionError('Partial results accepted for publication')
        for value in ('../escape','/absolute','a/../../escape'):
            try:p.relative_safe(value)
            except ValueError:pass
            else:raise AssertionError('Unsafe path accepted')
        passed.append('reject-path-traversal')
    return {'status':'passed','scope':'Local publication validation fixtures; no synthetic benchmark results or report stage created','tests':passed,'passed':len(passed)}


def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--stage',type=Path);ap.add_argument('--old-report',type=Path,default=p.DEFAULT_OLD);ap.add_argument('--self-test',action='store_true');a=ap.parse_args()
    if a.self_test:result=selftest()
    else:
        if a.stage is None:ap.error('--stage is required unless --self-test')
        result=validate_staged(a.stage.resolve(),a.old_report.resolve())
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
