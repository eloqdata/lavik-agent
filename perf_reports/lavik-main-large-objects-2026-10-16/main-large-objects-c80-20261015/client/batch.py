import runner as b
import hashlib,json,time,fcntl,traceback
R=b.R
try:
 lock=(R/'runner.lock').open('w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 assert not (R/'STARTED').exists()
 assert hashlib.file_digest(open(R/'bench','rb'),'sha256').hexdigest()=='f596a6f1a5a1a600c5cec3240e0f56a0dd56f338283d5666e38a4c82ccb62b08'
 (R/'STARTED').write_text(time.strftime('%FT%TZ',time.gmtime()))
 b.event('Fresh storage; main 07e0f2ac, seven workloads c80 one round')
 b.remote('fresh','initial')
 b.smoke('pr');b.formal('pr')
 assert len(list((R/'results/pr').glob('*/r1/COMPLETE')))==7
 (R/'COMPLETE').write_text(time.strftime('%FT%TZ',time.gmtime()))
 b.event('COMPLETE all 7 main large-object points')
except BaseException:
 b.save(R/'failure-batch.json',{'traceback':traceback.format_exc()});b.event('FAILED');raise
