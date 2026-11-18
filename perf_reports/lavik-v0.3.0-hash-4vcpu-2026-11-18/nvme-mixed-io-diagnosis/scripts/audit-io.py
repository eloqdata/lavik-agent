import argparse,pathlib,json,statistics,csv
p=argparse.ArgumentParser();p.add_argument('root',type=pathlib.Path);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args();windows=[]
for campaign in ['fio-alignment','fio-alignment-factorial','spdk-queue-probe']:
 root=a.root/campaign;assert json.loads((root/'complete.json').read_text())['windows']==9
 for f in sorted(root.glob('*-r[123]')):
  point,rep=f.name.rsplit('-r',1)
  if campaign.startswith('fio'):
   s=(f/'fio.json').read_text();x=json.loads(s[s.index('{'):]);assert all(j['error']==0 for j in x['jobs']);r=x['jobs'][0]['read'];assert 59000<=r['runtime']<=62000
   writes=[j['write'] for j in x['jobs'] if j['write']['io_bytes']];row={'read_mean_bytes':r['io_bytes']/r['total_ios'],'read_iops':r['iops'],'read_mean_us':r['clat_ns']['mean']/1000,'read_p999_us':r['clat_ns']['percentile']['99.900000']/1000,'write_mib_s':sum(w['bw_bytes'] for w in writes)/1048576}
   assert abs(r['total_ios']/(r['runtime']/1000)-r['iops'])<0.01
  else:
   assert json.loads((f/'exit.json').read_text())['returncode']==0;x=json.loads((f/'result.json').read_text());assert x['errors']==0;row={k:x[k] for k in ['read_iops','read_mean_us','write_mib_s']};row['read_p999_us']=None;row['read_mean_bytes']=None
  windows.append({'campaign':campaign,'point':point,'repeat':int(rep),**row})
rows=[]
for c,p in dict.fromkeys((w['campaign'],w['point']) for w in windows):
 ws=[w for w in windows if w['campaign']==c and w['point']==p];assert sorted(w['repeat'] for w in ws)==[1,2,3];row={'campaign':c,'point':p}
 for k in ['read_iops','read_mean_us','read_p999_us','write_mib_s','read_mean_bytes']:row[k]=statistics.mean(w[k] for w in ws) if ws[0][k] is not None else None
 row['min_iops']=min(w['read_iops'] for w in ws);row['max_iops']=max(w['read_iops'] for w in ws);rows.append(row)
x={'valid_points':len(rows),'valid_windows':len(windows),'rows':rows,'windows':windows};assert len(windows)==27;a.out.write_text(json.dumps(x,indent=2)+'\n')
with a.out.with_suffix('.csv').open('w') as f:w=csv.DictWriter(f,fieldnames=rows[0],lineterminator='\n');w.writeheader();w.writerows(rows)
print(json.dumps(rows,indent=2))
