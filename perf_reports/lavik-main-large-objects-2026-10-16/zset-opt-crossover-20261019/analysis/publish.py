#!/usr/bin/env python3
"""Read-only validation by default; append eight real ZSet points in a new stage.

--stage must name a new directory beneath workspace outputs/. This tool never
edits a repository or accesses a remote host. Existing 115 points stay intact.
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
import subprocess
import sys
import tempfile
from pathlib import Path, PurePosixPath
import xml.etree.ElementTree as ET

WORK=Path(__file__).resolve().parent
WORKSPACE=WORK.parents[1]
NAME='zset-opt-crossover-20261019'
REPORT_NAME='lavik-main-large-objects-2026-10-16'
DEFAULT_OLD=WORKSPACE/'work/lavik-agent-perf/perf_reports'/REPORT_NAME
DEFAULT_RAW=WORKSPACE/'outputs'/NAME
BUILD_ROOT=WORKSPACE/'work/zset-compact-20261019'
BUILD_RAW=WORKSPACE/'outputs/zset-compact-20261019/server'
OLD_MAIN='9c68079a7dd775db647cf55fe578a6cd43426a82'
REVISIONS={'main':'684894d973878ca0e0649b54404ce77521f1695f','candidate':'32bdd6b474733c2850b80e3cc217461075e73af5'}
BYCORF='86d686724ddd1c5617fb1b62f8131e05571e8423'
SIZES={'compact':256,'grouped':32768}
OPS=('zincr','zswap')
COMMANDS={'zincr':'ZINCRBY','zswap':'ZREM/ZADD'}
FIGURE='zset-opt-crossover.svg'
SECTION='zset_opt_crossover'
GENERATED_OLD={'README.md','SOURCE.json','formal-points.json','SHA256SUMS','omitted-state-files.json'}
PRIVATE_HEADERS=tuple(b'-----BEGIN '+kind+b'-----' for kind in (b'OPENSSH PRIVATE KEY',b'RSA PRIVATE KEY',b'EC PRIVATE KEY',b'PRIVATE KEY',b'ENCRYPTED PRIVATE KEY'))
BINARY_MAGIC=(b'\x7fELF',b'\xfe\xed\xfa\xce',b'\xce\xfa\xed\xfe',b'\xfe\xed\xfa\xcf',b'\xcf\xfa\xed\xfe',b'\xca\xfe\xba\xbe')
TEXT_EXTENSIONS={'.json','.jsonl','.log','.py','.cpp','.h','.md','.txt','.conf','.xml','.patch','.svg','.sha256','.stdout','.stderr'}
MARKERS={'COMPLETE','STARTED','BUILD_COMPLETE','TESTS_COMPLETE','CLIENT_TESTS_COMPLETE','MEASUREMENTS_COMPLETE','FORMAL_COMPLETE','SUITE_COMPLETE'}

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
    require(source['main_revision']==OLD_MAIN and source['canonical_main_points']==20 and source['selected_formal_points']==59,'Historical 1 MiB SOURCE changed')
    require(formal['canonical_main_revision']==OLD_MAIN and formal['canonical_main_points']==20 and formal['selected_points']==59 and len(formal['points'])==59,'Historical 1 MiB points changed')
    require(source.get('total_selected_formal_points')==formal.get('total_selected_points')==115,'Expected existing 115-point report')
    for value in (source['objects8k_fourdb'],formal['objects8k_fourdb']):
        require(value['complete'] is True and value['selected_formal_points']==56 and value['canonical_main_points']==14 and value['main_revision']==REVISIONS['main'],'Existing 8 KiB metadata differs')
    require(len(formal['objects8k_fourdb']['points'])==56,'Existing 8 KiB points missing')
    require(SECTION not in source and SECTION not in formal,'Crossover section already exists')
    ids=[row['id'] for row in formal['points']+formal['objects8k_fourdb']['points']]
    require(len(set(ids))==115,'Historical point ID collision')
    for name in sums:
        require(exclusion(old/name) is None,'Historical file conflicts with exclusions: '+name)
        scan_private(old/name)
    return sums,source,formal


def check_complete(data):
    require(data.get('schema_version')==1 and data.get('experiment')==NAME,'Unexpected analysis experiment/schema')
    require(data.get('complete') is True and data.get('completed_points')==8 and data.get('expected_points')==8 and data.get('pending')==[],'All eight real points are required')
    points=data.get('points',[])
    expected={(v,s,o) for v in REVISIONS for s in SIZES for o in OPS}
    require(len(points)==8 and {(p['variant'],p['size'],p['op']) for p in points}==expected,'Missing or duplicate formal point')


def complete_analysis(raw,comparison):
    data=load(comparison);check_complete(data)
    # Use a separate interpreter to prevent similarly named historical harness
    # modules in an importing caller from contaminating the fresh offline audit.
    code='import json,sys; from pathlib import Path; import analyze; print(json.dumps(analyze.analyze(Path(sys.argv[1]),partial=False,write_outputs=False)))'
    process=subprocess.run([sys.executable,'-B','-c',code,str(raw)],cwd=WORK,text=True,capture_output=True,check=True)
    require(json.loads(process.stdout)==data,'Saved comparison differs from fresh read-only analysis')
    rows=[]
    for point in data['points']:
        variant,size,op=(point[k] for k in ('variant','size','op'))
        label=f'{variant}-{size}-{op}-c80';relative='client/results/'+label
        require(point['label']==label and point['raw_dir']==relative,'Unexpected raw point path')
        directory=raw/relative;result=load(directory/'result.json');case=load(directory/'case.json')
        require(point['revision']==REVISIONS[variant] and point['connections']==80 and point['errors']==0,'Point identity differs')
        require(result['metrics']==point['metrics'] and point['source_sha256']==sha(directory/'result.json'),'Raw/analyzed metric differs')
        require(point['unit']==('pairs/s' if op=='zswap' else 'ops/s'),'Principal throughput unit differs')
        require(result['data_shape']==point['shape'] and point['shape']['members_per_key']==SIZES[size] and point['shape']['member_bytes']==32,'Object shape differs')
        require(point['validation']['state_continuity'] is True,'State chain missing')
        measured=dt.datetime.fromtimestamp(point['timing']['start'],dt.timezone.utc).isoformat()
        rows.append({'id':f'lavik/zset-crossover/{variant}/{size}/{op}/c80','dataset':NAME,
                     'role':'crossover-baseline' if variant=='main' else 'crossover-candidate',
                     'product':'lavik','variant':variant,'revision':point['revision'],'size':size,
                     'op':op,'command':COMMANDS[op],'connections':80,'keys':8192,'unit':point['unit'],
                     'data_shape':point['shape'],'measured_at_utc':measured,'elapsed_seconds':point['elapsed_seconds'],
                     'metrics':point['metrics'],'raw_path':NAME+'/'+relative+'/result.json',
                     'command_path':NAME+'/'+relative+'/command.json',
                     'source_sha256':point['source_sha256'],'binary_sha256':point['binary_sha256'],
                     'client_binary_sha256':case['client_binary_sha256'],
                     'conditions':{'warm_seconds':90,'formal_seconds':60,'load_seed':101,'warm_seed':10180,
                                   'formal_seed':20180,'client_threads':16,'pipeline':1,
                                   'namespace_loads':1,'shared_across_versions':True,'fixed_version_order':['main','candidate']},
                     'observations':point['observations'],'transactions':point['transactions'],'state':point['state']})
    return data,rows


def chart_provenance(raw,charts,analysis):
    path=charts/'chart-receipt.json';receipt=load(path);reviewed=load(raw/'reviewed_rows.json')
    require(receipt.get('complete') is True and receipt.get('experiment')==NAME and reviewed.get('complete') is True,'Chart incomplete')
    require(receipt['source_sha256']==sha(raw/'reviewed_rows.json') and receipt['plot_script_sha256']==sha(WORK/'plot.py'),'Chart source or script changed')
    fields=('variant','size','op','qps','avg_ms','p999_ms','unit')
    expected={}
    for point in analysis['points']:
        row={**point,**point['metrics']['OPERATIONS']}
        expected[(point['variant'],point['size'],point['op'])]={k:row[k] for k in fields}
    for values in (receipt['values'],reviewed['rows']):
        require(len(values)==8 and {(r['variant'],r['size'],r['op']):{k:r[k] for k in fields} for r in values}==expected,'Chart values differ from OPERATIONS')
    require(set(receipt['figures'])=={FIGURE},'Unexpected figure inventory')
    svg(charts/FIGURE);require(sha(charts/FIGURE)==receipt['figures'][FIGURE],'SVG changed after rendering')
    return path


def client_provenance(raw):
    base=raw/'client';build=load(base/'client-build-manifest.json');tests=load(base/'linux-client-tests.json')
    require(build['status']=='complete' and set(build['clients'])=={'bench'},'Unexpected client build')
    require(tests.get('status')=='passed' and tests.get('mode')=='full-linux-client' and tests.get('passed')==31 and len(tests.get('checks',[]))==31 and tests.get('platform','').startswith('Linux'),'Missing real 31-pass Linux receipt')
    identity=build['clients']['bench']
    require(sha(base/'clients/bench.cpp')==identity['source_sha256']==tests['source_sha256'],'Client source identity differs')
    require(identity['binary_sha256']==tests['binary_sha256'],'Client binary identity differs')
    for path,key in (('clients/interface.py','interface_sha256'),('clients/test_client.py','test_script_sha256'),('clients/source-manifest.json','source_manifest_sha256')):
        require(sha(base/path)==build[key],'Client provenance differs: '+path)
    require(build['test_script_sha256']==tests['test_script_sha256'] and sha(base/'linux-client-tests.json')==build['linux_test_receipt']['sha256'],'Client receipt identity differs')


def build_provenance(raw):
    """Archive only the pinned builds/tests, never old partial benchmark points."""
    included={};identities={}
    for variant,revision in REVISIONS.items():
        manifest=load(raw/'client'/f'{variant}-manifest.json')
        require(manifest==load(raw/'server'/f'{variant}-manifest.json'),'Host build identities differ')
        require(manifest['revision']==revision and manifest['bycorf_revision']==BYCORF,'Build revision differs')
        identities[variant]=manifest
        for stem in ('build','source'):
            source=BUILD_ROOT/f'{stem}-manifest.json'
            require(sha(source)==manifest[f'{stem}_manifest_sha256'],'Pinned original build/source manifest differs')
            included[NAME+f'/build-provenance/{stem}-manifest.json']=source
    build=load(BUILD_ROOT/'build-manifest.json')
    require(build['test_build']['revision']==REVISIONS['candidate'],'Correctness tests are not for this candidate')
    total=0
    for name in ('unit','sorted_set_e2e'):
        test=build['tests'][name];source=BUILD_RAW/Path(test['xml']).name
        require(sha(source)==test['xml_sha256'],'Candidate test XML checksum differs')
        xml=ET.parse(source).getroot();stats=test['results']
        for field in ('tests','failures','errors','disabled'):
            require(xml.attrib[field]==stats[field],'Test XML totals differ')
        require(all(int(stats[k])==0 for k in ('failures','errors','disabled')),'Candidate correctness tests did not pass')
        total+=int(stats['tests']);included[NAME+'/build-provenance/'+source.name]=source
    require(total==158,'Expected candidate 125 unit + 33 e2e tests')
    return included,{'candidate_revision':REVISIONS['candidate'],'passed':total,'unit':125,'e2e':33,
                     'scope':'Selected candidate correctness tests only; no independent 158-test main receipt.',
                     'build_manifest':NAME+'/build-provenance/build-manifest.json'}


def changes(rows):
    lookup={(r['variant'],r['size'],r['op']):r['metrics']['OPERATIONS'] for r in rows};result=[]
    for size in SIZES:
        for op in OPS:
            baseline,candidate=(lookup[v,size,op] for v in REVISIONS)
            require(all(baseline[k]>0 for k in ('qps','avg_ms','p999_ms')),'Cannot calculate change from zero')
            result.append({'size':size,'op':op,'baseline':baseline,'candidate':candidate,
                           'change_percent':{k:100*(candidate[k]/baseline[k]-1) for k in ('qps','avg_ms','p999_ms')}})
    return result


def temporal_grouped_zincr(raw,analysis):
    """Recompute consecutive 10 s bins from the actual 60 one-second counts.

    These fixed-duration bins exclude the in-flight completion tail; principal
    QPS remains the full checked count / measured elapsed time from OPERATIONS.
    """
    result={}
    for point in analysis['points']:
        if (point['size'],point['op'])!=('grouped','zincr'):continue
        path=raw/point['raw_dir']/'result.json';value=load(path)
        require(sha(path)==point['source_sha256'],'Temporal source identity differs')
        counts=value['operations_per_second']
        require(len(counts)==60 and all(type(v) is int and v>=0 for v in counts),'Expected sixty actual one-second buckets')
        bins=[{'start_seconds':start,'end_seconds':start+10,'count':sum(counts[start:start+10]),
               'mean_ops_per_second':sum(counts[start:start+10])/10} for start in range(0,60,10)]
        first=sum(counts[:40])/40;last=sum(counts[40:])/20
        require(first>0,'Cannot compare an empty first 40 seconds')
        result[point['variant']]={'raw_path':NAME+'/'+point['raw_dir']+'/result.json',
            'source_sha256':point['source_sha256'],'bucket_width_seconds':1,'bucket_count':60,
            'ten_second_bins':bins,'first_40_seconds_mean_ops_per_second':first,
            'last_20_seconds_mean_ops_per_second':last,
            'last_20_vs_first_40_change_percent':100*(last/first-1),
            'bucket_operation_count':sum(counts),'principal_operation_count':point['metrics']['OPERATIONS']['count'],
            'completion_tail_operations':point['metrics']['OPERATIONS']['count']-sum(counts),
            'principal_elapsed_seconds':point['elapsed_seconds'],
            'principal_qps':point['metrics']['OPERATIONS']['qps']}
    require(set(result)==set(REVISIONS),'Both grouped ZINCRBY time series are required')
    result['full_window_qps_change_percent']=100*(result['candidate']['principal_qps']/result['main']['principal_qps']-1)
    result['interpretation']='The candidate drops during the last 20 seconds. The full-window QPS difference describes this fixed 60-second run, not a demonstrated steady-state or causal improvement.'
    return result


def section(rows,temporal):
    table=['| 每 key 数据量 | 命令 | main：吞吐 / Avg / p99.9 | candidate：吞吐 / Avg / p99.9 | 吞吐变化 | Avg 变化 | p99.9 变化 |',
           '|---|---|---:|---:|---:|---:|---:|']
    for row in changes(rows):
        cells=[('8 KiB' if row['size']=='compact' else '1 MiB'),COMMANDS[row['op']]]
        for variant in ('baseline','candidate'):
            metric=row[variant];cells.append(f'{metric["qps"]:,.1f} / {metric["avg_ms"]:.3f} / {metric["p999_ms"]:.3f}')
        cells.extend(f'{row["change_percent"][metric]:+.1f}%' for metric in ('qps','avg_ms','p999_ms'))
        table.append('| '+' | '.join(cells)+' |')
    candidate,baseline=temporal['candidate'],temporal['main']
    bins='、'.join(f'{b["mean_ops_per_second"]:,.1f}' for b in candidate['ten_second_bins'])
    baseline_bins=[b['mean_ops_per_second'] for b in baseline['ten_second_bins']]
    temporal_note=(f'1 MiB ZINCRBY 的候选版在六个连续 10 秒窗口中的平均吞吐依次为 **{bins} ops/s**；'
        f'前 40 秒平均 {candidate["first_40_seconds_mean_ops_per_second"]:,.1f} ops/s，'
        f'后 20 秒平均 {candidate["last_20_seconds_mean_ops_per_second"]:,.1f} ops/s，'
        f'后段相对前段变化 {candidate["last_20_vs_first_40_change_percent"]:+.1f}%。'
        f'main 的六段均值为 {min(baseline_bins):,.1f}–{max(baseline_bins):,.1f} ops/s。'
        f'因此表中的 **{temporal["full_window_qps_change_percent"]:+.1f}%** 仅是整个固定 60 秒窗口的汇总差异，'
        '不能表述为稳定吞吐提升，也不能据此确认因果关系。'
        f'逐秒计数见 [candidate 原始结果]({candidate["raw_path"]}) 和 [main 原始结果]({baseline["raw_path"]})。')
    return '\n'.join([
        '## ZSet 点更新优化：8 KiB 与 1 MiB 对照（2026-10-19）','',
        '本节独立比较 main `684894d` 与包含两项 ZSet 点更新优化的 candidate `32bdd6b`；两版 Bycorf 均为 `86d6867`。候选版通过 125 项单元测试和 33 项端到端测试。前面的 1 MiB 和四库 8 KiB 结果保持原样。','',
        '两档各 8,192 个 key，member 均为 32 B：8 KiB 每 key 有 256 个 member，1 MiB 有 32,768 个 member。每档只装载一次，后续操作及版本切换共用数据；ZREM/ZADD 的 member 状态连续保存。每点 80 个连接，预热 90 秒、正式测量 60 秒，各一轮。','',
        'ZINCRBY 随机选择现存 member，以 ±32,768 更新 score；ZREM/ZADD 为每个连接保留一个 member 槽，先删除再添加，score 按序列号取模 32,768。ZREM/ZADD 的吞吐单位为 **pairs/s**，延迟是完成一整对命令的耗时；ZINCRBY 使用 **ops/s**。表格延迟单位均为 **ms**，变化按 `(candidate / main − 1) × 100%` 计算。','',
        '\n'.join(table),'',f'![ZSet 点更新吞吐与 p99.9 延迟]({FIGURE})','',temporal_note,'',
        '测试顺序固定为 main 的 8 KiB 两项、装载 1 MiB 数据、main 的 1 MiB 两项，然后 candidate 的同样四项。因此 main 的 8 KiB 测量时只有 compact 命名空间，candidate 的 8 KiB 测量时两个命名空间均已存在，总驻留数据量不同；两版 1 MiB 测量时均已有两个命名空间。数据、score 和替换状态持续变化，切换版本时以干净停止和 checkpoint 恢复保持连续。结果表示这一次固定顺序下的观测差异，尤其不能把 compact 的小幅波动单独归因于代码优化，也不能据此估计重复运行的波动范围。','',
        f'原始结果、命令和观测记录见 [{NAME}]({NAME}/)，逐点身份及变化比例见 [comparison.json]({NAME}/comparison.json) 与 [summary.json]({NAME}/summary.json)。','',
        '运行入口（须先按归档准备二进制、六块专用盘及客户端；每个新实验只执行一次）：','',
        '```sh',f'cd /opt/benchmark/{NAME}','sudo python3 run.py','```',''])


def make_plan(old,raw,comparison,charts):
    old_sums,source,formal=validate_old(old)
    analysis,rows=complete_analysis(raw,comparison)
    temporal=temporal_grouped_zincr(raw,analysis)
    receipt=chart_provenance(raw,charts,analysis);client_provenance(raw)
    included,omitted=inventory(raw);build_files,test_summary=build_provenance(raw);included.update(build_files)
    for name in ('comparison.json','reviewed_rows.json'):
        included[NAME+'/'+name]=comparison if name=='comparison.json' else raw/name
    included[NAME+'/chart-receipt.json']=receipt;included[FIGURE]=charts/FIGURE
    for name in ('collection-inventory.json','audit-final.json'):
        if (raw/name).is_file():included[NAME+'/'+name]=raw/name
    for name in ('analyze.py','analysis_common.py','experiment.py','provenance.py','validation.py','publish.py','plot.py'):
        included[NAME+'/analysis/'+name]=WORK/name
    for name in ('local-controller-tests.json','check_controller.py','server_checks.py'):
        if (WORK/name).is_file():included[NAME+'/analysis/'+name]=WORK/name
    for name,path in included.items():
        require(path.is_file() and exclusion(path) is None,'Missing or excluded selected source: '+name);scan_private(path)
    hashes={name:sha(path) for name,path in included.items()}
    new={'schema_version':1,'complete':True,'experiment':NAME,'selected_formal_points':8,
         'revisions':REVISIONS,'bycorf_revision':BYCORF,'points_by_variant':{'main':4,'candidate':4},
         'members_per_key':SIZES,'member_bytes':32,'keys_per_namespace':8192,'namespace_loads':2,
         'source_directory':NAME,'comparison':NAME+'/comparison.json','summary':NAME+'/summary.json',
         'comparison_sha256':sha(comparison),'analysis_sha256':sha(WORK/'analyze.py'),
         'correctness_tests':test_summary,'interpretation':analysis['interpretation'],
         'selection_note':'Eight new crossover points only; the earlier 59 one-MiB and 56 eight-KiB points retain their original identity and selection.',
         'raw_file_sha256':{k:v for k,v in hashes.items() if k.startswith(NAME+'/')}}
    new_source=copy.deepcopy(source);new_source[SECTION]=new;new_source['total_selected_formal_points']=123
    new_formal=copy.deepcopy(formal);new_formal[SECTION]={k:new[k] for k in ('schema_version','complete','experiment','selected_formal_points','revisions','interpretation','selection_note')};new_formal[SECTION]['points']=rows;new_formal['total_selected_points']=123
    old_ids={p['id'] for p in formal['points']+formal['objects8k_fourdb']['points']}
    require(len({r['id'] for r in rows})==8 and not old_ids.intersection(r['id'] for r in rows),'Point IDs collide')
    return {'old_sums':old_sums,'included':included,'hashes':hashes,'source':new_source,'formal':new_formal,
            'old_omitted':load(old/'omitted-state-files.json'),'omitted':omitted,'rows':rows,
            'readme':(old/'README.md').read_text().rstrip()+'\n\n'+section(rows,temporal),
            'summary':{'complete':True,'experiment':NAME,'points':8,'comparisons':changes(rows),
                       'temporal_grouped_zincr':temporal,
                       'interpretation':analysis['interpretation'],'correctness_tests':test_summary}}


def validate_staged(destination,old,plan):
    verify_sums(destination)
    for name,digest in plan['old_sums'].items():
        if name not in GENERATED_OLD:require(sha(destination/name)==digest,'Historical file changed: '+name)
    for filename,total_key in (('SOURCE.json','total_selected_formal_points'),('formal-points.json','total_selected_points')):
        original=load(old/filename);current=load(destination/filename)
        require(current.pop(SECTION) and current.pop(total_key)==123,'New metadata absent')
        original.pop(total_key);require(current==original,'Historical metadata altered')
    omitted=load(destination/'omitted-state-files.json');require(omitted==plan['old_omitted']+plan['omitted'],'Omitted listing changed')
    require((destination/'README.md').read_text().startswith((old/'README.md').read_text().rstrip()+'\n\n'),'Historical report text altered')
    for name,digest in plan['hashes'].items():require(sha(destination/name)==digest,'New archive copy differs: '+name)


def stage(plan,old,destination):
    destination=Path(destination).resolve();outputs=(WORKSPACE/'outputs').resolve()
    require(destination.is_relative_to(outputs) and destination!=outputs and not destination.exists(),'Stage must be a NEW directory beneath outputs/')
    require(not any((p/'.git').exists() for p in (destination,*destination.parents)),'Stage cannot be inside a Git checkout')
    destination.mkdir(parents=True)
    for name,digest in plan['old_sums'].items():
        target=destination/name;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(old/name,target)
        require(sha(target)==digest,'Historical file changed during copy')
    for name,path in plan['included'].items():
        target=destination/name;require(not target.exists(),'New archive path collision: '+name)
        target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(path,target)
        require(sha(target)==plan['hashes'][name],'New source changed while staging')
    (destination/'README.md').write_text(plan['readme'])
    write(destination/'SOURCE.json',plan['source']);write(destination/'formal-points.json',plan['formal'])
    write(destination/'omitted-state-files.json',plan['old_omitted']+plan['omitted'])
    write(destination/NAME/'summary.json',plan['summary'])
    receipt={'schema_version':1,'complete':True,'old_SHA256SUMS_sha256':sha(old/'SHA256SUMS'),
             'historical_file_sha256':plan['old_sums'],'historical_points_preserved':115,'new_points':8,
             'combined_points':123,'new_ids':[row['id'] for row in plan['rows']],
             'new_file_sha256':plan['hashes'],'summary_sha256':sha(destination/NAME/'summary.json'),
             'omitted_files':len(plan['omitted'])}
    write(destination/'zset-crossover-publication-receipt.json',receipt)
    lines=[f'{sha(path)}  {path.relative_to(destination).as_posix()}' for path in sorted(destination.rglob('*')) if path.is_file() and path.name!='SHA256SUMS']
    (destination/'SHA256SUMS').write_text('\n'.join(lines)+'\n')
    validate_staged(destination,old,plan)
    return destination


def self_test():
    """Boundary checks only; never fabricate or render benchmark observations."""
    checks=[]
    for incomplete in ({},{'schema_version':1,'experiment':NAME,'complete':False,'completed_points':7,'expected_points':8,'pending':['candidate-grouped-zswap']}):
        try:check_complete(incomplete)
        except ValueError:checks.append('incomplete_analysis_rejected')
        else:raise AssertionError('Incomplete data accepted')
    from plot import validate as validate_chart
    try:validate_chart({'complete':False,'rows':[]})
    except ValueError:checks.append('partial_chart_rejected')
    else:raise AssertionError('Partial chart accepted')
    sums,source,formal=validate_old(DEFAULT_OLD);checks.append('actual_115_historical_points_and_all_checksums_verified')
    with tempfile.TemporaryDirectory() as temporary:
        root=Path(temporary)
        for name,data in (('state.bin',b'flags'),('binary',b'\x7fELFpayload'),('preview.png',b'png')):
            p=root/name;p.write_bytes(data);require(exclusion(p) is not None,'Forbidden payload not excluded')
        checks.append('state_executable_png_excluded')
        p=root/'linked';p.symlink_to(root/'state.bin');require(exclusion(p)=='symlink','Symlink allowed');checks.append('symlink_excluded')
        p=root/'bad.svg';p.write_text('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')
        try:svg(p)
        except ValueError:checks.append('active_svg_rejected')
        else:raise AssertionError('Active SVG allowed')
        p=root/'key.txt';p.write_bytes(PRIVATE_HEADERS[0])
        try:scan_private(p)
        except ValueError:checks.append('key_material_rejected')
        else:raise AssertionError('Key material allowed')
    return {'status':'passed','checks':checks,'historical_files_verified':len(sums),'new_results_generated':False,'remote_operations':0}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--old-report',type=Path,default=DEFAULT_OLD)
    parser.add_argument('--raw-root',type=Path,default=DEFAULT_RAW)
    parser.add_argument('--comparison',type=Path);parser.add_argument('--charts',type=Path)
    parser.add_argument('--stage',type=Path);parser.add_argument('--self-test',action='store_true')
    args=parser.parse_args()
    if args.self_test:print(json.dumps(self_test(),indent=2));return
    old=args.old_report.resolve();raw=args.raw_root.resolve()
    plan=make_plan(old,raw,(args.comparison or raw/'comparison.json').resolve(),(args.charts or raw).resolve())
    result={'mode':'dry-run','historical_points_preserved':115,'new_complete_points':8,
            'historical_files_verified':len(plan['old_sums']),'new_files':len(plan['included']),
            'omitted_files':len(plan['omitted']),'target_report':REPORT_NAME}
    if args.stage:result.update(mode='staged',path=str(stage(plan,old,args.stage)))
    print(json.dumps(result,ensure_ascii=False,indent=2))


if __name__=='__main__':main()

