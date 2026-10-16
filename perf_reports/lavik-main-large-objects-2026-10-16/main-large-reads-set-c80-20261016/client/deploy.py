from pathlib import Path
import subprocess as sp,tarfile,shlex
R=Path(__file__).resolve().parent
SSH=['ssh','-o','ControlPath=none','-o','ConnectTimeout=15','-F','/Users/chen/Documents/Codex/2026-10-10/standard-l16aos-v4/work/ssh.conf']
for host,root in [('server','/mnt/dev/benchmark/'+R.name),('client','/opt/benchmark/'+R.name)]:
 bundle=R/(host+'-deploy.tar.gz')
 with tarfile.open(bundle,'w:gz') as t:
  for p in R.iterdir():
   if p.suffix in ['.py','.json','.md','.cpp']:t.add(p,arcname=p.name)
 with bundle.open('rb') as f:sp.run(SSH+[host,'sudo mkdir -p '+root+' && sudo tar xzf - -C '+root],stdin=f,check=True,timeout=600)
 if host=='server':
  old='/mnt/dev/benchmark/pr347-set1m-20261015/'
  sp.run(SSH+[host,'sudo cp '+old+'build-manifest.json '+old+'spdk-devices.json '+root+'/'],check=True)
 else:
  cmd='cd '+root+' && exec python3 -u batch.py > batch.log 2>&1'
  sp.run(SSH+[host,'sudo systemd-run --unit='+R.name+' --property=LimitNOFILE=65535 --property=LimitMEMLOCK=infinity /bin/sh -c '+shlex.quote(cmd)],check=True)
