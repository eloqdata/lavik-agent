#!/usr/bin/env python3
"""Dispatch fixed release benchmarks and an independently labelled version control."""
import pathlib,subprocess,sys,json,time
kit=pathlib.Path('/opt/bench/v031-v5-kit');records=int(sys.argv[sys.argv.index('--records')+1])
if records==100000000:
 p=pathlib.Path('/opt/bench/v031-v5-benchmark/v031-n10000000-default');rows=json.loads((p/'summary.json').read_text());b=next(x for x in rows if x['point']=='B-mature')
 if b['mean_qps']<200000:
  q=pathlib.Path('/opt/bench/v031-version-controls');q.mkdir(exist_ok=False)
  (q/'reason.json').write_text(json.dumps({'epoch':time.time(),'reason':'Default95:5 unexpectedly slow in both fresh and mature10M states; compare old and new official binaries sequentially on same data before100M reset. Do not mix diagnostic controls into eight canonical points.','trigger_mature_B_qps':b['mean_qps']},indent=2)+'\n')
  for version in ['v030','v031']:subprocess.run(['python3',str(kit/'version-control.py'),'--release',version],check=True)
subprocess.run(['python3',str(kit/'campaign-main.py'),*sys.argv[1:]],check=True)
