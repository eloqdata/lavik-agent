#!/usr/bin/env python3
"""Recompute native unlimited-only summaries from unmodified YCSB logs."""
import argparse,csv,hashlib,json,pathlib,re,statistics
p=argparse.ArgumentParser();p.add_argument('root',type=pathlib.Path);p.add_argument('--out',type=pathlib.Path,default=pathlib.Path('audit.json'));a=p.parse_args()
root=a.root;errors=[];rows=[];windows=0;failed_points=[]
schedule=json.loads((root/'schedule.json').read_text())
common=pathlib.Path(__file__).with_name('common.properties')
assert hashlib.sha256(common.read_bytes()).hexdigest()==(root/'common-sha256.txt').read_text().strip(),'Common workload properties differ from the acquisition'
props=dict(line.split('=',1) for line in common.read_text().splitlines() if line and not line.startswith('#'))
for k,v in {'fieldcount':'8','fieldlength':'128','readallfields':'true','writeallfields':'true','redis.scanindex':'none','requestdistribution':'uniform'}.items():assert props.get(k)==v,(k,props.get(k))
def parse(path):
 text=path.read_text();metrics={}
 for line in text.splitlines():
  m=re.match(r'^\[([^]]+)\], ([^,]+), (.+)$',line)
  if m:
   op,k,v=m.groups()
   try:metrics.setdefault(op,{})[k]=float(v)
   except ValueError:pass
 exceptions=[x for x in text.splitlines() if re.search(r'\b[\w.$]*(?:Exception|Error)(?::|\s*$)',x)]
 if exceptions:raise ValueError('Exception/error trace: '+str(exceptions[:3]))
 for op,data in metrics.items():
  for k,v in data.items():
   if k.startswith('Return=') and k!='Return=OK' and v:raise ValueError(f'{op} {k}={v}')
 return metrics
for spec in schedule:
 product,n,tiered=(spec[k] for k in ['product','records','tiered'])
 tag=f'n{n}-native-unlimited'+('-tiered-listpack' if tiered else '')
 pairdir=root/product/tag
 try:
  load=parse(root/product/(tag+'-load')/'ycsb.log')
  assert load['INSERT']['Return=OK']==n,'Successful load count differs from configured count'
  final_path=pairdir/'verified-final.json'
  declared_failure=(product=='dragonfly' and n==100000000 and tiered and (pairdir/'failure.txt').exists())
  assert final_path.exists() or declared_failure,'Missing final validation without a recorded failure'
  for filename in ['verified-load.json']+(['verified-final.json'] if final_path.exists() else []):
   sample=json.loads((pairdir/filename).read_text())
   assert sample['configured_records']==n and sample['sample_count']>=1000
   assert sample['index_exists'] is False
  baseline_path=pairdir/'verified-pre-C.json'
  if not baseline_path.exists():baseline_path=pairdir/'verified-load.json'
  baseline=json.loads(baseline_path.read_text())['sample_sha256']
  read_only=json.loads((pairdir/(tag+'-C-t0-samples.json')).read_text())['sample_sha256']
  assert baseline==read_only,'Read-only sample hashes changed'
  for workload,target in spec['cells']:
   assert target==0,'Rate-limited condition found in final schedule'
   label=tag+f'-{workload}-t0';run_qps=[];per_run=[]
   if not (pairdir/(label+'-mean.json')).exists():
    failure_log=root/product/(label+'-warmup')/'ycsb.log'
    assert declared_failure and workload=='A' and 'ERR Out of memory' in failure_log.read_text(),'Unexplained missing point'
    assert not any((root/product/(label+f'-r{i}')).exists() for i in range(1,4)),'Unexpected partial measured windows'
    failed_points.append({'product':product,'records':n,'tiered':tiered,'workload':workload,'stage':'warmup','reason':'ERR Out of memory','measured_windows':0})
    continue
   point_sample=json.loads((pairdir/(label+'-samples.json')).read_text())
   assert point_sample['configured_records']==n and point_sample['sample_count']>=1000 and point_sample['index_exists'] is False
   for rep in range(1,4):
    folder=root/product/(label+f'-r{rep}')
    invocation=json.loads((folder/'invocation.json').read_text())
    assert '-target' not in invocation['command'],'Rate option present'
    assert invocation['args']['threads']==128 and invocation['args']['seconds']==60 and not invocation['args']['partial']
    if product=='kvrocks' and workload=='C' and rep==1:
     before=json.loads((pairdir/(label+'-r1-before')/'info.json').read_text())
     assert before.get('compaction_pending',0)==0 and before.get('num_running_compactions',0)==0,'Post-load compaction overlapped the read-only point'
    assert (folder/'READ.hdr').stat().st_size>0
    if workload!='C':assert (folder/'UPDATE.hdr').stat().st_size>0
    stats=parse(folder/'ycsb.log');runtime=stats['OVERALL']['RunTime(ms)']/1000
    assert runtime>=57,'Window ended early'
    successful=sum(stats.get(op,{}).get('Return=OK',0) for op in ['READ','UPDATE'])
    assert successful>0
    qps=successful/runtime;run_qps.append(qps);per_run.append(stats)
    stored=json.loads((folder/'exit.json').read_text())
    assert stored['exit_code']==0 and not stored['errors']
    assert abs(stored['successful_qps']-qps)<1e-7
    windows+=1
   summary=json.loads((pairdir/(label+'-mean.json')).read_text())
   mean=statistics.mean(run_qps)
   assert abs(summary['mean_qps']-mean)<1e-7
   assert len(summary['run_qps'])==3 and all(abs(x-y)<1e-7 for x,y in zip(run_qps,summary['run_qps']))
   row={'product':product,'records':n,'tiered':tiered,'workload':workload,'mean_qps':mean,'min_qps':min(run_qps),'max_qps':max(run_qps),**{f'run{i+1}_qps':q for i,q in enumerate(run_qps)}}
   for op in ['READ','UPDATE']:
    row[f'{op.lower()}_qps']=statistics.mean(s.get(op,{}).get('Return=OK',0)/(s['OVERALL']['RunTime(ms)']/1000) for s in per_run)
    for key,field in [('AverageLatency(us)','mean'),('99thPercentileLatency(us)','p99'),('99.9PercentileLatency(us)','p999')]:
     values=[s.get(op,{}).get(key) for s in per_run]
     row[f'{op.lower()}_{field}_ms']=statistics.mean(values)/1000 if all(v is not None for v in values) else None
   rows.append(row)
 except Exception as e:errors.append({'product':product,'records':n,'tiered':tiered,'error':str(e)})
result={'valid_points':len(rows),'valid_windows':windows,'expected_points':sum(len(x['cells']) for x in schedule),'errors':errors,'failed_points':failed_points,'rows':rows,'note':'Latency statistics are arithmetic means of per-run values; key counts are not independently scanned.'}
a.out.write_text(json.dumps(result,indent=2)+'\n')
if rows:
 with a.out.with_suffix('.csv').open('w',newline='') as f:
  writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
print(json.dumps({k:result[k] for k in ['valid_points','valid_windows','expected_points','failed_points','errors']},indent=2))
raise SystemExit(bool(errors))
