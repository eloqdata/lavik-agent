"""Audit measurement snapshots independently from the benchmark controller."""
import argparse,json,pathlib,re
p=argparse.ArgumentParser();p.add_argument('raw',type=pathlib.Path);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args()
windows=[];pure_read_checks=[]
def counters(s):
 return {line.split()[0]:int(line.split()[1]) for line in s.splitlines()}
for f in sorted(a.raw.rglob('invocation.json')):
 inv=json.loads(f.read_text());args=inv.get('args',{})
 if args.get('phase')!='measure':continue
 label=args['label'];product=args['product']
 receipt=json.loads((f.parent/'exit.json').read_text())
 assert not receipt['exit_code'] and not receipt['errors'],f
 assert args['threads']==128 and args['target']==0,(f,args)
 snapshots={}
 for side in ['before','after']:
  candidates=list((a.raw/product).glob('*/'+label+'-'+side+'/server.json'))
  assert len(candidates)==1,(f,side,candidates)
  snap=json.loads(candidates[0].read_text())
  affinity=re.search(r'^Cpus_allowed_list:\s*(\S+)',snap['proc_status'],re.M)
  assert affinity and affinity[1]=='0-3',(candidates[0],affinity)
  events=counters(snap['memory.events'])
  assert not events.get('oom',0) and not events.get('oom_kill',0),(candidates[0],events)
  assert int(snap['memory.current'])<=28*1024**3,candidates[0]
  snapshots[side]=snap
 before,after=[snapshots[x] for x in ['before','after']]
 elapsed=after['epoch']-before['epoch']
 usage=counters(after['cpu.stat'])['usage_usec']-counters(before['cpu.stat'])['usage_usec']
 windows.append({'product':product,'records':args['records'],'label':label,'cpu_cores':usage/1e6/elapsed,'memory_after_bytes':int(after['memory.current']),'memory_peak_bytes':int(after['memory.peak'])})
for pre in sorted(a.raw.glob('*/*/verified-pre-C.json')):
 before=json.loads(pre.read_text())
 candidates=list(pre.parent.glob('*-C-t0-samples.json'))
 assert len(candidates)==1,(pre,candidates)
 after=json.loads(candidates[0].read_text())
 assert before['sample_sha256']==after['sample_sha256'],pre
 pure_read_checks.append(str(pre.parent.relative_to(a.raw)))
a.out.write_text(json.dumps({'validated_windows':len(windows),'pure_read_sample_checks':pure_read_checks,'windows':windows},indent=2)+'\n')
print(json.dumps({'runtime_validated_windows':len(windows)}))
