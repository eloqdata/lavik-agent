#!/usr/bin/env python3
import pathlib,json,collections,statistics,sys
root=pathlib.Path(sys.argv[1]);out=[]
for p in sorted(root.rglob('latency-diagnostics.log')):
 groups=collections.defaultdict(list)
 for line in p.read_text().splitlines():
  d=json.loads(line)
  if d.get('event')=='command_latency_trace':groups[d['command']].append(d)
 if not groups:continue
 item={'path':str(p.relative_to(root)),'qualification':'Only retained, sampled slow requests during diagnostic soak. Not a population latency distribution; read_io includes completion/resume waiting.','commands':{}}
 for cmd,rows in groups.items():
  dominant=collections.Counter();shares=[]
  for r in rows:
   stages=r.get('stages',[])
   if stages:dominant[max(stages,key=lambda x:x['duration_us'])['name']]+=1
   if r['total_us']:shares.append(sum(x['duration_us'] for x in stages if x['name']=='read_io')/r['total_us'])
  item['commands'][cmd]={'retained_samples':len(rows),'threshold_us':sorted(set(r['threshold_us'] for r in rows)),'sample_every':sorted(set(r['sample_every'] for r in rows)),'largest_stage_counts':dict(dominant),'mean_read_io_fraction':statistics.mean(shares),'mean_total_us':statistics.mean(r['total_us'] for r in rows)}
 out.append(item)
pathlib.Path(sys.argv[2]).write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps(out,indent=2))
