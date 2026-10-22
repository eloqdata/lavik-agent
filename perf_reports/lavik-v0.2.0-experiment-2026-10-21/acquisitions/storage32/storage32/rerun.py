#!/usr/bin/env python3
"""Rerun Lavik 1B with 32 clients threads, then provision fresh peer storage."""
import pathlib,json,subprocess as sp,time,os,hashlib,traceback
import runner as b,spdk_run
P=pathlib.Path;r=b.ROOT;y=r/'ycsb';p=r/'peers';here=P(__file__).resolve().parent
assert os.geteuid()==0 and b.C['kind']=='large'
def run(args):return sp.run([str(x) for x in args],check=True)
def out(args):return sp.check_output([str(x) for x in args],text=True).strip()
try:
 print('Waiting for complete YCSB evidence to be verified locally',flush=True)
 while not (r/'YCSB_EVIDENCE_SAVED.json').exists():time.sleep(5)
 saved=json.loads((r/'YCSB_EVIDENCE_SAVED.json').read_text())
 assert saved['sha256']==hashlib.file_digest((r/'evidence-ycsb.tar.gz').open('rb'),'sha256').hexdigest()
 assert json.loads((y/'complete.json').read_text())['complete']==16
 for name in ['lavik','asd','redis-server','valkey-server']:
  assert sp.run(['pgrep','-x',name],stdout=sp.DEVNULL).returncode==1
 md=P('/dev/md/bench020').resolve();assert str(md).startswith('/dev/md') and md.exists()
 slaves=list((P('/sys/class/block')/md.name/'slaves').iterdir())
 expected={d['serial']:d for d in b.C['nvmes']};devices=[]
 for s in slaves:
  serial=(s/'device/serial').read_text().strip();assert serial in expected
  assert int((s/'size').read_text())*512==expected[serial]['bytes']
  assert (s/'device/device').resolve().name==expected[serial]['bdf']
  devices.append('/dev/'+s.name)
 assert len(devices)==6 and len({(s/'device/serial').read_text().strip() for s in slaves})==6
 for dev in [str(md),str(md)+'p1',str(md)+'p2']:
  assert sp.run(['findmnt','-rn','-S',dev],stdout=sp.DEVNULL).returncode!=0
  assert sp.run(['fuser',dev],stdout=sp.DEVNULL,stderr=sp.DEVNULL).returncode!=0
 b.write(here/'raid-before.json',{'md':str(md),'devices':devices,'detail':out(['mdadm','--detail',md]),'authorization':'User requested 32-thread 1B rerun; these are the six dedicated scratch NVMe created for this task.'})
 run(['mdadm','--stop',md])
 for dev in devices:run(['mdadm','--zero-superblock',dev])
 run(['udevadm','settle']);spdk_run.inventory()
 old=b.R/'storage/lavik-1b';archive=r/'superseded/large-storage16/lavik-1b'
 assert old.is_dir() and not archive.exists();archive.parent.mkdir(parents=True,exist_ok=True);old.rename(archive)
 (b.R/'COMPLETE').unlink()
 original=json.loads((r/'config.json').read_text());b.write(here/'config-before.json',original)
 b.C.update(storage_client_threads=32,storage_client_cpus='0-31',storage_connections=[160,320,640,1280])
 b.write(r/'config.json',b.C)
 b.write(here/'settings.json',{'client_threads':32,'client_cpus':'0-31','connections':[160,320,640,1280],'fill_connections':640,'measured_seconds':60,'request':'32 memtier threads for 1B; remove 80-connection point'})
 spdk_run.main(10**9,'lavik-1b')
 assert len(list((b.R/'storage/lavik-1b').glob('get-c*.result.json')))==4
 assert len(list((b.R/'storage/lavik-1b').glob('set-c*.result.json')))==4
 (b.R/'COMPLETE').write_text(time.strftime('%FT%TZ',time.gmtime())+'\n')
 b.event('COMPLETE large with 32-thread 1B rerun')
 run(['python3',r/'collect-memory32.py','large'])
 devices=spdk_run.inventory()
 for d in devices:run(['blkdiscard',d['device']])
 run(['mdadm','--create','/dev/md/bench020','--metadata=1.2','--level=0','--raid-devices=6','--chunk=512','--run',*[d['device'] for d in devices]])
 run(['udevadm','settle']);md=P('/dev/md/bench020').resolve()
 run(['mkfs.xfs','-f',md]);P('/mnt/bench020').mkdir(exist_ok=True)
 run(['mount','-o','noatime',md,'/mnt/bench020'])
 b.write(p/'filesystem-prepared.json',{'time':time.time(),'md':str(md),'member_serials':sorted(d['serial'] for d in devices),'mount':out(['findmnt','-J','/mnt/bench020']),'after':'32-thread Lavik 1B rerun'})
 g=p/'downloads/garnet/net10.0';native=g/'runtimes/linux-x64/native';native.mkdir(parents=True,exist_ok=True)
 (native/'libnative_device.so').symlink_to('../../../libnative_device.so')
 (g/'libaio.so.1').symlink_to('/lib/x86_64-linux-gnu/libaio.so.1t64')
 b.write(r/'storage32-ready.json',{'client_threads':32,'lavik_complete':True,'utc':time.strftime('%FT%TZ',time.gmtime())})
except BaseException:
 b.write(here/'failure.json',{'utc':time.strftime('%FT%TZ',time.gmtime()),'traceback':traceback.format_exc()})
 raise
