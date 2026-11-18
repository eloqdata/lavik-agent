#!/usr/bin/env python3
"""Independently recompute fio triplicates from raw JSON, not acquisition summaries."""
import argparse,pathlib,json,statistics,csv
p=argparse.ArgumentParser();p.add_argument('root',type=pathlib.Path);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args()
rows=[];windows=[]
for campaign in ['fio-readonly','fio-crossover','fio-nvme-flush']:
 root=a.root/campaign;complete=json.loads((root/'complete.json').read_text());assert complete['windows']==(6 if campaign=='fio-nvme-flush' else 12)
 for folder in sorted(root.glob('*-r[123]')):
  e=json.loads((folder/'exit.json').read_text());assert e['returncode']==0
  inv=json.loads((folder/'invocation.json').read_text());assert inv['started_epoch']<e['finished_epoch']
  raw=json.loads((folder/'fio.json').read_text());assert all(j['error']==0 for j in raw['jobs'])
  jobs=[j for j in raw['jobs'] if j['read']['io_bytes']>0];assert len(jobs)==1
  r=jobs[0]['read'];assert 59000<=r['runtime']<=62000
  assert abs(r['total_ios']/(r['runtime']/1000)-r['iops'])<0.01
  writers=[j for j in raw['jobs'] if j['write']['io_bytes']>0]
  point,rep=folder.name.rsplit('-r',1)
  if campaign=='fio-readonly' or point.startswith('read-'):
   assert '--readonly' in inv['command'] and not writers
  else:
   cfg=(folder/'job.fio').read_text();assert 'offset=2T' in cfg and 'size=1G' in cfg and len(writers)==1
   if point.endswith('fsync'):assert 'fsync=1' in cfg and writers[0]['sync']['total_ios']>0
  if campaign=='fio-nvme-flush' and point.startswith('append'):
   assert json.loads((folder/'flush-exit.json').read_text())['returncode']==0
   records=list(csv.DictReader((folder/'nvme-flush.csv').open()));assert records and all(r['result']=='0' for r in records)
  windows.append({'campaign':campaign,'point':point,'repeat':int(rep),'read_iops':r['iops'],'mean_clat_us':r['clat_ns']['mean']/1000,'p99_clat_us':r['clat_ns']['percentile']['99.000000']/1000,'p999_clat_us':r['clat_ns']['percentile']['99.900000']/1000,'write_mib_s':sum(j['write']['bw_bytes'] for j in writers)/1024**2,'sync_ios':sum(j.get('sync',{}).get('total_ios',0) for j in writers),'start_epoch':inv['started_epoch'],'end_epoch':e['finished_epoch']})
for campaign,point in dict.fromkeys((w['campaign'],w['point']) for w in windows):
 selected=[w for w in windows if w['campaign']==campaign and w['point']==point];assert sorted(w['repeat'] for w in selected)==[1,2,3]
 row={'campaign':campaign,'point':point,'mean_read_iops':statistics.mean(w['read_iops'] for w in selected),'min_read_iops':min(w['read_iops'] for w in selected),'max_read_iops':max(w['read_iops'] for w in selected)}
 for k in ['mean_clat_us','p99_clat_us','p999_clat_us','write_mib_s']:row[k]=statistics.mean(w[k] for w in selected)
 rows.append(row)
result={'valid_points':len(rows),'valid_windows':len(windows),'errors':[],'note':'Means of three 60-second measured windows; per-run percentiles averaged, not pooled. fio clat includes queueing/completion handling and is not pure hardware service time. Each repetition has a 5-second ramp.','rows':rows,'windows':windows}
assert len(rows)==10 and len(windows)==30
a.out.write_text(json.dumps(result,indent=2)+'\n')
with a.out.with_suffix('.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
print(json.dumps({'valid_points':len(rows),'valid_windows':len(windows),'errors':[],'rows':rows},indent=2))
