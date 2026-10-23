#!/usr/bin/env python3
"""Archive explicit benchmark evidence, excluding credentials and all datasets."""
import pathlib,json,subprocess,hashlib,tarfile,os,sys,time
P=pathlib.Path;root=P('/opt/bench020');kind=sys.argv[1];r=root/'results'/kind
assert kind in ['large','small']
assert (r/'COMPLETE').exists() and not (r/'active-server.json').exists()
if kind=='large':assert (root/'ALL_COMPLETE').exists()
for name in ['lavik','redis-server','valkey-server','asd','kvrocks','pika','tendisplus','GarnetServer']:
 assert subprocess.run(['pgrep','-x',name],stdout=subprocess.DEVNULL).returncode==1
c=json.loads((root/'config.json').read_text())
assert all((P('/sys/bus/pci/devices')/d['bdf']/'driver').resolve().name=='nvme' for d in c['nvmes'])
with (root/'inventory-after.json').open('w') as f:subprocess.run(['python3',str(root/'inventory.py')],stdout=f,check=True)
allow=['config.json','run.log','inventory-before.json','inventory-after.json','lavik.sha256','runner.py','spdk_run.py','run_all.py','client_wrapper.py','configure.py','network-policy.sh','collect.py','client-provenance.json','inventory.py']
files=[root/n for n in allow if (root/n).is_file()]
for f in sorted(r.rglob('*')):
 if f.is_file() and 'data' not in f.relative_to(r).parts:files.append(f)
if kind=='large':
 for name in ['ALL_COMPLETE','rest.log','run-rest.sh','aerospike.sha256','dotnet-prepare.log']:
  if (root/name).is_file():files.append(root/name)
 for d in ['ycsb','peers']:
  for f in sorted((root/d).rglob('*')):
   rel=f.relative_to(root/d)
   if f.is_file() and not f.is_symlink() and not any(x in rel.parts for x in ['downloads','sources','builds','dotnet','__pycache__']):files.append(f)
manifest={str(p.relative_to(root)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in files}
manifest_file=root/('evidence-'+kind+'-manifest.json');manifest_file.write_text(json.dumps({'utc':time.strftime('%FT%TZ',time.gmtime()),'files':manifest},indent=2)+'\n');files.append(manifest_file)
archive=root/('evidence-'+kind+'.tar.gz')
with tarfile.open(archive,'w:gz') as t:
 for f in files:t.add(f,arcname=str(f.relative_to(root)),recursive=False)
os.chmod(archive,0o644)
print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'sha256':hashlib.file_digest(archive.open('rb'),'sha256').hexdigest(),'files':len(files)}))
