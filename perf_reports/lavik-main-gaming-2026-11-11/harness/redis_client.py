import socket

class Redis:
 def __init__(self,host='10.96.0.4',port=6379):self.host=host;self.port=port
 def __enter__(self):
  self.s=socket.create_connection((self.host,self.port),timeout=180);self.f=self.s.makefile('rb');return self
 def __exit__(self,*args):self.f.close();self.s.close()
 def read(self):
  line=self.f.readline()
  if not line.endswith(b'\r\n'):raise RuntimeError('Truncated RESP: '+repr(line[:100]))
  kind=line[:1];v=line[1:-2]
  if kind==b'-':raise RuntimeError(v.decode(errors='replace'))
  if kind==b'+':return v
  if kind==b':':return int(v)
  if kind==b'$':
   n=int(v)
   if n==-1:return None
   if not 0<=n<=192*1024*1024:raise RuntimeError('Bulk size')
   data=self.f.read(n)
   if len(data)!=n or self.f.read(2)!=b'\r\n':raise RuntimeError('Bulk framing')
   return data
  if kind==b'*':
   n=int(v)
   if n==-1:return None
   if not 0<=n<=3000000:raise RuntimeError('Array size')
   return [self.read() for _ in range(n)]
  raise RuntimeError('Unknown RESP type')
 def call(self,*args):
  args=[x if isinstance(x,bytes) else str(x).encode() for x in args]
  self.s.sendall(b'*'+str(len(args)).encode()+b'\r\n'+b''.join(b'$'+str(len(x)).encode()+b'\r\n'+x+b'\r\n' for x in args));return self.read()

def member(i,added=False):
 mask=(1<<64)-1
 def mix(x):
  x=(x+0x9e3779b97f4a7c15)&mask;x=((x^(x>>30))*0xbf58476d1ce4e5b9)&mask;x=((x^(x>>27))*0x94d049bb133111eb)&mask;return x^(x>>31)
 alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';x=mix(i+20261029);s='X' if added else 'M'
 for j in range(1,24):
  if j%9==0:x=mix(x)
  s+=alphabet[x&63];x>>=6
 return (s+f'{i:08x}').encode()

def key_name(i):
 mask=(1<<64)-1;x=(i+20261030+0x9e3779b97f4a7c15)&mask
 x=((x^(x>>30))*0xbf58476d1ce4e5b9)&mask;x=((x^(x>>27))*0x94d049bb133111eb)&mask;x=x^(x>>31)
 return 'zbench:multi:'+f'{x:016x}'

def validate(r,n,full=False):
 assert r.call('DBSIZE')==64
 for k in range(64):
  key=key_name(k)
  assert r.call('ZCARD',key)==n
  for i in [0,1,n//2,n-2,n-1]:
   assert int(r.call('ZSCORE',key,member(i)))==i*1024
   assert r.call('ZRANK',key,member(i))==i
   assert r.call('ZREVRANK',key,member(i))==n-1-i
  assert r.call('ZSCORE',key,member(0,True)) is None
 return {'keys':64,'members_per_key':n,'all_key_cardinality_and_samples':'passed','full_contents':'see separate C++ verify receipt'}
