#!/usr/bin/env python3
import argparse,pathlib,json,re,statistics
p=argparse.ArgumentParser();p.add_argument('root',type=pathlib.Path);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args();rows=[]
for trial in ['defrag-ba-retry2']:
 root=a.root/trial
 if not root.exists():continue
 complete=json.loads((root/'complete.json').read_text());assert not complete['failures']
 samples=[json.loads(x) for x in (root/'info-timeseries.jsonl').read_text().splitlines()];samples=[x for x in samples if 'info' in x]
 tag='n10000000-defrag-ba-sleep-100ms';pair=root/'lavik'/tag
 for workload in ('B' if trial=='defrag-ba-control0' else 'BA'):
  qs=[];ms=[];windows=[]
  for rep in [1,2,3]:
   f=root/'lavik'/f'{tag}-{workload}-t0-r{rep}';text=(f/'ycsb.log').read_text();assert 'Exception' not in text
   m={}
   for line in text.splitlines():
    z=re.match(r'^\[([^]]+)\], ([^,]+), (.+)$',line)
    if z:
     op,k,v=z.groups()
     try:m.setdefault(op,{})[k]=float(v)
     except ValueError:pass
   for d in m.values():assert all(v==0 for k,v in d.items() if k.startswith('Return=') and k!='Return=OK')
   runtime=m['OVERALL']['RunTime(ms)']/1000;assert runtime>=57
   q=sum(m.get(op,{}).get('Return=OK',0) for op in ['READ','UPDATE'])/runtime
   e=json.loads((f/'exit.json').read_text());assert e['exit_code']==0 and not e['errors'] and abs(q-e['successful_qps'])<1e-7
   inv=json.loads((f/'invocation.json').read_text());assert '-target' not in inv['command'];assert inv['args']['threads']==128 and inv['args']['seconds']==60
   start=float(re.search(r'StartTime: ([0-9.]+)',(f/'READ.hdr').read_text()[:250])[1]);windows.append((start,e['finished_epoch']));qs.append(q);ms.append(m)
  v=json.loads((pair/(tag+f'-{workload}-t0-samples.json')).read_text());assert v['sample_count']>=1000 and not v['index_exists']
  observed=[x for x in samples if any(lo<=x['epoch']<=hi for lo,hi in windows)]
  row={'trial':trial,'product':'lavik','records':10000000,'tiered':False,'workload':workload,'mean_qps':statistics.mean(qs),'min_qps':min(qs),'max_qps':max(qs),**{f'run{i+1}_qps':v for i,v in enumerate(qs)},'sample_count':len(observed),'defrag_active_samples':sum(x['info'].get('defrag_active',0)>0 for x in observed),'max_defrag_pending':max((x['info'].get('defrag_pending',0) for x in observed),default=0)}
  for op in ['READ','UPDATE']:
   row[op.lower()+'_qps']=statistics.mean(m.get(op,{}).get('Return=OK',0)/(m['OVERALL']['RunTime(ms)']/1000) for m in ms)
   for key,name in [('AverageLatency(us)','mean'),('99thPercentileLatency(us)','p99'),('99.9PercentileLatency(us)','p999')]:row[op.lower()+'_'+name+'_ms']=statistics.mean(m[op][key] for m in ms)/1000
  rows.append(row)
a.out.write_text(json.dumps({'valid_points':len(rows),'valid_windows':3*len(rows),'errors':[],'rows':rows},indent=2)+'\n');print(a.out.read_text())
