import statistics,resource
import pathlib,subprocess as sp,socket,json,time,sys,os,shlex,traceback,fcntl,struct
R=pathlib.Path('/opt/benchmark/main-large-objects-c80-20261015');HOST='10.84.1.4'
OPS=['set','setrange','hash','list','zincr','zswap','stream'];CS=[80]
SERVER='/mnt/dev/benchmark/main-large-objects-c80-20261015/server.py'
def client_preflight():
 soft,hard=resource.getrlimit(resource.RLIMIT_NOFILE)
 required=65535
 if hard!=resource.RLIM_INFINITY and hard<required:
  raise RuntimeError(f'Client NOFILE hard limit {hard} < {required}')
 resource.setrlimit(resource.RLIMIT_NOFILE,(required,hard))
 sockets=[]
 try:
  for _ in range(max(CS)+32):sockets.append(socket.socket())
 finally:
  for s in sockets:s.close()
 print(f'CLIENT PREFLIGHT: NOFILE {soft} -> {required}; {max(CS)+32} sockets verified',flush=True)
client_preflight()
def save(p,d):p.parent.mkdir(parents=True,exist_ok=True);tmp=p.with_suffix(p.suffix+'.tmp');tmp.write_text(json.dumps(d,indent=2)+'\n');tmp.replace(p)
def event(msg):
 print(time.strftime('%FT%TZ',time.gmtime()),msg,flush=True);save(R/'status.json',{'utc':time.strftime('%FT%TZ',time.gmtime()),'message':msg,'pid':os.getpid()})
def remote(*args):
 return sp.check_output(['ssh','-i','/opt/benchmark/keys/server-control','-o','BatchMode=yes','-o','ServerAliveInterval=30','azureuser@10.84.0.4',shlex.join(['sudo','python3',SERVER,*map(str,args)])],text=True,timeout=600)
class Resp:
 def __enter__(self):self.s=socket.create_connection((HOST,6379),timeout=180);self.f=self.s.makefile('rb');return self
 def __exit__(self,*a):self.f.close();self.s.close()
 def read(self):
  b=self.f.readline();assert b,b
  t,v=b[:1],b[1:-2]
  if t==b'-':raise RuntimeError(v.decode())
  if t==b'+':return v
  if t==b':':return int(v)
  if t==b'$':
   n=int(v)
   if n<0:return None
   b=self.f.read(n);assert len(b)==n;assert self.f.read(2)==b'\r\n';return b
  if t==b'*':return [self.read() for _ in range(int(v))]
  raise RuntimeError(b)
 def cmd(self,*a):
  a=[x if isinstance(x,bytes) else str(x).encode() for x in a];self.s.sendall(b'*'+str(len(a)).encode()+b'\r\n'+b''.join(b'$'+str(len(v)).encode()+b'\r\n'+v+b'\r\n' for v in a));return self.read()
def validate(op,prefix,keys,path):
 data={}
 with Resp() as c:
  for i in sorted(set([0,keys//2,keys-1])):
   k=f'{prefix}:{i}'
   if op in ('set','setrange'):
    n=c.cmd('STRLEN',k);assert n==1048576;sample=c.cmd('GETRANGE',k,0,31);data[k]={'length':n,'sample_hex':sample.hex()}
   elif op=='hash':
    n=c.cmd('HLEN',k);assert n==4096;v=c.cmd('HGET',k,'f2048');assert len(v)==256;data[k]={'fields':n,'sample_hex':v[:32].hex()}
   elif op=='list':
    n=c.cmd('LLEN',k);assert n==4096;v=c.cmd('LINDEX',k,2048);assert len(v)==256;data[k]={'length':n,'sample_hex':v[:32].hex()}
   elif op in ('zincr','zswap'):
    n=c.cmd('ZCARD',k);assert n==32768;v=c.cmd('ZRANGE',k,0,2,'WITHSCORES');assert all(len(x)==32 for x in v[::2]);data[k]={'members':n,'sample':[x.decode() for x in v]}
   else:
    n=c.cmd('XLEN',k);assert n==4096;v=c.cmd('XRANGE',k,'-','+','COUNT',1);assert len(v[0][1][1])==256;data[k]={'entries':n,'sample_id':v[0][0].decode()}
 save(path,data)
def bench(op,phase,prefix,keys,c,sec,seed,d,name,state=None):
 d.mkdir(parents=True,exist_ok=True);output=d/(name+'.json')
 args=[str(R/'bench'),'--host',HOST,'--op',op,'--phase',phase,'--prefix',prefix,'--keys',str(keys),'--connections',str(c),'--threads','16','--seconds',str(sec),'--seed',str(seed),'--out',str(output)]
 if state:args+=['--state',str(state)]
 save(d/(name+'.command.json'),args);event(str(d.relative_to(R))+'/'+name)
 begin=time.time()
 with (d/(name+'.log')).open('w') as f:sp.run(args,stdout=f,stderr=sp.STDOUT,check=True,timeout=43200 if phase=='load' else sec+300)
 r=json.loads(output.read_text());assert r['errors']==0
 if phase=='load':
  per={'set':1,'setrange':1,'hash':64,'list':64,'zincr':256,'zswap':256,'stream':4096}[op]
  assert r['metrics']['LOAD']['count']==keys*per,r
 else:
  total=r['metrics']['OPERATIONS']['count'];assert total>0
  for k,v in r['metrics'].items():assert v['count']==total,(k,v,total)
 save(d/(name+'.timing.json'),{'start':begin,'end':time.time()})
 return r

def smoke(product,already=False):
 label='smoke-'+product
 if not already:remote('start',product,label)
 try:
  for op in OPS:
   d=R/'smoke'/product/op;d.mkdir(parents=True,exist_ok=True);prefix='smoke:'+op
   with Resp() as c:assert c.cmd('FLUSHDB')==b'OK'
   bench(op,'load',prefix,16,16,0,1,d,'load')
   validate(op,prefix,16,d/'before.json')
   state=d/'state.bin';state.unlink(missing_ok=True)
   bench(op,'run',prefix,16,80,2,2,d,'c80',state if op=='zswap' else None)
   validate(op,prefix,16,d/'after.json')
  (R/'smoke'/product/'COMPLETE').write_text(time.strftime('%FT%TZ',time.gmtime()))
  event('SMOKE COMPLETE '+product)
 finally:remote('stop')

def formal(product):
 for op in OPS:
  for repeat in range(1,2):
   label=f'{product}-{op}-r{repeat}';d=R/'results'/product/op/f'r{repeat}'
   if (d/'COMPLETE').exists():continue
   if d.exists():raise RuntimeError('Partial run exists: '+str(d))
   remote('start',product,label);prefix='formal:'+op
   try:
    with Resp() as c:assert c.cmd('FLUSHDB')==b'OK'
    bench(op,'load',prefix,8192,80,0,100+repeat,d,'load')
    validate(op,prefix,8192,d/'validation-before.json')
    state=d/'state.bin'
    for conn in CS:
     base=f'{product}/{op}/r{repeat}/c{conn}'
     warm=bench(op,'warm',prefix,8192,conn,90,10000+repeat*100+conn,d,f'warm-c{conn}',state if op=='zswap' else None)
     remote('snapshot',base+'-before.json')
     host_before={x:pathlib.Path('/proc/'+x).read_text() for x in ['stat','meminfo','net/dev']};save(d/f'c{conn}-client-before.json',host_before)
     r=bench(op,'run',prefix,8192,conn,60,20000+repeat*100+conn,d,f'c{conn}',state if op=='zswap' else None)
     save(d/f'c{conn}-client-after.json',{x:pathlib.Path('/proc/'+x).read_text() for x in ['stat','meminfo','net/dev']})
     remote('snapshot',base+'-after.json')
     validate(op,prefix,8192,d/f'c{conn}-validation.json')
     event(f'DONE {base}: {r["metrics"]["OPERATIONS"]["qps"]:.1f} operations/s')
    (d/'COMPLETE').write_text(time.strftime('%FT%TZ',time.gmtime()))
   finally:remote('stop')
 event('FORMAL COMPLETE '+product)
if __name__=='__main__':
 R.mkdir(exist_ok=True);lock=(R/'runner.lock').open('w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 try:
  if sys.argv[1]=='smoke':smoke(sys.argv[2],len(sys.argv)>3)
  elif sys.argv[1]=='formal':formal(sys.argv[2])
 except BaseException:
  save(R/'failure.json',{'utc':time.strftime('%FT%TZ',time.gmtime()),'traceback':traceback.format_exc()});event('FAILED: '+str(sys.exc_info()[1]));raise
