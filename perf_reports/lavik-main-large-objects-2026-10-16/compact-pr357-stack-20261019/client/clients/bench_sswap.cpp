// Derived for fixed 8 KiB objects; see client-interface.md and source-manifest.json.
#include "bench8k.h"
#include <arpa/inet.h>
#include <sys/epoll.h>
#include <sys/socket.h>
#include <netinet/tcp.h>
#include <unistd.h>
#include <fcntl.h>
#include <sched.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstring>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <map>
#include <mutex>
#include <random>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>
#include <charconv>
using namespace std;
using Clock=chrono::steady_clock;
uint64_t ns(){return chrono::duration_cast<chrono::nanoseconds>(Clock::now().time_since_epoch()).count();}
string resp(const vector<string>& a){string s="*"+to_string(a.size())+"\r\n";for(auto&v:a)s+="$"+to_string(v.size())+"\r\n"+v+"\r\n";return s;}
struct Reply {char type;string value;size_t used=0;};
Reply parse(const string&s){if(s.empty())return {};auto e=s.find("\r\n");if(e==string::npos)return {};Reply r{s[0],s.substr(1,e-1),e+2};if(r.type=='$'){long n=stol(r.value);if(n<0)throw runtime_error("Unexpected null bulk");if(s.size()<e+2+n+2)return {};r.value=s.substr(e+2,n);r.used=e+2+n+2;}else if(r.type!='+'&&r.type!=':'&&r.type!='-')throw runtime_error("Unexpected RESP type");if(r.type=='-')throw runtime_error("Server: "+r.value);return r;}

// Incremental flat RESP2 array framing. Offsets survive string reallocations;
// previously scanned bulk payloads are never rescanned after a partial recv.
struct ArrayScan {
 size_t pos=0; long expected=-1; vector<pair<size_t,size_t>> spans;
 void reset(){pos=0;expected=-1;spans.clear();}
 Reply scan(const string&s){
  if(s.empty())return {};
  if(s[0]!='*')return parse(s);
  if(expected<0){auto e=s.find("\r\n");if(e==string::npos)return {};expected=stol(s.substr(1,e-1));if(expected<0||expected>65536)throw runtime_error("Invalid array size");pos=e+2;}
  while(spans.size()<size_t(expected)){
   if(pos>=s.size())return {};
   if(s[pos]!='$')throw runtime_error("Non-bulk array element");
   auto e=s.find("\r\n",pos);if(e==string::npos)return {};
   long n=stol(s.substr(pos+1,e-pos-1));if(n<0||n>1048576)throw runtime_error("Invalid bulk size");
   size_t start=e+2,end=start+size_t(n);if(s.size()<end+2)return {};
   if(s.compare(end,2,"\r\n"))throw runtime_error("Invalid bulk terminator");
   spans.emplace_back(start,size_t(n));pos=end+2;
  }
  return Reply{'*',"",pos};
 }
};
struct Stats{vector<uint32_t> lat;uint64_t sum=0;void add(uint64_t n){uint32_t us=min<uint64_t>(4294967295ULL,(n+500)/1000);lat.push_back(us);sum+=us;}};
struct Client{ArrayScan array;vector<unsigned char> seen;int fd=-1,id=0;string out,in;size_t sent=0;uint64_t started=0,pair_start=0,seq=0;int stage=0,key=0,slot=0,loadkey=0,loadpos=0,loadcount=0;string expected;};
map<string,string> opts;string op,phase,host,prefix;int port,connections,threads,keys;double seconds;uint64_t seed,load_seed=101;atomic<bool> failed{false};atomic<int> ready{0};atomic<uint64_t> start_ns{0},end_ns{0};mutex errlock;string error_msg;vector<map<string,Stats>> stats;vector<vector<uint64_t>> persecond;
string payload; // Immutable, deterministic, low-compressibility bytes.
string data(size_t n,uint64_t seq,int id){
 // Small fields must differ throughout, not only in a short prefix: repeated
 // 256-byte bodies would make hash/list/stream SST blocks highly compressible.
 if(n==256){
  uint64_t x=seed^(uint64_t(id)*0x9e3779b97f4a7c15ULL)^(seq*0xd6e8feb86659fd93ULL);
  string v(n,'\0');
  for(size_t i=0;i<n;i+=8){x+=0x9e3779b97f4a7c15ULL;uint64_t z=x;z=(z^(z>>30))*0xbf58476d1ce4e5b9ULL;z=(z^(z>>27))*0x94d049bb133111ebULL;z^=z>>31;memcpy(v.data()+i,&z,8);}
  return v;
 }
 string v=payload.substr(0,n);string tag=to_string(seed)+":"+to_string(id)+":"+to_string(seq);v.replace(0,tag.size(),tag);return v;
}
string keyname(int k){return prefix+":"+to_string(k);}
string member(int slot,bool alternate){char b[33];snprintf(b,sizeof b,"m%030d%c",slot,alternate?'b':'a');return b;}
int connect_server(){int fd=socket(AF_INET,SOCK_STREAM,0),one=1;if(fd<0)throw runtime_error("socket");setsockopt(fd,IPPROTO_TCP,TCP_NODELAY,&one,sizeof one);sockaddr_in a{};a.sin_family=AF_INET;a.sin_port=htons(port);inet_pton(AF_INET,host.c_str(),&a.sin_addr);if(connect(fd,(sockaddr*)&a,sizeof a))throw runtime_error("connect: "+string(strerror(errno)));fcntl(fd,F_SETFL,O_NONBLOCK);return fd;}
// Each connection owns one zswap slot, on every key. Separate slots prevent
// races between REMOVE/ADD pairs; a deterministic toggle persists per key.
vector<vector<uint8_t>> toggles;

bool whole_read(){return op=="hgetall"||op=="zrange"||op=="smembers";}
unsigned decimal(const string&s,size_t off,size_t n){
 unsigned v=0;auto p=s.data()+off;auto z=from_chars(p,p+n,v);
 if(z.ec!=errc()||z.ptr!=p+n)throw runtime_error("Invalid decimal");return v;
}
unsigned member_slot(const string&s,size_t off,size_t n){
 if(n!=32||s[off]!='m'||s[off+31]!='a')throw runtime_error("Invalid member shape");
 for(size_t i=1;i<26;i++)if(s[off+i]!='0')throw runtime_error("Invalid member prefix");
 unsigned v=decimal(s,off+26,5);if(v>=256)throw runtime_error("Invalid member ID");return v;
}
void expected_small(char*dst,uint64_t seq,int id){
 uint64_t x=load_seed^(uint64_t(id)*0x9e3779b97f4a7c15ULL)^(seq*0xd6e8feb86659fd93ULL);
 for(size_t i=0;i<256;i+=8){x+=0x9e3779b97f4a7c15ULL;uint64_t z=x;z=(z^(z>>30))*0xbf58476d1ce4e5b9ULL;z=(z^(z>>27))*0x94d049bb133111ebULL;z^=z>>31;memcpy(dst+i,&z,8);}
}
void check_array(Client&c,const Reply&r){
 size_t count=op=="hgetall"?32:256;
 if(r.type!='*'||c.array.spans.size()!=count*(op=="smembers"?1:2))throw runtime_error("Whole-read cardinality mismatch");
 c.seen.assign(count,0);
 for(size_t i=0;i<c.array.spans.size();i+=(op=="smembers"?1:2)){
  auto [off,n]=c.array.spans[i];unsigned slot;
  if(op=="hgetall"){
   if(n<2||n>5||c.in[off]!='f')throw runtime_error("Invalid field");
   slot=decimal(c.in,off+1,n-1);if(slot>=32)throw runtime_error("Field out of range");
   auto [vo,vn]=c.array.spans[i+1];if(vn!=256)throw runtime_error("Field value size");
   char expected[256];expected_small(expected,slot,c.key);
   if(memcmp(expected,c.in.data()+vo,256))throw runtime_error("Field payload mismatch");
  }else{
   slot=member_slot(c.in,off,n);
   if(op=="zrange"){
    auto [so,sn]=c.array.spans[i+1];if(decimal(c.in,so,sn)!=slot||slot!=i/2)throw runtime_error("Score or order mismatch");
   }
  }
  if(c.seen[slot]++)throw runtime_error("Duplicate field/member");
 }
}
string make_load(Client&c){string k=keyname(c.loadkey);c.loadcount=1;
 if(op=="set"||op=="setrange")return resp({"SET",k,data(8192,c.loadkey,0)});
 if(op=="hash"||op=="hgetall"){vector<string>a={"HSET",k};c.loadcount=min(64,32-c.loadpos);for(int i=0;i<c.loadcount;i++){a.push_back("f"+to_string(c.loadpos+i));a.push_back(data(256,c.loadpos+i,c.loadkey));}return resp(a);}
 if(op=="list"){vector<string>a={"RPUSH",k};c.loadcount=min(64,32-c.loadpos);for(int i=0;i<c.loadcount;i++)a.push_back(data(256,c.loadpos+i,c.loadkey));return resp(a);}
 if(op=="zincr"||op=="zswap"||op=="zrange"){vector<string>a={"ZADD",k};c.loadcount=min(128,256-c.loadpos);for(int i=0;i<c.loadcount;i++){a.push_back(to_string(c.loadpos+i));a.push_back(member(c.loadpos+i,false));}return resp(a);}
 if(op=="sswap"||op=="smembers"){vector<string>a={"SADD",k};c.loadcount=min(128,256-c.loadpos);for(int i=0;i<c.loadcount;i++)a.push_back(member(c.loadpos+i,false));return resp(a);}
 if(op=="stream")return resp({"XADD",k,"*","payload",data(256,c.loadpos,c.loadkey)});
 throw runtime_error("unknown op");}
string make_run(Client&c,mt19937_64&rng){if(c.stage==0){c.key=rng()%keys;c.seq++;c.slot=rng()%256;}string k=keyname(c.key);c.expected.clear();
 if(op=="hgetall")return resp({"HGETALL",k});
 if(op=="zrange")return resp({"ZRANGE",k,"0","-1","WITHSCORES"});
 if(op=="smembers")return resp({"SMEMBERS",k});
 if(op=="sswap"){bool alt=toggles[c.id][c.key];return c.stage==0?resp({"SADD",k,member(c.id,!alt)}):resp({"SREM",k,member(c.id,alt)});}
 if(op=="set")return resp({"SET",k,data(8192,c.seq,c.id)});
 if(op=="setrange")return resp({"SETRANGE",k,to_string(rng()%(8192-256+1)),data(256,c.seq,c.id)});
 if(op=="hash")return resp({"HSET",k,"f"+to_string(rng()%32),data(256,c.seq,c.id)});
 if(op=="list")return c.stage==0?resp({"LPUSH",k,data(256,c.seq,c.id)}):resp({"RPOP",k});
 if(op=="zincr")return resp({"ZINCRBY",k,(rng()&1)?"32768":"-32768",member(c.slot,false)});
 if(op=="zswap"){bool alt=toggles[c.id][c.key];return c.stage==0?resp({"ZREM",k,member(c.id,alt)}):resp({"ZADD",k,to_string(c.seq%32768),member(c.id,!alt)});}
 if(op=="stream")return resp({"XADD",k,"MAXLEN","=","32","*","payload",data(256,c.seq,c.id)});
 throw runtime_error("unknown op");}
void check(Client&c,const Reply&r){auto integer=[&](long expected){if(r.type!=':'||b8::integer(r.value)!=expected)throw runtime_error("Unexpected integer reply: "+r.value+" expected "+to_string(expected));};
 if(phase=="load"){
  if(op=="set"||op=="setrange"){if(r.type!='+'||r.value!="OK")throw runtime_error("SET load reply");}
  else if(op=="hash"||op=="hgetall"||op=="zincr"||op=="zswap"||op=="zrange"||op=="smembers"||op=="sswap")integer(c.loadcount);
  else if(op=="list")integer(c.loadpos+c.loadcount);
  else if(op=="stream"){if(r.type!='$'||r.value.find('-')==string::npos)throw runtime_error("XADD load reply");}
  return;
 }
 if(whole_read()){check_array(c,r);return;}
 if(op=="set"){if(r.type!='+'||r.value!="OK")throw runtime_error("SET reply");}
 else if(op=="setrange")integer(8192);
 else if(op=="hash")integer(0);
 else if(op=="zswap"||op=="sswap")integer(1);
 else if(op=="list"){if(c.stage==0){if(r.type!=':'||stol(r.value)<33||stol(r.value)>32+connections)throw runtime_error("LPUSH length");}else if(r.type!='$'||r.value.size()!=256)throw runtime_error("RPOP value length");}
 else if(op=="zincr"){if(r.type!='$')throw runtime_error("ZINCRBY reply");b8::numeric(r.value);}
 else if(op=="stream"){if(r.type!='$'||r.value.find('-')==string::npos)throw runtime_error("XADD reply");}
}
string command_name(const Client&c){if(op=="sswap")return c.stage?"SREM":"SADD";if(op=="hgetall")return "HGETALL";if(op=="zrange")return "ZRANGE_WITHSCORES";if(op=="smembers")return "SMEMBERS";if(op=="list")return c.stage?"RPOP":"LPUSH";if(op=="zswap")return c.stage?"ZADD":"ZREM";return map<string,string>{{"set","SET"},{"setrange","SETRANGE"},{"hash","HSET"},{"zincr","ZINCRBY"},{"stream","XADD_MAXLEN"}}.at(op);}
void worker(int tid){vector<Client> cs;int ep=-1;try{
 cpu_set_t mask;CPU_ZERO(&mask);CPU_SET(tid,&mask);if(sched_setaffinity(0,sizeof mask,&mask))throw runtime_error("affinity");
 mt19937_64 rng(seed+0x9e3779b97f4a7c15ULL*(tid+1));ep=epoll_create1(0);
 for(int id=tid;id<connections;id+=threads){Client c;c.id=id;c.loadkey=id;c.fd=connect_server();cs.push_back(move(c));}
 auto arm=[&](int idx,bool add){epoll_event ev{};ev.events=EPOLLIN|(cs[idx].sent<cs[idx].out.size()?EPOLLOUT:0);ev.data.u32=idx;if(epoll_ctl(ep,add?EPOLL_CTL_ADD:EPOLL_CTL_MOD,cs[idx].fd,&ev))throw runtime_error("epoll_ctl");};
 ready++;while(!start_ns&&!failed)this_thread::yield();if(failed)throw runtime_error("cancelled");
 int active=0;for(int i=0;i<(int)cs.size();i++){auto&c=cs[i];if(phase=="load"&&c.loadkey>=keys){close(c.fd);c.fd=-1;continue;}c.out=phase=="load"?make_load(c):make_run(c,rng);c.started=c.pair_start=ns();arm(i,true);active++;}
 epoll_event events[256];uint64_t lastprogress=ns();
 while(active&&!failed){int count=epoll_wait(ep,events,256,100);if(count<0&&errno!=EINTR)throw runtime_error("epoll_wait");if(ns()-lastprogress>120000000000ULL)throw runtime_error("120s without progress");
  for(int i=0;i<count;i++){int idx=events[i].data.u32;auto&c=cs[idx];if(c.fd<0)continue;auto ev=events[i].events;
   if(ev&(EPOLLERR|EPOLLHUP))throw runtime_error("socket closed/error");
   if(ev&EPOLLOUT){while(c.sent<c.out.size()){ssize_t n=send(c.fd,c.out.data()+c.sent,c.out.size()-c.sent,MSG_NOSIGNAL);if(n>0)c.sent+=n;else if(errno==EAGAIN||errno==EWOULDBLOCK)break;else throw runtime_error("send failed");}arm(idx,false);}
   if(ev&EPOLLIN){char buf[65536];for(;;){ssize_t n=recv(c.fd,buf,sizeof buf,0);if(n>0)c.in.append(buf,n);else if(n<0&&(errno==EAGAIN||errno==EWOULDBLOCK))break;else throw runtime_error("recv failed");}
    if(c.in.size()>4*1048576)throw runtime_error("Oversized reply");Reply r=whole_read()&&phase!="load"?c.array.scan(c.in):parse(c.in);if(!r.used)continue;if(r.used!=c.in.size())throw runtime_error("Unexpected extra reply");check(c,r);lastprogress=ns();uint64_t now=lastprogress;
    string metric=phase=="load"?"LOAD":command_name(c);stats[tid][metric].add(now-c.started);
    bool paired=(op=="list"||op=="zswap"||op=="sswap")&&phase!="load";bool next=true;
    if(phase=="load"){c.loadpos+=c.loadcount;int total=(op=="set"||op=="setrange")?1:(op=="zincr"||op=="zswap"||op=="zrange"||op=="smembers"||op=="sswap")?256:32;if(c.loadpos>=total){c.loadkey+=connections;c.loadpos=0;}next=c.loadkey<keys&&!b8::interrupted;}
    else if(paired&&c.stage==0)c.stage=1;
    else {stats[tid]["OPERATIONS"].add(now-c.pair_start);size_t bucket=(now-start_ns)/1000000000ULL;if(bucket<persecond[tid].size())persecond[tid][bucket]++;if(op=="zswap"||op=="sswap")toggles[c.id][c.key]^=1;c.stage=0;next=!b8::interrupted&&now<start_ns+uint64_t(seconds*1e9);}
    if(!next){epoll_ctl(ep,EPOLL_CTL_DEL,c.fd,nullptr);close(c.fd);c.fd=-1;active--;continue;}
    c.out=phase=="load"?make_load(c):make_run(c,rng);c.in.clear();c.array.reset();c.sent=0;c.started=ns();if(c.stage==0)c.pair_start=c.started;arm(idx,false);
   }
  }
 }
 uint64_t n=ns(),old=end_ns;while(old<n&&!end_ns.compare_exchange_weak(old,n)){}
 }catch(const exception&e){failed=true;lock_guard<mutex>g(errlock);if(error_msg.empty())error_msg=e.what();}
 for(auto&c:cs)if(c.fd>=0)close(c.fd);if(ep>=0)close(ep);
}
int main(int argc,char**argv){try{opts=b8::arguments(argc,argv);op=opts.at("--op");phase=opts.at("--phase");host=opts.at("--host");prefix=opts.at("--prefix");port=stoi(opts.count("--port")?opts["--port"]:"6379");connections=stoi(opts.at("--connections"));threads=min(connections,stoi(opts.at("--threads")));keys=stoi(opts.at("--keys"));seconds=stod(opts.at("--seconds"));seed=stoull(opts.at("--seed"));load_seed=stoull(opts.count("--load-seed")?opts["--load-seed"]:"101");if(connections>1280||keys<1)throw runtime_error("bounds");
 b8::validate(opts,op,phase,host,prefix,connections,stoi(opts.at("--threads")),keys,seconds,port,{"sswap"});
 mt19937_64 gen(17);payload.resize(8192);for(char&c:payload)c=char(33+gen()%90);stats.resize(threads);persecond.assign(threads,vector<uint64_t>(size_t(seconds)+1,0));toggles.assign(1280,vector<uint8_t>(keys,0));
 if(opts.count("--state"))b8::load_state(opts.at("--state"),toggles,keys,connections,phase=="load");
 vector<thread>ts;for(int t=0;t<threads;t++)ts.emplace_back(worker,t);while(ready<threads&&!failed)this_thread::sleep_for(chrono::milliseconds(1));start_ns=ns();for(auto&t:ts)t.join();if(failed)throw runtime_error(error_msg);
 double elapsed=(end_ns-start_ns)/1e9;map<string,Stats>all;for(auto&group:stats)for(auto&[name,s]:group){auto&a=all[name];a.sum+=s.sum;a.lat.insert(a.lat.end(),s.lat.begin(),s.lat.end());}
 if((op=="zswap"||op=="sswap")&&phase!="load")b8::save_state(opts.at("--state"),toggles,keys);
 ostringstream result;result<<fixed<<setprecision(6)<<"{"<<b8::metadata(op,prefix,threads,seed,b8::test_mode(opts))<<"\"op\":\""<<op<<"\",\"phase\":\""<<phase<<"\",\"connections\":"<<connections<<",\"keys\":"<<keys<<",\"elapsed_seconds\":"<<elapsed<<",\"errors\":0,\"metrics\":{";
 bool first=true;for(auto&[name,s]:all){if(!first)result<<",";first=false;sort(s.lat.begin(),s.lat.end());auto pct=[&](double p){return s.lat[min(s.lat.size()-1,size_t(ceil(p*s.lat.size()))-1)]/1000.0;};result<<"\""<<name<<"\":{\"count\":"<<s.lat.size()<<",\"qps\":"<<s.lat.size()/elapsed<<",\"avg_ms\":"<<s.sum/double(s.lat.size())/1000<<",\"p50_ms\":"<<pct(.5)<<",\"p99_ms\":"<<pct(.99)<<",\"p999_ms\":"<<pct(.999)<<",\"max_ms\":"<<s.lat.back()/1000.0<<"}";}
 result<<"},\"operations_per_second\":[";for(size_t i=0;i<size_t(seconds);i++){uint64_t n=0;for(auto&v:persecond)n+=v[i];if(i)result<<",";result<<n;}result<<"]}\n";cout<<result.str();if(opts.count("--out")){ofstream f(opts["--out"]);if(!f)throw runtime_error("Cannot open output");f<<result.str();if(!f)throw runtime_error("Cannot write output");}return b8::interrupted?130:0;
 }catch(const exception&e){cerr<<"ERROR: "<<e.what()<<"\n";return 1;}}
