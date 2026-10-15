import runner as b
import batch
import pathlib,fcntl,traceback,time
R=b.R
lock=(R/'runner.lock').open('w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
try:
 b.smoke('lavik')
 b.formal('lavik')
 batch.provision('raid')
 for p in ['redis','valkey','kvrocks']:
  b.smoke(p)
  b.formal(p)
 points=[p for p in (R/'results').glob('*/*/r*/c*.json') if p.stem[1:].isdigit()]
 assert len(points)==420,len(points)
 (R/'COMPLETE').write_text(time.strftime('%FT%TZ',time.gmtime()))
 b.event('COMPLETE: all 420 formal points')
except BaseException:
 b.save(R/'failure-resume.json',{'time':time.time(),'traceback':traceback.format_exc()});b.event('FAILED: see failure-resume.json');raise
