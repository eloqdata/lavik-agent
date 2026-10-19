#!/usr/bin/env python3
"""Local fake RESP validation. --binary tests the real Linux epoll client.

Without --binary, compile a test-only portable driver from the exact production
member/state/make_run/check functions. This does NOT claim full Linux coverage.
No VM access. Every file and server socket is temporary/loopback-only.
"""
import argparse, hashlib, json, os, platform, shutil, socket, struct, signal, time
import subprocess, tempfile, threading
from pathlib import Path

R=Path(__file__).resolve().parent
KEYS=3

def state_bytes():
    flags=bytearray(1280*KEYS)
    for slot in range(80):
        for key in range(KEYS):flags[slot*KEYS+key]=(slot+key)%2
    return struct.pack('<ii',1280,KEYS)+flags

class FakeResp:
    def __init__(self,state,bad_reply=False,members=32768,loading=False):
        self.members=members;self.loading=loading;self.loaded=set()
        self.flags=bytearray(state[8:]);self.removed=set();self.scores={};self.seen=[]
        self.errors=[];self.bad_reply=bad_reply;self.lock=threading.Lock();self.jobs=[];self.pause_first=False;self.did_pause=False;self.paused=threading.Event();self.release=threading.Event()
    def __enter__(self):
        self.sock=socket.socket();self.sock.bind(('127.0.0.1',0));self.sock.listen(128);self.sock.settimeout(.1)
        self.port=self.sock.getsockname()[1];self.stop=threading.Event()
        self.thread=threading.Thread(target=self.accept,daemon=True);self.thread.start();return self
    def __exit__(self,*_):
        self.release.set();self.stop.set();self.thread.join(2);self.sock.close()
        for job in self.jobs:job.join(2)
    def accept(self):
        while not self.stop.is_set():
            try:connection,_=self.sock.accept()
            except socket.timeout:continue
            job=threading.Thread(target=self.serve,args=(connection,),daemon=True);job.start();self.jobs.append(job)
    def serve(self,connection):
        with connection,connection.makefile('rb') as stream:
            while not self.stop.is_set():
                try:
                    head=stream.readline()
                    if not head:return
                    assert head[:1]==b'*';args=[]
                    for _ in range(int(head[1:])):
                        bulk=stream.readline();assert bulk[:1]==b'$';n=int(bulk[1:]);args.append(stream.read(n).decode());assert stream.read(2)==b'\r\n'
                    with self.lock:
                        reply=self.command(args)
                        pause=self.pause_first and args[0]=="ZREM" and not self.did_pause
                        if pause:self.did_pause=True
                    if pause:
                        self.paused.set()
                        assert self.release.wait(5),"No test release for first half of pair"
                    connection.sendall(reply)
                except (ConnectionResetError, BrokenPipeError) as err:
                    if not (self.bad_reply or self.stop.is_set()):
                        self.errors.append('unexpected client disconnect: '+repr(err))
                    return
                except Exception as err:
                    self.errors.append(repr(err))
                    try:connection.sendall(b'-ERR fake-server validation failed\r\n')
                    except OSError:pass
                    return
    def command(self,args):
        cmd,key,*tail=args;k=int(key.rsplit(':',1)[1]);assert 0<=k<KEYS
        if self.loading:
            assert cmd=='ZADD' and key.startswith('zset-opt:'+('compact' if self.members==256 else 'grouped')+':') and len(tail)==256
            for score,member in zip(tail[::2],tail[1::2]):
                slot=int(member[1:-1]);assert 0<=slot<self.members and member==f'm{slot:030d}a' and int(score)==slot
                assert (k,slot) not in self.loaded;self.loaded.add((k,slot))
            self.seen.append((cmd,k,len(tail)//2,'load'));return b':128\r\n'
        member=tail[-1];assert len(member)==32 and member[0]=='m' and member[-1] in 'ab';slot=int(member[1:-1]);assert 0<=slot<self.members
        flag=self.flags[slot*KEYS+k] if slot<80 else 0;expected='b' if flag else 'a'
        self.seen.append((cmd,k,slot,member[-1]))
        if self.bad_reply and cmd=='ZREM':return b':0\r\n'
        if cmd=='ZINCRBY':
            assert member[-1]==expected and (k,slot) not in self.removed,(args,expected)
            delta=int(tail[0]);assert delta in (-32768,32768)
            ident=(k,slot);self.scores[ident]=self.scores.get(ident,slot)+delta
            value=str(self.scores[ident]).encode();return b'$'+str(len(value)).encode()+b'\r\n'+value+b'\r\n'
        if cmd=='ZREM':
            assert slot<80 and member[-1]==expected and (k,slot) not in self.removed
            self.removed.add((k,slot));return b':1\r\n'
        if cmd=='ZADD':
            assert slot<80 and member[-1]!=expected and (k,slot) in self.removed
            self.removed.remove((k,slot));self.flags[slot*KEYS+k]^=1;return b':1\r\n'
        raise AssertionError('unexpected command '+cmd)


def portable_driver(directory):
    source=(R/'bench.cpp').read_text()
    # Exact source slices: no alternate implementations of the functions under test.
    headers='''#include <arpa/inet.h>\n#include <sys/socket.h>\n#include <unistd.h>\n#include <fcntl.h>\n#include <algorithm>\n#include <atomic>\n#include <chrono>\n#include <cmath>\n#include <cstdio>\n#include <cstring>\n#include <fstream>\n#include <iomanip>\n#include <iostream>\n#include <map>\n#include <mutex>\n#include <random>\n#include <sstream>\n#include <stdexcept>\n#include <string>\n#include <thread>\n#include <vector>\n'''
    prefix=source[source.index('using namespace std;'):source.index('int connect_server()')]
    functions=source[source.index('// Each connection owns'):source.index('string command_name(')]
    driver=r'''
int main(int argc,char**argv){try{
 op=argv[1];phase="run";prefix="formal:zincr";keys=3;members=stoi(argv[4]);seed=20180;connections=2;threads=1;seconds=1;
 toggles.assign(1280,vector<uint8_t>(keys,0));load_state(argv[2]);if(op=="validate")return 0;
 int fd=socket(AF_INET,SOCK_STREAM,0);sockaddr_in addr{};addr.sin_family=AF_INET;addr.sin_port=htons(stoi(argv[3]));inet_pton(AF_INET,"127.0.0.1",&addr.sin_addr);if(connect(fd,(sockaddr*)&addr,sizeof addr))throw runtime_error("connect");
 mt19937_64 rng(seed);vector<int> slots={0,1,2,78,79,80,members/2,members-1};
 for(int key=0;key<keys;key++)for(int slot:slots){
  Client c;c.id=slot%2;c.key=key;c.slot=slot;c.seq=25;c.stage=1;
  if(op=="zswap"){c.id=slot%2;c.stage=0;}
  int steps=op=="zswap"?2:1;
  for(int step=0;step<steps;step++){
   string message=make_run(c,rng);size_t sent=0;while(sent<message.size()){ssize_t n=send(fd,message.data()+sent,message.size()-sent,0);if(n<=0)throw runtime_error("send");sent+=n;}
   string buffer;Reply reply{};while(!reply.used){char b[4096];ssize_t n=recv(fd,b,sizeof b,0);if(n<=0)throw runtime_error("recv");buffer.append(b,n);reply=parse(buffer);}
   check(c,reply);if(op=="zswap")c.stage++;
  }
  if(op=="zswap")toggles[c.id][c.key]^=1;
 }
 close(fd);if(op=="zswap")save_state(argv[2]);return 0;
}catch(const exception&e){cerr<<e.what()<<"\n";return 1;}}
'''
    src=directory/'portable-driver.cpp';src.write_text(headers+prefix+functions+driver)
    binary=directory/'portable-driver';subprocess.run(['clang++','-std=c++17','-O2',str(src),'-o',str(binary)],check=True,capture_output=True)
    return binary


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--binary',type=Path);args=parser.parse_args()
    if args.binary and platform.system()!='Linux':raise SystemExit('--binary requires Linux')
    passed=[]
    with tempfile.TemporaryDirectory(prefix='zset-crossover-client-') as temp:
        temp=Path(temp);binary=args.binary.resolve() if args.binary else portable_driver(temp)
        def invoke(op,state,port,members=32768,phase='run'):
            if not args.binary:return [str(binary),op,str(state),str(port),str(members)]
            return [str(binary),'--host','127.0.0.1','--port',str(port),'--op',op,'--phase',phase,'--prefix','zset-opt:compact' if members==256 else 'zset-opt:grouped','--members',str(members),'--keys',str(KEYS),'--connections','8','--threads','4','--seconds','2','--seed',str({'load':101,'warm':10180,'run':20180}[phase]),'--out',str(temp/'result.json'),'--state',str(state),'--test-mode','1']
        state=temp/'state.bin';initial=state_bytes()
        for members in (256,32768):
            state.write_bytes(initial)
            for label,op,phase in [('main-zincr','zincr','run'),('main-zswap-warm','zswap','warm'),('main-zswap-formal','zswap','run'),('candidate-zincr','zincr','run'),('candidate-zswap-warm','zswap','warm'),('candidate-zswap-formal','zswap','run')]:
                before=state.read_bytes()
                with FakeResp(before,members=members) as server:
                    result=subprocess.run(invoke(op,state,server.port,members,phase),capture_output=True,text=True,timeout=30)
                assert result.returncode==0,(members,label,result.stdout,result.stderr,server.errors)
                assert not result.stderr and not server.errors and server.seen and not server.removed,(label,server.errors)
                after=state.read_bytes();assert after==before if op=='zincr' else after[8:]==server.flags
                if op=='zincr':
                    assert any(slot<80 and suffix=='b' for _,_,slot,suffix in server.seen)
                    assert any(slot>=80 and suffix=='a' for _,_,slot,suffix in server.seen)
                if args.binary:
                    raw=json.loads((temp/'result.json').read_text());assert raw['errors']==0 and raw['members']==members
                    assert raw['test_mode'] is True and raw['interrupted'] is False and raw['threads']==4 and raw['pipeline']==1
                    assert raw['data_shape']=={'structure':'zset','members_per_key':members,'member_bytes':32,'logical_payload_bytes':members*32}
                    expected=len(server.seen)//(2 if op=='zswap' else 1);assert raw['metrics']['OPERATIONS']['count']==expected
                    for name in ('ZREM','ZADD') if op=='zswap' else ('ZINCRBY',):assert raw['metrics'][name]['count']==expected
                passed.append(str(members)+' '+label+' exact state/data flow')
        with FakeResp(state.read_bytes(),bad_reply=True) as server:
            before=state.read_bytes();result=subprocess.run(invoke('zswap',state,server.port),capture_output=True,text=True,timeout=30)
        assert result.returncode!=0 and state.read_bytes()==before and not server.errors,server.errors;passed.append('bad ZREM return rejected without saving state')
        fixtures={'missing':None,'truncated':initial[:-1],'extra':initial+b'x','badflag':initial[:8]+b'\2'+initial[9:],
                  'inactive':initial[:8+80*KEYS]+b'\1'+initial[9+80*KEYS:],'shape':struct.pack('<ii',1280,KEYS+1)+initial[8:]}
        for label,data in fixtures.items():
            path=temp/(label+'.bin')
            if data is not None:path.write_bytes(data)
            result=subprocess.run(invoke('zincr',path,1),capture_output=True,text=True,timeout=5)
            assert result.returncode!=0,(label,result.stdout,result.stderr)
            assert 'state' in result.stderr,(label,result.stderr)
            passed.append(label+' state rejected before connection')
        if args.binary:
            zero=struct.pack('<ii',1280,KEYS)+bytes(1280*KEYS)
            for members in (256,32768):
                state.write_bytes(zero)
                with FakeResp(zero,members=members,loading=True) as server:
                    result=subprocess.run(invoke('zincr',state,server.port,members,'load'),capture_output=True,text=True,timeout=30)
                assert result.returncode==0 and not result.stderr and not server.errors,(result.stderr,server.errors)
                raw=json.loads((temp/'result.json').read_text())
                assert len(server.loaded)==KEYS*members and len(server.seen)==KEYS*members//128 and raw['metrics']['LOAD']['count']==KEYS*members//128
                assert raw['members']==members and state.read_bytes()==zero
                passed.append(str(members)+' fresh load covers every member once and leaves state zero')
                state.write_bytes(initial)
                with FakeResp(initial,members=members) as server:
                    server.pause_first=True
                    process=subprocess.Popen(invoke('zswap',state,server.port,members,'warm'),stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
                    assert server.paused.wait(5),'No first-half pause'
                    process.send_signal(signal.SIGTERM);time.sleep(.02);server.release.set()
                    stdout,stderr=process.communicate(timeout=10)
                assert process.returncode==130 and not stderr and not server.errors,(stdout,stderr,server.errors)
                assert not server.removed and state.read_bytes()[8:]==server.flags
                raw=json.loads((temp/'result.json').read_text());assert raw['interrupted'] is True
                count=raw['metrics']['OPERATIONS']['count'];assert count>0 and len(server.seen)==2*count
                assert raw['metrics']['ZREM']['count']==raw['metrics']['ZADD']['count']==count
                # The next version's ZINCRBY must read the just-saved suffix flags without changing them.
                before=state.read_bytes()
                with FakeResp(before,members=members) as server:
                    result=subprocess.run(invoke('zincr',state,server.port,members),capture_output=True,text=True,timeout=30)
                assert result.returncode==0 and not result.stderr and not server.errors and state.read_bytes()==before
                passed.append(str(members)+' signal completes pair and next-version zincr uses saved state')
            for label,changes in [('wrong-prefix',{'--prefix':'formal:zincr'}),('bad-members',{'--members':'80'}),('wrong-shape',{'--keys':'81920'}),('unsupported-command',{'--op':'set'}),('unsupported-phase',{'--phase':'profile'}),('nonloopback-test',{'--host':'10.84.1.4'})]:
                cmd=invoke('zincr',state,1)
                for key,value in changes.items():cmd[cmd.index(key)+1]=value
                result=subprocess.run(cmd,capture_output=True,text=True,timeout=5)
                assert result.returncode!=0 and 'connect' not in result.stderr,(label,result.stderr)
                passed.append(label+' rejected before connection')
            cmd=invoke('zincr',state,1)[:-2];result=subprocess.run(cmd,capture_output=True,text=True,timeout=5)
            assert result.returncode!=0 and 'Fixed crossover' in result.stderr
            passed.append('small fake dimensions rejected without test-mode')
            state.write_bytes(initial)
            result=subprocess.run(invoke('zincr',state,1,256,'load'),capture_output=True,text=True,timeout=5)
            assert result.returncode!=0 and 'zero initial state' in result.stderr
            passed.append('nonzero state rejected by fresh loader')
        print(json.dumps({'mode':'full-linux-client' if args.binary else 'portable-production-functions',
            'platform':platform.platform(),'status':'passed',
            'source_sha256':hashlib.sha256((R/'bench.cpp').read_bytes()).hexdigest(),
            'test_script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'binary_sha256':hashlib.sha256(binary.read_bytes()).hexdigest(),
            'passed':len(passed),'checks':passed,'remote_operations':0},indent=2))

if __name__=='__main__':main()
