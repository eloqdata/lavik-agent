"""Disposable Docker checks for the user-facing onboarding and migration guides."""
import hashlib,json,os,platform,subprocess,time,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
os.chdir(ROOT)
TASK='lavik-onboard-'+uuid.uuid4().hex[:8]
CACHE=ROOT/'.cache/docs-reorg';CACHE.mkdir(exist_ok=True,parents=True)
IMAGE=TASK+'-image'
paths=['scripts/verify-onboarding.py']+[str(p) for p in Path('verification/onboarding').rglob('*') if p.is_file()]
hashes={p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in sorted(paths)}
report={'status':'failed','version':'0.1.0-beta.1','architecture':platform.machine(),'fileHashes':hashes,'steps':[],'cases':[]}
def run(args,timeout=180,record=True):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 if record: report['steps'].append({'argv':args,'exitCode':p.returncode,'stdout':p.stdout.strip(),'stderr':p.stderr.strip()})
 if p.returncode: raise RuntimeError(str(args[:4])+': '+p.stderr[-1500:]+p.stdout[-1500:])
 return p.stdout.strip()
def redis(container,port,*args):return run(['docker','exec',container,'redis-cli','--raw','-c','-p',str(port),*args],record=False)
def wait(fn,seconds=120):
 until=time.monotonic()+seconds
 while time.monotonic()<until:
  try:
   value=fn()
   if value:return value
  except RuntimeError:pass
  time.sleep(.5)
 raise RuntimeError('Timed out waiting for service or expected data')
def fixture_args(name,network,volume):
 return ['docker','run','-d','--name',name,'--network',network,'--mount',f'source={volume},target=/var/lib/lavik','--ulimit','memlock=536870912:536870912','--memory','1g','--cpus','2','--read-only','--tmpfs','/tmp','--cap-drop','ALL','--security-opt','no-new-privileges:true','--security-opt','seccomp:unconfined','--stop-timeout','60',IMAGE]
containers=[];volumes=[]
try:
 image_file=CACHE/(TASK+'-image-id')
 run(['docker','build','--iidfile',str(image_file),'-t',IMAGE,'verification/onboarding'],timeout=600)
 IMAGE=image_file.read_text().strip()
 assert IMAGE.startswith('sha256:')
 report['lavikImage']=IMAGE
 image_file.unlink()
 report['redisImage']=json.loads(run(['docker','image','inspect','redis:7.2.5']))[0]['RepoDigests']
 # Plain Docker: retained state survives container replacement, not just restart.
 name=TASK+'-plain';volume=TASK+'-plain-data';containers.append(name);volumes.append(volume)
 run(fixture_args(name,'none',volume));wait(lambda:redis(name,6379,'PING')=='PONG')
 report['binaryVersion']=run(['docker','exec',name,'/opt/lavik/lavik','--version'])
 report['binarySha256']=run(['docker','exec',name,'sha256sum','/opt/lavik/lavik']).split()[0]
 report['sourceCommit']=run(['docker','exec',name,'cat','/opt/lavik/REVISION'])
 assert report['binaryVersion']=='lavik 0.1.0-beta.1'
 assert report['sourceCommit']==json.loads(Path('content/releases/0.1.0.json').read_text())['commit']
 assert redis(name,6379,'SET','greeting','hello from Lavik')=='OK'
 assert redis(name,6379,'GET','greeting')=='hello from Lavik'
 run(['docker','stop','--time','60',name]);run(['docker','rm',name]);run(fixture_args(name,'none',volume));wait(lambda:redis(name,6379,'GET','greeting')=='hello from Lavik')
 report['cases'].append({'name':'docker','status':'passed','greeting':'hello from Lavik','containerReplacement':'passed'})
 run(['docker','rm','-f',name]);containers.remove(name)
 # Exact Compose service, with test-only project/image and no published ports.
 override=CACHE/(TASK+'-compose.yaml')
 override.write_text('services:\n  lavik:\n    image: '+IMAGE+'\n    pull_policy: never\n    ports: !reset []\n    network_mode: none\n')
 compose=['docker','compose','-p',TASK,'-f',str(ROOT/'verification/onboarding/compose.yaml'),'-f',str(override)]
 try:
  run([*compose,'config','--quiet']);run([*compose,'up','-d','--no-build','--wait'])
  cid=run([*compose,'ps','-q','lavik']);assert redis(cid,6379,'SET','greeting','compose-persistent')=='OK'
  run([*compose,'down']);run([*compose,'up','-d','--no-build','--wait']);cid=run([*compose,'ps','-q','lavik']);assert redis(cid,6379,'GET','greeting')=='compose-persistent'
  report['cases'].append({'name':'compose','status':'passed','downUpPersistence':'passed','health':json.loads(run(['docker','inspect',cid]))[0]['State']['Health']['Status']})
 finally:run([*compose,'down','--volumes']);override.unlink(missing_ok=True)
 for layout in ['redis','redis-cluster']:
  source=TASK+'-'+layout;target=source+'-target';volume=target+'-data'
  containers.extend([source,target]);volumes.append(volume)
  ports=[7001] if layout=='redis' else [7001,7002,7003]
  startup='; '.join(f'mkdir -p /tmp/r{p}; redis-server --port {p} --bind 127.0.0.1 --protected-mode no --repl-diskless-sync no --save "" --dir /tmp/r{p} --daemonize yes '+('--cluster-enabled yes --cluster-node-timeout 5000 ' if layout=='redis-cluster' else '') for p in ports)+'; exec sleep infinity'
  run(['docker','run','-d','--name',source,'--network','none','--memory','512m','--tmpfs','/tmp','--entrypoint','sh','redis:7.2.5','-c',startup])
  for p in ports:wait(lambda:redis(source,p,'PING')=='PONG')
  if layout=='redis-cluster':
   run(['docker','exec',source,'redis-cli','--cluster','create',*[f'127.0.0.1:{p}' for p in ports],'--cluster-yes'])
   wait(lambda:'cluster_state:ok' in redis(source,7001,'CLUSTER','INFO'))
  import binascii
  keys=[]
  for i,p in enumerate(ports):
   key=next('migration-'+str(n) for n in range(10000) if min(binascii.crc_hqx(('migration-'+str(n)).encode(),0)%16384//5461,2)==i)
   assert redis(source,7001,'SET',key,'value-'+str(p))=='OK';keys.append((key,'value-'+str(p)))
  assert redis(source,7001,'SET','migration-ttl','expires','EX','300')=='OK'
  run(fixture_args(target,'container:'+source,volume));wait(lambda:redis(target,6379,'PING')=='PONG')
  env=['-e','LAVIK_HOST=127.0.0.1','-e','LAVIK_PORT=6379','-e','REDIS_HOST=127.0.0.1','-e','REDIS_PORT=7001','-e','REDIS_HOST_2=127.0.0.1','-e','REDIS_PORT_2=7002','-e','REDIS_HOST_3=127.0.0.1','-e','REDIS_PORT_3=7003']
  snippet='attach-redis.sh' if layout=='redis' else 'attach-cluster.sh'
  reply=run(['docker','exec',*env,target,'sh','-ec',Path('verification/onboarding',snippet).read_text()]);assert 'ERR' not in reply,reply
  wait(lambda:all(redis(target,6379,'GET',k)==v for k,v in keys))
  assert 0<int(redis(target,6379,'TTL','migration-ttl'))<=300
  # Replay post-snapshot writes from every primary.
  for key,value in keys:assert redis(source,7001,'SET',key,value+'-updated')=='OK'
  wait(lambda:all(redis(target,6379,'GET',k)==v+'-updated' for k,v in keys))
  watermarks={}
  for p in ports:
   info=dict(line.split(':',1) for line in redis(source,p,'INFO','replication').splitlines() if ':' in line)
   watermarks[p]=int(info['master_repl_offset'])
  def caught_up():
   for p in ports:
    info=dict(line.split(':',1) for line in redis(source,p,'INFO','replication').splitlines() if ':' in line)
    offset=watermarks[p];replicas=[v for k,v in info.items() if k.startswith('slave') and k[5:].isdigit()]
    if not replicas or not any(int(dict(x.split('=',1) for x in r.split(','))['offset'])>=offset for r in replicas):return False
   return True
  wait(caught_up)
  before=redis(target,6379,'INFO','replication')
  reply=run(['docker','exec',*env,target,'sh','-ec',Path('verification/onboarding/detach.sh').read_text()]);assert 'ERR' not in reply and 'master' in reply,reply
  assert all(redis(target,6379,'GET',k)==v+'-updated' for k,v in keys)
  assert redis(target,6379,'SET','after-cutover','writable')=='OK'
  report['cases'].append({'name':layout,'status':'passed','keys':keys,'initialAndIncrementalReads':'passed','ttlPreserved':True,'sourceAcksCaughtUp':True,'sourceWatermarks':watermarks,'beforeDetach':before,'afterDetach':reply,'targetWritable':True,'redisVersion':run(['docker','exec',source,'redis-server','--version'])})
  run(['docker','rm','-f',target,source]);containers.remove(target);containers.remove(source)
 assert hashes=={p:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in sorted(paths)}
 report['status']='passed';report['verifiedAt']=time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime());report['scope']='Native local Docker; Minimal beta.1 standalone; Redis 7.2.5, one source and three co-located Cluster primaries. Test-only container names, isolated network namespaces and no host ports. No TLS/authenticated-source, source failover, resharding or production migration certification.'
 Path('evidence/onboarding/0.1.0/verification.json').write_text(json.dumps(report,indent=2)+'\n')
 print('Docker, Compose, Redis and Redis Cluster checks passed.')
except Exception as e:
 report['error']=str(e);(CACHE/'failed-run.json').write_text(json.dumps(report,indent=2)+'\n');raise
finally:
 for c in containers:subprocess.run(['docker','rm','-f',c],capture_output=True)
 for v in volumes:subprocess.run(['docker','volume','rm',v],capture_output=True)
