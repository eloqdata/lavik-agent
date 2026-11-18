#!/usr/bin/env python3
"""Fresh SPDK 10M B diagnostic; tracing results are not formal benchmark rows."""
import json,pathlib,subprocess,threading,time,urllib.request
import redis
root=pathlib.Path('/opt/bench');out=root/'spdk-trace-b';out.mkdir(exist_ok=False)
ssh=['ssh','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4']
tag='n10000000-spdk-trace';r=redis.Redis(host='10.83.0.4',socket_timeout=10)
def control(action):subprocess.run(ssh+['sudo','python3','/opt/bench/spdk-server-control.py',action,'--dataset',tag],check=True)
def phase(kind,label):
 cmd=['python3',str(root/'kit/run.py'),'--ycsb-root',str(root/'YCSB-247a2d4'),'--host','10.83.0.4','--product','lavik','--records','10000000','--phase',kind,'--threads','128','--workload','B','--target','0','--seconds','60','--out',str(out),'--label',label,'--execute']
 subprocess.run(cmd,check=True)
def snapshot(label):
 p=out/label;p.mkdir()
 (p/'info.json').write_text(json.dumps(r.info(),indent=2)+'\n')
 (p/'metrics.txt').write_bytes(urllib.request.urlopen('http://10.83.0.4:9100/metrics',timeout=5).read())
 (p/'server.json').write_bytes(subprocess.check_output(ssh+['sudo','python3','/opt/bench/spdk-capture-server.py','lavik']))
def sample(stop,label):
 client=redis.Redis(host='10.83.0.4',socket_timeout=5)
 with (out/(label+'-traces.jsonl')).open('w') as f:
  while not stop.is_set():
   try:
    records=client.execute_command('LATENCY','TRACE','GET',64)
    row={'epoch':time.time(),'info':client.info(),'traces':[json.loads(v) for v in records]}
   except Exception as e:row={'epoch':time.time(),'error':str(e)}
   f.write(json.dumps(row)+'\n');f.flush();stop.wait(5)
try:
 # This probe is allowed only after all fio services finish.
 subprocess.run(ssh+['test','-f','/opt/bench/fio-nvme-flush/complete.json'],check=True)
 code='''import pathlib,subprocess,json
for unit in ['bench-fio-readonly','bench-fio-crossover','bench-fio-direct-flush']:
 assert subprocess.run(['systemctl','is-active','--quiet',unit]).returncode!=0
metadata={k:subprocess.check_output(v,text=True) for k,v in {'dmesg':['dmesg','--ctime'],'nvme_smart_after':['nvme','smart-log','/dev/nvme1n1','-o','json'],'nvme_error_after':['nvme','error-log','/dev/nvme1n1','-e','8','-o','json'],'compiler':['cc','--version'],'write_cache':['cat','/sys/block/nvme1n1/queue/write_cache'],'lsblk':['lsblk','-b','-o','NAME,SIZE,MODEL,SERIAL,MOUNTPOINTS']}.items()}
pathlib.Path('/opt/bench/fio-post-test-host.json').write_text(json.dumps(metadata,indent=2)+'\\n')
'''
 subprocess.run(ssh+['sudo','python3','-'],input=code,text=True,check=True)
 control('reset');control('start');phase('load',tag+'-load')
 subprocess.run(['python3',str(root/'kit/verify.py'),'--host','10.83.0.4','--product','lavik','--records','10000000','--out',str(out/'verified-load.json')],check=True)
 phase('warmup',tag+'-warmup')
 for rep in range(1,4):
  label=tag+f'-B-r{rep}'
  r.execute_command('CONFIG','SET','latency-diagnostics-duration-seconds','90')
  r.execute_command('CONFIG','SET','latency-diagnostics-sample-every','64')
  r.execute_command('CONFIG','SET','latency-diagnostics-slow-threshold-us','0')
  r.execute_command('CONFIG','SET','latency-diagnostics-log-enabled','no')
  r.execute_command('LATENCY','TRACE','RESET')
  snapshot(label+'-before')
  r.execute_command('CONFIG','SET','latency-diagnostics-enabled','yes')
  stop=threading.Event();thread=threading.Thread(target=sample,args=(stop,label));thread.start()
  try:phase('measure',label)
  finally:stop.set();thread.join();r.execute_command('CONFIG','SET','latency-diagnostics-enabled','no')
  snapshot(label+'-after');print('TRACE POINT',rep,flush=True)
 subprocess.run(['python3',str(root/'kit/verify.py'),'--host','10.83.0.4','--product','lavik','--records','10000000','--out',str(out/'verified-final.json')],check=True)
 (out/'complete.json').write_text(json.dumps({'epoch':time.time(),'windows':3,'diagnostic_only':True})+'\n')
finally:control('stop')
