#!/usr/bin/env python3
"""Copy immutable completed memory/SPDK evidence while subsequent tests run."""
import pathlib,json,hashlib,tarfile,os,time,sys
P=pathlib.Path;r=P('/opt/bench020');kind=sys.argv[1];root=r/'results'/kind
assert kind in ['small','large']
assert (root/'COMPLETE').exists() and not (root/'failure.json').exists() and not (root/'active-server.json').exists()
allow=['config.json','inventory-before.json','lavik.sha256','client-provenance.json','runner.py','spdk_run.py','run_all.py','client_wrapper.py','configure.py','network-policy.sh','collect-memory.py','inventory.py']
files=[r/n for n in allow if (r/n).is_file()]
files += [f for f in sorted(root.rglob('*')) if f.is_file() and not f.is_symlink() and 'data' not in f.relative_to(root).parts]
manifest={str(p.relative_to(r)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in files}
m=r/('evidence-'+kind+'-manifest.json');m.write_text(json.dumps({'utc':time.strftime('%FT%TZ',time.gmtime()),'files':manifest},indent=2)+'\n');files.append(m)
archive=r/('evidence-'+kind+'.tar.gz')
assert not archive.exists()
with tarfile.open(archive,'w:gz') as t:
 for f in files:t.add(f,arcname=str(f.relative_to(r)),recursive=False)
os.chmod(archive,0o644)
print(json.dumps({'archive':str(archive),'bytes':archive.stat().st_size,'sha256':hashlib.file_digest(archive.open('rb'),'sha256').hexdigest(),'files':len(files)}))
