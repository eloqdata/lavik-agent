import json,pathlib,subprocess,sys,time,re,urllib.request,hashlib
from redis_client import Redis
from kvrocks_dbsize import refresh_dbsize
B=pathlib.Path('/opt/gaming-main-20261111')
product,label,w,keys,c,hot,seconds,seed=sys.argv[1:];keys=int(keys);c=int(c);seconds=int(seconds)
D=B/'results'/label;D.mkdir()
while (B/'building-candidate2').exists():time.sleep(2)
binary=B/'bin'/('workload-cperf' if w=='C' else 'workload')
binary_sha256=hashlib.sha256(binary.read_bytes()).hexdigest()
def run(n,name):
 a=[str(binary),'--host','10.96.0.4','--workload',w,'--phase','run','--keys',str(keys),'--members','10000000','--connections',str(c),'--threads','32','--seconds',str(n),'--hot-percent',hot,'--seed',seed,'--out',str(D/name)]
 (D/(name+'.args')).write_text(json.dumps(a));subprocess.run(a,check=True,stdout=subprocess.DEVNULL,timeout=n+600)
def info(r):return r.call('INFO').decode()
def drain(r):
 if product not in ['base','candidate']:return
 start=time.monotonic()
 while True:
  s=r.call('INFO','STATS').decode();assert 'storage_durability_failed:1' not in s
  if 'storage_durability_pending:0\r\n' in s:return
  assert time.monotonic()-start<300;time.sleep(.1)
def metrics():return urllib.request.urlopen('http://10.96.0.4:9100/metrics',timeout=30).read().decode() if product in ['base','candidate'] else ''
def counts(s):return {k.lower():int(v) for k,v in re.findall(r'cmdstat_(\w+):calls=(\d+)',s)}
with Redis() as r:
 dbsize_refresh=None
 if product=='kvrocks' and r.call('DBSIZE')!=keys:dbsize_refresh=refresh_dbsize(r)
 assert r.call('DBSIZE')==keys
 runtime_config={}
 if product=="base":
  runtime_config["spdk-max-completions-per-poll"]=[x.decode() for x in r.call("CONFIG","GET","spdk-max-completions-per-poll")]
  assert runtime_config["spdk-max-completions-per-poll"][-1]=="0"
 if product in ['redis','valkey','kvrocks']:
  config_names=['appendonly','save','io-threads','io-threads-do-reads'] if product in ['redis','valkey'] else ['rocksdb.write_options.sync','rocksdb.write_options.disable_wal','workers']
  for name in config_names:
   runtime_config[name]=[x.decode() if isinstance(x,bytes) else x for x in r.call('CONFIG','GET',name)]
 run(10,'warm.json');drain(r);before=info(r);mb=metrics();cb=counts(r.call('INFO','commandstats').decode());start=time.time()
 run(seconds,'result.json');end=time.time();ca=counts(r.call('INFO','commandstats').decode());drain(r);after=info(r);ma=metrics()
 result=json.loads((D/'result.json').read_text());assert result['errors']==0;m=result['metrics']
 if w=='A':
  assert m['Top100']['count']==m['ZRANK']['count']==2*m['ZINCRBY']['count'];expected={'zrevrange':m['Top100']['count'],'zrank':m['ZRANK']['count'],'zincrby':m['ZINCRBY']['count']}
 else:
  reads=sum(m.get('HGETALL_'+s,{}).get('count',0) for s in ['hot','cold']);writes=sum(m.get('HSET_'+s,{}).get('count',0) for s in ['hot','cold']);assert reads==9*writes;expected={'hgetall':reads,'hset':writes}
 actual={k:ca.get(k,0)-cb.get(k,0) for k in expected}
 # All five expose commandstats; exact deltas catch retries or protocol mismatches.
 assert actual==expected,(actual,expected)
 assert sum(expected.values())==result['operations']
 for n,s in [('info-before.txt',before),('info-after.txt',after),('metrics-before.txt',mb),('metrics-after.txt',ma)]: (D/n).write_text(s)
 def values(s):return {k:float(v) for k,v in re.findall(r'^(lavik_storage_(?:io_|tx_commit)[^ \n]+)\s+([0-9.e+]+)$',s,re.M)}
 b,a=values(mb),values(ma)
 d={'product':product,'label':label,'started_at':start,'ended_at':end,'runtime_config':runtime_config,'client_binary_sha256':binary_sha256,'dbsize_refresh':dbsize_refresh,'result':result,'expected_commands':expected,'actual_commands':actual,'counter_deltas':{k:a[k]-v for k,v in b.items() if k in a}}
 (D/'point.json').write_text(json.dumps(d,indent=2));print(json.dumps(d))
