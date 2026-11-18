import argparse,pathlib,json,statistics,csv,re,datetime
p=argparse.ArgumentParser();p.add_argument('root',type=pathlib.Path);p.add_argument('--iostat',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args();root=a.root
assert json.loads((root/'complete.json').read_text())['windows']==9
assert json.loads((root/'aerospike/load/exit.json').read_text())['successful_ops']==10000000
first=json.loads((root/'verified-load.json').read_text());assert first==json.loads((root/'verified-recovery.json').read_text());assert first['sample_count']==1003
assert json.loads((root/'verified-final.json').read_text())['sample_count']==1003
def info(s):
 s=s.strip().split('\t',1)[-1];return dict(x.split('=',1) for x in s.split(';') if '=' in x)
io=[];epoch=None;cols=[]
for line in a.iostat.read_text().splitlines():
 line=line.strip()
 for fmt in ['%m/%d/%Y %H:%M:%S','%Y-%m-%dT%H:%M:%S%z','%Y-%m-%d %H:%M:%S','%m/%d/%y %H:%M:%S']:
  try:epoch=datetime.datetime.strptime(line,fmt).replace(tzinfo=datetime.timezone.utc).timestamp();break
  except ValueError:pass
 if line.startswith('Device'):cols=line.split()
 elif line.startswith('nvme1n1 ') and epoch is not None:
  v=line.split();io.append({'epoch':epoch,**{k:float(x) for k,x in zip(cols[1:],v[1:])}})
assert io,'no iostat samples parsed'
windows=[]
for point in ['C','B','C-recovery']:
 for rep in range(1,4):
  label=point+f'-r{rep}';f=root/'aerospike'/label;e=json.loads((f/'exit.json').read_text());assert e['exit_code']==0 and not e['errors'] and 59<=e['runtime_seconds']<=62
  metrics=e['metrics'];success=sum(metrics.get(op,{}).get('Return=OK',0) for op in ['READ','UPDATE']);assert success==e['successful_ops'];assert abs(success/e['runtime_seconds']-e['successful_qps'])<1e-6
  before=info(json.loads((root/(label+'-before.json')).read_text())['namespace/ycsb']);after=info(json.loads((root/(label+'-after.json')).read_text())['namespace/ycsb']);assert int(after['objects'])==10000000
  for op,counter in [('READ','client_read_success'),('UPDATE','client_write_success')]:assert int(after[counter])-int(before[counter])==metrics.get(op,{}).get('Return=OK',0),(label,op)
  log=(f/'ycsb.log').read_text();m=re.search(r'(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d:\d{3}) 0 sec:',log);assert m
  start=datetime.datetime.strptime(m[1],'%Y-%m-%d %H:%M:%S:%f').replace(tzinfo=datetime.timezone.utc).timestamp();end=start+e['runtime_seconds'];samples=[s for s in io if start+1<=s['epoch']<=end];assert len(samples)>=55,(label,len(samples))
  rsum=sum(s['r/s'] for s in samples);wsum=sum(s['w/s'] for s in samples)
  series=[json.loads(x) for x in (root/(label+'-info.jsonl')).read_text().splitlines()];assert not any('error' in x for x in series)
  row={'point':point,'repeat':rep,'qps':e['successful_qps'],'read_mean_ms':metrics['READ']['AverageLatency(us)']/1000,'read_p999_ms':metrics['READ']['99.9PercentileLatency(us)']/1000,'update_p999_ms':metrics.get('UPDATE',{}).get('99.9PercentileLatency(us)',0)/1000 if point=='B' else None,'device_read_iops':rsum/len(samples),'device_read_await_ms':sum(s['r/s']*s['r_await'] for s in samples)/rsum,'device_read_kib':sum(s['rkB/s'] for s in samples)/rsum,'device_write_iops':wsum/len(samples),'device_write_mib_s':sum(s['wkB/s'] for s in samples)/len(samples)/1024,'device_write_await_ms':sum(s['w/s']*s['w_await'] for s in samples)/wsum if wsum else None,'device_write_kib':sum(s['wkB/s'] for s in samples)/wsum if wsum else None,'io_samples':len(samples),'connections_max':max(int(info(x['statistics'])['client_connections']) for x in series),'defrag_reads_delta':int(after['storage-engine.device[0].defrag_reads'])-int(before['storage-engine.device[0].defrag_reads']),'defrag_writes_delta':int(after['storage-engine.device[0].defrag_writes'])-int(before['storage-engine.device[0].defrag_writes'])}
  windows.append(row)
rows=[]
for point in ['C','B','C-recovery']:
 ws=[w for w in windows if w['point']==point];row={'point':point,'runs':3,'min_qps':min(w['qps'] for w in ws),'max_qps':max(w['qps'] for w in ws)}
 for k in windows[0]:
  if k not in ['point','repeat']:row[k]=statistics.mean(w[k] for w in ws) if all(w[k] is not None for w in ws) else None
 rows.append(row)
x={'valid_points':3,'valid_windows':9,'note':'Arithmetic mean of three60s runs and per-run percentiles. Iostat weighted await from full1s intervals within YCSB reported window; device requests differ from logicalYCSBops. Business concurrency128; reportedconnections include management/monitoring.','rows':rows,'windows':windows};a.out.write_text(json.dumps(x,indent=2)+'\n')
with a.out.with_suffix('.csv').open('w') as f:w=csv.DictWriter(f,fieldnames=rows[0],lineterminator='\n');w.writeheader();w.writerows(rows)
print(json.dumps(rows,indent=2))
