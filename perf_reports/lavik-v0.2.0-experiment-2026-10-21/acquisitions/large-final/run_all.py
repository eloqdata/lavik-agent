#!/usr/bin/env python3
import os,time,hashlib,traceback,fcntl
import runner as b
import spdk_run
assert os.geteuid()==0
lock=(b.ROOT/'run.lock').open('w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
assert os.cpu_count()==b.C['workers']
assert b.out(['uname','-r'])=='6.17.0-1022-azure'
assert hashlib.file_digest(b.LAVIK.open('rb'),'sha256').hexdigest()==b.C['lavik_binary_sha256']
for name in ['lavik','redis-server','valkey-server','asd','kvrocks','pika','tendisplus','GarnetServer','memtier_benchmark']:
 assert b.sp.run(['pgrep','-x',name],stdout=b.sp.DEVNULL).returncode==1,name
assert not (b.R/'EXPERIMENT.json').exists(), 'One-shot batch: inspect partial results before resume'
b.write(b.R/'EXPERIMENT.json',b.C)
try:
 b.snapshot(b.R/'host-before.json')
 if b.C['kind']=='small':
  spdk_run.main(10**6,'lavik-1m');spdk_run.main(10**8,'lavik-100m')
 else:
  spdk_run.main(10**7,'lavik-10m');spdk_run.main(10**9,'lavik-1b')
 b.memory('redis');b.memory('valkey');b.snapshot(b.R/'host-after.json')
 (b.R/'COMPLETE').write_text(str(time.time())+'\n');b.event('COMPLETE '+b.C['kind'])
except BaseException:
 b.write(b.R/'failure.json',{'time':time.time(),'traceback':traceback.format_exc()});raise
