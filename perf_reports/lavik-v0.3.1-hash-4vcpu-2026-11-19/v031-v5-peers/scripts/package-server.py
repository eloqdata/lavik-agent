import pathlib,subprocess,tarfile,hashlib,json
root=pathlib.Path('/opt/bench')
for product in ['redis','kvrocks','dragonfly','lavik']:
 assert subprocess.run(['systemctl','is-active','--quiet','bench-db-'+product]).returncode!=0
archive=root/'v031-v5-peers-server-evidence.tgz'
with tarfile.open(archive,'w:gz') as t:
 for product in ['redis','kvrocks','dragonfly']:
  for f in (pathlib.Path('/mnt/bench')/product).rglob('*'):
   if f.is_file() and (f.name in ['stdout.log','bench.conf','launch.json'] or (f.name.startswith('kvrocks_') and f.suffix=='.log') or f.name.startswith('LOG')):
    t.add(f,arcname='server/'+str(f.relative_to('/mnt/bench')))
 for name in ['v031-v5-peers-host','v031-v5-peer-prepare','v031-v5-peer-control.py','v031-v5-peer-capture.py','v031-v5-peer-preparation.json','v031-v5-hardware.json']:
  t.add(root/name,arcname='server/'+name)
 for f in pathlib.Path('/tmp').glob('dragonfly*'):
  if f.is_file():t.add(f.resolve(),arcname='server/dragonfly-logs/'+f.name)
subprocess.run(['chown','bench:bench',str(archive)],check=True)
sha=hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()
(root/'v031-v5-peers-server-SHA256SUMS').write_text(sha+'  '+str(archive)+'\n')
print(sha,flush=True)
