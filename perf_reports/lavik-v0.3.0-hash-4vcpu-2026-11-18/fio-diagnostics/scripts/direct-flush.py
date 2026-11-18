#!/usr/bin/env python3
"""Distinguish kernel fsync from explicit NVMe Flush on a write-through namespace."""
import pathlib,subprocess,json,time,csv
root=pathlib.Path('/opt/bench');out=root/'fio-nvme-flush';out.mkdir(exist_ok=True)
assert json.loads((root/'fio-crossover/complete.json').read_text())['windows']==12
assert subprocess.run(['systemctl','is-active','--quiet','bench-db-lavik']).returncode!=0
ns=[p for p in pathlib.Path('/sys/class/nvme').glob('nvme*') if (p/'device').resolve().name=='97b2:00:00.0'];assert len(ns)==1
assert (ns[0]/'serial').read_text().strip()=='0baff889821a310b0001'
dev='/dev/'+ns[0].name+'n1';assert int(subprocess.check_output(['blockdev','--getsize64',dev]))==2879775571968
assert subprocess.run(['findmnt','-rn','-S',dev]).returncode!=0
plan=[(rep,phase) for rep in range(1,4) for phase in ['append-nvmeflush64','read-after-nvmeflush']]
(out/'schedule.json').write_text(json.dumps(plan,indent=2)+'\n');rows=[]
with (out/'iostat.txt').open('w') as iolog:
 monitor=subprocess.Popen(['iostat','-x','-y','-t','1'],stdout=iolog)
 try:
  for rep,phase in plan:
   label=f'{phase}-r{rep}';folder=out/label;folder.mkdir()
   src=root/'fio-crossover'/('append-8MiB-r1' if phase.startswith('append') else 'read-before-r1')
   cfg=(src/'job.fio').read_text().replace(str(src),str(folder)).replace('randseed=1001','randseed='+str(1000+rep))
   assert 'filename='+dev in cfg
   (folder/'job.fio').write_text(cfg)
   cmd=['fio',str(folder/'job.fio'),'--output-format=json','--output='+str(folder/'fio.json')]
   if phase.startswith('read'):cmd.insert(1,'--readonly')
   start=time.time();(out/'current.json').write_text(json.dumps({'phase':phase,'repeat':rep,'epoch':start})+'\n')
   inv={'command':cmd,'started_epoch':start};flush=None;flushlog=None
   if phase.startswith('append'):
    inv['flush_command']=['/opt/bench/nvme-flush',dev,'64'];flushlog=(folder/'nvme-flush.csv').open('w');flush=subprocess.Popen(inv['flush_command'],stdout=flushlog,stderr=subprocess.PIPE,text=True)
   (folder/'invocation.json').write_text(json.dumps(inv,indent=2)+'\n')
   try:r=subprocess.run(cmd,capture_output=True,text=True)
   finally:
    if flush is not None:
     flush.terminate();_,err=flush.communicate(timeout=15);flushlog.close();(folder/'flush-exit.json').write_text(json.dumps({'returncode':flush.returncode,'stderr':err})+'\n')
   (folder/'stderr.txt').write_text(r.stderr);(folder/'exit.json').write_text(json.dumps({'returncode':r.returncode,'finished_epoch':time.time()})+'\n');assert r.returncode==0,r.stderr
   if flush is not None:assert flush.returncode==0,'Explicit NVMe Flush failed; inspect receipts'
   data=json.loads((folder/'fio.json').read_text());assert all(j['error']==0 for j in data['jobs'])
   readjobs=[j for j in data['jobs'] if j['read']['io_bytes']>0];assert len(readjobs)==1
   read=readjobs[0]['read'];writes=[j for j in data['jobs'] if j['write']['io_bytes']>0];assert read['runtime']>=59000
   row={'phase':phase,'repeat':rep,'read_iops':read['iops'],'clat_mean_us':read['clat_ns']['mean']/1000,'clat_p99_us':read['clat_ns']['percentile']['99.000000']/1000,'clat_p999_us':read['clat_ns']['percentile']['99.900000']/1000,'write_mib_s':sum(j['write']['bw_bytes'] for j in writes)/1024**2}
   if flush is not None:
    fl=list(csv.DictReader((folder/'nvme-flush.csv').open()));assert fl and all(x['result']=='0' for x in fl)
    row['nvme_flush_commands']=len(fl);row['nvme_flush_mean_us']=sum(int(x['duration_ns']) for x in fl)/len(fl)/1000
   rows.append(row);(out/'results.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(row),flush=True)
 finally:monitor.terminate();monitor.wait()
(out/'complete.json').write_text(json.dumps({'finished_epoch':time.time(),'windows':len(rows)})+'\n')
