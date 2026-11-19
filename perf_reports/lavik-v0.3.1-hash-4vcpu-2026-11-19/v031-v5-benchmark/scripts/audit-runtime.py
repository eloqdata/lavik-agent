import pathlib,json,re,shlex,sys,statistics
root=pathlib.Path(sys.argv[1]);out=pathlib.Path(sys.argv[2]);rows=[];capacity=2879775571968
for scope in sorted(root.glob('v031-v5-*')):
 protocol=json.loads((scope/'protocol.json').read_text());version=protocol['release'].removeprefix('v')
 samples=[json.loads(l) for l in (scope/'timeseries.jsonl').read_text().splitlines()]
 for f in sorted((scope/'lavik').glob('*/invocation.json')):
  inv=json.loads(f.read_text());a=inv['args']
  if a['phase']!='measure':continue
  receipt=json.loads(f.with_name('exit.json').read_text());assert not receipt['errors'] and receipt['exit_code']==0
  assert a['threads']==128 and a['records'] in [10000000,100000000] and a['target']==0 and a['seconds']==60
  assert inv['command'][2]=='lavik' and '-target' not in inv['command'] and not a['partial']
  label=f.parent.name
  for suffix in ['before','after']:
   p=scope/(label+'-'+suffix);srv=json.loads((p/'server.json').read_text());cfg=json.loads((p/'config.json').read_text());info=json.loads((p/'info.json').read_text());cmd=shlex.split(srv['cmdline'])
   assert cmd[0]==('/opt/bench/v031-release/lavik-v0.3.1-linux-x86_64/lavik' if version=='0.3.1' else '/opt/bench/lavik-standard/lavik-v0.3.0-linux-x86_64/lavik')
   assert info['lavik_version']==version
   assert '--storage=spdk' in cmd and '--pin-workers' in cmd and cmd[cmd.index('--threads')+1]=='4'
   assert cmd[cmd.index('--max-memory')+1]=='24gb' and cmd[cmd.index('--data-file')+1]=='spdk://'+protocol['hardware']['nvme_pci']+'/1'
   assert not any(x.startswith(('--defrag','--flush','--background','--storage-write-buffers')) for x in cmd)
   for k,v in {'defrag-sleep-ms':'0','defrag-record-sleep-us':'0','defrag-max-active-per-device':'8','defrag-paused':'no','background-warrant-percent':'1','background-budget-us':'10','latency-diagnostics-enabled':'no'}.items():assert str(cfg[k])==v,(p,k,cfg[k])
   assert re.search(r'^Cpus_allowed_list:\s*0-3$',srv['proc_status'],re.M)
   events={k:int(v) for k,v in (l.split() for l in srv['memory.events'].splitlines())};assert events['oom']==events['oom_kill']==0
   assert info['oom_rejected_commands']==0 and info['storage_durability_failed']==0
  wire=json.loads(f.with_name('wire-command-counts.json').read_text())['delta'];metrics=receipt['metrics']
  assert wire.get('cmdstat_hgetall',0)==metrics['READ']['Operations']
  assert wire.get('cmdstat_lavik.hreplace',0)==metrics.get('UPDATE',{}).get('Operations',0) and wire.get('cmdstat_hmset',0)==0
  selected=[r for r in samples if inv['started_epoch']<=r['epoch']<=receipt['finished_epoch']];assert len(selected)>=55 and not any('error'in r for r in selected)
  def val(r,key):return sum(v for k,v in r['metrics'].items() if k.startswith(key))
  gc=[val(r,'lavik_storage_defrag_runs_total{result="success"}') for r in selected];space=[(capacity-val(r,'lavik_storage_available_bytes{'))/2**30 for r in selected]
  rows.append({'scope':scope.name,'label':label,'records':a['records'],'workload':a['workload'],'version':version,'default_parameters_verified':True,'wire_counts_exact':True,'samples':len(selected),'gc_success_during_sampled_window':gc[-1]-gc[0],'unavailable_GiB_start':space[0],'unavailable_GiB_end':space[-1],'unavailable_GiB_delta':space[-1]-space[0],'unavailable_GiB_median':statistics.median(space),'unavailable_GiB_peak':max(space)})
out.write_text(json.dumps({'validated_windows':len(rows),'windows':rows,'space_metric':'Raw device capacity minus reported foreground-available bytes; includes metadata, GC reserve, and transient allocator activation. Not exact live bytes.'},indent=2)+'\n');print('Validated v0.3.1 runtime/defaults/wire/sample windows:',len(rows))
