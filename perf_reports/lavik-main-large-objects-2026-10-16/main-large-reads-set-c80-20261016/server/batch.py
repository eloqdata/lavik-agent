import runner as b
import subprocess as sp,shlex,time,traceback,fcntl,hashlib,json
R=b.R;SERVER='/mnt/dev/benchmark/'+R.name
try:
 lock=(R/'runner.lock').open('w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);assert not (R/'STARTED').exists()
 (R/'STARTED').write_text(time.strftime('%FT%TZ',time.gmtime()))
 meta={'compiler':sp.check_output(['g++','--version'],text=True),'source_sha256':hashlib.sha256((R/'bench.cpp').read_bytes()).hexdigest()}
 b.event('Compiling and validating extended array-response client')
 for src,target in [('bench.cpp','bench'),('bench_test.cpp','bench-test')]:sp.run(['g++','-std=c++17','-O3','-pthread',str(R/src),'-o',str(R/target)],check=True)
 with (R/'client-tests.log').open('w') as f:sp.run([str(R/'bench-test')],stdout=f,stderr=sp.STDOUT,check=True)
 meta['sha256']=hashlib.file_digest(open(R/'bench','rb'),'sha256').hexdigest();b.save(R/'CLIENT_BUILD.json',meta)
 b.event('Preparing SPDK and Lavik main')
 b.remote('fresh','initial');b.smoke('pr');b.formal('pr')
 b.event('Lavik complete; preparing six-disk RAID0/XFS for peer systems')
 sp.run(['ssh','-i','/opt/benchmark/keys/server-control','-o','BatchMode=yes','azureuser@10.84.0.4','sudo python3 '+SERVER+'/raid.py'],check=True,timeout=600)
 for product in ['redis','valkey','kvrocks']:
  b.smoke(product);b.formal(product)
 assert len(list((R/'results').glob('*/*/r1/COMPLETE')))==16
 (R/'COMPLETE').write_text(time.strftime('%FT%TZ',time.gmtime()));b.event('COMPLETE 16 new collection benchmarks')
except BaseException:
 b.save(R/'failure-batch.json',{'traceback':traceback.format_exc()});b.event('FAILED');raise
