#!/usr/bin/env python3
"""Prepare the new task-owned scratch disks after the complete SPDK matrix."""
import json,pathlib,subprocess as sp,time,os,sys
R=pathlib.Path(__file__).resolve().parent;ROOT=R.parent
sys.path.insert(0,str(ROOT));import spdk_run
assert os.geteuid()==0
assert (ROOT/'results/large/COMPLETE').exists()
assert not (R/'provision-complete.json').exists()
def run(a,**kw):return sp.run([str(x) for x in a],check=True,**kw)
def out(a):return sp.check_output([str(x) for x in a],text=True).strip()
def save(n,v):(R/n).write_text(json.dumps(v,indent=2)+'\n')
for name in ['lavik','asd','redis-server','valkey-server']:
 assert sp.run(['pgrep','-x',name],stdout=sp.DEVNULL).returncode==1
assert out(['uname','-r'])=='6.17.0-1022-azure'
assert not pathlib.Path('/dev/md/bench020').exists()
devices=spdk_run.inventory();assert len(devices)==6
save('devices-before.json',devices)
for d in devices:run(['blkdiscard',d['device']])
run(['mdadm','--create','/dev/md/bench020','--metadata=1.2','--level=0','--raid-devices=6','--chunk=512','--run',*[d['device'] for d in devices]])
run(['udevadm','settle']);md=str(pathlib.Path('/dev/md/bench020').resolve());assert md.startswith('/dev/md')
size=2147450880;start=49152
run(['sgdisk','-o','-a','49152','-n',f'1:{start}:{start+size-1}','-c','1:bench020-aerospike','-n',f'2:{start+size}:{start+2*size-1}','-c','2:bench020-lavik',md])
run(['blockdev','--rereadpt',md]);run(['udevadm','settle'])
for num,name in [(1,'aerospike'),(2,'lavik')]:
 device=f'{md}p{num}';assert int(out(['blockdev','--getsize64',device]))==1099494850560
 (R/(name+'-device')).symlink_to(device);t=time.time()
 with (R/(name+'-zero.log')).open('w') as log:run(['dd','if=/dev/zero','of='+device,'bs=16M','count=65535','oflag=direct','conv=fdatasync','status=progress'],stdout=log,stderr=log)
 with open(device,'rb',buffering=0) as f:
  for offset in [0,1099494850560//2,1099494850560-2**20]:f.seek(offset);assert f.read(2**20)==bytes(2**20)
 save(name+'-zero.json',{'device':device,'bytes':1099494850560,'seconds':time.time()-t})
save('storage-after.json',{'partition_table':json.loads(out(['sfdisk','--json',md])),'mdadm':out(['mdadm','--detail',md]),'devices':devices})
pathlib.Path('/sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages').write_text('0')
for p in ['/opt/aerospike/smd','/var/log/aerospike','/var/run/aerospike']:pathlib.Path(p).mkdir(parents=True,exist_ok=True)
save('provision-complete.json',{'utc':time.strftime('%FT%TZ',time.gmtime()),'disks':devices,'storage':'6-disk RAID0,512KiB,two raw fully zeroed 1099494850560-byte partitions','authorization':'New dedicated scratch NVMe in task-created lavik-v020-large-20261021 resource group; user requested Azure reprovisioning.'})
