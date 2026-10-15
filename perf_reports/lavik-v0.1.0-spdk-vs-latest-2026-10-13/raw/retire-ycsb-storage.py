"""Retire only the completed, archived six-disk YCSB RAID before fresh SPDK."""
from pathlib import Path
import os,json,subprocess as sp,time,sys
import runner as b
old=Path('/mnt/dev/benchmark/release010/ycsb')
r=Path(__file__).resolve().parent
assert os.geteuid()==0
assert (r.parent/'YCSB_ARCHIVED').exists(), 'Require locally verified evidence before destroying datasets'
assert json.loads((old/'complete.json').read_text())['complete']==16
sys.path.insert(0,str(old));import host_policy
host_policy.assert_default()
b.ssh('test -z "$(pgrep -x java)"')
# This is the completed Aero instance left running by the prior experiment.
sp.run(['systemctl','stop','aerospike-ycsb-default-20261013.service'],check=True,timeout=330)
for name in ['asd','lavik','redis-server','valkey-server']:
 assert sp.run(['pgrep','-x',name],stdout=sp.DEVNULL).returncode==1,name
md=Path('/dev/md/release010').resolve()
assert md.name.startswith('md') and md.exists()
block=Path('/sys/class/block')/md.name
assert (block/'md/level').read_text().strip()=='raid0'
assert (block/'md/raid_disks').read_text().strip()=='6'
devices=[]
for slave in (block/'slaves').iterdir():
 serial=(slave/'device/serial').read_text().strip()
 size=int((slave/'size').read_text())*512
 assert serial in b.SERIALS.values() and size==1919850381312
 devices.append({'device':'/dev/'+slave.name,'serial':serial,'bytes':size})
assert len(devices)==6 and {d['serial'] for d in devices}==set(b.SERIALS.values())
parts=list(block.glob(md.name+'p*'));assert len(parts)==2
for p in [block,*parts]:
 assert sp.run(['findmnt','-rn','-S','/dev/'+p.name],stdout=sp.DEVNULL).returncode!=0
 assert not list((p/'holders').iterdir())
b.write(r/'retired-ycsb-storage.json',{'utc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'md_device':str(md),'devices':devices,'archived_receipt':(r.parent/'YCSB_ARCHIVED').read_text(),'authorization':'User authorized clearing/rebuilding all six temporary NVMe; latest-version and 1 TB extension requested 2026-10-13.'})
sp.run(['mdadm','--stop',str(md)],check=True)
for d in devices:sp.run(['mdadm','--zero-superblock',d['device']],check=True)
sp.run(['udevadm','settle'],check=True)
print('Completed YCSB datasets retired after evidence archival; six NVMe released for fresh SPDK')
