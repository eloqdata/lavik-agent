#!/usr/bin/env python3
import pathlib, subprocess, json, time, statistics
import argparse
p=argparse.ArgumentParser();p.add_argument('--confirm-discard',action='store_true');a=p.parse_args()
if not a.confirm_discard:p.error('This test erases the dedicated scratch NVMe; pass --confirm-discard only after checking device identity.')
B=pathlib.Path('/opt/bench/fio-screen');B.mkdir(exist_ok=False)
identity=json.loads(pathlib.Path('/opt/bench/new-host-identity/identity.json').read_text());PCI=identity['scratch_pci'];SERIAL=identity['scratch_serial'];OSPCI=identity['os_pci'];DEV=identity['scratch_device'];CTL=pathlib.Path(DEV).name.rsplit('n',1)[0]
(B/'identity.json').write_text(json.dumps(identity,indent=2)+'\n')
def run(cmd,path):
 t=time.time();r=subprocess.run(cmd,capture_output=True,text=True)
 (B/(path+'.json')).write_text(json.dumps({'cmd':cmd,'start':t,'end':time.time(),'returncode':r.returncode,'stdout':r.stdout,'stderr':r.stderr},indent=2)+'\n')
 assert r.returncode==0,(cmd,r.stderr)
 return r.stdout
assert pathlib.Path('/sys/class/nvme/'+CTL+'/serial').read_text().strip()==SERIAL
assert pathlib.Path('/sys/class/nvme/'+CTL+'/device').resolve().name==PCI
OSCTL=pathlib.Path(identity['os_device']).name.rsplit('n',1)[0]
assert pathlib.Path('/sys/class/nvme/'+OSCTL+'/device').resolve().name==OSPCI
assert int(run(['blockdev','--getsize64',DEV],'size'))==identity['scratch_bytes']
assert not json.loads(run(['lsblk','-J','-o','NAME,MOUNTPOINTS',DEV],'mounts'))['blockdevices'][0].get('children')
assert subprocess.run(['findmnt','-rn','-S',DEV],capture_output=True).returncode!=0
run(['nvme','id-ctrl',DEV,'-o','json'],'controller')
run(['nvme','smart-log',DEV,'-o','json'],'smart-before')
run(['fio','--version'],'fio-version')
run(['uname','-a'],'uname')
run(['swapoff','-a'],'swapoff')
assert identity['scratch_bytes'] >= 2*1024**4+1024**3
root_source=subprocess.check_output(['findmnt','-n','-o','SOURCE','/'],text=True).strip()
ancestors=subprocess.check_output(['lsblk','-s','-nr','-o','PATH',root_source],text=True).splitlines()
assert str(pathlib.Path(DEV).resolve()) not in [str(pathlib.Path(x).resolve()) for x in ancestors]
assert identity['os_device'] in ancestors and DEV!=identity['os_device']
run(['blkdiscard','--force',DEV],'full-discard')
# Write nonzero pseudorandom content to avoid testing an unwritten virtual range.
run(['fio','--name=initialize','--filename='+DEV,'--ioengine=io_uring','--direct=1','--rw=write','--bs=1M','--iodepth=16','--offset=1G','--size=8G','--refill_buffers=1','--scramble_buffers=1','--output-format=json'],'initialize')
time.sleep(10)
rows=[]
for rep in range(1,4):
 for name,bs,align,write in [('small-read-only','bssplit=1536/56:2048/44',512,False),('small-read-write','bssplit=1536/56:2048/44',512,True),('4k-read-write','bs=4096',4096,True)]:
  p=B/f'fio-{name}-r{rep}';p.mkdir()
  cfg=f'[global]\nfilename={DEV}\nioengine=io_uring\ndirect=1\ntime_based=1\nruntime=60\nramp_time=5\ngroup_reporting=1\ncpus_allowed=0-3\npercentile_list=50:95:99:99.9:99.99\n[read]\nrw=randread\n{bs}\nblockalign={align}\noffset=1G\nsize=8G\nnumjobs=4\niodepth=32\n'
  if write:cfg+='[write]\nnew_group=1\nrw=write\nbs=53248\noffset=2T\nsize=1G\nnumjobs=1\niodepth=4\nrate=5M\n'
  (p/'job.fio').write_text(cfg)
  cmd=['fio',str(p/'job.fio'),'--output-format=json','--output='+str(p/'fio.json')]+([] if write else ['--readonly'])
  run(cmd,f'fio-{name}-r{rep}/invocation');s=(p/'fio.json').read_text();d=json.loads(s[s.index('{'):]);assert all(j['error']==0 for j in d['jobs']);rd=d['jobs'][0]['read'];assert 59000<=rd['runtime']<=62000
  row={'engine':'fio','point':name,'repeat':rep,'read_iops':rd['iops'],'read_mean_us':rd['clat_ns']['mean']/1000,'read_p999_us':rd['clat_ns']['percentile']['99.900000']/1000,'read_mean_bytes':rd['io_bytes']/rd['total_ios'],'write_mib_s':sum(j['write']['bw_bytes'] for j in d['jobs'])/1048576}
  rows.append(row);(B/'progress.json').write_text(json.dumps(rows,indent=2));print(json.dumps(row),flush=True)
run(['nvme','smart-log',DEV,'-o','json'],'smart-after-fio')
means=[]
for point in ['small-read-only','small-read-write','4k-read-write']:
 rr=[r for r in rows if r['point']==point];assert len(rr)==3
 means.append({'point':point,**{k:statistics.mean(r[k] for r in rr) for k in ['read_iops','read_mean_us','read_p999_us','write_mib_s','read_mean_bytes']},'min_read_iops':min(r['read_iops'] for r in rr),'max_read_iops':max(r['read_iops'] for r in rr)})
checks=[]
for rep in range(1,4):
 pure=next(r for r in rows if r['repeat']==rep and r['point']=='small-read-only')
 for r in rows:
  if r['repeat']==rep and r['point']!='small-read-only':
   ratio=r['read_iops']/pure['read_iops'];checks.append({'repeat':rep,'point':r['point'],'mixed_to_pure_iops_ratio':ratio,'pass':ratio>=0.75 and r['read_mean_us']<1000})
(B/'complete.json').write_text(json.dumps({'windows':9,'rows':means,'checks':checks,'screen_pass':all(r['pass'] for r in checks),'epoch':time.time()},indent=2)+'\n')
print('COMPLETE',json.dumps(means),flush=True)
