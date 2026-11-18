#!/usr/bin/env python3
"""Sequential native-server campaign: three independent 60-second runs per point."""
import argparse,hashlib,json,pathlib,random,statistics,subprocess,time,traceback
import redis,threading
stop_sampling=threading.Event()
def sample_info():
 client=redis.Redis(host="10.83.0.4",socket_timeout=2)
 with (OUT/"info-timeseries.jsonl").open("a") as f:
  while not stop_sampling.is_set():
   try:row={"epoch":time.time(),"info":client.info()}
   except Exception as e:row={"epoch":time.time(),"error":str(e)}
   f.write(json.dumps(row,default=str)+"\n");f.flush();stop_sampling.wait(1)
parser=argparse.ArgumentParser();parser.add_argument('--resume',action='store_true');args=parser.parse_args()
ROOT=pathlib.Path('/opt/bench');OUT=ROOT/'defrag-ba-retry2';OUT.mkdir(exist_ok=True)
SSH=['ssh','-i',str(ROOT/'server-key'),'-o','StrictHostKeyChecking=accept-new','-o','UserKnownHostsFile='+str(ROOT/'server-known-hosts'),'bench@10.83.0.4']
PAIRS=[('lavik',10_000_000,sleep) for sleep in [100]]
plan=[]
for product,n,tiered in PAIRS:
 cells=[(w,0) for w in 'BA']
 plan.append({'product':product,'records':n,'tiered':tiered,'cells':cells})
(OUT/'schedule.json').write_text(json.dumps(plan,indent=2)+'\n')
(OUT/'common-sha256.txt').write_text(hashlib.sha256((ROOT/'kit/common.properties').read_bytes()).hexdigest()+'\n')
r=redis.Redis(host='10.83.0.4',socket_timeout=30)
def control(action,product,dataset,tiered=False):
 cmd=SSH+['sudo','python3','/opt/bench/defrag-server-control.py',action,product,'--dataset',dataset]
 if action=='start':cmd+=['--defrag-sleep-ms',str(tiered)]
 subprocess.run(cmd,check=True)
def snapshot(path,product):
 path.mkdir(exist_ok=True,parents=True)
 (path/'info.json').write_text(json.dumps(r.info(),indent=2,default=str)+'\n')
 (path/'server.json').write_text(subprocess.check_output(SSH+['sudo','python3','/opt/bench/capture-server.py',product],text=True))
def verify(product,n,path):
 subprocess.run(['python3',str(ROOT/'kit/verify.py'),'--host','10.83.0.4','--product',product,'--records',str(n),'--out',str(path)],check=True)
def phase(product,n,label,kind,workload='B',target=0):
 cmd=['python3',str(ROOT/'kit/run.py'),'--ycsb-root',str(ROOT/'YCSB-247a2d4'),'--host','10.83.0.4','--product',product,'--records',str(n),'--phase',kind,'--threads','128','--workload',workload,'--target',str(target),'--seconds','60','--out',str(OUT),'--label',label,'--execute']
 subprocess.run(cmd,check=True)
 return OUT/product/label
def wait_for_compaction(product,n,path):
 if product!='kvrocks':return
 stable=0;deadline=time.time()+3600
 with (path/'quiescence-wait.jsonl').open('a') as log:
  while time.time()<deadline:
   info=r.info();debt=sum(v for k,v in info.items() if k.startswith('estimate_pending_compaction_bytes[') and isinstance(v,(int,float)))
   record={'epoch':time.time(),'pending':info.get('compaction_pending',0),'running':info.get('num_running_compactions',0),'estimated_debt_bytes':debt,'background_errors':info.get('num_background_errors',0)}
   log.write(json.dumps(record)+'\n');log.flush()
   if record['background_errors']:raise RuntimeError('Kvrocks background errors')
   stable=stable+1 if not (record['pending'] or record['running'] or debt) else 0
   (OUT/'current.json').write_text(json.dumps({'product':product,'records':n,'state':'waiting_for_compaction',**record})+'\n')
   print('COMPACTION WAIT',record,flush=True)
   if stable>=3:return
   time.sleep(10)
 raise RuntimeError('Kvrocks did not finish post-load compaction within one hour')
threading.Thread(target=sample_info,daemon=True).start()
failures=[];summaries=json.loads((OUT/'summary.json').read_text()) if args.resume and (OUT/'summary.json').exists() else []
for row in plan:
 product,n,tiered=[row[k] for k in ['product','records','tiered']]
 tag='n10000000-defrag-ba-sleep-100ms'
 pairdir=OUT/product/tag
 if args.resume and (pairdir/'complete.json').exists():
  print('RESUME SKIP COMPLETED',product,n,flush=True);continue
 pairdir.mkdir(parents=True,exist_ok=args.resume)
 (OUT/'current.json').write_text(json.dumps({**row,'state':'loading','epoch':time.time()},indent=2)+'\n')
 print('PAIR START',tag,product,flush=True)
 try:
  loaded=args.resume and (pairdir/'verified-load.json').exists()
  if loaded:
   receipt=json.loads((OUT/product/(tag+'-load')/'exit.json').read_text())
   assert receipt['exit_code']==0 and receipt['successful_ops']==n
   if product not in ('lavik','kvrocks'):raise RuntimeError('Cannot resume an in-memory dataset after stopping its server')
   state=subprocess.run(SSH+['systemctl','is-active','bench-db-'+product],text=True,capture_output=True).stdout.strip()
   if state!='active':control('start',product,tag,tiered)
  else:
   control('start',product,tag,tiered)
   # Reopen the just-tested checkpoint; no reload for this diagnostic control.
   (pairdir/'diagnostic-history.json').write_text(json.dumps({'dataset':'Reusing existing10Mdataset after excludedAzureNVMe latency trials;no reload per userinstruction','reloaded':False})+'\n')
   verify(product,n,pairdir/'verified-load.json')
   snapshot(pairdir/'after-load',product)
  wait_for_compaction(product,n,pairdir)
  verify(product,n,pairdir/'verified-pre-C.json')
  (OUT/'current.json').write_text(json.dumps({**row,'state':'prepared','epoch':time.time()})+'\n')
  if False:
   info=r.info('tiered');(pairdir/'tiered-after-load.json').write_text(json.dumps(info,indent=2)+'\n')
   if not any(isinstance(v,(int,float)) and v>0 for k,v in info.items() if k in ('tiered_entries','tiered_entries_bytes','tiered_allocated_bytes')):
    raise RuntimeError('Experimental tiering did not demonstrate offloaded data')
  for workload,target in row['cells']:
   point=tag+f'-{workload}-t{target}'
   phase(product,n,point+'-warmup','warmup',workload,target)
   runs=[]
   for rep in range(1,4):
    (OUT/'current.json').write_text(json.dumps({**row,'state':'running','workload':workload,'target':target,'repeat':rep,'epoch':time.time()},indent=2)+'\n')
    label=point+f'-r{rep}'
    snapshot(pairdir/(label+'-before'),product)
    run_dir=phase(product,n,label,'measure',workload,target)
    snapshot(pairdir/(label+'-after'),product)
    runs.append(json.loads((run_dir/'exit.json').read_text()))
   mean_metrics={}
   for op in ['READ','UPDATE','Intended-READ','Intended-UPDATE']:
    keys=set.intersection(*(set(x['metrics'].get(op,{})) for x in runs))
    mean_metrics[op]={k:statistics.mean(x['metrics'][op][k] for x in runs) for k in keys if 'Latency' in k}
   summary={**row,'workload':workload,'target':target,'run_qps':[x['successful_qps'] for x in runs],'mean_qps':statistics.mean(x['successful_qps'] for x in runs),'mean_of_run_latency_statistics_us':mean_metrics,'run_seconds':[x['runtime_seconds'] for x in runs],'all_three_valid':all(x['exit_code']==0 and not x['errors'] for x in runs)}
   (pairdir/(point+'-mean.json')).write_text(json.dumps(summary,indent=2)+'\n');summaries.append(summary)
   (OUT/'summary.json').write_text(json.dumps(summaries,indent=2)+'\n')
   verify(product,n,pairdir/(point+'-samples.json'))
   print('POINT COMPLETE',product,n,workload,target,summary['mean_qps'],flush=True)
  verify(product,n,pairdir/'verified-final.json')
  (pairdir/'complete.json').write_text(json.dumps({'epoch':time.time()})+'\n')
 except Exception:
  detail=traceback.format_exc();print(detail,flush=True)
  (pairdir/'failure.txt').write_text(detail);failures.append({'product':product,'tag':tag,'detail':detail})
 finally:
  try:control('stop',product,tag)
  except Exception:print(traceback.format_exc(),flush=True)
 print('PAIR FINISHED',tag,product,flush=True)
(OUT/'complete.json').write_text(json.dumps({'finished_epoch':time.time(),'failures':failures},indent=2)+'\n')
print('CAMPAIGN COMPLETE',len(failures),'failed datasets',flush=True)

stop_sampling.set()
