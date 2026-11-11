"""One-shot VM clock calibration; exits before any TTL benchmark starts."""
import socket,time,sys,json
ADDRESS=('10.96.0.4',16379)
if sys.argv[1]=='server':
 with socket.socket() as listener:
  listener.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);listener.settimeout(20);listener.bind(ADDRESS);listener.listen(1)
  peer,_=listener.accept()
  with peer:
   peer.settimeout(5)
   for _ in range(10):
    assert peer.recv(1)==b'?';peer.sendall((str(time.time_ns())+'\n').encode())
 print('clock probe exited')
else:
 for attempt in range(100):
  try:s=socket.create_connection(ADDRESS,timeout=1);break
  except OSError:
   if attempt==99:raise
   time.sleep(.1)
 samples=[]
 with s:
  f=s.makefile('rb')
  for _ in range(10):
   a=time.time_ns();s.sendall(b'?');remote=int(f.readline());b=time.time_ns();samples.append({'offset_ms':(remote-(a+b)/2)/1e6,'rtt_ms':(b-a)/1e6})
 best=min(samples,key=lambda x:x['rtt_ms'])
 print(json.dumps({**best,'wall_ms':time.time_ns()//1000000,'samples':samples,'method':'one-shot private-network timestamp exchange; server exits before benchmark'}))
