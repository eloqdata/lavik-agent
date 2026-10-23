#!/usr/bin/env python3
"""Archive the immutable completed YCSB matrix while storage peers continue."""
import pathlib,json,hashlib,tarfile,time,os
P=pathlib.Path;r=P('/opt/bench020');y=r/'ycsb'
assert json.loads((y/'complete.json').read_text())['complete']==16
assert not (y/'failure.json').exists()
allow=['config.json','inventory-before.json','client-provenance.json','lavik.sha256','aerospike.sha256','collect-ycsb.py']
files=[r/n for n in allow if (r/n).is_file()]
files += [f for f in sorted(y.rglob('*')) if f.is_file() and not f.is_symlink() and '__pycache__' not in f.parts]
manifest={str(p.relative_to(r)):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in files}
m=r/'evidence-ycsb-manifest.json';m.write_text(json.dumps({'utc':time.strftime('%FT%TZ',time.gmtime()),'files':manifest},indent=2)+'\n');files.append(m)
a=r/'evidence-ycsb.tar.gz';assert not a.exists()
with tarfile.open(a,'w:gz') as t:
 for f in files:t.add(f,arcname=str(f.relative_to(r)),recursive=False)
os.chmod(a,0o644)
print(json.dumps({'archive':str(a),'bytes':a.stat().st_size,'sha256':hashlib.file_digest(a.open('rb'),'sha256').hexdigest(),'files':len(files)}))
