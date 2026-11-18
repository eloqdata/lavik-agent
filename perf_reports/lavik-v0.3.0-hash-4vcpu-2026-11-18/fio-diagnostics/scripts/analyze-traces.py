#!/usr/bin/env python3
import argparse,pathlib,json,re,statistics
p=argparse.ArgumentParser();p.add_argument('root',type=pathlib.Path);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args();root=a.root/'spdk-trace-b'
assert json.loads((root/'complete.json').read_text())['windows']==3
pat=re.compile(r'lavik_latency_diagnostics_stage_seconds_(sum|count)\{command_family="([^"]+)",stage="([^"]+)"\} (.+)')
def metrics(p):
 d={}
 for l in p.read_text().splitlines():
  m=pat.fullmatch(l)
  if m:d[m[2],m[3],m[1]]=float(m[4])
 return d
runs=[]
for rep in range(1,4):
 label=f'n10000000-spdk-trace-B-r{rep}';e=json.loads((root/'lavik'/label/'exit.json').read_text());assert e['exit_code']==0 and not e['errors'] and 59<e['runtime_seconds']<62
 b=metrics(root/(label+'-before')/'metrics.txt');z=metrics(root/(label+'-after')/'metrics.txt');d={k:v-b.get(k,0) for k,v in z.items()};assert all(v>=0 for v in d.values())
 stages={}
 for family in ['read','write']:
  stages[family]={}
  sampled=d[family,'request_queue','count']
  for f,s,k in d:
   if f!=family or k!='sum':continue
   count=d[f,s,'count'];stages[family][s]={'observations':count,'mean_us_per_observation':d[f,s,'sum']*1e6/count if count else None,'mean_us_per_sampled_command':d[f,s,'sum']*1e6/sampled}
 rows=[json.loads(l) for l in (root/(label+'-traces.jsonl')).read_text().splitlines()];assert not any('error' in r for r in rows)
 traces={t['trace_id']:t for r in rows for t in r['traces']};reads=[t for t in traces.values() if t['command']=='HGETALL'];total=sum(t['total_us'] for t in reads);io=sum(s['duration_us'] for t in reads for s in t['stages'] if s['name']=='read_io')
 runs.append({'repeat':rep,'qps':e['successful_qps'],'read_mean_us':e['metrics']['READ']['AverageLatency(us)'],'sampled_info_count':len(rows),'defrag_active_max':max(r['info']['defrag_active'] for r in rows),'defrag_pending_max':max(r['info']['defrag_pending'] for r in rows),'stages':stages,'retained_read_traces':len(reads),'retained_read_io_fraction_of_total':io/total})
x={'diagnostic_only':True,'mean_qps':statistics.mean(r['qps'] for r in runs),'note':'Stage sums/counts are before/after Prometheus differences for all selected traces (sample_every=64). Stages may nest; do not sum them as a partition. Retained GET64 traces are a bounded recent subset, not an unbiased latency distribution. read_io includes completion polling and resumption. Tracing overhead is not separately measured.','runs':runs};a.out.write_text(json.dumps(x,indent=2)+'\n')
for r in runs:print(r['repeat'],r['qps'],r['stages']['read']['read_io'],r['retained_read_io_fraction_of_total'])
