#!/usr/bin/env python3
"""Read / low-rate append / append+flush crossover on authorized scratch NVMe.

Writer touches only [2TiB,2TiB+1GiB). Do not resume Lavik on this storage set
without an explicit reset/reload after this diagnostic series.
"""
import argparse,pathlib,subprocess,json,time
p=argparse.ArgumentParser();p.add_argument('--allow-scratch-writes',action='store_true');a=p.parse_args();assert a.allow_scratch_writes
root=pathlib.Path('/opt/bench');out=root/'fio-crossover';out.mkdir(exist_ok=True)
assert json.loads((root/'fio-readonly/complete.json').read_text())['windows']==12
for unit in ['bench-db-lavik','bench-fio-readonly']:
 assert subprocess.run(['systemctl','is-active','--quiet',unit]).returncode!=0
pci='97b2:00:00.0';ns=[p for p in pathlib.Path('/sys/class/nvme').glob('nvme*') if (p/'device').resolve().name==pci];assert len(ns)==1
assert (ns[0]/'serial').read_text().strip()=='0baff889821a310b0001'
dev='/dev/'+ns[0].name+'n1';assert int(subprocess.check_output(['blockdev','--getsize64',dev]))==2879775571968
assert subprocess.run(['findmnt','-rn','-S',dev]).returncode!=0
plan=[(rep,phase) for rep in range(1,4) for phase in ['read-before','append-8MiB','append-8MiB-fsync','read-after']]
(out/'schedule.json').write_text(json.dumps(plan,indent=2)+'\n')
(out/'scratch-write-notice.json').write_text(json.dumps({'device':dev,'serial':'0baff889821a310b0001','write_offset':2*1024**4,'write_region_bytes':1024**3,'read_offset':1024**3,'read_region_bytes':8*1024**3,'reset_before_lavik_resume':True},indent=2)+'\n')
rows=[]
with (out/'iostat.txt').open('w') as log:
 monitor=subprocess.Popen(['iostat','-x','-y','-t','1'],stdout=log)
 try:
  for rep,phase in plan:
   label=f'{phase}-r{rep}';folder=out/label;folder.mkdir()
   cfg=f'''[global]
filename={dev}
ioengine=io_uring
direct=1
time_based=1
runtime=60
ramp_time=5
group_reporting=1
randrepeat=1
randseed={1000+rep}
norandommap=1
cpus_allowed=0-3
cpus_allowed_policy=shared
percentile_list=50:95:99:99.9:99.99
lat_percentiles=1
log_avg_msec=1000
write_iops_log={folder}/iops
write_lat_log={folder}/latency

[readers]
rw=randread
bssplit=4k/70:8k/30
blockalign=4k
iodepth=32
numjobs=4
offset=1G
size=8G
'''
   if phase.startswith('append'):
    cfg+='''
[writer]
new_group=1
rw=write
bs=128k
iodepth=4
numjobs=1
offset=2T
size=1G
rate=8m
refill_buffers=1
'''
    if phase.endswith('fsync'):cfg+='fsync=1\n'
   jobfile=folder/'job.fio';jobfile.write_text(cfg)
   cmd=['fio',str(jobfile),'--output-format=json','--output='+str(folder/'fio.json')]
   if phase.startswith('read'):cmd.insert(1,'--readonly')
   start=time.time();(folder/'invocation.json').write_text(json.dumps({'command':cmd,'started_epoch':start},indent=2)+'\n');(out/'current.json').write_text(json.dumps({'phase':phase,'repeat':rep,'epoch':start})+'\n')
   r=subprocess.run(cmd,capture_output=True,text=True);(folder/'stderr.txt').write_text(r.stderr);(folder/'exit.json').write_text(json.dumps({'returncode':r.returncode,'finished_epoch':time.time()})+'\n');assert r.returncode==0,r.stderr
   data=json.loads((folder/'fio.json').read_text());assert all(j['error']==0 for j in data['jobs'])
   readjobs=[j for j in data['jobs'] if j['read']['io_bytes']>0];assert len(readjobs)==1
   read=readjobs[0]['read'];assert read['runtime']>=59000
   writes=[j for j in data['jobs'] if j['write']['io_bytes']>0]
   assert bool(writes)==phase.startswith('append')
   row={'phase':phase,'repeat':rep,'read_iops':read['iops'],'read_bw_mib_s':read['bw_bytes']/1024**2,'clat_mean_us':read['clat_ns']['mean']/1000,'clat_p99_us':read['clat_ns']['percentile']['99.000000']/1000,'clat_p999_us':read['clat_ns']['percentile']['99.900000']/1000,'write_mib_s':sum(j['write']['bw_bytes'] for j in writes)/1024**2,'sync_ios':sum(j.get('sync',{}).get('total_ios',0) for j in writes)}
   rows.append(row);(out/'results.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(row),flush=True)
 finally:monitor.terminate();monitor.wait()
(out/'complete.json').write_text(json.dumps({'finished_epoch':time.time(),'windows':len(rows)})+'\n')
