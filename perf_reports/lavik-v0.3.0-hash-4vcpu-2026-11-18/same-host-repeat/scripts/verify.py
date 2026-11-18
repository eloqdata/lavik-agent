#!/usr/bin/env python3
"""Fixed, distributed YCSB-key samples; deliberately no DBSIZE or scan; requires python3-redis."""
import argparse,hashlib,json,pathlib,random,time
import redis
p=argparse.ArgumentParser();p.add_argument('--host',required=True);p.add_argument('--records',required=True,type=int);p.add_argument('--product',required=True);p.add_argument('--out',required=True);a=p.parse_args()
r=redis.Redis(host=a.host,socket_timeout=30)
assert not r.exists('_indices'),'Unexpected scan index'
def key(n):
 h=0xcbf29ce484222325
 for _ in range(8):h=((h^(n&255))*1099511628211)&((1<<64)-1);n>>=8
 h=h if h<(1<<63) else h-(1<<64)
 return 'user'+str(abs(h) if h!=-(1<<63) else h)
ids={0,a.records-1,a.records//2};ids.update(random.Random(20261118).sample(range(a.records),min(1000,a.records)))
pipe=r.pipeline(transaction=False)
for i in sorted(ids):pipe.hgetall(key(i))
rows=pipe.execute(); hashes={}
expected={f'field{i}'.encode() for i in range(8)}
for i,row in zip(sorted(ids),rows):
 assert set(row)==expected,(i,list(row))
 assert all(len(v)==128 for v in row.values()),i
 digest=hashlib.sha256()
 for k,v in sorted(row.items()):digest.update(k);digest.update(v)
 hashes[key(i)]=digest.hexdigest()
report={'configured_records':a.records,'sample_count':len(rows),'sample_sha256':hashes,'index_exists':False,'info':r.info(),'epoch':time.time()}
pathlib.Path(a.out).write_text(json.dumps(report,indent=2,default=str)+'\n')
print('VERIFIED',a.product,a.records,'configured records;',len(rows),'samples; no _indices; no key count scan')
