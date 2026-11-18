#!/usr/bin/env python3
import pathlib,json,subprocess,shutil,tarfile,hashlib
root=pathlib.Path('/opt/bench');out=root/'retry2-evidence';raw=out/'raw';raw.mkdir(parents=True,exist_ok=True)
for trial in ['defrag-ba-tuning','defrag-ba-control0','defrag-record10','defrag-ba-retry2']:
 if trial=='defrag-ba-retry2':assert not json.loads((root/trial/'complete.json').read_text())['failures']
 shutil.copytree(root/trial,raw/trial,dirs_exist_ok=True);shutil.copy2(root/(trial+'.log'),raw/(trial+'.log'))
ssh=['ssh','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4']
shutil.copy2(root/'excluded-nvme-latency.json',raw/'excluded-nvme-latency.json')
code='''import pathlib,tarfile
base=pathlib.Path('/mnt/bench/lavik/n10000000-defrag-ba-sleep-100ms')
with tarfile.open('/opt/bench/tuning-server.tar.xz','w:xz') as t:
 for p in base.rglob('*'):
  if p.is_file() and (p.name in ['stdout.log','launch.json'] or p.name.startswith('lavik.log')):t.add(p,arcname='server/'+str(p.relative_to(base)))
 for p in pathlib.Path('/opt/bench').glob('defrag-*-launch.json'):t.add(p,arcname='server/'+p.name)
 p=pathlib.Path('/opt/bench/tuning-iostat.txt');t.add(p,arcname='server/'+p.name)
'''
subprocess.run(ssh+['sudo','python3','-'],input=code,text=True,check=True)
subprocess.run(['scp','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4:/opt/bench/tuning-server.tar.xz',str(out/'server.tar.xz')],check=True)
with tarfile.open(out/'server.tar.xz') as t:t.extractall(raw,filter='data')
files=sorted(p for p in raw.rglob('*') if p.is_file());manifest=[{'path':str(p.relative_to(raw)),'bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest()} for p in files];(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
with tarfile.open(out/'raw.tar.xz','w:xz') as t:t.add(raw,arcname='raw')
print(json.dumps({'files':len(files),'bytes':(out/'raw.tar.xz').stat().st_size,'sha256':hashlib.file_digest((out/'raw.tar.xz').open('rb'),'sha256').hexdigest()}))
