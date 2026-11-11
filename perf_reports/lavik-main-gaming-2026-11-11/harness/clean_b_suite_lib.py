from common import *
import sys,math
def capture_cpu(*args):pass  # No continuous or per-thread monitor in formal windows.
for sub in ['points','memory','init','provenance']: (OUT/sub).mkdir(exist_ok=True)
active=None;awake=None

def report():subprocess.run([sys.executable,str(ROOT/'report.py')],check=True,stdout=subprocess.DEVNULL)
def receipt(sub,label,d):
 (OUT/sub/(label+'.json')).write_text(json.dumps(d,indent=2));report();return d

def command(c,timeout=180):return ssh('load','cd '+BASE+' && '+c,timeout=timeout).stdout

def stop():
 global active
 if active:
  log('stop '+active);ssh('db',f'sudo systemctl stop {active}',timeout=1900);active=None

def start(product,label,expected_keys=0):
 global active
 visit=label+'-'+str(int(time.time()))
 assert not ssh('db',"ss -H -ltn 'sport = :6379'").stdout.strip()
 active='gaming1111-'+visit;log('start '+visit)
 ssh('db',f'sudo systemd-run --unit={active} --uid=azureuser --property=TimeoutStopSec=1800 /bin/bash {BASE}/start-product.sh {product} {visit}')
 for _ in range(180):
  r=ssh('load','timeout 5 redis-cli -h 10.96.0.4 --raw PING',False)
  if r.returncode==0 and r.stdout.strip()=='PONG':break
  assert ssh('db',f'systemctl is-active {active}',False).stdout.strip() not in ['inactive','failed'];time.sleep(1)
 else:raise RuntimeError('server timeout')

 config=command('redis-cli -h 10.96.0.4 --raw CONFIG GET spdk-max-completions-per-poll').splitlines()
 assert config==['spdk-max-completions-per-poll','0']
 (OUT/'provenance'/f'{label}-runtime.json').write_text(json.dumps({'at':time.time(),'spdk_max_completions_per_poll':0,'observed':config}))
 if expected_keys is not None:single_zset_readiness(visit,expected_keys)
 (OUT/'provenance'/f'{label}-info.txt').write_text(command('redis-cli -h 10.96.0.4 INFO'))

def snap(product,keys,label):
 d=json.loads(ssh('db',f'sudo python3 {BASE}/snapshot.py {active} {product} {keys} {label}').stdout);receipt('memory',label,d)

def bench(w,phase,keys,seconds,label,extra='',c=320,timeout=7200):
 a=f'{BASE}/bin/workload --host 10.96.0.4 --workload {w} --phase {phase} --keys {keys} --members 10000000 --connections {c} --threads 32 --seconds {seconds} --out {BASE}/results/{label}.json {extra}'
 log(label);d=json.loads(command(a,timeout));assert d['errors']==0;return receipt('init',label,d)

def flush():assert command('redis-cli -h 10.96.0.4 FLUSHDB',timeout=600).strip()=='OK'

def verify_a(label,keys=10,n=10000000):
 log(label);a=f'{BASE}/bin/verify_a --host 10.96.0.4 --key game:global --keys {keys} --hot-percent 0 --op score --phase verify --members {n} --connections {min(keys,32)} --threads {min(keys,32)} --seconds 1 --seed 101 --out {BASE}/results/{label}.json'
 d=json.loads(command(a,7200));assert d['errors']==0 and d['per_key_operations']==[1]*keys;return receipt('init',label,d)

def smoke(product):
 label='compat-'+product;start(product,label)
 log('bounded ZADD compatibility '+product)
 a=f'{BASE}/bin/load_a --host 10.96.0.4 --key game:global --keys 2 --hot-percent 0 --op score --phase load --members 1000 --connections 2 --threads 2 --seconds 1 --seed 101 --out {BASE}/results/{label}-a-load.json'
 d=json.loads(command(a,180));assert d['errors']==0 and d['per_key_operations']==[1,1]
 verify_a(label+'-a-verify',2,1000);flush()
 # Latest B client uses distinct member IDs for every match.
 bench('B','load',512,1,label+'-b-load',c=32);bench('B','verify',512,1,label+'-b-verify',c=32)
 epoch=int(command("python3 -c 'import time;print(int(time.time()*1000)+5000)'"));extra=f'--epoch-ms {epoch} --ttl-ms 10000';bench('B','ttl',512,1,label+'-b-ttl',extra,c=32)
 b=bench('B','run',512,25,label+'-b-run',extra,c=32);m=b['metrics'];assert m['ZADD_create']['count']==m['PEXPIRE_create']['count'];assert 1250<=m['ZADD_create']['count']<=1300
 flush();bench('C','load',512,1,label+'-c-load',c=32);bench('C','run',512,3,label+'-c-run',c=32);bench('C','verify',512,1,label+'-c-verify',c=32);flush();stop()

def workload(product,w,keys_override=None,suffix=""):
 label=product+'-'+w.lower()+suffix;start(product,label);keys=keys_override or {'A':10,'B':1000000,'C':10000000}[w];snap(product,keys,label+'-empty')
 if w=='A':
  log(label+' bounded ZADD load: 10 x 10M members, sorted 8192-member batches');a=f'{BASE}/bin/load_a --host 10.96.0.4 --key game:global --keys 10 --hot-percent 0 --op score --phase load --members 10000000 --connections 10 --threads 10 --seconds 1 --seed 101 --out {BASE}/results/{label}-load.json';d=json.loads(command(a,14400));assert d['errors']==0 and d['per_key_operations']==[1]*10;receipt('init',label+'-load',d);verify_a(label+'-before')
 else:
  loaded=bench(w,'load',keys,1,label+'-load',timeout=14400);assert loaded['operations']==keys;bench(w,'verify',keys,1,label+'-before',timeout=14400)
 snap(product,keys,label+'-loaded')
 if w in ['A','C']:
  for rep in range(1,4):
   for c in [320]:
    for hot in ([5,10] if w=='C' else [5]):
     point=f'{label}-r{rep}-c{c}-h{hot}';log(point)
     capture_cpu(point,'before')
     d=json.loads(command(f'python3 {BASE}/formal-case.py {product} {point} {w} {keys} {c} {hot} 60 {1107+rep}',900));receipt('points',point,d);log(str(d['result']['metrics']['all']))
     capture_cpu(point,'after')
  if w=='A':verify_a(label+'-after')
  else:bench(w,'verify',keys,1,label+'-after',timeout=14400)
 else:
  loadqps=loaded['metrics']['all']['qps'];lead=max(120,math.ceil(2*keys/max(1000,loadqps)))
  with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
   serving=pool.submit(ssh,'db',f'python3 {BASE}/clock-probe.py server',timeout=30)
   clock=json.loads(command(f'python3 {BASE}/clock-probe.py client',30));serving.result(timeout=30)
  receipt('provenance',label+'-clock',clock);assert abs(clock['offset_ms'])<50
  epoch=clock['wall_ms']+lead*1000;bench('B','ttl',keys,1,label+'-ttl',f'--epoch-ms {epoch}',timeout=1200)
  remaining=epoch-int(command("python3 -c 'import time;print(int(time.time()*1000))'"));assert remaining>10000,remaining
  snap(product,keys,label+'-ttl-set');point=label+'-churn';log(f'{point}, 1860 seconds, starts in {remaining/1000:.1f}s')
  capture_cpu('clean-'+point,'before')
  d=json.loads(command(f'python3 {BASE}/churn-case.py {product} {point} {epoch} 1860',3000));receipt('points',point,d);log(str(d['result']['metrics']['all']))
 if w=='B':capture_cpu('clean-'+point,'after')
 snap(product,keys,label+'-after');(OUT/'provenance'/f'{label}-after-info.txt').write_text(command('redis-cli -h 10.96.0.4 INFO'));flush();stop()
 receipt('provenance',label+'-complete',{'at':time.time(),'product':product,'workload':w})
