#!/usr/bin/env python3
"""Build this one client and run loopback tests on Linux; no database access."""
from pathlib import Path
import argparse, hashlib, json, platform, subprocess, time

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def write(path,value):Path(path).write_text(json.dumps(value,indent=2)+'\n')
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,required=True);a=ap.parse_args()
    root=a.root.resolve();clients=Path(__file__).resolve().parent
    if platform.system()!='Linux' or root!=Path('/opt/benchmark/zset-opt-crossover-20261019') or clients!=root/'clients':raise RuntimeError('Run only in the new Linux client experiment directory')
    if (clients/'bench').exists() or (root/'client-build-manifest.json').exists():raise RuntimeError('Refusing to replace an existing client build')
    compiler='/usr/bin/g++-13';command=[compiler,'-std=c++20','-O3','-pthread',str(clients/'bench.cpp'),'-o',str(clients/'bench')]
    start=time.time();build=subprocess.run(command,text=True,capture_output=True)
    (root/'client-build.log').write_text(build.stdout+build.stderr)
    if build.returncode:raise RuntimeError('Client build failed; see client-build.log')
    tests=subprocess.run(['/usr/bin/python3',str(clients/'test_client.py'),'--binary',str(clients/'bench')],text=True,capture_output=True,timeout=180)
    (root/'client-tests.stdout').write_text(tests.stdout);(root/'client-tests.stderr').write_text(tests.stderr)
    if tests.returncode or tests.stderr:raise RuntimeError('Client tests failed; see client-tests.stdout/stderr')
    receipt=json.loads(tests.stdout)
    if receipt['status']!='passed' or receipt['mode']!='full-linux-client' or receipt['passed']!=31:raise RuntimeError('Unexpected test receipt')
    if receipt['source_sha256']!=sha(clients/'bench.cpp') or receipt['binary_sha256']!=sha(clients/'bench'):raise RuntimeError('Test source/binary mismatch')
    write(root/'linux-client-tests.json',receipt)
    manifest={'schema_version':1,'status':'complete','started_at':start,'completed_at':time.time(),'compiler':compiler,'compiler_version':subprocess.check_output([compiler,'--version'],text=True),'flags':['-std=c++20','-O3','-pthread'],'clients':{'bench':{'source':str(clients/'bench.cpp'),'source_sha256':sha(clients/'bench.cpp'),'binary':str(clients/'bench'),'binary_sha256':sha(clients/'bench'),'build_command':command}},'interface_sha256':sha(clients/'interface.py'),'test_script_sha256':sha(clients/'test_client.py'),'source_manifest_sha256':sha(clients/'source-manifest.json'),'linux_test_receipt':{'path':str(root/'linux-client-tests.json'),'sha256':sha(root/'linux-client-tests.json')}}
    write(root/'client-build-manifest.json',manifest)
    print(json.dumps({'status':'complete','passed':receipt['passed'],'binary_sha256':sha(clients/'bench')},indent=2))
if __name__=='__main__':main()
