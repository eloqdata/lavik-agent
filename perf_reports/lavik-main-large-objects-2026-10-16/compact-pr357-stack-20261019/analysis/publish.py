#!/usr/bin/env python3
"""Read-only validation by default; append fourteen real stacked Lavik points in a new stage.

--stage must name a new directory beneath workspace outputs/. This tool never
edits a repository or accesses a remote host. Existing 123 points stay intact.
"""
from __future__ import annotations
import argparse
import copy
import datetime as dt
import hashlib
import importlib.util
import json
import math
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path, PurePosixPath
import xml.etree.ElementTree as ET

WORK=Path(__file__).resolve().parent
WORKSPACE=WORK.parents[1]
NAME='compact-pr357-stack-20261019'
REPORT_NAME='lavik-main-large-objects-2026-10-16'
DEFAULT_OLD=WORKSPACE/'work/lavik-agent-perf/perf_reports'/REPORT_NAME
DEFAULT_RAW=WORKSPACE/'outputs'/NAME
SECTION='compact_pr357_stack'
OLD_MAIN='9c68079a7dd775db647cf55fe578a6cd43426a82'
MAIN='684894d973878ca0e0649b54404ce77521f1695f'
STACK='d0084f4a9a869e38ab91ecef6291a89483940123'
COMMANDS={'hgetall':'HGETALL','hkeys':'HKEYS','hvals':'HVALS','smembers':'SMEMBERS','lrange':'LRANGE','zrange':'ZRANGE WITHSCORES','set':'SET','setrange':'SETRANGE','hash':'HSET','list':'LPUSH/RPOP','zincr':'ZINCRBY','zswap':'ZREM/ZADD','stream':'XADD MAXLEN','sswap':'SADD/SREM'}
GENERATED_OLD={'README.md','SOURCE.json','formal-points.json','SHA256SUMS','omitted-state-files.json'}
PRIVATE_HEADERS=tuple(b'-----BEGIN '+kind+b'-----' for kind in (b'OPENSSH PRIVATE KEY',b'RSA PRIVATE KEY',b'EC PRIVATE KEY',b'PRIVATE KEY',b'ENCRYPTED PRIVATE KEY'))
BINARY_MAGIC=(b'\x7fELF',b'\xfe\xed\xfa\xce',b'\xce\xfa\xed\xfe',b'\xfe\xed\xfa\xcf',b'\xcf\xfa\xed\xfe',b'\xca\xfe\xba\xbe')
TEXT_EXTENSIONS={'.json','.jsonl','.log','.py','.cpp','.h','.md','.txt','.conf','.xml','.patch','.svg','.sha256','.stdout','.stderr'}
MARKERS={'COMPLETE','STARTED','BUILD_COMPLETE','TESTS_COMPLETE','CLIENT_TESTS_COMPLETE','MEASUREMENTS_COMPLETE','FORMAL_COMPLETE','LAVIK_COMPLETE','LAVIK_STARTED'}

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
            rel=path.relative_to(raw).as_posix();reason=exclusion(path) or ('unused template scaffolding' if '.template.' in path.name else None) or ('temporary file' if path.suffix in {'.tmp', '.partial'} or path.name.endswith('~') else None)
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
            local=key.rsplit('}',1)[-1]
            require(not local.lower().startswith('on'),'Active SVG event handler')
            if local=='href':require(value.startswith('#'),'External/embedded SVG resource')


def validate_old(old):
    sums=verify_sums(old);source=load(old/'SOURCE.json');formal=load(old/'formal-points.json')
    require(source['main_revision']==formal['canonical_main_revision']==OLD_MAIN,'Historical main identity differs')
    require(source['selected_formal_points']==formal['selected_points']==len(formal['points'])==59,'Historical 1 MiB point count differs')
    require(source['objects8k_fourdb']['main_revision']==formal['objects8k_fourdb']['main_revision']==MAIN and len(formal['objects8k_fourdb']['points'])==56,'Published four-database 8 KiB points differ')
    require(source['zset_opt_crossover']['selected_formal_points']==len(formal['zset_opt_crossover']['points'])==8,'Published crossover points differ')
    require(source['total_selected_formal_points']==formal['total_selected_points']==123,'Expected existing 123-point report')
    require(SECTION not in source and SECTION not in formal,'Stack section already exists')
    ids=[p['id'] for p in formal['points']+formal['objects8k_fourdb']['points']+formal['zset_opt_crossover']['points']]
    require(len(set(ids))==123,'Historical point ID collision')
    for name in sums:
        require(exclusion(old/name) is None,'Historical file conflicts with exclusions: '+name);scan_private(old/name)
    return sums,source,formal


def complete_analysis(raw,old):
    data=load(raw/'comparison.json')
    require(data.get('experiment')==NAME and data.get('complete') is True and data.get('completed_points')==data.get('expected_points')==14 and data.get('pending')==[],'All fourteen real points are required')
    require(len(data['points'])==14 and {p['op'] for p in data['points']}==set(COMMANDS),'Incomplete or duplicate commands')
    code='import json,sys; from pathlib import Path; import analyze,compare_main; r=Path(sys.argv[1]); print(json.dumps({"analysis":analyze.analyze(r,partial=False,write_outputs=False),"comparison":compare_main.compare(r,Path(sys.argv[2]),write_outputs=False)}))'
    process=subprocess.run([sys.executable,'-B','-c',code,str(raw),str(old)],cwd=WORK,text=True,capture_output=True,check=True)
    verified=json.loads(process.stdout)
    require(data==verified['analysis'],'Saved stack analysis differs from fresh offline audit')
    compared=load(raw/'baseline-comparison.json')
    require(compared==verified['comparison'],'Saved historical-main comparison differs from fresh audit')
    rows=[]
    for point in data['points']:
        op=point['op'];directory=raw/point['raw_dir'];case=load(directory/'case.json')
        require(point['product']=='lavik' and point['identity']['revision']==STACK and point['connections']==80 and point['errors']==0,'Point identity differs')
        require(point['source_sha256']==sha(directory/'result.json'),'Raw source SHA differs')
        rows.append({'id':f'lavik/pr358-pr357/8k/{op}/c80','dataset':NAME,'role':'stacked-candidate-8k',
            'product':'lavik','revision':STACK,'pull_requests':[358,357],'op':op,'command':COMMANDS[op],
            'connections':80,'keys':8192,'data_shape':point['shape'],'unit':point['unit'],
            'measured_at_utc':dt.datetime.fromtimestamp(point['timing']['start'],dt.timezone.utc).isoformat(),
            'elapsed_seconds':point['elapsed_seconds'],'metrics':point['metrics'],
            'raw_path':NAME+'/'+point['raw_dir']+'/result.json','command_path':NAME+'/'+point['raw_dir']+'/command.json',
            'source_sha256':point['source_sha256'],'binary_sha256':point['identity']['binary_sha256'],
            'client_binary_sha256':case['client_binary_sha256'],'observations':point['observations'],
            'conditions':{'fresh_per_workload':True,'warm_seconds':90,'formal_seconds':60,'client_threads':16,
                          'pipeline':1,'load_seed':101,'warm_seed':10180,'formal_seed':20180}})
    return data,compared,rows


def cpu_comparison(raw,old,analysis):
    """Recompute process CPU from raw /proc ticks, independent of display values."""
    previous={p['op']:p for p in load(old/'formal-points.json')['objects8k_fourdb']['points'] if p['product']=='lavik'}
    def measure(path):
        records=[json.loads(line) for line in path.read_text().splitlines() if line.strip()]
        metadata=[row for row in records if row.get('event')=='metadata']
        samples=[row for row in records if row.get('event')=='sample']
        require(len(metadata)==1 and len(samples)>=2,'CPU observation metadata/samples missing')
        first,last=samples[0],samples[-1];hz=metadata[0]['clock_ticks_per_second']
        a,b=first['process_stat_fields'],last['process_stat_fields']
        require(first['pid']==last['pid'] and a['start_ticks']==b['start_ticks'],'CPU process identity changed')
        elapsed=(last['monotonic_ns']-first['monotonic_ns'])/1e9
        require(44<=elapsed<=55 and hz>0,'Invalid CPU observation window')
        user=(b['utime_ticks']-a['utime_ticks'])/hz;system=(b['stime_ticks']-a['stime_ticks'])/hz
        require(user>=0 and system>=0,'CPU counter decreased')
        return {'elapsed_seconds':elapsed,'user_seconds':user,'system_seconds':system,
                'process_cpu_seconds':user+system,'mean_cpu_cores':(user+system)/elapsed,
                'source_sha256':sha(path)}
    rows=[]
    for point in analysis['points']:
        op=point['op'];relative='server/observations/'+point['label']+'/monitor.jsonl'
        baseline_path='objects8k-fourdb-20261019/'+relative
        before,after=measure(old/baseline_path),measure(raw/relative)
        require(math.isclose(before['mean_cpu_cores'],previous[op]['observations']['server']['cpu_cores'],abs_tol=1e-12)
                and math.isclose(after['mean_cpu_cores'],point['observations']['server']['cpu_cores'],abs_tol=1e-12),'Recomputed CPU differs from checked observations')
        rows.append({'op':op,'baseline':dict(before,raw_path=baseline_path),
                     'stack':dict(after,raw_path=NAME+'/'+relative),
                     'change_percent':100*(after['mean_cpu_cores']/before['mean_cpu_cores']-1)})
    require(len(rows)==14,'CPU comparison requires fourteen points')
    return {'complete':True,'experiment':NAME,'points':14,'rows':rows,'nominal_observation_seconds':45,
            'formula':'(delta process utime + delta process stime) / clock ticks per second / monotonic elapsed seconds',
            'scope':'Whole server process, including SPDK polling; this is not a measurement of useful-work CPU alone.'}


def brief_findings(compared,cpu):
    rows={r['op']:r for r in compared['rows']};usage={r['op']:r for r in cpu['rows']}
    changes=[r['change_percent']['qps'] for r in compared['rows']]
    lines=[f'本轮吞吐未显示明显的整体提升：十四项变化范围为 **{min(changes):+.1f}%～{max(changes):+.1f}%**。'
           '各点仅一轮，不能据此确认这些小幅差异是真实收益或回退。']
    pieces=[]
    for op in ('zswap','sswap'):
        delta=rows[op]['change_percent']
        pieces.append(f'{COMMANDS[op]} 吞吐 {delta["qps"]:+.1f}%、p99.9 {delta["p999_ms"]:+.1f}%')
    r=rows['setrange']
    pieces.append(f'SETRANGE 吞吐 {r["change_percent"]["qps"]:+.1f}%，但 p99.9 从 {r["baseline"]["p999_ms"]:.3f} 增至 {r["stack"]["p999_ms"]:.3f} ms（{r["change_percent"]["p999_ms"]:+.1f}%）')
    pieces.append(f'XADD MAXLEN 的 p99.9 为 {rows["stream"]["change_percent"]["p999_ms"]:+.1f}%，ZINCRBY 为 {rows["zincr"]["change_percent"]["p999_ms"]:+.1f}%')
    lines.append('本轮观测中，'+'；'.join(pieces)+'。')
    cpu_pieces=[]
    for op in ('setrange','zincr','zswap','sswap'):
        row=usage[op]
        cpu_pieces.append(f'{COMMANDS[op]} **{row["baseline"]["mean_cpu_cores"]:.2f}→{row["stack"]["mean_cpu_cores"]:.2f} 核**（{row["change_percent"]:+.1f}%）')
    lines.append('正式测量期间各自 45 秒观测窗口内，服务端进程的平均 CPU 占用下降：'+'；'.join(cpu_pieces)+'，其余项接近持平。'
                 '这里统计整个进程的 CPU 时间，包含 SPDK 轮询，不能等同于纯有效工作所消耗的 CPU。'
                 f'逐项原始路径、计算窗口和 SHA 见 [cpu-comparison.json]({NAME}/cpu-comparison.json)。')
    return '\n\n'.join(lines)


def report_section(compared,rows,cpu):
    dates=sorted({row['measured_at_utc'][:10] for row in rows})
    lines=['## PR #358 + #357：8 KiB 全部读写命令','',
        f'测量日期（UTC）：{", ".join(dates)}。在 [#358](https://github.com/eloqdata/lavik/pull/358) 的 `001442e8` 上叠加 [#357](https://github.com/eloqdata/lavik/pull/357) 的 `48ca16c`，实际测试提交为 **`d0084f4a`**。本节为独立的十四点测试，不覆盖上面的历史数据。','',
        '每项均为 8,192 keys、每 key 8 KiB 逻辑数据、80 连接；预热 90 秒，正式 60 秒，各一轮。复用此前四库实验的全部客户端二进制、随机种子及统计方法；每项清库后独立装载。','',
        '下表每格为 **吞吐 / Avg ms / p99.9 ms**。LPUSH/RPOP、ZREM/ZADD、SADD/SREM 的吞吐使用完整 **pairs/s**，其余使用 **ops/s**；成对命令的延迟也按完整 pair 统计。','',
        '| 命令 | 历史 main `684894d` | #358 + #357 `d0084f4a` | 吞吐变化 | Avg 变化 | p99.9 变化 |',
        '|---|---:|---:|---:|---:|---:|']
    for row in compared['rows']:
        cells=[COMMANDS[row['op']]]
        for side in ('baseline','stack'):
            metric=row[side];cells.append(f'{metric["qps"]:,.1f} / {metric["avg_ms"]:.3f} / {metric["p999_ms"]:.3f}')
        cells.extend(f'{row["change_percent"][key]:+.1f}%' for key in ('qps','avg_ms','p999_ms'))
        lines.append('| '+' | '.join(cells)+' |')
    lines+=['',brief_findings(compared,cpu),'','变化比例按 `(叠加版本 / 历史 main − 1) × 100%` 计算。这是相同客户端及负载参数下的两次独立测量，基线为此前发布的 main `684894d`，不能把全部差异单独归因于 #357；各点仅一轮，未估计重复运行波动。','',
        f'逐点原始结果、实际命令和观测记录见 [{NAME}]({NAME}/)，比较身份与计算见 [baseline-comparison.json]({NAME}/baseline-comparison.json)。','',
        '运行入口（须先准备归档中固定版本的二进制、客户端和存储；每个新实验只执行一次）：','',
        '```sh',f'cd /opt/benchmark/{NAME}','sudo python3 suite.py lavik','```','']
    return '\n'.join(lines)


def make_plan(old,raw):
    sums,source,formal=validate_old(old);analysis,compared,rows=complete_analysis(raw,old)
    cpu=cpu_comparison(raw,old,analysis)
    included,omitted=inventory(raw)
    for name in ('comparison.json','reviewed_rows.json','baseline-comparison.json','baseline-comparison.md','collection-inventory.json'):
        require((raw/name).is_file(),'Missing analyzed artifact '+name);included[NAME+'/'+name]=raw/name
    for name in ('audit-final.json',):
        if (raw/name).is_file():included[NAME+'/'+name]=raw/name
    for name in ('analyze.py','analysis_checks.py','compare_main.py','provenance.py','experiment.py','publish.py','check_controller.py','local-controller-tests.json'):
        included[NAME+'/analysis/'+name]=WORK/name
    hashes={}
    for name,path in included.items():
        require(path.is_file() and exclusion(path) is None,'Missing or excluded source '+name);scan_private(path);hashes[name]=sha(path)
    identity=load(raw/'client/stack-manifest.json')
    metadata={'schema_version':1,'complete':True,'experiment':NAME,'revision':STACK,'pull_requests':[358,357],
        'optimization_base_revision':identity['base_revision'],'pr357_revision':identity['pr357_revision'],
        'bycorf_revision':identity['bycorf_revision'],'binary_sha256':identity['binary_sha256'],
        'selected_formal_points':14,'source_directory':NAME,'comparison':NAME+'/comparison.json',
        'historical_main_comparison':NAME+'/baseline-comparison.json','cpu_comparison':NAME+'/cpu-comparison.json','baseline_revision':MAIN,
        'analysis_sha256':sha(WORK/'analyze.py'),'comparison_sha256':sha(raw/'comparison.json'),
        'selection_note':'Fourteen new stack points only; all 123 earlier selected points and their identities are retained.',
        'interpretation':compared['interpretation'],'raw_file_sha256':hashes}
    new_source=copy.deepcopy(source);new_source[SECTION]=metadata;new_source['total_selected_formal_points']=137
    new_formal=copy.deepcopy(formal);new_formal[SECTION]={k:metadata[k] for k in ('schema_version','complete','experiment','revision','pull_requests','selected_formal_points','baseline_revision','selection_note','interpretation')};new_formal[SECTION]['points']=rows;new_formal['total_selected_points']=137
    prior_ids={p['id'] for p in formal['points']+formal['objects8k_fourdb']['points']+formal['zset_opt_crossover']['points']}
    require(len({r['id'] for r in rows})==14 and not prior_ids.intersection(r['id'] for r in rows),'New formal IDs collide')
    return {'old_sums':sums,'source':new_source,'formal':new_formal,'included':included,'hashes':hashes,
            'rows':rows,'omitted':omitted,'old_omitted':load(old/'omitted-state-files.json'),'cpu':cpu,
            'readme':(old/'README.md').read_text().rstrip()+'\n\n'+report_section(compared,rows,cpu)}


def stage(plan,old,destination):
    destination=Path(destination).resolve();outputs=(WORKSPACE/'outputs').resolve()
    require(destination.is_relative_to(outputs) and destination!=outputs and not destination.exists(),'Stage must be NEW beneath outputs/')
    require(not any((p/'.git').exists() for p in (destination,*destination.parents)),'Cannot stage inside a Git checkout')
    destination.mkdir(parents=True)
    for name,digest in plan['old_sums'].items():
        target=destination/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(old/name,target)
        require(sha(target)==digest,'Historical source changed while copying')
    for name,path in plan['included'].items():
        target=destination/name;require(not target.exists(),'New archive collision '+name)
        target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(path,target)
        require(sha(target)==plan['hashes'][name],'New source changed while copying')
    (destination/'README.md').write_text(plan['readme']);write(destination/'SOURCE.json',plan['source']);write(destination/'formal-points.json',plan['formal'])
    write(destination/'omitted-state-files.json',plan['old_omitted']+plan['omitted'])
    write(destination/NAME/'cpu-comparison.json',plan['cpu'])
    write(destination/'compact-pr357-publication-receipt.json',{'schema_version':1,'complete':True,
        'old_SHA256SUMS_sha256':sha(old/'SHA256SUMS'),'historical_file_sha256':plan['old_sums'],
        'historical_points_preserved':123,'new_points':14,'combined_points':137,
        'new_ids':[p['id'] for p in plan['rows']],'new_file_sha256':plan['hashes'],
        'cpu_comparison_sha256':sha(destination/NAME/'cpu-comparison.json'),'omitted_files':len(plan['omitted'])})
    (destination/'SHA256SUMS').write_text('\n'.join(f'{sha(p)}  {p.relative_to(destination).as_posix()}' for p in sorted(destination.rglob('*')) if p.is_file() and p.name!='SHA256SUMS')+'\n')
    verify_sums(destination)
    for name,digest in plan['old_sums'].items():
        if name not in GENERATED_OLD:require(sha(destination/name)==digest,'Historical file changed '+name)
    for filename,total in (('SOURCE.json','total_selected_formal_points'),('formal-points.json','total_selected_points')):
        before=load(old/filename);after=load(destination/filename);require(after.pop(total)==137,'Total differs');after.pop(SECTION);before.pop(total)
        require(before==after,'Historical metadata changed')
    return destination


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--old-report',type=Path,default=DEFAULT_OLD);parser.add_argument('--raw-root',type=Path,default=DEFAULT_RAW);parser.add_argument('--stage',type=Path);parser.add_argument('--check-history',action='store_true')
    args=parser.parse_args();old=args.old_report.resolve()
    if args.check_history:
        sums,_,_=validate_old(old);print(json.dumps({'valid':True,'historical_points':123,'files':len(sums),'writes':False}));return
    plan=make_plan(old,args.raw_root.resolve())
    result={'mode':'dry-run','historical_points_preserved':123,'new_complete_points':14,'new_files':len(plan['included']),'omitted_files':len(plan['omitted'])}
    if args.stage:result.update(mode='staged',path=str(stage(plan,old,args.stage)))
    print(json.dumps(result,indent=2))

if __name__=='__main__':main()


