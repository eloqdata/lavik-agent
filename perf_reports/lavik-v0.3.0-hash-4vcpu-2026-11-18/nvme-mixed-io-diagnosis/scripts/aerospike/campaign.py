import pathlib,subprocess,json,time,threading,socket,struct,sys
root=pathlib.Path('/opt/bench');kit=root/'aerospike-kit';out=root/'aerospike-diagnostic-results';out.mkdir(exist_ok=False)
ssh=['ssh','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4']
def control(action):subprocess.run(ssh+['sudo','python3','/opt/bench/aerospike-server.py',action],check=True)
def info(cmd):
 with socket.create_connection(('10.83.0.4',3000),timeout=5) as s:
  payload=(cmd+'\n').encode();s.sendall(struct.pack('>Q',(2<<56)|(1<<48)|len(payload))+payload)
  def read(n):
   b=b''
   while len(b)<n:
    v=s.recv(n-len(b));assert v;b+=v
   return b
  n=struct.unpack('>Q',read(8))[0]&((1<<48)-1);return read(n).decode()
def sample(stop,label):
 with (out/(label+'-info.jsonl')).open('w') as f:
  while not stop.is_set():
   try:row={'epoch':time.time(),'statistics':info('statistics'),'namespace':info('namespace/ycsb')}
   except Exception as e:row={'epoch':time.time(),'error':str(e)}
   f.write(json.dumps(row)+'\n');f.flush();stop.wait(1)
def snapshot(label):
 b=subprocess.check_output(ssh+['sudo','python3','/opt/bench/aerospike-server.py','snapshot']);json.loads(b);(out/(label+'.json')).write_bytes(b)
def verify(label):
 cp=str(kit)+':/opt/bench/YCSB-247a2d4/aerospike/target/dependency/*';b=subprocess.check_output(['java','-cp',cp,'VerifyAerospike','10.83.0.4',str(kit/'sample-keys.txt')]);j=json.loads(b);assert j['sample_count']==1003;(out/(label+'.json')).write_bytes(b);return j

def phase(kind,label,w):
 snapshot(label+'-before');stop=threading.Event();t=threading.Thread(target=sample,args=(stop,label));t.start()
 try:subprocess.run(['python3',str(kit/'run.py'),'--ycsb-root','/opt/bench/YCSB-247a2d4','--host','10.83.0.4','--product','aerospike','--records','10000000','--phase',kind,'--threads','128','--workload',w,'--target','0','--seconds','60','--out',str(out),'--label',label,'--execute'],check=True)
 finally:stop.set();t.join()
 snapshot(label+'-after')
try:
 if '--reuse-prepared' not in sys.argv:control('prepare')
 control('start')
 subprocess.run(ssh+['sudo','systemctl','stop','bench-rootcause-iostat'])
 subprocess.run(ssh+['sudo','systemd-run','--unit=bench-aerospike-iostat','--collect','-p','StandardOutput=append:/opt/bench/aerospike-diagnosis/iostat.txt','iostat','-x','-y','-t','1'],check=True)
 phase('load','load','C');first=verify('verified-load');control('stop');control('start');assert verify('verified-recovery')==first
 for point,w in [('C','C'),('B','B'),('C-recovery','C')]:
  phase('warmup',point+'-warmup',w)
  for rep in range(1,4):phase('measure',point+f'-r{rep}',w);print('COMPLETE',point,rep,flush=True)
 verify('verified-final');(out/'complete.json').write_text(json.dumps({'windows':9,'points':['C','B','C-recovery'],'epoch':time.time()})+'\n')
finally:
 control('stop');subprocess.run(ssh+['sudo','systemctl','stop','bench-aerospike-iostat'])
