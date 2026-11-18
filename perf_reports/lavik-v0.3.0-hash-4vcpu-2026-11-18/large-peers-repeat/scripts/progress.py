#!/usr/bin/env python3
import pathlib,json,re
r=pathlib.Path('/opt/bench/same-host-peers-100m')
d=json.loads((r/'current.json').read_text());print({k:d[k] for k in ['product','state','workload','repeat'] if k in d})
if d.get('state')=='loading':
 logs=sorted((r/d['product']).glob('*load/ycsb.log'),key=lambda p:p.stat().st_mtime)
 if logs:
  lines=[x for x in logs[-1].read_text().splitlines() if 'current ops/sec' in x]
  if lines:print(lines[-1].split(' [INSERT:')[0])
p=r/'summary.json'
if p.exists():print('Completed:',[(x['product'],x['workload'],round(x['mean_qps'])) for x in json.loads(p.read_text())])
p=r/'complete.json'
if p.exists():print('CAMPAIGN FINISHED',p.read_text())
