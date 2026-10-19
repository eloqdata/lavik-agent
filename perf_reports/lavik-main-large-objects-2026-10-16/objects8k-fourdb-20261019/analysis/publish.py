#!/usr/bin/env python3
"""Stage the completed 56-point 8 KiB report without changing a Git checkout.

Default is read-only validation/dry-run. --stage must name a NEW directory under
this workspace's outputs/. Historical raw files and dataset identities stay intact.
"""
from __future__ import annotations
import argparse
import copy
import datetime as dt
import hashlib
import importlib.util
import json
import re
import shutil
import sys
from pathlib import Path, PurePosixPath
import xml.etree.ElementTree as ET

WORK=Path(__file__).resolve().parent
WORKSPACE=WORK.parents[1]
NAME='objects8k-fourdb-20261019'
REPORT_NAME='lavik-main-large-objects-2026-10-16'
DEFAULT_OLD=WORKSPACE/'work/lavik-agent-perf/perf_reports'/REPORT_NAME
DEFAULT_RAW=WORKSPACE/'outputs'/NAME
MAIN='684894d973878ca0e0649b54404ce77521f1695f'
OLD_MAIN='9c68079a7dd775db647cf55fe578a6cd43426a82'
PRODUCTS=('lavik','redis','valkey','kvrocks')
VERSIONS={'lavik':MAIN,'redis':'8.10.2','valkey':'9.1.2','kvrocks':'2.17.0'}
OPS=('hgetall','hkeys','hvals','smembers','lrange','zrange','set','setrange','hash','list','zincr','zswap','stream','sswap')
PAIRED={'list','zswap','sswap'}
COMMANDS={'hgetall':'HGETALL','hkeys':'HKEYS','hvals':'HVALS','smembers':'SMEMBERS','lrange':'LRANGE','zrange':'ZRANGE WITHSCORES','set':'SET 8 KiB','setrange':'SETRANGE 256 B','hash':'HSET 256 B','list':'LPUSH/RPOP','zincr':'ZINCRBY','zswap':'ZREM/ZADD','stream':'XADD MAXLEN = 32','sswap':'SADD/SREM'}
GENERATED_OLD={'README.md','SOURCE.json','formal-points.json','SHA256SUMS','omitted-state-files.json'}
PRIVATE_HEADERS=tuple(b'-----BEGIN '+kind+b'-----' for kind in (b'OPENSSH PRIVATE KEY',b'RSA PRIVATE KEY',b'EC PRIVATE KEY',b'PRIVATE KEY',b'ENCRYPTED PRIVATE KEY'))
BINARY_MAGIC=(b'\x7fELF',b'\xfe\xed\xfa\xce',b'\xce\xfa\xed\xfe',b'\xfe\xed\xfa\xcf',b'\xcf\xfa\xed\xfe',b'\xca\xfe\xba\xbe')
TEXT_EXTENSIONS={'.json','.jsonl','.log','.py','.cpp','.h','.md','.txt','.conf','.xml','.patch','.svg','.sha256'}
MARKERS={'COMPLETE','STARTED','LAVIK_COMPLETE','PEERS_COMPLETE','LAVIK_STARTED','PEERS_STARTED','BUILD_COMPLETE','TESTS_COMPLETE','CLIENT_TESTS_COMPLETE','MEASUREMENTS_COMPLETE','FORMAL_COMPLETE'}


def require(ok,msg):
    if not ok:raise ValueError(msg)

def sha(path):
    with Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def load(path):return json.loads(Path(path).read_text())
def write(path,obj):Path(path).write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n')

def relative_safe(name):
    p=PurePosixPath(name)
    require(not p.is_absolute() and '..' not in p.parts and name not in ('','.'),'Unsafe relative path: '+name)
    return p

def verify_sums(root):
    root=Path(root);sums={}
    for line in (root/'SHA256SUMS').read_text().splitlines():
        m=re.fullmatch(r'([0-9a-f]{64})  (.+)',line)
        require(m is not None,'Malformed SHA256SUMS entry')
        digest,name=m.groups();relative_safe(name)
        require(name not in sums,'Duplicate checksum: '+name)
        p=root/name;require(p.is_file() and not p.is_symlink(),'Missing/linked historical file: '+name)
        require(sha(p)==digest,'Historical checksum mismatch: '+name);sums[name]=digest
    actual={p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() and p.name!='SHA256SUMS'}
    require(actual==set(sums),'Historical manifest has missing/unlisted files')
    require(not any(p.is_symlink() for p in root.rglob('*')),'Historical archive contains symlinks')
    return sums

def exclusion(path):
    p=Path(path);name=p.name.lower();parts={x.lower() for x in p.parts}
    if p.is_symlink():return 'symlink'
    if parts & {'.git','.ssh','keys','__pycache__'} or name in {'id_ed25519','id_rsa','server-control'}:return 'private or internal file'
    if p.suffix.lower()=='.png':return 'PNG duplicate'
    if p.suffix.lower()=='.bin':return 'binary state' if 'state' in name or 'states' in parts else 'binary payload'
    if p.suffix.lower() in {'.gz','.tar','.zip','.a','.o','.so','.dylib','.exe','.pyc'}:return 'binary/archive'
    with p.open('rb') as f:head=f.read(4096)
    if head.startswith(BINARY_MAGIC) or head[:2]==b'MZ':return 'executable binary'
    if any(marker in head for marker in PRIVATE_HEADERS):return 'private key'
    return None

def scan_private(path):
    # Detect key material without ever returning its contents in an error.
    tail=b''
    with Path(path).open('rb') as f:
        while chunk:=f.read(1024*1024):
            data=tail+chunk
            require(not any(marker in data for marker in PRIVATE_HEADERS),'Private key material detected: '+str(path))
            tail=data[-64:]

def inventory(raw):
    included={};omitted=[]
    for side in ('client','server'):
        directory=raw/side;require(directory.is_dir(),'Missing final collection: '+str(directory))
        for path in sorted(directory.rglob('*')):
            if not path.is_file() and not path.is_symlink():continue
            rel=path.relative_to(raw).as_posix();reason=exclusion(path) or ('unused template scaffolding' if '.template.' in path.name else None)
            if reason:
                if path.is_file() and not path.is_symlink():omitted.append({'source':str(path.relative_to(WORKSPACE)) if path.is_relative_to(WORKSPACE) else str(path),'archive_path':NAME+'/'+rel,'sha256':sha(path),'bytes':path.stat().st_size,'reason':reason,'retained_locally':True})
                continue
            require(path.suffix in TEXT_EXTENSIONS or path.name in MARKERS,'Unexpected archive file type: '+rel)
            scan_private(path);included[NAME+'/'+rel]=path
    return included,omitted

def svg(path):
    require(path.is_file(),'Missing final chart: '+str(path));scan_private(path)
    tree=ET.parse(path);root=tree.getroot();require(root.tag.endswith('svg'),'Not SVG: '+str(path))
    require(not any(e.tag.rsplit('}',1)[-1] in ('script','foreignObject') for e in root.iter()),'Unexpected active SVG content')
    for e in root.iter():
        for key,value in e.attrib.items():
            if key.rsplit('}',1)[-1]=='href':require(not value.startswith(('http:','https:','file:','data:')),'External/embedded SVG resource')

def chart_provenance(raw,charts,analysis):
    receipt_path=charts/'chart-receipt.json';reviewed_path=raw/'reviewed_rows.json'
    receipt=load(receipt_path);reviewed=load(reviewed_path)
    require(receipt.get('complete') is True and reviewed.get('complete') is True,'Incomplete chart source/receipt')
    require(receipt['source_sha256']==sha(reviewed_path),'Chart source SHA differs')
    require(receipt['plot_script_sha256']==sha(WORK/'plot.py'),'Chart script changed since rendering')
    expected={(row['product'],row['op']):{'product':row['product'],'op':row['op'],'qps':row['metrics']['OPERATIONS']['qps'],'p999_ms':row['metrics']['OPERATIONS']['p999_ms'],'unit':row['unit']} for row in analysis['points']}
    require(len(receipt['values'])==56 and {(v['product'],v['op']):v for v in receipt['values']}==expected,'Chart plotted values differ from analyzed OPERATIONS')
    require(reviewed.get('completed_points')==56 and len(reviewed.get('rows',[]))==56,'Chart reviewed rows incomplete')
    for row in reviewed['rows']:
        require({key:row[key] for key in ('product','op','qps','p999_ms','unit')}==expected[(row['product'],row['op'])],'Reviewed chart values differ')
    require(set(receipt['figures'])=={'objects8k-reads.svg','objects8k-writes.svg'},'Unexpected chart file set')
    for name,digest in receipt['figures'].items():
        svg(charts/name);require(sha(charts/name)==digest,'Chart SVG differs from receipt: '+name)
    return receipt_path,reviewed_path


def complete_analysis(raw,comparison):
    """Schema integration completed against the analyzer's final contract below."""
    data=load(comparison)
    require(data.get('experiment')==NAME and data.get('schema_version')==1,'Unexpected analysis schema/experiment')
    require(data.get('complete') is True and data.get('completed_points')==56 and data.get('expected_points')==56 and data.get('pending')==[],'56-point analysis is incomplete')
    spec=importlib.util.spec_from_file_location('objects8k_analysis_before_publication',WORK/'analyze.py')
    analyzer=importlib.util.module_from_spec(spec);spec.loader.exec_module(analyzer)
    validated=analyzer.analyze(raw,partial=False,write_outputs=False)
    require(validated==data,'Saved comparison differs from a fresh read-only analysis')
    points=data['points']
    require(isinstance(points,list) and len(points)==56,'Expected all 56 completed 8 KiB points')
    require({(p['product'],p['op']) for p in points}=={(p,o) for p in PRODUCTS for o in OPS},'Missing/duplicate product/workload points')
    rows=[]
    for p in points:
        product,op=p['product'],p['op'];label=f'{product}-{op}-c80';relative=f'client/results/{label}'
        require(p['label']==label and p['raw_dir']==relative,'Unexpected point raw path '+label)
        d=raw/relative;require((d/'COMPLETE').is_file(),'Incomplete formal point '+label)
        value=load(d/'result.json');case=load(d/'case.json');command=load(d/'command.json');family=load(raw/'client/families'/f'{product}-{op}.json')
        require(family.get('state')=='complete','Family not complete '+label)
        require(value['errors']==0 and value['interrupted'] is False and value['test_mode'] is False,'Invalid formal point '+label)
        require(value['op']==op and value['phase']=='run' and value['keys']==8192 and value['connections']==80 and value['threads']==16 and value['pipeline']==1 and value['seed']==20180,'Formal dimensions differ '+label)
        require(value['data_shape']['logical_payload_bytes']==8192,'Not an 8 KiB point '+label)
        require(p['metrics']==value['metrics'],'Analyzed/raw metrics differ '+label)
        active=case['active'];expected_version=VERSIONS[product]
        require(str(active['revision'])==expected_version,'Unexpected database identity '+label)
        require(p['identity']['revision']==active['revision'] and p['identity']['version']==active['version'] and p['identity']['binary_sha256']==active['binary_sha256'],'Analysis/raw database identity differs '+label)
        require(set(p['observations'])=={'server','client'} and p.get('validation'),'Missing observation/validation summary '+label)
        counts=load(d/'command-counts.json');require(counts['matched'] is True and counts['expected']==counts['observed'],'Command/reply reconciliation failed '+label)
        require(p['source_sha256']==sha(d/'result.json'),'Result SHA differs '+label)
        result_path=NAME+'/'+relative+'/result.json'
        measured=dt.datetime.fromtimestamp(load(d/'timing.json')['start'],dt.timezone.utc).isoformat()
        rows.append({'id':f'{product}/8k/{op}/c80','dataset':NAME,'canonical_main':product=='lavik','role':'canonical-main-8k' if product=='lavik' else 'peer-8k','product':product,'version':expected_version,'op':op,'command':COMMANDS[op],'connections':80,'keys':8192,'unit':'pairs/s' if op in PAIRED else 'QPS','measured_at_utc':measured,'elapsed_seconds':value['elapsed_seconds'],'data_shape':value['data_shape'],'metrics':value['metrics'],'conditions':{'client_threads':16,'formal_seconds':60,'warm_seconds':90,'load_seed':101,'warm_seed':10180,'formal_seed':20180,'pipeline':1,'fresh_per_workload':True},'raw_path':result_path,'command_path':NAME+'/'+relative+'/command.json','warm_command_path':NAME+f'/client/results/{product}-{op}-warm/command.json','source':{'suite':NAME,'path':str((d/'result.json').relative_to(WORKSPACE)) if d.is_relative_to(WORKSPACE) else str(d/'result.json'),'sha256':sha(d/'result.json')},'binary_sha256':case['binary_sha256'],'client_binary_sha256':case['client_binary_sha256'],'observations':p.get('observations',{}),'analysis_label':p.get('label',label)})
    return data,rows

def validate_old(old):
    sums=verify_sums(old);source=load(old/'SOURCE.json');formal=load(old/'formal-points.json')
    require(source['main_revision']==OLD_MAIN and source['canonical_main_points']==20 and source['selected_formal_points']==59,'Historical SOURCE identity/count changed')
    require(formal['canonical_main_revision']==OLD_MAIN and formal['canonical_main_points']==20 and formal['selected_points']==59 and len(formal['points'])==59,'Historical formal points changed')
    require(not source.get('objects8k_fourdb') and not formal.get('objects8k_fourdb'),'8 KiB section already exists; do not duplicate publication')
    for name in sums:
        reason=exclusion(old/name);require(reason is None,'Historical file conflicts with publication exclusions: '+name)
        scan_private(old/name)
    return sums,source,formal

def table(rows):
    lookup={(p['product'],p['op']):p['metrics']['OPERATIONS'] for p in rows}
    lines=['| 命令 | Lavik main `684894d` | Redis 8.10.2 | Valkey 9.1.2 | Kvrocks 2.17.0 |','|---|---:|---:|---:|---:|']
    for op in OPS:
        cells=[]
        for product in PRODUCTS:
            m=lookup[(product,op)];cells.append(f'{m["qps"]:,.1f} / {m["avg_ms"]:.3f} / {m["p999_ms"]:.3f}')
        lines.append('| '+COMMANDS[op]+' | '+' | '.join(cells)+' |')
    return '\n'.join(lines)

def render_readme(old_text,rows):
    first,rest=old_text.split('\n',1)
    require(first=='# Lavik main：1 MiB 大对象测试结果','Unexpected old report title')
    introduction='# Lavik main：1 MiB 与 8 KiB 对象测试结果\n\n下面保留 2026-10-18 的 1 MiB 测量；文末追加 2026-10-19 的独立 8 KiB 四库测试。两个数据集的 main 提交分别标识。\n'
    section=(WORK/'report-template.md').read_text();require(section.count('{{TABLE}}')==1,'Invalid report template')
    return introduction+rest.rstrip()+'\n\n'+section.replace('{{TABLE}}',table(rows))

def make_plan(old,raw,comparison,charts):
    old_sums,source,formal=validate_old(old)
    analysis,rows=complete_analysis(raw,comparison)
    chart_receipt,reviewed=chart_provenance(raw,charts,analysis)
    included,omitted=inventory(raw)
    for required in ('client/client-build-manifest.json','client/linux-client-tests.json','client/runtime-interface.md','client/clients/client-interface.md','client/clients/test_clients.py','client/clients/source-manifest.json','client/clients/bench8k.h'):
        require(NAME+'/'+required in included,'Missing publication provenance: '+required)
    build=load(raw/'client/client-build-manifest.json');tests=load(raw/'client/linux-client-tests.json')
    require(tests.get('status')=='passed' and tests.get('passed')==41 and len(tests.get('tests',[]))==41,'Missing 41-pass Linux client receipt')
    require(tests.get('platform','').startswith('Linux'),'Client receipt is not Linux execution')
    for name,identity in build['clients'].items():
        p=raw/'client/clients'/f'{name}.cpp';require(sha(p)==identity['source_sha256']==tests['source_sha256'][name+'.cpp'],'Client source provenance mismatch')
        require(identity['binary_sha256']==tests['binary_sha256'][name],'Client binary provenance mismatch')
    require(sha(raw/'client/clients/bench8k.h')==build['shared_headers']['bench8k.h']==tests['source_sha256']['bench8k.h'],'Client header provenance mismatch')
    require(sha(raw/'client/clients/interface.py')==build['interface_sha256'],'Client interface provenance mismatch')
    require(sha(raw/'client/clients/test_clients.py')==build['test_script_sha256'],'Client tests provenance mismatch')
    require(sha(raw/'client/linux-client-tests.json')==build['linux_test_receipt']['sha256'],'Linux receipt SHA mismatch')
    included[NAME+'/comparison.json']=comparison
    included[NAME+'/chart-receipt.json']=chart_receipt
    included[NAME+'/reviewed_rows.json']=reviewed
    for name in ('collection-inventory.json',):
        if (raw/name).is_file():included[NAME+'/'+name]=raw/name
    for name in ('analyze.py','publish.py','publication-checks.py','report-template.md','plot.py'):
        require((WORK/name).is_file(),'Missing analysis/publication source '+name);included[NAME+'/analysis/'+name]=WORK/name
    for name in ('analysis_checks.py','local-controller-tests.json','audit-first.json'):
        path=raw/name if (raw/name).is_file() else WORK/name
        if path.is_file():included[NAME+'/analysis/'+name]=path
    for name in ('objects8k-reads.svg','objects8k-writes.svg'):
        svg(charts/name);included[name]=charts/name
    hashes={name:sha(path) for name,path in included.items()}
    section={'schema_version':1,'complete':True,'experiment':NAME,'main_revision':MAIN,'versions':VERSIONS,'selected_formal_points':56,'canonical_main_points':14,'points_by_product':dict.fromkeys(PRODUCTS,14),'objects_per_point':8192,'logical_payload_bytes_per_key':8192,'source_directory':NAME,'comparison':NAME+'/comparison.json','analysis_sha256':sha(WORK/'analyze.py'),'comparison_sha256':sha(comparison),'measurement_dates_utc':{row['id']:row['measured_at_utc'] for row in rows},'canonical_selection':'Only these 14 8 KiB Lavik points identify main 684894d; historical 1 MiB points retain main 9c68079.','raw_file_sha256':{k:v for k,v in hashes.items() if k.startswith(NAME+'/')}}
    new_source=copy.deepcopy(source);new_source['objects8k_fourdb']=section;new_source['total_selected_formal_points']=115
    new_formal=copy.deepcopy(formal);new_formal['objects8k_fourdb']={k:section[k] for k in ('schema_version','complete','experiment','main_revision','canonical_main_points','selected_formal_points','versions','canonical_selection')};new_formal['objects8k_fourdb']['points']=rows;new_formal['total_selected_points']=115
    old_omitted=load(old/'omitted-state-files.json')
    return {'old_sums':old_sums,'included':included,'hashes':hashes,'omitted':omitted,'source':new_source,'formal':new_formal,'omitted_listing':old_omitted+omitted,'readme':render_readme((old/'README.md').read_text(),rows),'rows':rows}

def stage(plan,old,destination):
    destination=Path(destination).resolve();outputs=(WORKSPACE/'outputs').resolve()
    require(destination.is_relative_to(outputs) and destination!=outputs,'Stage must be a new directory below workspace outputs/')
    require(not destination.exists(),'Stage destination already exists')
    require(not any((p/'.git').exists() for p in (destination,*destination.parents) if p!=WORKSPACE.parent),'Stage cannot be inside a Git checkout')
    destination.mkdir(parents=True)
    try:
        for name,digest in plan['old_sums'].items():
            target=destination/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(old/name,target)
            require(sha(target)==digest,'Historical copy mismatch '+name)
        for name,source in plan['included'].items():
            target=destination/name;require(not target.exists(),'New archive path collides with old file '+name)
            target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
            require(sha(target)==plan['hashes'][name],'New source changed while staging '+name)
        (destination/'README.md').write_text(plan['readme'])
        write(destination/'SOURCE.json',plan['source']);write(destination/'formal-points.json',plan['formal']);write(destination/'omitted-state-files.json',plan['omitted_listing'])
        receipt={'schema_version':1,'complete':True,'old_report':str(old),'old_SHA256SUMS_sha256':sha(old/'SHA256SUMS'),'historical_file_count':len(plan['old_sums']),'historical_file_sha256':plan['old_sums'],'historical_metadata_fields_preserved':True,'historical_points_preserved':59,'new_points':56,'combined_points':115,'new_ids':[p['id'] for p in plan['rows']],'omitted_files':len(plan['omitted']),'new_file_sha256':plan['hashes']}
        write(destination/'objects8k-publication-receipt.json',receipt)
        lines=[f'{sha(p)}  {p.relative_to(destination).as_posix()}' for p in sorted(destination.rglob('*')) if p.is_file() and p.name!='SHA256SUMS']
        (destination/'SHA256SUMS').write_text('\n'.join(lines)+'\n')
        check=load_checks();check.validate_staged(destination,old)
    except Exception:
        # Retain a failed stage for diagnosis; never replace or delete user content.
        raise
    return destination

def load_checks():
    spec=importlib.util.spec_from_file_location('objects8k_publication_checks',WORK/'publication-checks.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod);return mod

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--old-report',type=Path,default=DEFAULT_OLD);ap.add_argument('--raw-root',type=Path,default=DEFAULT_RAW);ap.add_argument('--comparison',type=Path);ap.add_argument('--charts',type=Path,default=DEFAULT_RAW);ap.add_argument('--stage',type=Path)
    a=ap.parse_args();old=a.old_report.resolve();raw=a.raw_root.resolve();comparison=(a.comparison or raw/'comparison.json').resolve()
    plan=make_plan(old,raw,comparison,a.charts.resolve())
    result={'mode':'dry-run','historical_files_verified':len(plan['old_sums']),'historical_points_preserved':59,'new_complete_points':56,'new_files':len(plan['included']),'omitted_files':len(plan['omitted']),'target_report':REPORT_NAME}
    if a.stage:result.update(mode='staged',path=str(stage(plan,old,a.stage)))
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
