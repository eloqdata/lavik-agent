import os,sys,json,time,subprocess as sp,pathlib,signal,socket,hashlib
R=pathlib.Path('/mnt/dev/benchmark/main-large-objects-c80-20261015');R.mkdir(exist_ok=True)
HOST='10.84.1.4';PORT='6379';CLI='/usr/bin/redis-cli'
def out(a):return sp.check_output(list(map(str,a)),text=True).strip()
def save(p,d):p.write_text(json.dumps(d,indent=2)+'\n')
def cli(*args):return out([CLI,'-h',HOST,'-p',PORT,'--raw',*args])
def stop():
 p=R/'active.json'
 if not p.exists():return
 a=json.loads(p.read_text());pid=a['pid'];proc=pathlib.Path(f'/proc/{pid}')
 if proc.exists():
  actual=(proc/'cmdline').read_bytes().replace(b'\0',b' ').decode()
  assert os.path.samefile(proc/'exe', a['args'][3]),actual
  if 'start_ticks' in a:assert (proc/'stat').read_text().split()[21]==a['start_ticks']
  os.kill(pid,signal.SIGTERM)
  deadline=time.monotonic()+300
  while proc.exists():
   if (proc/'stat').read_text().split()[2]=='Z':break
   if time.monotonic()>deadline:raise RuntimeError('Clean stop timed out; not killing')
   time.sleep(.5)
 p.rename(R/('stopped-'+str(time.time_ns())+'.json'))
def start(product,label):
 assert not (R/'active.json').exists()
 assert not pathlib.Path('/mnt/dev/benchmark/large-objects-81920-20261015/active.json').exists()
 try:
  socket.create_connection((HOST,6379),1).close();raise RuntimeError('port occupied')
 except ConnectionRefusedError:pass
 d=R/label;d.mkdir(parents=True,exist_ok=False);env=dict(os.environ)
 if product in ('redis','valkey'):
  binary=f'/mnt/dev/benchmark/release010-latest/downloads/{product}/src/{product}-server'
  threads=16 if product=='redis' else 8
  args=[binary,'--bind',HOST,'--protected-mode','no','--port',PORT,'--dir',str(d),'--save','','--appendonly','no','--io-threads',str(threads),'--maxclients','10000']
 elif product=='kvrocks':
  binary='/mnt/dev/benchmark/storage-peers-20261014/sources/kvrocks/build/kvrocks'
  data=pathlib.Path('/mnt/storage-peers-20261014/main-large-objects-c80-20261015')/label;data.mkdir(parents=True,exist_ok=False)
  cfg=pathlib.Path('/mnt/dev/benchmark/storage-peers-20261014/configs/kvrocks.conf').read_text().replace('dir /mnt/storage-peers-20261014/kvrocks','dir '+str(data))
  (d/'server.conf').write_text(cfg);args=[binary,'-c',str(d/'server.conf')]
 elif product in ('pr',):
  identity=json.loads((R/'build-manifest.json').read_text())['variants'][product]
  binary=identity['binary']
  assert hashlib.file_digest(open(binary,'rb'),'sha256').hexdigest()==identity['sha256']
  huge=pathlib.Path('/sys/kernel/mm/hugepages/hugepages-2048kB/free_hugepages')
  deadline=time.monotonic()+120
  while int(huge.read_text())<4096:
   if time.monotonic()>deadline:raise RuntimeError('Hugepages not released after previous server exit')
   time.sleep(.5)
  time.sleep(2)
  devices=json.loads((R/'spdk-devices.json').read_text())
  env.update(BYCORF_EAL_ARGS=' '.join('-a '+v['bdf'] for v in devices),BYCORF_DPDK_MEMORY_MB='8192')
  args=[binary,'--storage=spdk','--bind='+HOST,'--threads=16','--pin-workers','--metrics-port=0','--spdk-max-completions-per-poll=16','--log-dir='+str(d/'logs'),'--shutdown-checkpoint']+['--data-file=spdk://'+v['bdf']+'/1' for v in devices]
 else:raise ValueError(product)
 args=['taskset','-c','0-15']+args
 save(d/'launch.json',{'args':args,'binary_sha256':hashlib.file_digest(open(binary,'rb'),'sha256').hexdigest(),'environment':{k:v for k,v in env.items() if k.startswith('BYCORF_')}})
 with (d/'server.log').open('w') as f:p=sp.Popen(args,stdout=f,stderr=sp.STDOUT,env=env,start_new_session=True)
 save(R/'active.json',{'pid':p.pid,'product':product,'label':label,'args':args,'start_ticks':pathlib.Path(f'/proc/{p.pid}/stat').read_text().split()[21]})
 for _ in range(600):
  if p.poll() is not None:raise RuntimeError('server exited: '+str(p.returncode))
  try:
   if cli('PING')=='PONG':break
  except Exception:pass
  time.sleep(.5)
 else:raise RuntimeError('startup timeout')
 if product in ('redis','valkey'):
  assert cli('CONFIG','GET','save')=='save';assert cli('CONFIG','GET','appendonly').splitlines()==['appendonly','no']
 if product in ('pr',):assert cli('CONFIG','GET','defrag-paused').splitlines()==['defrag-paused','no']
 print(json.dumps({'started':label,'pid':p.pid}))
def snapshot(name):
 a=json.loads((R/'active.json').read_text());pid=a['pid'];d={'time':time.time(),'active':a}
 for n in ['stat','meminfo','diskstats','net/dev']:d[n]=pathlib.Path('/proc/'+n).read_text()
 for n in ['stat','status','io']:d['process_'+n]=pathlib.Path(f'/proc/{pid}/'+n).read_text()
 d['info']={x:cli('INFO',x) for x in ['server','memory','stats']}
 if a['product'] in ('pr',):
  d['defrag']=cli('CONFIG','GET','defrag-paused');assert d['defrag'].splitlines()==['defrag-paused','no']
 if a['product']=='kvrocks':
  d['auto_compaction']=cli('CONFIG','GET','rocksdb.disable_auto_compactions');assert d['auto_compaction'].splitlines()[-1] in ('no','false','0')
 dest=R/'snapshots'/name;dest.parent.mkdir(parents=True,exist_ok=True);save(dest,d)
if __name__=='__main__':
 assert os.geteuid()==0
 import resource
 resource.setrlimit(resource.RLIMIT_NOFILE,(65535,65535))
 resource.setrlimit(resource.RLIMIT_MEMLOCK,(resource.RLIM_INFINITY,resource.RLIM_INFINITY))
 action=sys.argv[1]
 if action=='start':start(*sys.argv[2:])
 elif action=='fresh':
  import fresh
  fresh.main(sys.argv[2])
 elif action=='stop':stop()
 elif action=='snapshot':snapshot(sys.argv[2])
