#!/usr/bin/env python3
import argparse,json,pathlib,subprocess,time
p=argparse.ArgumentParser();p.add_argument('action',choices=['start','stop','reset']);p.add_argument('--dataset',required=True);p.add_argument('--pin-workers',action='store_true');a=p.parse_args()
assert a.dataset.startswith('v031-v5-') and a.dataset.replace('-','').isalnum()
identity=json.loads(pathlib.Path('/opt/bench/new-host-identity/identity.json').read_text())
pci=identity['scratch_pci'];os_pci=identity['os_pci'];assert pci!=os_pci
host=json.loads(pathlib.Path('/opt/bench/v031-v5-hardware.json').read_text())['server_private_ip'];unit='bench-db-lavik';setup='/opt/bench/probe-kit/scripts/setup.sh'
base=pathlib.Path('/opt/bench/spdk-runs')/a.dataset;base.mkdir(parents=True,exist_ok=True)
def run(cmd):return subprocess.run(cmd,check=True,text=True,capture_output=True)
def active(name):return subprocess.run(['systemctl','is-active','--quiet',name]).returncode==0
if a.action=='stop':
 stopped=subprocess.run(['systemctl','stop',unit],capture_output=True,text=True)
 assert stopped.returncode in [0,5],stopped.stderr
 raise SystemExit(0)
for product in ['lavik','redis','kvrocks','dragonfly']:assert not active('bench-db-'+product)
assert pathlib.Path('/sys/bus/pci/devices/'+os_pci+'/driver').resolve().name=='nvme'
if a.action=='reset':
 logs=[]
 run(['modprobe','vfio-pci'])
 unsafe=pathlib.Path('/sys/module/vfio/parameters/enable_unsafe_noiommu_mode')
 if not pathlib.Path('/sys/bus/pci/devices/'+pci+'/iommu_group').exists():
  state=pathlib.Path('/opt/bench/v031-v5-vfio-before.json')
  if not state.exists():state.write_text(json.dumps({'previous':unsafe.read_text().strip(),'scratch_pci':pci})+'\n')
  previous=unsafe.read_text().strip();unsafe.write_text('1\n')
  logs.append({'vfio_noiommu':True,'previous':previous,'current':unsafe.read_text().strip(),'reason':'Azure guest has no IOMMU group; same VFIO mode as prior SPDK benchmark.'})
 cmd=['env','PCI_ALLOWED='+pci,'PCI_BLOCKED='+os_pci,'DRIVER_OVERRIDE=vfio-pci',setup,'reset'];r=run(cmd);logs.append({'cmd':cmd,'stdout':r.stdout,'stderr':r.stderr})
 ns=[x for x in pathlib.Path('/sys/class/nvme').glob('nvme*') if (x/'device').resolve().name==pci];assert len(ns)==1
 assert (ns[0]/'serial').read_text().strip()==identity['scratch_serial']
 dev='/dev/'+ns[0].name+'n1';assert int(run(['blockdev','--getsize64',dev]).stdout)==identity['scratch_bytes']
 assert subprocess.run(['findmnt','-rn','-S',dev]).returncode!=0
 assert not json.loads(run(['lsblk','-J','-o','NAME,MOUNTPOINTS',dev]).stdout)['blockdevices'][0].get('children')
 for cmd in [['blkdiscard','--force',dev],['dd','if=/dev/zero','of='+dev,'bs=4096','count=1','conv=fsync,notrunc'],['env','PCI_ALLOWED='+pci,'PCI_BLOCKED='+os_pci,'DRIVER_OVERRIDE=vfio-pci','HUGEMEM=2048',setup,'config']]:
  r=run(cmd);logs.append({'cmd':cmd,'stdout':r.stdout,'stderr':r.stderr})
 (base/'reset.json').write_text(json.dumps(logs,indent=2)+'\n')
 assert pathlib.Path('/sys/bus/pci/devices/'+pci+'/driver').resolve().name=='vfio-pci','SPDK setup did not bind the selected scratch controller; inspect reset.json'
 raise SystemExit(0)
assert pathlib.Path('/sys/bus/pci/devices/'+pci+'/driver').resolve().name=='vfio-pci'
binary='/opt/bench/v031-release/lavik-v0.3.1-linux-x86_64/lavik';assert pathlib.Path(binary).is_file()
cmd=['systemd-run','--unit',unit,'--collect','-p','AllowedCPUs=0-3','-p','CPUAffinity=0-3','-p','MemoryMax=26G','-p','MemorySwapMax=0','-p','LimitMEMLOCK=infinity','-p','LimitNOFILE=65535','-p','TimeoutStopSec=300','-p','SendSIGKILL=no','-p','StandardOutput=append:'+str(base/'stdout.log'),'-p','StandardError=inherit','--setenv=BYCORF_EAL_ARGS=-a '+pci,'--setenv=BYCORF_DPDK_MEMORY_MB=2048',binary,'--storage=spdk','--bind',host,'--port','6379','--metrics-port','9100','--threads','4','--max-memory','24gb','--data-file','spdk://'+pci+'/1','--log-dir',str(base/'logs'),'--shutdown-checkpoint']
if a.pin_workers:cmd+=['--pin-workers']
(base/'launch.json').write_text(json.dumps(cmd,indent=2)+'\n');print(run(cmd).stderr,flush=True)
for _ in range(180):
 r=subprocess.run(['redis-cli','-h',host,'PING'],capture_output=True,text=True)
 if r.stdout.strip()=='PONG':print('READY native SPDK');break
 if not active(unit):raise RuntimeError('SPDK startup failed; inspect '+str(base/'stdout.log'))
 time.sleep(1)
else:raise RuntimeError('SPDK startup timeout')
