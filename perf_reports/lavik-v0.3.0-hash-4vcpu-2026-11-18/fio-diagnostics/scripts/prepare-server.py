#!/usr/bin/env python3
"""Destructive reset of the explicitly authorized temporary NVMe only."""
import pathlib,subprocess,json,time,tarfile
root=pathlib.Path('/opt/bench/spdk-evidence');root.mkdir(exist_ok=True)
def run(cmd):
 p=subprocess.run(cmd,text=True,capture_output=True)
 with (root/'prepare.log').open('a') as f:f.write(json.dumps({'epoch':time.time(),'cmd':cmd,'rc':p.returncode,'stdout':p.stdout,'stderr':p.stderr})+'\n')
 if p.returncode:raise RuntimeError(str(cmd)+p.stderr)
 return p.stdout
dev='/dev/nvme1n1';pci='97b2:00:00.0';serial='0baff889821a310b0001'
assert pathlib.Path('/sys/class/nvme/nvme1/serial').read_text().strip()==serial
assert pathlib.Path('/sys/class/nvme/nvme1/device').resolve().name==pci
assert pathlib.Path('/sys/class/nvme/nvme0/device').resolve().name!=pci
assert int(run(['blockdev','--getsize64',dev]))==2879775571968
for product in ['lavik','redis','kvrocks','dragonfly']:
 assert subprocess.run(['systemctl','is-active','--quiet','bench-db-'+product]).returncode!=0
assert run(['findmnt','-rn','-S',dev,'-o','TARGET']).strip()=='/mnt/bench'
# Preserve diagnostic logs, never database files or credentials.
with tarfile.open(root/'pre-reset-server-logs.tar.xz','w:xz') as t:
 for p in pathlib.Path('/mnt/bench/lavik').rglob('*'):
  if p.is_file() and (p.name in ['launch.json','stdout.log'] or p.name.startswith('lavik.log')):t.add(p,arcname=str(p.relative_to('/mnt/bench')))
run(['umount','/mnt/bench'])
assert subprocess.run(['findmnt','-rn','-S',dev]).returncode!=0
run(['wipefs','--all',dev])
run(['blkdiscard','--force',dev])
# Explicitly zero the new member's label even if discard read semantics differ.
run(['dd','if=/dev/zero','of='+dev,'bs=4096','count=1','conv=fsync,notrunc'])
run(['modprobe','vfio-pci'])
previous={'hugepages':pathlib.Path('/sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages').read_text().strip(),'noiommu':pathlib.Path('/sys/module/vfio/parameters/enable_unsafe_noiommu_mode').read_text().strip(),'pci':pci,'serial':serial,'namespace':1,'reset_authorized':True}
(root/'original-host-settings.json').write_text(json.dumps(previous,indent=2)+'\n')
if not list(pathlib.Path('/sys/kernel/iommu_groups').iterdir()):
 pathlib.Path('/sys/module/vfio/parameters/enable_unsafe_noiommu_mode').write_text('1\n')
run(['env','PCI_ALLOWED='+pci,'PCI_BLOCKED=c05b:00:00.0','DRIVER_OVERRIDE=vfio-pci','HUGEMEM=2048','/opt/bench/spdk-d519b163cbc0e2f28c35d9bc86d610da368b032c/scripts/setup.sh','config'])
assert pathlib.Path('/sys/bus/pci/devices/'+pci+'/driver').resolve().name=='vfio-pci'
assert pathlib.Path('/sys/bus/pci/devices/c05b:00:00.0/driver').resolve().name=='nvme'
print('Authorized temporary NVMe reset and bound to VFIO; OS NVMe unchanged.')
