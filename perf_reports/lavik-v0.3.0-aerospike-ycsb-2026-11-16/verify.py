"""Verify normalized io_uring / Aerospike points against archived receipts and logs."""
from pathlib import Path
import csv,hashlib,json,math,re,tarfile
R=Path(__file__).resolve().parent
rows=list(csv.DictReader((R/'metadata/windows.csv').open()))
ops=list(csv.DictReader((R/'metadata/operations.csv').open()))
assert len(rows)==16 and len(ops)==28
with tarfile.open(R/'raw.tar.gz') as tf:
 content={m.name:tf.extractfile(m).read() for m in tf if m.isfile()}
 for d in json.loads((R/'metadata/raw-manifest.json').read_text()):
  b=content[d['path']];assert len(b)==d['bytes'] and hashlib.sha256(b).hexdigest()==d['sha256']
 for backend in ['aerospike','uring']:
  receipts=json.loads(content[f'runs/{backend}/results.json']);assert len(receipts)==8
  complete=json.loads(content[f'runs/{backend}/complete.json']);assert complete['final_recovery_verified'] and complete['windows']==8
  for d in receipts:
   assert d['failed']==0 and d['exit_code']==0 and d['runtime_ms']>=300000
   matches=[b for n,b in content.items() if n.startswith(f'runs/{backend}/') and n.endswith('.log') and hashlib.sha256(b).hexdigest()==d['sha256']];assert len(matches)==1
   text=matches[0].decode();assert 'Maximum time elapsed. Requesting stop for the workload.' in text
   values={}
   for group,key,val in re.findall(r'^\[([^]]+)\], ([^,]+), (.+)$',text,re.M):
    try:values[group,key]=float(val)
    except ValueError:pass
   successful=sum(values.get((p,'Return=OK'),0) for p in ['READ','UPDATE','INSERT']);assert successful==d['succeeded']
   actual_qps=successful*1000/values['OVERALL','RunTime(ms)']
   r=next(r for r in rows if r['backend']==backend and r['workload']==d['workload'] and int(r['target_ops_sec'])==d['target_ops_sec']);assert math.isclose(float(r['qps']),actual_qps,rel_tol=1e-12)
   for r in ops:
    if r['backend']==backend and r['workload']==d['workload'] and int(r['target_ops_sec'])==d['target_ops_sec']:
     for field,key in [('p99_ms','99thPercentileLatency(us)'),('p999_ms','99.9PercentileLatency(us)'),('p9999_ms','99.99PercentileLatency(us)')]:assert float(r[field])==values[r['operation'],key]/1000
print('Verified 16 formal windows, 28 operation rows, recovery receipts and all archived file hashes')
