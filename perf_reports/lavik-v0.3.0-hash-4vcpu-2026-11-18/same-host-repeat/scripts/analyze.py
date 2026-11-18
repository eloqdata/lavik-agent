#!/usr/bin/env python3
import argparse,json,pathlib,re,statistics,csv
p=argparse.ArgumentParser();p.add_argument('root',type=pathlib.Path);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args();rows=[]
for sleep in [0,100]:
 tag=f'n10000000-defrag-sleep-{sleep}ms';base=a.root/'lavik'/tag
 for workload in 'CBA':
  qs=[];metrics=[]
  for rep in [1,2,3]:
   folder=a.root/'lavik'/f'{tag}-{workload}-t0-r{rep}'
   log=(folder/'ycsb.log').read_text();assert not re.search(r'Exception|ERR Out of memory',log)
   m={}
   for line in log.splitlines():
    match=re.match(r'^\[([^]]+)\], ([^,]+), (.+)$',line)
    if match:
     op,key,v=match.groups()
     try:m.setdefault(op,{})[key]=float(v)
     except ValueError:pass
   for op,d in m.items():
    assert all(not v for k,v in d.items() if k.startswith('Return=') and k!='Return=OK')
   seconds=m['OVERALL']['RunTime(ms)']/1000;assert seconds>=57
   q=sum(m.get(op,{}).get('Return=OK',0) for op in ['READ','UPDATE'])/seconds
   e=json.loads((folder/'exit.json').read_text());assert e['exit_code']==0 and not e['errors'];assert abs(q-e['successful_qps'])<1e-7
   qs.append(q);metrics.append(m)
  starts=[];ends=[]
  for rep in [1,2,3]:
   folder=a.root/'lavik'/f'{tag}-{workload}-t0-r{rep}'
   hdr=(folder/'READ.hdr').read_text().splitlines()[:4]
   starts.append(float(re.search(r'StartTime: ([0-9.]+)',str(hdr))[1]))
   ends.append(json.loads((folder/'exit.json').read_text())['finished_epoch'])
  row={'measurement_start_epochs':starts,'measurement_end_epochs':ends,'sleep_ms':sleep,'workload':workload,'mean_qps':statistics.mean(qs),'run_qps':qs}
  for op in ['READ','UPDATE']:
   for metric,key in [('p99','99thPercentileLatency(us)'),('p999','99.9PercentileLatency(us)')]:
    vals=[m.get(op,{}).get(key) for m in metrics];row[op.lower()+'_'+metric+'_ms']=statistics.mean(vals)/1000 if all(v is not None for v in vals) else None
  rows.append(row)
series=[]
for line in (a.root/'info-timeseries.jsonl').read_text().splitlines():
 d=json.loads(line)
 if 'info' in d:series.append(d)
for row in rows:
 windows=list(zip(row['measurement_start_epochs'],row['measurement_end_epochs']))
 measured=[d for d in series if any(start<=d['epoch']<=end for start,end in windows)]
 row['defrag_samples']=len(measured)
 row['defrag_active_samples']=sum(d['info'].get('defrag_active',0)>0 for d in measured)
 row['defrag_max_pending']=max((d['info'].get('defrag_pending',0) for d in measured),default=0)
activity=[]
for sleep in [0,100]:
 records=[d for d in series if d['info'].get('defrag_block_sleep_ms')==sleep]
 activity.append({'sleep_ms':sleep,'samples':len(records),'active_samples':sum(d['info'].get('defrag_active',0)>0 for d in records),'max_active':max((d['info'].get('defrag_active',0) for d in records),default=0),'max_pending':max((d['info'].get('defrag_pending',0) for d in records),default=0)})
a.out.write_text(json.dumps({'rows':rows,'defrag_activity':activity},indent=2)+'\n');print(a.out.read_text())
