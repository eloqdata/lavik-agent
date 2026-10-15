import pathlib,sys,json,time,subprocess as sp,shlex,traceback,fcntl
import runner as b
R=b.R

def provision(mode):
 b.event('PROVISION '+mode)
 cmd=['sudo','python3','/mnt/dev/benchmark/large-objects-20261014/provision.py',mode]
 sp.run(['ssh','-i','/opt/benchmark/keys/server-control','-o','BatchMode=yes','azureuser@10.84.0.4',shlex.join(cmd)],check=True,timeout=900)

def main():
 lock=(R/'runner.lock').open('w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 for p in ['redis','valkey','kvrocks']:
  assert (R/'smoke'/p/'COMPLETE').exists(),p+' smoke missing'
 assert not (R/'FORMAL_STARTED').exists()
 (R/'FORMAL_STARTED').write_text(time.strftime('%FT%TZ',time.gmtime()))
 provision('spdk')
 b.smoke('lavik')
 b.formal('lavik')
 provision('raid')
 for p in ['redis','valkey','kvrocks']:b.formal(p)
 files=list((R/'results').glob('*/*/r*/c*.json'))
 points=[p for p in files if p.stem[1:].isdigit()]
 assert len(points)==420,len(points)
 (R/'COMPLETE').write_text(time.strftime('%FT%TZ',time.gmtime()))
 b.event('COMPLETE: all 420 formal points')
if __name__=='__main__':
 try:main()
 except BaseException:
  b.save(R/'failure-batch.json',{'time':time.time(),'traceback':traceback.format_exc()});b.event('BATCH FAILED: '+str(sys.exc_info()[1]));raise
