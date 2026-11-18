import pathlib,subprocess,json,time,argparse,socket,struct
p=argparse.ArgumentParser();p.add_argument('action',choices=['prepare','start','stop','snapshot']);a=p.parse_args();base=pathlib.Path('/opt/bench/aerospike-diagnosis');base.mkdir(exist_ok=True)
def run(cmd):
 r=subprocess.run(cmd,capture_output=True,text=True);assert r.returncode==0,(cmd,r.stdout,r.stderr);return r.stdout
if a.action=='stop':run(['systemctl','stop','bench-db-aerospike']);raise SystemExit
if a.action=='snapshot':
 out={}
 for cmd in ['build','statistics','namespace/ycsb','get-config:context=namespace;id=ycsb','get-config:context=service']:
  with socket.create_connection(('10.83.0.4',3000),timeout=5) as s:
   payload=(cmd+'\n').encode();s.sendall(struct.pack('>Q',(2<<56)|(1<<48)|len(payload))+payload)
   def read(n):
    b=b''
    while len(b)<n:
     v=s.recv(n-len(b));assert v;b+=v
    return b
   length=struct.unpack('>Q',read(8))[0]&((1<<48)-1);out[cmd]=read(length).decode()
 out['epoch']=time.time();out['ss']=run(['ss','-Htn','sport = :3000']);out['cgroup']=run(['systemctl','show','bench-db-aerospike','-p','MemoryCurrent','-p','CPUUsageNSec','-p','MemoryMax']);print(json.dumps(out));raise SystemExit
if a.action=='prepare':
 assert json.loads(pathlib.Path('/opt/bench/spdk-queue-probe/complete.json').read_text())['windows']==9
 for unit in ['bench-db-lavik','bench-db-aerospike','bench-db-redis','bench-db-kvrocks','bench-db-dragonfly','bench-alignment-followup']:
  assert subprocess.run(['systemctl','is-active','--quiet',unit]).returncode!=0,unit
 log={};log['bind']=run(['env','PCI_ALLOWED=97b2:00:00.0','/opt/bench/spdk-d519b163cbc0e2f28c35d9bc86d610da368b032c/scripts/setup.sh','reset'])
 assert pathlib.Path('/sys/class/nvme/nvme1/serial').read_text().strip()=='0baff889821a310b0001'
 assert int(run(['blockdev','--getsize64','/dev/nvme1n1']))==2879775571968
 assert subprocess.run(['findmnt','-rn','-S','/dev/nvme1n1']).returncode!=0
 log['smart-before']=run(['nvme','smart-log','/dev/nvme1n1','-o','json']);log['error-before']=run(['nvme','error-log','/dev/nvme1n1','-e','8','-o','json']);log['discard']=run(['blkdiscard','/dev/nvme1n1']);log['partition']=run(['parted','-s','/dev/nvme1n1','mklabel','gpt','mkpart','primary','1MiB','524289MiB']);run(['udevadm','settle'])
 assert int(run(['blockdev','--getsize64','/dev/nvme1n1p1']))==512*1024**3
 log['zero-header']=run(['dd','if=/dev/zero','of=/dev/nvme1n1p1','bs=1M','count=8','oflag=direct','conv=fsync'])
 samples=[]
 with open('/dev/nvme1n1p1','rb',buffering=0) as f:
  for offset in [0,1024**3,128*1024**3,256*1024**3,512*1024**3-4096]:f.seek(offset);assert f.read(4096)==bytes(4096);samples.append(offset)
 log['zero_samples']=samples;log['lsblk']=run(['lsblk','-b','-o','NAME,SIZE,SERIAL,MOUNTPOINTS']);log['hugepages']=run(['sysctl','-w','vm.nr_hugepages=0']);log['epoch']=time.time()
 run(['tar','-xJf','/opt/bench/aerospike-package.tar.xz','-C','/opt/bench']);run(['mkdir','-p','/opt/aerospike','/opt/aerospike/smd','/opt/aerospike/data','/var/run/aerospike','/var/log/aerospike']);run(['cp','-a','/opt/bench/aerospike-package/opt/aerospike/usr','/opt/aerospike/'])
 log['version']=run(['/opt/bench/aerospike-package/usr/bin/asd','--version']);log['sha256']=run(['sha256sum','/opt/bench/aerospike-package/usr/bin/asd']);(base/'prepare.json').write_text(json.dumps(log,indent=2)+'\n');print('PREPARED');raise SystemExit
assert (base/'prepare.json').exists()
for unit in ['bench-db-lavik','bench-db-aerospike','bench-db-redis','bench-db-kvrocks','bench-db-dragonfly']:
 assert subprocess.run(['systemctl','is-active','--quiet',unit]).returncode!=0
cfg='''service {
 cluster-name nvme-diagnosis-20261118
}
logging {
 console {
  context any info
 }
}
network {
 service {
  address 10.83.0.4
  port 3000
 }
 heartbeat {
  address 127.0.0.1
  mode mesh
  port 3002
 }
 fabric {
  address 127.0.0.1
  port 3001
 }
 admin {
  address 127.0.0.1
  port 3003
 }
}
namespace ycsb {
 replication-factor 1
 storage-engine device {
  device /dev/nvme1n1p1
 }
}
''';(base/'aerospike.conf').write_text(cfg)
cmd=['systemd-run','--unit=bench-db-aerospike','--collect','-p','AllowedCPUs=0-3','-p','CPUAffinity=0-3','-p','MemoryMax=28G','-p','MemorySwapMax=0','-p','LimitNOFILE=100000','-p','TimeoutStopSec=300','-p','SendSIGKILL=no','-p','StandardOutput=append:'+str(base/'server.log'),'-p','StandardError=inherit','/opt/bench/aerospike-package/usr/bin/asd','--config-file',str(base/'aerospike.conf'),'--foreground']
(base/'launch.json').write_text(json.dumps(cmd,indent=2)+'\n');print(run(cmd))
for _ in range(120):
 try:
  with socket.create_connection(('10.83.0.4',3000),timeout=2) as sock:
   payload=b'statistics\n';sock.sendall(struct.pack('>Q',(2<<56)|(1<<48)|len(payload))+payload)
   def read_ready(n):
    b=b''
    while len(b)<n:
     v=sock.recv(n-len(b))
     if not v:raise OSError('closed during readiness')
     b+=v
    return b
   n=struct.unpack('>Q',read_ready(8))[0]&((1<<48)-1);stats=read_ready(n).decode()
  if 'cluster_size=1;' in stats and 'cluster_is_member=true;' in stats:print('READY stable single-node cluster');break
  time.sleep(1)
 except OSError:time.sleep(1)
else:raise RuntimeError('startup timeout')
