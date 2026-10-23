#!/usr/bin/env python3
"""Copy immutable completed memory/SPDK evidence while subsequent tests run."""
import pathlib,json,hashlib,tarfile,os,time,sys
P=pathlib.Path;r=P('/opt/bench020');kind=sys.argv[1];root=r/'results'/kind; storage=root/'storage/lavik-1b'
assert kind in ['small','large']
assert (root/'COMPLETE').exists() and not (root/'failure.json').exists() and not (root/'active-server.json').exists()
assert json.loads((r/'config.json').read_text())['storage_client_threads']==32
assert (storage/'COMPLETE').exists()
allow=['config.json','inventory-before.json','lavik.sha256','client-provenance.json','runner.py','spdk_run.py','run_all.py','client_wrapper.py','configure.py','network-policy.sh','collect-memory32.py','inventory.py']
files=[r/n for n in allow if (r/n).is_file()]
files += [f for f in sorted(storage.rglob('*')) if f.is_file() and not f.is_symlink() and 'data' not in f.relative_to(root).parts]
files += [f for f in (r/'storage32').glob('*') if f.is_file() and f.suffix in ['.py','.json','.log']]
manifest={str(p.relative_to(r)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in files}
m=r/'evidence-storage32-manifest.json';m.write_text(json.dumps({'utc':time.strftime('%FT%TZ',time.gmtime()),'files':manifest},indent=2)+'\n');files.append(m)
archive=r/'evidence-storage32.tar.gz'
assert not archive.exists()
with tarfile.open(archive,'w:gz') as t:
 for f in files:t.add(f,arcname=str(f.relative_to(r)),recursive=False)
os.chmod(archive,0o644)
print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'sha256':hashlib.file_digest(archive.open('rb'),'sha256').hexdigest(),'files':len(files)}))
