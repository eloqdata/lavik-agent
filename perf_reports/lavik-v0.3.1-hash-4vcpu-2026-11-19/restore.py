import pathlib,json,hashlib,tarfile
root=pathlib.Path(__file__).resolve().parent
m=json.loads((root/'raw/manifest.json').read_text());target=root/'restored';assert not target.exists(),target
archive=root/m['archive'];partial=archive.with_suffix('.partial')
with partial.open('wb') as out:
 for part in m['parts']:
  p=root/part['path'];assert p.stat().st_size==part['bytes'];assert hashlib.file_digest(p.open('rb'),'sha256').hexdigest()==part['sha256'];out.write(p.read_bytes())
assert partial.stat().st_size==m['bytes'];assert hashlib.file_digest(partial.open('rb'),'sha256').hexdigest()==m['sha256'];partial.replace(archive)
with tarfile.open(archive) as t:t.extractall(target,filter='data')
print('Verified and extracted:',target)
