#!/usr/bin/env python3
"""Run one phase against an already deployed, dedicated database. Default: print command."""
import argparse, json, pathlib, shlex, subprocess, time, re
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--ycsb-root', required=True)
p.add_argument('--host', required=True)
p.add_argument('--port', type=int, default=6379)
p.add_argument('--product', choices=['lavik','kvrocks','dragonfly','redis'], required=True)
p.add_argument('--records', type=int, required=True)
p.add_argument('--phase', choices=['load','warmup','measure'], required=True)
p.add_argument('--workload', choices=['A','B','C'], default='B')
p.add_argument('--partial', action='store_true', help='Update one field; default updates all 8')
p.add_argument('--target', type=int, choices=[0], default=0)
p.add_argument('--threads', type=int, default=128)
p.add_argument('--seconds', type=int, help='Default 60 seconds')
p.add_argument('--label', required=True, help='Unique label, e.g. n1m-r1-B-100k-warmup')
p.add_argument('--out', default='results')
p.add_argument('--execute', action='store_true')
a=p.parse_args()
if min(a.records,a.threads,a.port)<=0 or (a.seconds is not None and a.seconds<=0):p.error('positive values required')
root=pathlib.Path(a.ycsb_root).resolve()
folder=(pathlib.Path(a.out)/a.product/a.label).resolve()
common=pathlib.Path(__file__).resolve().parent/'common.properties'
cmd=[str(root/'bin/ycsb.sh'), 'load' if a.phase=='load' else 'run','redis','-s','-threads',str(a.threads),'-P',str(common)]
props={'redis.host':a.host,'redis.port':a.port,'redis.timeout':10000,'recordcount':a.records,'writeallfields':str(not a.partial).lower(), 'hdrhistogram.fileoutput':'true', 'hdrhistogram.output.path':str(folder)+'/' }
if a.phase!='load':
 r,u={'A':(.5,.5),'B':(.95,.05),'C':(1,0)}[a.workload]
 props.update(readproportion=r,updateproportion=u,operationcount=2000000000,maxexecutiontime=a.seconds or 60)
 if a.target:cmd+=['-target',str(a.target)]
for k,v in props.items():cmd+=['-p',f'{k}={v}']
print(shlex.join(cmd),flush=True)
if not a.execute:raise SystemExit(0)
source=root/'redis/src/main/java/site/ycsb/db/RedisClient.java'
if not source.exists() or 'redis.scanindex' not in source.read_text():
 p.error('Use the updated pinned YCSB source with redis.scanindex support and rebuild before execution')
folder.mkdir(parents=True,exist_ok=False)
(folder/'invocation.json').write_text(json.dumps({'args':vars(a),'command':cmd,'started_epoch':time.time()},indent=2)+'\n')
limit=max(3600,a.records//10000) if a.phase=='load' else (props['maxexecutiontime']+180)
with (folder/'ycsb.log').open('w') as log:
 try:code=subprocess.run(cmd,cwd=root,stdout=log,stderr=subprocess.STDOUT,timeout=limit).returncode
 except subprocess.TimeoutExpired:code=124
text=(folder/'ycsb.log').read_text()
metrics={}
for line in text.splitlines():
 match=re.match(r"^\[([^]]+)\], ([^,]+), (.+)$",line)
 if match:
  op,k,v=match.groups()
  try: metrics.setdefault(op,{})[k]=float(v)
  except ValueError: pass
errors=[]
if '[OVERALL], RunTime(ms),' not in text: errors.append('Missing complete measurements')
if 'Exception in thread' in text: errors.append('Worker exception')
for op,data in metrics.items():
 for k,v in data.items():
  if k.startswith('Return=') and k!='Return=OK' and v: errors.append(f'{op} {k}: {v}')
success=sum(metrics.get(op,{}).get('Return=OK',0) for op in ['READ','UPDATE','INSERT'])
if success==0:errors.append('No successful operations')
if a.phase=='load' and success!=a.records:errors.append(f'Expected {a.records} INSERTs; got {success}')
runtime=metrics.get('OVERALL',{}).get('RunTime(ms)',0)/1000
if a.phase!='load' and runtime<props['maxexecutiontime']*.95:errors.append('Measurement ended early')
if code==0 and errors:code=2
summary={'exit_code':code,'finished_epoch':time.time(),'errors':errors,'successful_ops':success,'runtime_seconds':runtime,'successful_qps':success/runtime if runtime else None,'metrics':metrics}
(folder/'exit.json').write_text(json.dumps(summary,indent=2)+'\n')
print(f'Exit {code}; successful operations {success}; inspect {folder}/ycsb.log.')
raise SystemExit(code)
