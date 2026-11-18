#!/usr/bin/env python3
import pathlib,subprocess,json,hashlib,shutil,tarfile
root=pathlib.Path('/opt/bench');formal=root/'same-host-peers-100m';out=root/'large-peers-evidence';raw=out/'raw';raw.mkdir(parents=True,exist_ok=True)
assert (formal/'complete.json').exists()
shutil.copytree(formal,raw/'same-host-peers-100m',dirs_exist_ok=True);shutil.copy2(root/'large-peers-repeat.log',raw/'large-peers-repeat.log')
ssh=['ssh','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4']
code='''import pathlib,tarfile,subprocess,json,io
for name in ['kvrocks','dragonfly','lavik','redis']:
 assert subprocess.run(['systemctl','is-active','--quiet','bench-db-'+name]).returncode!=0
subprocess.run(['systemctl','stop','bench-large-iostat'],check=True)
with tarfile.open('/opt/bench/large-peers-server.tar.xz','w:xz') as t:
 for product,tag in [('kvrocks','n100000000-native-unlimited'),('dragonfly','n100000000-native-unlimited-tiered-listpack')]:
  root=pathlib.Path('/mnt/bench')/product/tag
  for p in root.rglob('*'):
   if p.is_file() and (p.name in ['launch.json','bench.conf','stdout.log'] or p.name.startswith('kvrocks_') and p.suffix=='.log' or p.name.startswith('LOG')):t.add(p,arcname='server/'+product+'/'+str(p.relative_to(root)))
 p=pathlib.Path('/opt/bench/large-peers-iostat.txt');t.add(p,arcname='server/'+p.name)
 for p in pathlib.Path('/tmp').glob('dragonfly-x86_64.*.log'):
  if p.is_file():t.add(p,arcname='server/dragonfly-glog/'+p.name)
 data=json.dumps({k:subprocess.check_output(v,text=True) for k,v in {'uname':['uname','-a'],'lscpu':['lscpu'],'lsblk':['lsblk','-b','-o','NAME,SIZE,TYPE,MOUNTPOINTS,MODEL']}.items()},indent=2).encode();info=tarfile.TarInfo('server/host.json');info.size=len(data);t.addfile(info,io.BytesIO(data))
'''
subprocess.run(ssh+['sudo','python3','-'],input=code,text=True,check=True)
subprocess.run(['scp','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4:/opt/bench/large-peers-server.tar.xz',str(out/'server.tar.xz')],check=True)
with tarfile.open(out/'server.tar.xz') as t:t.extractall(raw,filter='data')
manifest=[{'path':str(p.relative_to(raw)),'bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest()} for p in sorted(raw.rglob('*')) if p.is_file()];(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
with tarfile.open(out/'raw.tar.xz','w:xz') as t:t.add(raw,arcname='raw')
print(json.dumps({'bytes':(out/'raw.tar.xz').stat().st_size,'sha256':hashlib.file_digest((out/'raw.tar.xz').open('rb'),'sha256').hexdigest(),'files':len(manifest)}))
