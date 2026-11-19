#!/usr/bin/env python3
"""Official v0.3.1, fresh C/B/A triplicates and mature 10M B/A diagnostics."""
import argparse,json,pathlib,subprocess,time,threading,traceback,statistics,urllib.request
import redis
p=argparse.ArgumentParser();p.add_argument('--records',type=int,required=True);a=p.parse_args()
ROOT=pathlib.Path('/opt/bench');label=f'v031-v5-n{a.records}-default';OUT=ROOT/'v031-v5-benchmark'/label;OUT.mkdir(parents=True,exist_ok=False)
SSH=['ssh','-i',str(ROOT/'server-key'),'-o','UserKnownHostsFile='+str(ROOT/'server-known-hosts'),'bench@10.83.0.4']
r=redis.Redis(host='10.83.0.4',socket_timeout=30);stop=threading.Event()
protocol={'hardware':json.loads((ROOT/'v031-v5-hardware.json').read_text()),'records':a.records,'label':label,'release':'v0.3.1','source_sha':'dc6a3f98f403e952ecd0ffecb95e07eb8d9d7e03','binary_sha256':'29ae32e75ebb79c96cf5535fdf61ec5774dbfbc887fe717dd647ec40f57a9b7e','threads':128,'workers':4,'storage':'spdk','defrag_parameters':'all release defaults, no CLI overrides','flush_size_kb':128,'defrag_max_active':8,'defrag_sleep_ms':0,'defrag_record_sleep_us':0,'background_warrant_percent':1,'background_budget_us':10,'workloads':'CBA','warmup_seconds':60,'repetitions':3,'seconds':60,'target':0,'fresh_load':True,'extra_mature_10m':'After basic CBA: 300s A conditioning, then 60s warmup +3x60 B and A. Separate points.'}
(OUT/'protocol.json').write_text(json.dumps(protocol,indent=2)+'\n')
def control(action):subprocess.run(SSH+['sudo','python3','/opt/bench/v031-v5-server-control.py',action,'--dataset',label,'--pin-workers'],check=True)
def sample():
 c=redis.Redis(host='10.83.0.4',socket_timeout=2)
 with (OUT/'timeseries.jsonl').open('a') as f:
  while not stop.is_set():
   started=time.time()
   try:
    info=c.info();text=urllib.request.urlopen('http://10.83.0.4:9100/metrics',timeout=2).read().decode();metrics={}
    for line in text.splitlines():
     if line and not line.startswith('#'):
      k,v=line.rsplit(' ',1)
      if k.startswith(('lavik_storage_available_bytes{','lavik_storage_defrag_','lavik_storage_io_bytes_total{','lavik_storage_io_requests_total{','lavik_storage_flushes_pending','lavik_storage_durability_pending')):metrics[k]=float(v)
    x={'epoch':time.time(),'sample_seconds':time.time()-started,'info':info,'metrics':metrics}
   except Exception as e:x={'epoch':time.time(),'error':str(e)}
   f.write(json.dumps(x,default=str)+'\n');f.flush();stop.wait(max(.1,1-(time.time()-started)))
def snapshot(name):
 d=OUT/name;d.mkdir();info=r.info();cfg=r.config_get('*')
 for k,v in {'defrag-sleep-ms':'0','defrag-record-sleep-us':'0','defrag-max-active-per-device':'8','defrag-paused':'no','background-warrant-percent':'1','background-budget-us':'10'}.items():assert str(cfg[k])==v,(k,cfg[k])
 assert info.get('oom_rejected_commands',0)==0 and info.get('storage_durability_failed',0)==0
 (d/'info.json').write_text(json.dumps(info,indent=2,default=str)+'\n');(d/'config.json').write_text(json.dumps(cfg,indent=2,default=str)+'\n')
 (d/'server.json').write_text(subprocess.check_output(SSH+['sudo','python3','/opt/bench/capture-spdk.py','lavik'],text=True))
 (d/'metrics.txt').write_bytes(urllib.request.urlopen('http://10.83.0.4:9100/metrics',timeout=5).read())
def verify(name):subprocess.run(['python3',str(ROOT/'replacement-kit/verify.py'),'--host','10.83.0.4','--product','lavik','--records',str(a.records),'--out',str(OUT/(name+'.json'))],check=True)
def phase(name,kind,w='C',seconds=60):
 (OUT/'current.json').write_text(json.dumps({'phase':kind,'label':name,'epoch':time.time()})+'\n')
 subprocess.run(['python3',str(ROOT/'v031-v5-kit/run.py'),'--ycsb-root',str(ROOT/'YCSB-247a2d4'),'--host','10.83.0.4','--product','lavik','--records',str(a.records),'--phase',kind,'--threads','128','--workload',w,'--target','0','--seconds',str(seconds),'--out',str(OUT),'--label',name,'--execute'],check=True)
 return json.loads((OUT/'lavik'/name/'exit.json').read_text())
summary=[]
def point(w,prefix):
 phase(prefix+'-warmup','warmup',w);runs=[]
 for rep in range(1,4):
  name=prefix+'-r'+str(rep);snapshot(name+'-before');run=phase(name,'measure',w);snapshot(name+'-after');assert not run['errors'] and run['exit_code']==0;runs.append(run)
 verify(prefix+'-samples')
 row={'scope':label,'records':a.records,'workload':w,'point':prefix,'mean_qps':statistics.mean(x['successful_qps'] for x in runs),'read_p999_us':statistics.mean(x['metrics']['READ']['99.9PercentileLatency(us)'] for x in runs),'write_p999_us':statistics.mean(x['metrics']['UPDATE']['99.9PercentileLatency(us)'] for x in runs) if w!='C' else None,'runs':runs}
 summary.append(row);(OUT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print('POINT COMPLETE',json.dumps({k:v for k,v in row.items() if k!='runs'}),flush=True)
try:
 control('reset');control('start');snapshot('initial');threading.Thread(target=sample,daemon=True).start()
 phase('load','load');verify('verified-load');snapshot('after-load')
 for w in 'CBA':point(w,w)
 if a.records==10000000:
  snapshot('conditioning-before');phase('A-conditioning','warmup','A',300);snapshot('conditioning-after')
  for w in 'BA':point(w,w+'-mature')
 verify('verified-final');snapshot('final');stop.set();control('stop')
 (OUT/'complete.json').write_text(json.dumps({'epoch':time.time(),'points':len(summary)})+'\n')
except BaseException:
 (OUT/'failure.txt').write_text(traceback.format_exc());stop.set()
 try:control('stop')
 except Exception:pass
 raise
