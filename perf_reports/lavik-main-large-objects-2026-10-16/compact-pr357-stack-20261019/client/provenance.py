"""Pinned identities only; importing performs no I/O or remote action."""
from pathlib import Path
import hashlib
import json
import re

BYCORF='86d686724ddd1c5617fb1b62f8131e05571e8423'
ORIGINAL='/opt/benchmark/objects8k-fourdb-20261019'
STACK='d0084f4a9a869e38ab91ecef6291a89483940123'
BASE='001442e89129468d974cef8c30f8b70ad249f80a'
PR357='48ca16c10680899a81b31a6e6c16c54a2d21a666'

def sha(path):
    with Path(path).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()

def load(path):return json.loads(Path(path).read_text())

def require(ok,msg):
    if not ok:raise ValueError(msg)

def stack(root):
    value=load(Path(root)/'stack-manifest.json')
    require('PENDING' not in json.dumps(value),'Stack identity has not been finalized')
    for key in ('revision','base_revision','pr357_revision','bycorf_revision'):
        require(re.fullmatch('[0-9a-f]{40}',value[key]) is not None,'Invalid '+key)
    require(value['revision']==STACK and value['base_revision']==BASE and value['pr357_revision']==PR357 and value['bycorf_revision']==BYCORF,'Unexpected stack/base/PR/dependency')
    for key in ('binary_sha256','build_manifest_sha256','source_manifest_sha256'):
        require(re.fullmatch('[0-9a-f]{64}',value[key]) is not None,'Invalid '+key)
    require(Path(value['binary']).is_absolute() and value['binary'].endswith('/lavik'),'Invalid stack binary path')
    return value

def initial(root):
    root=Path(root);receipt=load(root/'initial-recovery.json');stop=load(root/'origin-stop.json')
    require(receipt['source_stop_sha256']==sha(root/'origin-stop.json'),'Origin stop checksum changed')
    require(receipt['checkpoint_generation']==stop['checkpoint_generation']==8 and receipt['checkpoint_entries']==stop['checkpoint_entries']==16384,'Unexpected initial checkpoint')
    require(stop['clean_stop_confirmed'] is True and stop['clean_checkpoint_confirmed'] is True and stop['returncode']==0,'Origin checkpoint was not clean')
    require(stop['active']['root']=='/mnt/dev/benchmark/zset-opt-crossover-20261019' and stop['active']['label']=='session-candidate-grouped-zswap','Unexpected origin session')
    return stop

def clients(root,require_binary=False):
    root=Path(root);reuse=load(root/'client-reuse-manifest.json');build=load(root/'client-build-manifest.json');tests=load(root/'linux-client-tests.json')
    require(reuse['original_root']==ORIGINAL and reuse['binaries_rebuilt'] is False and reuse['client_algorithm_changed'] is False,'Client must be reused unchanged')
    require(sha(root/'client-build-manifest.json')==reuse['client_build_manifest_sha256'] and sha(root/'linux-client-tests.json')==reuse['linux_test_receipt_sha256'],'Original client provenance changed')
    require(build['status']=='complete' and set(build['clients'])=={'bench','bench_sswap','bench_hash','bench_lrange','bench_workdist'},'Expected original five clients')
    require(tests['status']=='passed' and tests['passed']==len(tests['tests'])==41 and tests['platform'].startswith('Linux'),'Expected original 41-pass Linux receipt')
    for name,digest in reuse['source_files'].items():require(sha(root/'clients'/name)==digest,'Reused source bytes changed: '+name)
    for name,row in build['clients'].items():
        require(row['binary']==ORIGINAL+'/clients/'+name and row['source']==ORIGINAL+'/clients/'+name+'.cpp','Original build paths changed')
        require(sha(root/'clients'/(name+'.cpp'))==row['source_sha256']==tests['source_sha256'][name+'.cpp'] and row['binary_sha256']==tests['binary_sha256'][name],'Client identity differs')
        if require_binary:require(sha(row['binary'])==row['binary_sha256'],'Reused binary changed: '+name)
    header=sha(root/'clients/bench8k.h')
    require(header==build.get('header_sha256',build.get('shared_headers',{}).get('bench8k.h'))==tests['source_sha256']['bench8k.h'],'Shared header changed')
    require(sha(root/'clients/interface.py')==build['interface_sha256'] and sha(root/'clients/test_clients.py')==build['test_script_sha256'],'Frozen interface/tests changed')
    require(build['linux_test_receipt']=={'path':ORIGINAL+'/linux-client-tests.json','sha256':sha(root/'linux-client-tests.json')},'Original test receipt changed')
    return build
