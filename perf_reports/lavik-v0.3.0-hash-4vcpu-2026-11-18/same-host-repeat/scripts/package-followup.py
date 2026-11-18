#!/usr/bin/env python3
import pathlib,subprocess,shutil,json,hashlib,tarfile
root=pathlib.Path('/opt/bench');out=root/'same-host-evidence';raw=out/'raw';raw.mkdir(parents=True,exist_ok=True)
assert (root/'same-host-peers-10m/complete.json').exists()
for name in ['same-host-peers-10m','defrag-followup']:shutil.copytree(root/name,raw/name,dirs_exist_ok=True)
for name in ['same-host-peers.log','defrag-followup.log']:shutil.copy2(root/name,raw/name)
ssh=['ssh','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4']
code='''import pathlib,tarfile,io,json,subprocess
base=pathlib.Path('/mnt/bench');dest='/opt/bench/followup-server.tar.xz'
with tarfile.open(dest,'w:xz') as t:
 for product in ['lavik','redis','kvrocks','dragonfly']:
  for p in (base/product).rglob('*'):
   if p.is_file() and (p.name in ['launch.json','bench.conf','stdout.log'] or p.name.startswith('lavik.log') or (p.suffix=='.log' and 'kvrocks' in p.name)):
    t.add(p,arcname='server/'+str(p.relative_to(base)))
 data=json.dumps({k:subprocess.check_output(v,text=True) for k,v in {'uname':['uname','-a'],'lscpu':['lscpu'],'lsblk':['lsblk','-b','-o','NAME,SIZE,TYPE,MOUNTPOINTS,MODEL']}.items()},indent=2).encode();info=tarfile.TarInfo('server/host.json');info.size=len(data);t.addfile(info,io.BytesIO(data))
print(dest)
'''
subprocess.run(ssh+['sudo','python3','-'],input=code,text=True,check=True)
subprocess.run(['scp','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4:/opt/bench/followup-server.tar.xz',str(out/'server.tar.xz')],check=True)
with tarfile.open(out/'server.tar.xz') as t:t.extractall(raw,filter='data')
manifest=[{'path':str(p.relative_to(raw)),'bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest()} for p in sorted(raw.rglob('*')) if p.is_file()]
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
with tarfile.open(out/'raw.tar.xz','w:xz') as t:t.add(raw,arcname='raw')
print(json.dumps({'bytes':(out/'raw.tar.xz').stat().st_size,'sha256':hashlib.file_digest((out/'raw.tar.xz').open('rb'),'sha256').hexdigest(),'files':len(manifest)}))
