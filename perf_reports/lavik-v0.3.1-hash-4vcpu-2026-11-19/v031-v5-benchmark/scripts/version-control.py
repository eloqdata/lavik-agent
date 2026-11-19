#!/usr/bin/env python3
"""Official v0.3.1, fresh C/B/A triplicates and mature 10M B/A diagnostics."""
import argparse,json,pathlib,subprocess,time,threading,traceback,statistics,urllib.request
import redis
p=argparse.ArgumentParser();p.add_argument('--release',choices=['v030','v031'],required=True);a=p.parse_args();a.records=10000000
ROOT=pathlib.Path('/opt/bench');label=f'v031-control-{a.release}-b';OUT=ROOT/'v031-version-controls'/label;OUT.mkdir(parents=True,exist_ok=False)
SSH=['ssh','-i',str(ROOT/'server-key'),'-o','UserKnownHostsFile='+str(ROOT/'server-known-hosts'),'bench@10.83.0.4']
r=redis.Redis(host='10.83.0.4',socket_timeout=30);stop=threading.Event()
protocol={'records':a.records,'label':label,'release':'v0.3.1','source_sha':'dc6a3f98f403e952ecd0ffecb95e07eb8d9d7e03','binary_sha256':'29ae32e75ebb79c96cf5535fdf61ec5774dbfbc887fe717dd647ec40f57a9b7e','threads':128,'workers':4,'storage':'spdk','defrag_parameters':'all release defaults, no CLI overrides','flush_size_kb':128,'defrag_max_active':8,'defrag_sleep_ms':0,'defrag_record_sleep_us':0,'background_warrant_percent':1,'background_budget_us':10,'workloads':'CBA','warmup_seconds':60,'repetitions':3,'seconds':60,'target':0,'fresh_load':True,'extra_mature_10m':'After basic CBA: 300s A conditioning, then 60s warmup +3x60 B and A. Separate points.'}
protocol.update(release={'v030':'v0.3.0','v031':'v0.3.1'}[a.release],source_sha=None,binary_sha256=None,fresh_load=False,workloads='B',extra_mature_10m=None,description='Sequential same-data version control after v0.3.1 mature A, before100M reset. Default defrag and128KiB flush; no reload. Binary hashes recorded before warmup.');(OUT/'protocol.json').write_text(json.dumps(protocol,indent=2)+'\n')
def control(action):subprocess.run(SSH+['sudo','python3','/opt/bench/v031-v5-server-control.py',action,'--dataset',label,'--pin-workers','--release',a.release],check=True)
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
 binary='/opt/bench/v031-release/lavik-v0.3.1-linux-x86_64/lavik' if a.release=='v031' else '/opt/bench/lavik-standard/lavik-v0.3.0-linux-x86_64/lavik'
 (OUT/'binary-before.sha256').write_text(subprocess.check_output(SSH+['sha256sum',binary],text=True))
 control('start');verify('verified-existing');snapshot('initial');threading.Thread(target=sample,daemon=True).start()
 point('B','B')
 if a.release=='v031':
  keys=['latency-diagnostics-duration-seconds','latency-diagnostics-sample-every','latency-diagnostics-slow-threshold-us','latency-diagnostics-log-max-per-second','latency-diagnostics-enabled']
  old={k:r.config_get(k)[k] for k in keys}
  (OUT/'diagnostic-protocol.json').write_text(json.dumps({'seconds':30,'excluded_from_formal_means':True,'purpose':'Sample slow request stages after both versions showed slow95:5; read_io includes completion and resume waiting, not device-only latency.','original_config':old},indent=2)+'\n')
  try:
   for k,v in {'latency-diagnostics-duration-seconds':45,'latency-diagnostics-sample-every':64,'latency-diagnostics-slow-threshold-us':1000,'latency-diagnostics-log-max-per-second':20,'latency-diagnostics-enabled':'yes'}.items():r.config_set(k,v)
   snapshot('diagnostic-before');phase('B-diagnostic','warmup','B',30)
  finally:
   r.config_set('latency-diagnostics-enabled','no')
   for k,v in old.items():r.config_set(k,v)
  snapshot('diagnostic-after')
 verify('verified-final');snapshot('final');stop.set();control('stop')
 (OUT/'complete.json').write_text(json.dumps({'epoch':time.time(),'points':len(summary)})+'\n')
except BaseException:
 (OUT/'failure.txt').write_text(traceback.format_exc());stop.set()
 try:control('stop')
 except Exception:pass
 raise
