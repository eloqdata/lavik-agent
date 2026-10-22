#!/usr/bin/env python3
"""Replace the completed YCSB scratch layout with the peers' RAID0/XFS layout."""
import pathlib,json,subprocess as sp,os,time
P=pathlib.Path;ROOT=P('/opt/bench020');R=ROOT/'peers';Y=ROOT/'ycsb'
assert os.geteuid()==0
assert (Y/'complete.json').exists() and json.loads((Y/'complete.json').read_text())['complete']==16
assert not (R/'filesystem-prepared.json').exists()
for name in ['lavik','asd','redis-server','valkey-server']:
 assert sp.run(['pgrep','-x',name],stdout=sp.DEVNULL).returncode==1
md=P('/dev/md/bench020').resolve();assert str(md).startswith('/dev/md')
allowed=json.loads((ROOT/'config.json').read_text())['nvmes']
slaves=list((P('/sys/class/block')/md.name/'slaves').iterdir());assert len(slaves)==6
seen=set()
for slave in slaves:
 serial=(slave/'device/serial').read_text().strip();seen.add(serial)
 assert int((slave/'size').read_text())*512==1919850381312
assert seen=={d['serial'] for d in allowed}
assert sp.run(['findmnt','-rn','-S',str(md)],stdout=sp.DEVNULL).returncode!=0
for n in (1,2):
 dev=str(md)+'p'+str(n)
 assert P(dev).exists()
 assert sp.run(['findmnt','-rn','-S',dev],stdout=sp.DEVNULL).returncode!=0
 assert sp.run(['fuser',dev],stdout=sp.DEVNULL,stderr=sp.DEVNULL).returncode!=0
sp.run(['sgdisk','--zap-all',str(md)],check=True);sp.run(['blockdev','--rereadpt',str(md)],check=True);sp.run(['udevadm','settle'],check=True)
sp.run(['mkfs.xfs','-f',str(md)],check=True)
P('/mnt/bench020').mkdir(exist_ok=True)
sp.run(['mount','-o','noatime',str(md),'/mnt/bench020'],check=True)
(R/'filesystem-prepared.json').write_text(json.dumps({'time':time.time(),'md':str(md),'member_serials':sorted(seen),'mount':sp.check_output(['findmnt','-J','/mnt/bench020'],text=True)},indent=2))
# Match the historical package's native-device library layout.
g=R/'downloads/garnet/net10.0';native=g/'runtimes/linux-x64/native';native.mkdir(parents=True,exist_ok=True)
(native/'libnative_device.so').symlink_to('../../../libnative_device.so')
(g/'libaio.so.1').symlink_to('/lib/x86_64-linux-gnu/libaio.so.1t64')
