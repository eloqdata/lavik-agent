#!/usr/bin/env python3
"""Package native-server provenance and human logs; never database files or keys."""
import hashlib,json,pathlib,shutil,subprocess,tarfile
ROOT=pathlib.Path('/opt/bench');OUT=ROOT/'server-evidence';OUT.mkdir(exist_ok=True)
products=['lavik','redis','kvrocks','dragonfly']
def command(args):
 r=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
 return {'command':args,'exit_code':r.returncode,'output':r.stdout}
for product in products:
 if command(['systemctl','is-active','bench-db-'+product])['output'].strip() in ('active','activating'):
  raise SystemExit('Stop the native database before packaging: '+product)
subprocess.run(['systemctl','stop','bench-hoststats'],check=True)
metadata={name:command(args) for name,args in {
 'uname':['uname','-a'],'lscpu':['lscpu'],'lsblk':['lsblk','-b','-o','NAME,SIZE,TYPE,MOUNTPOINTS,MODEL'],
 'mount':['findmnt','-o','TARGET,SOURCE,FSTYPE,OPTIONS','/mnt/bench'],'sysstat':['sar','-V']}.items()}
metadata['policy']={name:pathlib.Path(path).read_text() for name,path in {
 'os_release':'/etc/os-release','thp':'/sys/kernel/mm/transparent_hugepage/enabled','overcommit':'/proc/sys/vm/overcommit_memory','swaps':'/proc/swaps'}.items()}
binaries={'lavik':ROOT/'lavik-release/lavik-v0.3.0-linux-x86_64-minimal/lavik','redis':ROOT/'bin/redis-server','kvrocks':ROOT/'bin/kvrocks','dragonfly':ROOT/'dragonfly-release/dragonfly-x86_64'}
metadata['versions']={k:command([str(p),'--version']) for k,p in binaries.items()}
metadata['binary_sha256']={k:hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for k,p in binaries.items()}
(OUT/'environment.json').write_text(json.dumps(metadata,indent=2)+'\n')
for name in ['server-hoststats.sar','binary-checksums.txt','lavik.sha256','lsblk-bytes.txt','lavik-help.txt','dragonfly-help.txt','kvrocks-default.conf']:
 p=ROOT/name
 if p.is_file():shutil.copy2(p,OUT/name)
allowed={'n10000000-native-unlimited','n100000000-native-unlimited','n100000000-native-unlimited-tiered','n100000000-native-unlimited-tiered-listpack'}
for product in products:
 for base in (pathlib.Path('/mnt/bench')/product).iterdir():
  if not base.is_dir() or base.name not in allowed:continue
  dest=OUT/'logs'/product/base.name;dest.mkdir(parents=True,exist_ok=True)
  files=[base/x for x in ['stdout.log','launch.json','bench.conf']]
  files+=list(base.glob('kvrocks_*.log'))+list(base.glob('logs/lavik.log*'))+list(base.glob('db/LOG*'))
  for p in files:
   if p.is_file():
    rel=p.relative_to(base);target=dest/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,target)
glogs=OUT/'dragonfly-glog';glogs.mkdir(exist_ok=True)
for p in pathlib.Path('/tmp').glob('dragonfly-x86_64.*.log'):
 if p.is_file():shutil.copy2(p,glogs/p.name)
with tarfile.open(ROOT/'server-evidence.tar.gz','w:gz') as t:t.add(OUT,arcname='server')
print(ROOT/'server-evidence.tar.gz')
