#!/usr/bin/env python3
"""Non-destructive direct-I/O characterization of the dedicated benchmark NVMe."""
import pathlib,subprocess,json,time,hashlib,statistics
out=pathlib.Path('/opt/bench/fio-readonly');out.mkdir(exist_ok=True)
pci='97b2:00:00.0';ns=[p for p in pathlib.Path('/sys/class/nvme').glob('nvme*') if (p/'device').resolve().name==pci];assert len(ns)==1
assert (ns[0]/'serial').read_text().strip()=='0baff889821a310b0001'
dev='/dev/'+ns[0].name+'n1'
assert int(subprocess.check_output(['blockdev','--getsize64',dev]))==2879775571968
assert subprocess.run(['systemctl','is-active','--quiet','bench-db-lavik']).returncode!=0
assert subprocess.run(['findmnt','-rn','-S',dev]).returncode!=0
inventory={k:subprocess.check_output(v,text=True) for k,v in {'fio':['fio','--version'],'lsblk':['lsblk','-b','-o','NAME,SIZE,MODEL,SERIAL,MOUNTPOINTS'],'lscpu':['lscpu'],'meminfo':['cat','/proc/meminfo'],'nvme_smart':['nvme','smart-log',dev,'-o','json'],'nvme_id_ctrl':['nvme','id-ctrl',dev,'-o','json'],'nvme_id_ns':['nvme','id-ns',dev,'-o','json']}.items()}
(out/'inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
samples=[]
with open(dev,'rb',buffering=0) as f:
 for offset in range(1024**3,9*1024**3,512*1024**2):
  f.seek(offset);b=f.read(4096);samples.append({'offset':offset,'zero':not any(b),'sha256':hashlib.sha256(b).hexdigest()})
(out/'read-region-samples.json').write_text(json.dumps(samples,indent=2)+'\n')
assert not any(x['zero'] for x in samples),'Selected read range includes sampled discarded/zero pages; inspect before benchmarking'
matrix=[('4k-q1',4096,1,1),('4k-q32',4096,4,8),('4k-q128',4096,4,32),('8k-q128',8192,4,32)]
(out/'schedule.json').write_text(json.dumps(matrix,indent=2)+'\n')
rows=[]
with (out/'iostat.txt').open('w') as log:
 monitor=subprocess.Popen(['iostat','-x','-y','-t','1'],stdout=log)
 try:
  for name,bs,jobs,depth in matrix:
   for rep in range(1,4):
    label=f'{name}-r{rep}';folder=out/label;folder.mkdir()
    cmd=['fio','--readonly','--name='+name,'--filename='+dev,'--ioengine=io_uring','--direct=1','--rw=randread','--bs='+str(bs),'--iodepth='+str(depth),'--numjobs='+str(jobs),'--offset=1G','--size=8G','--time_based=1','--runtime=60','--ramp_time=5','--group_reporting=1','--randrepeat=1','--randseed='+str(1000+rep),'--norandommap=1','--cpus_allowed=0-3','--cpus_allowed_policy=shared','--percentile_list=50:95:99:99.9:99.99','--lat_percentiles=1','--output-format=json','--output='+str(folder/'fio.json'),'--write_iops_log='+str(folder/'iops'),'--write_lat_log='+str(folder/'latency'),'--log_avg_msec=1000']
    start=time.time();(out/'current.json').write_text(json.dumps({'point':name,'repeat':rep,'epoch':start})+'\n');(folder/'invocation.json').write_text(json.dumps({'command':cmd,'started_epoch':start},indent=2)+'\n')
    r=subprocess.run(cmd,capture_output=True,text=True);(folder/'stderr.txt').write_text(r.stderr);(folder/'exit.json').write_text(json.dumps({'returncode':r.returncode,'finished_epoch':time.time()})+'\n');assert r.returncode==0,r.stderr
    data=json.loads((folder/'fio.json').read_text());assert all(x['error']==0 for x in data['jobs']);assert len(data['jobs'])==1
    job=data['jobs'][0];read=job['read'];assert read['runtime']>=59000 and job['write']['io_bytes']==0
    row={'point':name,'repeat':rep,'iops':read['iops'],'bw_mib_s':read['bw_bytes']/1024**2,'clat_mean_us':read['clat_ns']['mean']/1000,'lat_mean_us':read['lat_ns']['mean']/1000,'clat_p99_us':read['clat_ns']['percentile']['99.000000']/1000,'clat_p999_us':read['clat_ns']['percentile']['99.900000']/1000,'usr_cpu':job['usr_cpu'],'sys_cpu':job['sys_cpu'],'iodepth_level':job['iodepth_level']}
    rows.append(row);(out/'results.json').write_text(json.dumps(rows,indent=2)+'\n');print(json.dumps(row),flush=True)
 finally:monitor.terminate();monitor.wait()
(out/'complete.json').write_text(json.dumps({'finished_epoch':time.time(),'windows':len(rows),'readonly':True})+'\n')
