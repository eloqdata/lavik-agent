#!/usr/bin/env python3
"""Recompute completed triplicates from YCSB text logs, independent of campaign means."""
import pathlib,json,re,statistics,collections,argparse,hashlib
p=argparse.ArgumentParser();p.add_argument('raw',type=pathlib.Path);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args()
groups=collections.defaultdict(list);invalid=[];loads=[];failed_warmups=[]
for f in sorted(a.raw.rglob('invocation.json')):
 inv=json.loads(f.read_text())
 if 'args' not in inv or inv['args'].get('phase') not in ['load','measure','warmup']:continue
 args=inv['args'];folder=f.parent
 assert inv['command'][2]=='lavik',folder
 assert 'lavik.host=10.83.0.4' in inv['command'],folder
 if args['phase']=='warmup':
  warm=json.loads((folder/'exit.json').read_text()) if (folder/'exit.json').exists() else None
  if warm is None or warm['exit_code'] or warm['errors']:failed_warmups.append({'path':str(folder.relative_to(a.raw)),'receipt':warm})
  continue
 if not (folder/'exit.json').exists():invalid.append({'path':str(folder),'reason':'interrupted; no exit receipt'});continue
 receipt=json.loads((folder/'exit.json').read_text())
 if receipt['exit_code'] or receipt['errors']:invalid.append({'path':str(folder),'reason':receipt});continue
 metrics={}
 text=(folder/'ycsb.log').read_text()
 for line in text.splitlines():
  m=re.match(r'^\[([^]]+)\], ([^,]+), (.+)$',line)
  if m:
   try:metrics.setdefault(m[1],{})[m[2]]=float(m[3])
   except ValueError:pass
 assert not any(v for op,d in metrics.items() for k,v in d.items() if k.startswith('Return=') and k!='Return=OK'),folder
 assert 'Exception in thread' not in text,folder
 count=sum(metrics.get(op,{}).get('Return=OK',0) for op in ['READ','UPDATE','INSERT'])
 runtime=metrics['OVERALL']['RunTime(ms)']/1000;qps=count/runtime
 wire=json.loads((folder/'wire-command-counts.json').read_text())['delta']
 if args['phase']!='load':
  assert wire.get('cmdstat_lavik.hreplace',0)==metrics.get('UPDATE',{}).get('Operations',0),folder
  assert wire.get('cmdstat_hmset',0)==0,folder
 else:
  assert wire.get('cmdstat_hmset',0)==count,folder
 assert abs(qps-receipt['successful_qps'])<1e-6,folder
 assert '-target' not in inv['command'],folder
 if args['phase']=='load':
  assert count==args['records'],folder
  loads.append({'path':str(folder.relative_to(a.raw)),'records':count});continue
 assert 59<=runtime<=65,(folder,runtime)
 workload=args['workload'];expected={'C':0,'B':.05,'A':.5}[workload]
 updates=metrics.get('UPDATE',{}).get('Return=OK',0)
 assert abs(updates/count-expected)<.005,(folder,updates/count)
 label=re.sub(r'-r[123]$','',args['label']);scope=str(folder.parent.parent.relative_to(a.raw))
 key=(scope,args['product'],args['records'],workload,label)
 row={'path':str(folder.relative_to(a.raw)),'qps':qps,'runtime_seconds':runtime,'successful_ops':count,'metrics':metrics}
 groups[key].append(row)
summary=[];incomplete=[]
for key,rows in groups.items():
 scope,product,n,w,label=key
 if len(rows)!=3:incomplete.append({'key':key,'valid_windows':len(rows)});continue
 summary.append({'scope':scope,'product':product,'records':n,'workload':w,'label':label,'mean_qps':statistics.mean(r['qps'] for r in rows),'qps_min':min(r['qps'] for r in rows),'qps_max':max(r['qps'] for r in rows),'read_mean_us':statistics.mean(r['metrics']['READ']['AverageLatency(us)'] for r in rows),'read_p999_us':statistics.mean(r['metrics']['READ']['99.9PercentileLatency(us)'] for r in rows),'read_p999_min_us':min(r['metrics']['READ']['99.9PercentileLatency(us)'] for r in rows),'read_p999_max_us':max(r['metrics']['READ']['99.9PercentileLatency(us)'] for r in rows),'update_p999_us':statistics.mean(r['metrics']['UPDATE']['99.9PercentileLatency(us)'] for r in rows) if w!='C' else None,'runs':[{k:v for k,v in r.items() if k!='metrics'} for r in rows]})
# Check recorded field samples and absence of the optional YCSB scan index.
checks=0
for f in a.raw.rglob('*.json'):
 if 'samples' not in f.name and 'verified' not in f.name:continue
 x=json.loads(f.read_text())
 if isinstance(x,dict) and 'sample_sha256' in x:
  assert x['index_exists'] is False and x['sample_count']==1003,f
  assert len(x['sample_sha256'])==1003,f;checks+=1
out={'valid_points':len(summary),'valid_measurement_windows':sum(len(v) for v in groups.values()),'loads':loads,'sample_receipts_validated':checks,'summary':summary,'invalid_or_interrupted':invalid,'incomplete_points':incomplete,'failed_warmups':failed_warmups}
a.out.write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'valid_points':len(summary),'valid_windows':out['valid_measurement_windows'],'invalid_or_interrupted':len(invalid),'incomplete_points':len(incomplete),'sample_receipts_validated':checks}))
