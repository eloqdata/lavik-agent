import pathlib,json,time,subprocess,re
root=pathlib.Path('/opt/bench/v031-v5-benchmark')
for p in sorted(root.glob('v031-n*'))+sorted(pathlib.Path('/opt/bench/v031-version-controls').glob('v031-control-*')):
 x={'scope':p.name,'complete':(p/'complete.json').exists()}
 if x['complete']:
  x['points']=len(json.loads((p/'summary.json').read_text()));print(json.dumps(x),flush=True);continue
 if (p/'current.json').exists():
  phase=json.loads((p/'current.json').read_text());x['phase']=phase;x['elapsed_seconds']=round(time.time()-phase['epoch']);log=p/'lavik'/phase['label']/'ycsb.log'
  if log.exists():
   tail=subprocess.check_output(['tail','-12',str(log)],text=True)
   lines=[l for l in tail.splitlines() if ' current ops/sec;' in l]
   if lines:
    l=lines[-1];m=re.search(r'(\d+) sec: (\d+) operations; ([0-9.]+) current ops/sec',l);x['latest_status']={'seconds':int(m[1]),'operations':int(m[2]),'qps':float(m[3])} if m else {}
    for op,part in re.findall(r'\[(READ|UPDATE): ([^]]+)\]',l):
     m=re.search(r'(?:^|, )99\.9=([0-9.]+)(?:,|$)',part)
     if m:x['latest_status'][op+'_p999_us']=float(m[1])
 if (p/'summary.json').exists():x['results']=[{k:v for k,v in row.items() if k!='runs'} for row in json.loads((p/'summary.json').read_text())]
 if (p/'failure.txt').exists():x['failure']=(p/'failure.txt').read_text()
 ts=p/'timeseries.jsonl'
 if ts.exists():
  lines=subprocess.check_output(['tail','-2',str(ts)],text=True).splitlines()
  for l in reversed(lines):
   try:z=json.loads(l)
   except:continue
   x['sample_epoch']=z['epoch'];x['sample_error']=z.get('error');m=z.get('metrics',{});i=z.get('info',{});x['unavailable_GiB']=(2879775571968-sum(v for k,v in m.items() if k.startswith('lavik_storage_available_bytes{')))/2**30;x['defrag_success']=sum(v for k,v in m.items() if k.startswith('lavik_storage_defrag_runs_total{result="success"}'));x['defrag_active']=i.get('defrag_active');x['version']=i.get('lavik_version');break
 print(json.dumps(x),flush=True)
if (root/'failure.txt').exists():print((root/'failure.txt').read_text())
print('Evidence packaged:',pathlib.Path('/opt/bench/v031-v5-evidence-complete').exists())
