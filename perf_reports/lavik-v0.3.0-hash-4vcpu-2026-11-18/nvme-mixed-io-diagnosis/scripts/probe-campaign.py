import pathlib,subprocess,json,time
out=pathlib.Path('/opt/bench/spdk-queue-probe');out.mkdir(exist_ok=False)
assert json.loads(pathlib.Path('/opt/bench/fio-alignment/complete.json').read_text())['windows']==9
assert subprocess.run(['systemctl','is-active','--quiet','bench-fio-alignment2']).returncode!=0
for unit in ['bench-db-lavik','bench-db-aerospike','bench-db-redis','bench-db-kvrocks','bench-db-dragonfly']:
 assert subprocess.run(['systemctl','is-active','--quiet',unit]).returncode!=0
cmd=['env','PCI_ALLOWED=97b2:00:00.0','HUGEMEM=2048','/opt/bench/spdk-d519b163cbc0e2f28c35d9bc86d610da368b032c/scripts/setup.sh']
r=subprocess.run(cmd,capture_output=True,text=True);(out/'binding.log').write_text(r.stdout+r.stderr);assert r.returncode==0
for rep in range(1,4):
 for name,mode,wsize,rsize in [('small-read-only',0,53248,0),('small-read-write',1,53248,0),('4k-read-write',1,53248,4096)]:
  p=out/f'{name}-r{rep}';p.mkdir();cmd=['/opt/bench/queue_probe',str(mode),str(wsize),str(rsize)]
  (p/'invocation.json').write_text(json.dumps({'cmd':cmd,'epoch':time.time()}));r=subprocess.run(cmd,capture_output=True,text=True);(p/'stdout.txt').write_text(r.stdout);(p/'stderr.txt').write_text(r.stderr);(p/'exit.json').write_text(json.dumps({'returncode':r.returncode,'epoch':time.time()}));assert r.returncode==0,r.stderr
  row=json.loads([l for l in r.stdout.splitlines() if l.startswith('{')][-1]);assert row['errors']==0;(p/'result.json').write_text(json.dumps(row,indent=2)+'\n');print(rep,row,flush=True)
(out/'complete.json').write_text(json.dumps({'windows':9,'epoch':time.time()}))
