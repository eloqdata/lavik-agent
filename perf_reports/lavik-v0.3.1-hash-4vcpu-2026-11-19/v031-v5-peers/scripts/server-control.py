#!/usr/bin/env python3
"""Start one native database on the dedicated benchmark server."""
import argparse,json,pathlib,subprocess,time
p=argparse.ArgumentParser();p.add_argument('action',choices=['start','stop']);p.add_argument('product',choices=['lavik','redis','dragonfly','kvrocks']);p.add_argument('--dataset',default='pilot-native');p.add_argument('--tiered',action='store_true');a=p.parse_args()
if not a.dataset.replace('-','').isalnum():p.error('invalid dataset label')
def run(cmd,check=True):return subprocess.run(cmd,check=check,text=True,capture_output=True)
unit='bench-db-'+a.product
if a.action=='stop':
 if a.product=='dragonfly' and run(['systemctl','is-active',unit],False).stdout.strip()=='active':
  run(['redis-cli','-h','10.83.0.4','SHUTDOWN','NOSAVE'],False)
  for _ in range(20):
   if run(['systemctl','is-active',unit],False).stdout.strip() not in ('active','activating'):
    print('Stopped Dragonfly with SHUTDOWN NOSAVE after acquisition');raise SystemExit(0)
   time.sleep(1)
 r=run(['systemctl','stop',unit],False);print(r.stdout,r.stderr);raise SystemExit(r.returncode)
# Prevent simultaneous peer processes. A failed unit with no process is harmless.
for product in ['lavik','redis','dragonfly','kvrocks']:
 state=run(['systemctl','is-active','bench-db-'+product],False).stdout.strip()
 if state in ('active','activating'):raise SystemExit('A benchmark database is already active: '+product)
assert run(['findmnt','-rn','-M','/mnt/bench']).stdout.strip(), 'scratch is not mounted'
base=pathlib.Path('/mnt/bench')/a.product/a.dataset;base.mkdir(parents=True,exist_ok=True)
run(['systemctl','reset-failed',unit],False)
cmd=['systemd-run','--unit',unit,'--collect','-p','AllowedCPUs=0-3','-p','CPUAffinity=0-3','-p','MemoryMax=28G','-p','MemorySwapMax=0','-p','LimitNOFILE=65535','-p','TimeoutStopSec=300','-p','StandardOutput=append:'+str(base/'stdout.log'),'-p','StandardError=inherit']
if a.product=='lavik':
 if not (base/'lavik.data').exists():
  with (base/'lavik.data').open('wb') as f:f.truncate(512*1024**3)
 cmd+=['/opt/bench/lavik-release/lavik-v0.3.0-linux-x86_64-minimal/lavik','--bind','10.83.0.4','--port','6379','--threads','4','--max-memory','24gb','--data-file',str(base/'lavik.data'),'--log-dir',str(base/'logs'),'--shutdown-checkpoint']
elif a.product=='redis':
 cmd+=['/opt/bench/bin/redis-server','--bind','10.83.0.4','--protected-mode','no','--save','','--appendonly','no','--maxmemory','24gb','--maxmemory-policy','noeviction','--io-threads','4','--dir',str(base)]
elif a.product=='kvrocks':
 text=pathlib.Path('/opt/bench/kvrocks-default.conf').read_text()
 overrides={'bind':'10.83.0.4','port':'6379','workers':'4','dir':str(base),'daemonize':'no','rocksdb.block_cache_size':'8192','pidfile':str(base/'kvrocks.pid')}
 lines=[]
 for line in text.splitlines():
  parts=line.split()
  if parts and parts[0] in overrides:line=parts[0]+' '+overrides.pop(parts[0])
  lines.append(line)
 lines += [k+' '+v for k,v in overrides.items()]
 cfg=base/'bench.conf';cfg.write_text('\n'.join(lines)+'\n')
 cmd+=['/opt/bench/bin/kvrocks','-c',str(cfg)]
else:
 cmd+=['/opt/bench/dragonfly-release/dragonfly-x86_64','--bind=10.83.0.4','--port=6379','--proactor_threads=4','--maxmemory=24gb','--cache_mode=false','--dir='+str(base),'--dbfilename=baseline','--snapshot_cron=']
if a.tiered:
 if a.product!='dragonfly':p.error('Tiering is only supported here for Dragonfly')
 cmd+=['--tiered_prefix='+str(base/'tiered'),'--tiered_experimental_hash_support=true','--listpack_max_field_len=256','--listpack_max_bytes=2048']
(base/'launch.json').write_text(json.dumps(cmd,indent=2)+'\n')
r=run(cmd,False);print(r.stdout,r.stderr)
if r.returncode:raise SystemExit(r.returncode)
for i in range(120):
 r=run(['redis-cli','-h','10.83.0.4','PING'],False)
 if r.stdout.strip()=='PONG':print('READY native',a.product);break
 if run(['systemctl','is-active',unit],False).stdout.strip() not in ('active','activating'):raise SystemExit('Native process failed during startup; inspect stdout.log')
 time.sleep(1)
else:raise SystemExit('startup timeout')
