import pathlib,subprocess,json,time
out=pathlib.Path('/opt/bench/fio-alignment');out.mkdir(exist_ok=True)
assert pathlib.Path('/sys/class/nvme/nvme1/serial').read_text().strip()=='0baff889821a310b0001'
assert subprocess.run(['systemctl','is-active','--quiet','bench-db-lavik']).returncode!=0
for rep in range(1,4):
 for name,write in [('small-read-only',None),('small-read-aligned-write',53248),('small-read-unaligned-write',53760)]:
  p=out/f'{name}-r{rep}';p.mkdir(exist_ok=True)
  cfg='[global]\nfilename=/dev/nvme1n1\nioengine=io_uring\ndirect=1\ntime_based=1\nruntime=60\nramp_time=5\ngroup_reporting=1\ncpus_allowed=0-3\npercentile_list=50:95:99:99.9:99.99\n[read]\nrw=randread\nbssplit=1536/56:2048/44\nblockalign=512\noffset=1G\nsize=8G\nnumjobs=4\niodepth=32\n'
  if write:cfg+=f'[write]\nnew_group=1\nrw=write\nbs={write}\noffset=2T\nsize=1G\nnumjobs=1\niodepth=4\nrate=5M\n'
  (p/'job.fio').write_text(cfg);cmd=['fio',str(p/'job.fio'),'--output-format=json','--output='+str(p/'fio.json')]
  if write is None:cmd+=['--readonly']
  if not (p/'invocation.json').exists():(p/'invocation.json').write_text(json.dumps({'command':cmd,'epoch':time.time()}))
  r=subprocess.run(cmd,capture_output=True,text=True) if not (p/'fio.json').exists() else None
  if r: (p/'stderr.txt').write_text(r.stderr);assert r.returncode==0,r.stderr
  raw=(p/'fio.json').read_text();data=json.loads(raw[raw.index('{'):]);assert all(j['error']==0 for j in data['jobs']);j=data['jobs'][0]['read'];print(name,rep,j['iops'],j['clat_ns']['mean']/1000,flush=True)
(out/'complete.json').write_text(json.dumps({'windows':9,'epoch':time.time()}))
