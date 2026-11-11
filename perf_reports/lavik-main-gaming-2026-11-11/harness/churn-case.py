import json,pathlib,subprocess,sys,time,re
from redis_client import Redis,member
from kvrocks_dbsize import refresh_dbsize
B=pathlib.Path('/opt/gaming-main-20261111');product,label,epoch,seconds=sys.argv[1:];D=B/'results'/label;D.mkdir()
a=[str(B/'bin/workload'),'--host','10.96.0.4','--workload','B','--phase','run','--keys','1000000','--connections','320','--threads','32','--seconds',seconds,'--epoch-ms',epoch,'--out',str(D/'result.json')]
(D/'args.json').write_text(json.dumps(a))
def counts(s):return {k.lower():int(v) for k,v in re.findall(r'cmdstat_(\w+):calls=(\d+)',s)}
import hashlib
client_binary_sha256=hashlib.sha256((B/'bin/workload').read_bytes()).hexdigest()
with Redis() as r:
 before=r.call('INFO').decode();cb=counts(r.call('INFO','commandstats').decode());start=time.time();subprocess.run(a,check=True,stdout=subprocess.DEVNULL,timeout=int(seconds)+900);end=time.time();ca=counts(r.call('INFO','commandstats').decode());after=r.call('INFO').decode()
 result=json.loads((D/'result.json').read_text());m=result['metrics'];assert result['errors']==0;created=m['ZADD_create']['count'];assert created==m['PEXPIRE_create']['count']==m['creation_lateness']['count']
 expected={'zadd':created+m['ZADD_XX_CH']['count'],'pexpire':created};actual={k:ca.get(k,0)-cb.get(k,0) for k in expected};assert actual==expected,(actual,expected)
 (D/'info-before.txt').write_text(before);(D/'info-after.txt').write_text(after)
 dbsize=r.call('DBSIZE')
 def counter(text,name):
  m=re.search(r'^'+name+r':(\d+)',text,re.M);return int(m.group(1)) if m else None
 mask=(1<<64)-1
 def mix(x):
  x=(x+0x9e3779b97f4a7c15)&mask;x=((x^(x>>30))*0xbf58476d1ce4e5b9)&mask;x=((x^(x>>27))*0x94d049bb133111eb)&mask;return x^(x>>31)
 checked=missing=0;sample_start=time.time()
 for i in range(512):
  slot=mix(i+1177)%1000000;now=int(time.time()*1000);due=int(epoch)+(slot+1)*1800000//1000000;generation=0 if now<due else 1+(now-due)//1800000;key=f'game:match:{mix(slot+1107):016x}:{generation}'
  rows=r.call('ZRANGE',key,0,-1,'WITHSCORES')
  if not rows:missing+=1;continue
  assert len(rows)==100 and set(rows[::2])=={member(slot*50+j) for j in range(50)},(slot,len(rows))
  scores=[float(v) for v in rows[1::2]];assert scores==sorted(scores) and all(0<=x<1e13 for x in scores);checked+=1
 samples={'sample_count':512,'present_and_valid':checked,'missing_generation':missing,'started_at':sample_start,'ended_at':time.time()}
 dbsize_refresh=refresh_dbsize(r) if product=='kvrocks' else None
 if dbsize_refresh:dbsize=dbsize_refresh['keys']
 deltas={name:(counter(after,name)-counter(before,name) if counter(after,name) is not None and counter(before,name) is not None else None) for name in ['expired_keys','evicted_keys']}
 d={'product':product,'label':label,'started_at':start,'ended_at':end,'result':result,'target_creates_per_s':1000000/1800,'expected_commands':expected,'actual_commands':actual,'dbsize_after':dbsize,'dbsize_refresh':dbsize_refresh,'post_run_samples':samples,'stats_deltas':deltas}
 d['client_binary_sha256']=client_binary_sha256
 (D/'point.json').write_text(json.dumps(d,indent=2));print(json.dumps(d))
