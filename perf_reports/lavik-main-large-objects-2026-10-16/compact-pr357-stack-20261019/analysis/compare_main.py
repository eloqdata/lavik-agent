#!/usr/bin/env python3
"""Compare the complete stack run with the published, unchanged main 8 KiB run."""
from pathlib import Path
import argparse
import json
import sys
from analyze import analyze, OPS, PAIRED, sha, require

WORK=Path(__file__).resolve().parent
WORKSPACE=WORK.parents[1]
BASE_REVISION='684894d973878ca0e0649b54404ce77521f1695f'
BASE_REPORT=WORKSPACE/'work/lavik-agent-perf/perf_reports/lavik-main-large-objects-2026-10-16'

def compare(root,baseline_report=BASE_REPORT,write_outputs=True):
    root=Path(root).resolve();baseline_report=Path(baseline_report).resolve()
    current=analyze(root,partial=False,write_outputs=False)
    formal=json.loads((baseline_report/'formal-points.json').read_text())['objects8k_fourdb']
    require(formal['complete'] is True and formal['main_revision']==BASE_REVISION and formal['selected_formal_points']==56,'Published baseline identity differs')
    baseline={p['op']:p for p in formal['points'] if p['product']=='lavik'}
    require(set(baseline)==set(OPS),'Baseline fourteen commands incomplete')
    sums={line.split('  ',1)[1]:line.split('  ',1)[0] for line in (baseline_report/'SHA256SUMS').read_text().splitlines()}
    rows=[]
    for point in current['points']:
        op=point['op'];old=baseline[op];raw_path=baseline_report/old['raw_path']
        require(old['version']==BASE_REVISION and sha(raw_path)==old['source']['sha256']==sums[old['raw_path']],'Baseline raw identity differs: '+op)
        value=json.loads(raw_path.read_text())
        require(value['metrics']==old['metrics'] and value['errors']==0 and value['interrupted'] is False,'Baseline raw metrics differ')
        require(old['connections']==point['connections']==80 and old['keys']==8192 and old['data_shape']==point['shape'],'Baseline/new point dimensions differ')
        new_case=json.loads((root/point['raw_dir']/'case.json').read_text())
        require(new_case['client_binary_sha256']==old['client_binary_sha256'],'Different client binary for '+op)
        before,after=old['metrics']['OPERATIONS'],point['metrics']['OPERATIONS']
        require(all(before[k]>0 for k in ('qps','avg_ms','p999_ms')),'Cannot compare zero baseline')
        rows.append({'op':op,'unit':'pairs/s' if op in PAIRED else 'ops/s','baseline_revision':BASE_REVISION,
                     'stack_revision':point['identity']['revision'],'baseline':before,'stack':after,
                     'change_percent':{k:100*(after[k]/before[k]-1) for k in ('qps','avg_ms','p999_ms')},
                     'baseline_raw_path':old['raw_path'],'baseline_source_sha256':old['source']['sha256'],
                     'stack_raw_path':point['raw_dir']+'/result.json','stack_source_sha256':point['source_sha256'],
                     'same_client_binary_sha256':old['client_binary_sha256']})
    result={'schema_version':1,'complete':True,'experiment':current['experiment'],'points':14,'rows':rows,
            'baseline_report':str(baseline_report),'baseline_formal_sha256':sha(baseline_report/'formal-points.json'),
            'interpretation':'Historical main 684894d and the new stacked candidate are separate runs. Client binaries and workload dimensions match; differences do not isolate PR357 or establish repeat-run variability.'}
    if write_outputs:
        path=root/'baseline-comparison.json';temporary=path.with_suffix('.json.tmp')
        temporary.write_text(json.dumps(result,indent=2)+'\n');temporary.replace(path)
        lines=['# Lavik 8 KiB：历史 main 与叠加版本','',
               '每格为吞吐 / Avg ms / p99.9 ms。组合操作使用 pairs/s，其余使用 ops/s。','',
               '| 命令 | main 684894d | 叠加版本 | 吞吐变化 | Avg 变化 | p99.9 变化 |','|---|---:|---:|---:|---:|---:|']
        for row in rows:
            cells=[row['op']]
            for side in ('baseline','stack'):
                m=row[side];cells.append(f'{m["qps"]:,.1f} / {m["avg_ms"]:.3f} / {m["p999_ms"]:.3f}')
            cells.extend(f'{row["change_percent"][k]:+.1f}%' for k in ('qps','avg_ms','p999_ms'))
            lines.append('| '+' | '.join(cells)+' |')
        lines+=['','这是相同客户端及负载参数下的两次独立测量；基线是此前发布的 main，不能将差异单独归因于 PR357。各点仅测一轮。','']
        (root/'baseline-comparison.md').write_text('\n'.join(lines))
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=WORKSPACE/'outputs/compact-pr357-stack-20261019');p.add_argument('--baseline-report',type=Path,default=BASE_REPORT)
    args=p.parse_args();r=compare(args.root,args.baseline_report);print(json.dumps({'complete':r['complete'],'points':r['points']}))
