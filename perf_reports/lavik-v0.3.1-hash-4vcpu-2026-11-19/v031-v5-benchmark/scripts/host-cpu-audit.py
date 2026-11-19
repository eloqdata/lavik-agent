#!/usr/bin/env python3
import pathlib,json,datetime,statistics,sys
root=pathlib.Path(sys.argv[1]);host=json.loads(pathlib.Path(sys.argv[2]).read_text())['sysstat']['hosts'][0];out=pathlib.Path(sys.argv[3]);samples=[]
for r in host['statistics']:
 if 'timestamp' not in r or 'cpu-load' not in r:continue
 t=r['timestamp'];assert t['utc']==1
 epoch=datetime.datetime.fromisoformat(t['date']+'T'+t['time']).replace(tzinfo=datetime.timezone.utc).timestamp()
 cpu=next(x for x in r['cpu-load'] if x['cpu']=='all');samples.append((epoch,cpu))
results=[]
for f in sorted(root.rglob('invocation.json')):
 inv=json.loads(f.read_text());e=f.with_name('exit.json')
 if not e.exists():continue
 receipt=json.loads(e.read_text());rows=[r for t,r in samples if inv['started_epoch']<=t<=receipt['finished_epoch']]
 if not rows:continue
 d={'phase':str(f.parent.relative_to(root)),'samples':len(rows),'execution_cpu_mean_percent':statistics.mean(100-r['idle']-r['iowait']-r['steal'] for r in rows)}
 for k in ['steal','iowait','irq','soft','sys','usr','idle']:d[k+'_mean_percent']=statistics.mean(r[k] for r in rows);d[k+'_max_percent']=max(r[k] for r in rows)
 results.append(d)
out.write_text(json.dumps({'host':host['nodename'],'cpu_count':host['number-of-cpus'],'windows':results},indent=2)+'\n')
print(json.dumps({'windows':len(results),'max_mean_steal':max(x['steal_mean_percent'] for x in results)}))
