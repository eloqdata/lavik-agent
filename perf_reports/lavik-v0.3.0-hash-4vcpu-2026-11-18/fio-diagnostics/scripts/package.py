#!/usr/bin/env python3
import pathlib,subprocess,tarfile,hashlib,json,shutil
root=pathlib.Path('/opt/bench');out=root/'fio-final-evidence';raw=out/'raw';raw.mkdir(parents=True,exist_ok=True)
ssh=['ssh','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4']
code='''import pathlib,subprocess,tarfile,json,io
root=pathlib.Path('/opt/bench')
for trial,count in [('fio-readonly',12),('fio-crossover',12),('fio-nvme-flush',6)]:
 assert json.loads((root/trial/'complete.json').read_text())['windows']==count
for unit in ['bench-db-lavik','bench-fio-readonly','bench-fio-crossover','bench-fio-direct-flush']:
 assert subprocess.run(['systemctl','is-active','--quiet',unit]).returncode!=0
with tarfile.open(root/'fio-server-evidence.tar.xz','w:xz') as t:
 for name in ['fio-readonly','fio-crossover','fio-nvme-flush','spdk-runs','spdk-evidence']:
  t.add(root/name,arcname='server/'+name)
 for name in ['fio-readonly.log','fio-crossover.log','fio-direct-flush.log','nvme-flush.c','resumed-iostat.txt','resumed-0ms-launch.json']:
  p=root/name
  if p.exists():t.add(p,arcname='server/'+name)
 metadata=json.loads((root/'fio-post-test-host.json').read_text()) if (root/'fio-post-test-host.json').exists() else {k:subprocess.check_output(v,text=True) for k,v in {'dmesg':['dmesg','--ctime'],'nvme_smart_after':['nvme','smart-log','/dev/nvme1n1','-o','json'],'nvme_error_after':['nvme','error-log','/dev/nvme1n1','-e','8','-o','json'],'compiler':['cc','--version'],'write_cache':['cat','/sys/block/nvme1n1/queue/write_cache'],'lsblk':['lsblk','-b','-o','NAME,SIZE,MODEL,SERIAL,MOUNTPOINTS']}.items()}
 data=json.dumps(metadata,indent=2).encode();info=tarfile.TarInfo('server/final-host.json');info.size=len(data);t.addfile(info,io.BytesIO(data))
'''
subprocess.run(ssh+['sudo','python3','-'],input=code,text=True,check=True)
subprocess.run(['scp','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4:/opt/bench/fio-server-evidence.tar.xz',str(out/'server.tar.xz')],check=True)
with tarfile.open(out/'server.tar.xz') as t:t.extractall(raw,filter='data')
with tarfile.open(root/'spdk-interrupted.tar.xz') as t:t.extractall(raw/'client-interrupted',filter='data')
(raw/'client-interrupted/STATUS.json').write_text(json.dumps({'spdk_completed_points':['10M C','10M B'],'spdk_interrupted':'10M A first measured window stopped for fio diagnosis;100M not started','uring_interrupted':'User corrected required backend to SPDK;not accepted as SPDK','full_spdk_comparison_complete':False},indent=2)+'\n')
if (root/'spdk-trace-b').exists():
 shutil.copytree(root/'spdk-trace-b',raw/'spdk-trace-b',dirs_exist_ok=True)
 if (root/'spdk-trace-b.log').exists():shutil.copy2(root/'spdk-trace-b.log',raw/'spdk-trace-b.log')
manifest=[{'path':str(p.relative_to(raw)),'bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest()} for p in sorted(raw.rglob('*')) if p.is_file()]
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
with tarfile.open(out/'raw.tar.xz','w:xz') as t:t.add(raw,arcname='raw')
result={'bytes':(out/'raw.tar.xz').stat().st_size,'sha256':hashlib.file_digest((out/'raw.tar.xz').open('rb'),'sha256').hexdigest(),'files':len(manifest)};(out/'archive.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
