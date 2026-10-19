#!/usr/bin/env python3
"""Linux loopback tests against a strict in-memory RESP model, never a database."""
import argparse, collections, hashlib, json, os, platform, signal, socketserver, struct, subprocess, tempfile, threading, time, traceback
from pathlib import Path
import interface as api

class Fake:
    def __init__(self, op, *, corrupt=None, fragment=False, pause=None):
        self.op=op; self.db={}; self.calls=[]; self.errors=[]; self.lock=threading.Lock(); self.corrupt=corrupt; self.fragment=fragment; self.pause=pause; self.paused=threading.Event(); self.release=threading.Event(); self.did_pause=False; self.allow_disconnect=bool(corrupt); self.streamseq=0
        outer=self
        class Handler(socketserver.StreamRequestHandler):
            def handle(self):
                try:
                    while True:
                        head=self.rfile.readline()
                        if not head: return
                        assert head.startswith(b'*') and head.endswith(b'\r\n'), head
                        args=[]
                        for _ in range(int(head[1:])):
                            size=self.rfile.readline(); assert size.startswith(b'$')
                            n=int(size[1:]); v=self.rfile.read(n); assert len(v)==n and self.rfile.read(2)==b'\r\n'; args.append(v)
                        with outer.lock:
                            outer.calls.append(args)
                            value=outer.command(args)
                            pause_this=outer.pause==args[0].decode() and not outer.did_pause
                            if pause_this: outer.did_pause=True
                        if pause_this:
                            outer.paused.set()
                            if not outer.release.wait(5): raise AssertionError('Test did not release paused command')
                        raw=encode(value)
                        if outer.fragment and len(raw)>20:
                            for part in (raw[:1],raw[1:13],raw[13:29],raw[29:]): self.wfile.write(part); self.wfile.flush()
                        else: self.wfile.write(raw); self.wfile.flush()
                except (BrokenPipeError,ConnectionResetError):
                    if not outer.allow_disconnect: outer.errors.append(traceback.format_exc())
                except Exception: outer.errors.append(traceback.format_exc())
        class Server(socketserver.ThreadingTCPServer):
            allow_reuse_address=True; daemon_threads=True
        self.server=Server(('127.0.0.1',0),Handler); self.port=self.server.server_address[1]
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True); self.thread.start()
    def close(self):
        self.release.set(); self.server.shutdown(); self.server.server_close(); self.thread.join(2)
        assert not self.errors, '\n'.join(self.errors)
    def command(self,a):
        cmd=a[0].decode(); key=a[1]; assert key.startswith(b'objects8k:')
        assert 0<=int(key.rsplit(b':',1)[1])<2
        d=self.db
        if cmd=='SET': assert len(a)==3 and len(a[2])==8192; d[key]=a[2]; v=Simple('OK')
        elif cmd=='SETRANGE':
            assert len(a)==4 and len(a[3])==256 and 0<=int(a[2])<=7936
            assert len(d[key])==8192; pos=int(a[2]); d[key]=d[key][:pos]+a[3]+d[key][pos+256:]; v=8192
        elif cmd=='HSET':
            assert (len(a)-2)%2==0
            obj=d.setdefault(key,{})
            n=0
            for field,val in zip(a[2::2],a[3::2]):
                assert field.startswith(b'f') and 0<=int(field[1:])<32 and len(val)==256
                n+=field not in obj;obj[field]=val
            assert len(obj)<=32; v=n
        elif cmd in ('RPUSH','LPUSH'):
            obj=d.setdefault(key,[]); assert a[2:] and all(len(x)==256 for x in a[2:])
            if cmd=='RPUSH': assert len(a[2:])==32;obj.extend(a[2:])
            else: assert len(a)==3;obj.insert(0,a[2])
            v=len(obj)
        elif cmd=='RPOP': assert len(a)==2; v=d[key].pop()
        elif cmd=='ZADD':
            assert (len(a)-2)%2==0
            obj=d.setdefault(key,{}); n=0
            for score,m in zip(a[2::2],a[3::2]):
                assert_member(m); score=int(score);assert 0<=score<32768
                n+=m not in obj;obj[m]=score
            assert len(obj)<=256;v=n
        elif cmd=='ZREM':
            assert len(a)==3; assert_member(a[2]);obj=d[key];v=int(a[2] in obj);obj.pop(a[2],None)
        elif cmd=='ZINCRBY':
            assert len(a)==4 and int(a[2]) in (-32768,32768);assert_member(a[3]);assert a[3] in d[key]
            d[key][a[3]]+=int(a[2]);v=str(d[key][a[3]]).encode()
        elif cmd=='SADD':
            obj=d.setdefault(key,set());n=0
            for m in a[2:]: assert_member(m);n+=m not in obj;obj.add(m)
            assert len(obj)<=260;v=n
        elif cmd=='SREM':
            assert len(a)==3;assert_member(a[2]);v=int(a[2] in d[key]);d[key].discard(a[2])
        elif cmd=='XADD':
            obj=d.setdefault(key,[])
            if a[2]==b'MAXLEN': assert a[2:7]==[b'MAXLEN',b'=',b'32',b'*',b'payload'];val=a[7]
            else: assert a[2:4]==[b'*',b'payload'];val=a[4]
            assert len(val)==256;obj.append(val)
            if a[2]==b'MAXLEN': del obj[:-32]
            assert len(obj)<=32;self.streamseq+=1;v=f'{self.streamseq}-0'.encode()
        elif cmd in ('HGETALL','HKEYS','HVALS'):
            obj=d[key];assert len(obj)==32
            items=sorted(obj.items(),reverse=True)
            v=[z for kv in items for z in kv] if cmd=='HGETALL' else [k if cmd=='HKEYS' else val for k,val in items]
        elif cmd=='LRANGE': assert a[2:]==[b'0',b'-1'];v=list(d[key]);assert len(v)==32
        elif cmd=='SMEMBERS': v=sorted(d[key],reverse=True);assert len(v)==256
        elif cmd=='ZRANGE':
            assert a[2:]==[b'0',b'-1',b'WITHSCORES'];obj=d[key];assert len(obj)==256
            v=[z for m,score in sorted(obj.items(),key=lambda kv:kv[1]) for z in (m,str(score).encode())]
        else: raise AssertionError(a)
        if self.corrupt and self.corrupt[0]==cmd:
            kind=self.corrupt[1]
            if kind=='wrong_int': v=1048576
            elif kind=='duplicate': v=list(v);v[1]=v[0]
            elif kind=='bad_payload': v=list(v);v[-1]=b'!'*len(v[-1])
            elif kind=='short':v=list(v[:-1])
            elif kind=='nan':v=b'nan'
            else: raise AssertionError(kind)
        return v

def assert_member(m): assert len(m)==32 and m[:1]==b'm' and m[-1:] in (b'a',b'b') and 0<=int(m[1:31])<256
class Simple(str): pass
def encode(v):
    if isinstance(v,Simple): return b'+'+v.encode()+b'\r\n'
    if isinstance(v,int): return f':{v}\r\n'.encode()
    if isinstance(v,bytes): return f'${len(v)}\r\n'.encode()+v+b'\r\n'
    if isinstance(v,list): return f'*{len(v)}\r\n'.encode()+b''.join(encode(x) for x in v)
    raise TypeError(v)

def state(path): path.write_bytes(struct.pack('<ii',1280,2)+bytes(1280*2))
def check_state(path,db,op):
    data=path.read_bytes();assert len(data)==8+1280*2 and struct.unpack('<ii',data[:8])==(1280,2)
    flags=data[8:];assert not any(flags[4:])
    for k in range(2):
        obj=db[f'objects8k:{op}:{k}'.encode()]; assert len(obj)==256
        for slot in range(256):
            alt=flags[slot*2+k] if slot<2 else 0
            m=f'm{slot:030d}{"b" if alt else "a"}'.encode(); assert m in obj

def argv(binary_dir,op,phase,out,server,statepath=None,seconds=.06):
    args=api.command(op,phase,out,statepath,root=binary_dir,host='127.0.0.1',port=server.port)
    values={'--keys':'2','--connections':'1' if phase=='validate' else '2','--threads':'1','--seconds':'1' if phase=='validate' else str(seconds)}
    for key,val in values.items():args[args.index(key)+1]=val
    args+=['--test-mode','1'];return args

def invoke(args,out,expected=0):
    p=subprocess.run(args,text=True,capture_output=True,timeout=15)
    assert p.returncode==expected,(p.returncode,p.stdout,p.stderr,args)
    if expected==0:
        assert not p.stderr,p.stderr
        r=json.loads(out.read_text());assert r['errors']==0 and not r['interrupted'] and r['test_mode'] and r['pipeline']==1
        assert r['data_shape']['logical_payload_bytes']==8192
        return r
    return p

def run_tests(bindir):
    passed=[]
    with tempfile.TemporaryDirectory(prefix='objects8k-clients-') as td:
        root=Path(td)
        def run_case(op):
            srv=Fake(op,fragment=op in api.READ_OPS); st=root/(op+'.state') if op in api.STATEFUL else None
            if st: state(st)
            try:
                out=root/(op+'.json');v=invoke(argv(bindir,op,'load',out,srv,st),out)
                count=api.expected_load_count(op)//8192*2;assert v['metrics']['LOAD']['count']==count
                assert len(srv.db)==2 and all(len(x)==api.shape(op)['items_per_key'] if not isinstance(x,bytes) else len(x)==8192 for x in srv.db.values())
                for ph in ('warm','run'):
                    v=invoke(argv(bindir,op,ph,out,srv,st),out)
                    assert v['data_shape']==api.shape(op) and v['seed']==api.SEEDS[ph]
                    n=v['metrics']['OPERATIONS']['count'];assert n>0
                    for metric in api.METRICS[op]: assert v['metrics'][metric]['count']==n
                    if st:check_state(st,srv.db,op)
                if op in api.READ_OPS:
                    v=invoke(argv(bindir,op,'validate',out,srv),out)
                    assert v['metrics']['OPERATIONS']['count']==3 and v['validation_keys']==[0,1,1]
                if op=='stream':assert all(len(x)==32 for x in srv.db.values())
                if op=='list':assert all(len(x)==32 for x in srv.db.values())
            finally:srv.close()
        for op in api.OPS:run_case(op);passed.append('load-warm-run-shape-'+op)
        # Inject wrong cardinalities, payloads and numeric replies after a genuine load.
        for op,command,kind in [('setrange','SETRANGE','wrong_int'),('zincr','ZINCRBY','nan'),('hgetall','HGETALL','bad_payload'),('hkeys','HKEYS','duplicate'),('hvals','HVALS','bad_payload'),('lrange','LRANGE','short'),('smembers','SMEMBERS','duplicate'),('zrange','ZRANGE','short')]:
            srv=Fake(op)
            try:
                out=root/'bad.json';invoke(argv(bindir,op,'load',out,srv),out)
                srv.corrupt=(command,kind);srv.allow_disconnect=True
                invoke(argv(bindir,op,'run',out,srv),out,1)
            finally:srv.close()
            passed.append('reject-reply-'+op)
        # SIGTERM after the first command has executed, before its reply is released.
        for op,first in [('zswap','ZREM'),('sswap','SADD'),('list','LPUSH')]:
            srv=Fake(op);st=root/(op+'.interrupt.state') if op in api.STATEFUL else None
            if st:state(st)
            try:
                out=root/'signal.json';invoke(argv(bindir,op,'load',out,srv,st),out)
                srv.pause=first
                args=argv(bindir,op,'warm',out,srv,st,seconds=2)
                p=subprocess.Popen(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
                assert srv.paused.wait(5),'Pair was not issued'
                p.send_signal(signal.SIGTERM);time.sleep(.02);srv.release.set()
                stdout,stderr=p.communicate(timeout=10);assert p.returncode==130,(stdout,stderr,p.returncode)
                assert not stderr,stderr
                r=json.loads(out.read_text());assert r['interrupted'] is True and r['errors']==0
                n=r['metrics']['OPERATIONS']['count'];assert n>0
                for m in api.METRICS[op]:assert r['metrics'][m]['count']==n
                if st:check_state(st,srv.db,op)
                assert all(len(x)==api.shape(op)['items_per_key'] for x in srv.db.values())
                # A fresh process must continue from the saved flags, not reset to a.
                srv.pause=None;invoke(argv(bindir,op,'run',out,srv,st),out)
                if st:check_state(st,srv.db,op)
            finally:srv.close()
            passed.append('signal-finishes-pair-and-resumes-'+op)
        # Frontend/state refusals are checked before any network connection occurs.
        srv=Fake('zswap')
        try:
            out=root/'reject.json';st=root/'reject.state';base=argv(bindir,'zswap','run',out,srv,st)
            invoke(base,out,1);passed.append('reject-missing-state')
            for kind in ('shape','truncated','trailing','nonbinary','inactive'):
                state(st);b=bytearray(st.read_bytes())
                if kind=='shape':b[:4]=struct.pack('<i',80)
                elif kind=='truncated':b=b[:-1]
                elif kind=='trailing':b+=b'\0'
                elif kind=='nonbinary':b[8]=2
                elif kind=='inactive':b[8+2*2]=1
                st.write_bytes(b);invoke(base,out,1);passed.append('reject-state-'+kind)
            state(st)
            for key,val in [('--keys','81920'),('--connections','80'),('--threads','16'),('--seconds','60'),('--op','set'),('--phase','profile'),('--test-mode','0'),('--host','10.84.1.4')]:
                args=list(base);args[args.index(key)+1]=val
                # 'set' would be supported by bench but rejects --state.
                invoke(args,out,1);passed.append('reject-argument-'+key)
            args=base[:-2];invoke(args,out,1);passed.append('reject-small-without-testmode')
            args=base+['--keys','2'];invoke(args,out,1);passed.append('reject-duplicate-argument')
            assert not srv.calls
        finally:srv.close()
    return passed

if __name__=='__main__':
    ap=argparse.ArgumentParser();ap.add_argument('--bin-dir',type=Path,required=True);ap.add_argument('--out',type=Path);a=ap.parse_args()
    started=time.time();passed=run_tests(a.bin_dir.resolve())
    sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
    report={'status':'passed','tests':passed,'passed':len(passed),'platform':platform.platform(),'elapsed_seconds':time.time()-started,'scope':'Full Linux executables against a loopback fake RESP server; no real database or benchmark dataset accessed','source_sha256':{p.name:sha(p) for p in sorted(Path(__file__).parent.glob('bench*')) if p.is_file() and p.suffix in ('.cpp','.h')},'binary_sha256':{name:sha(a.bin_dir/name) for name in sorted(set(api.binary_name(op) for op in api.OPS))}}
    if a.out:a.out.write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
