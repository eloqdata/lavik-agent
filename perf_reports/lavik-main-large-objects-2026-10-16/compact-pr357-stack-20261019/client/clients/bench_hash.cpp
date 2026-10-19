// Derived for fixed 8 KiB objects; see client-interface.md and source-manifest.json.
#include "bench8k.h"
#ifndef BENCH_HASH_VALIDATION_ONLY
#include <arpa/inet.h>
#include <sys/epoll.h>
#include <sys/socket.h>
#include <netinet/tcp.h>
#include <unistd.h>
#include <fcntl.h>
#include <sched.h>
#endif
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
#include <array>
#include <cstdint>
#include <cmath>
#include <limits>
#include <set>
using namespace std;
using Clock=chrono::steady_clock;
uint64_t ns(){return chrono::duration_cast<chrono::nanoseconds>(Clock::now().time_since_epoch()).count();}
string resp(const vector<string>& a){string s="*"+to_string(a.size())+"\r\n";for(auto&v:a)s+="$"+to_string(v.size())+"\r\n"+v+"\r\n";return s;}
// Wire timing and epoll scheduling derive from bench_workdist.cpp. This
// standalone dataset intentionally differs from the earlier HGETALL dataset.
constexpr unsigned kFields = 32;
constexpr unsigned kValueBytes = 256;
constexpr const char* kDataset = "packed-hash-32x256-8k-v1";
struct Reply {char type=0; string value; size_t used=0;};
long long integer_text(const string& s,size_t begin,size_t length){
 long long n=0;const char* first=s.data()+begin;const char* last=first+length;
 auto parsed=from_chars(first,last,n);
 if(parsed.ec!=errc()||parsed.ptr!=last||first==last)throw runtime_error("Invalid RESP integer");
 return n;
}
Reply parse(const string&s){
 if(s.empty())return {};auto e=s.find("\r\n");if(e==string::npos)return {};
 Reply r{s[0],s.substr(1,e-1),e+2};
 if(r.type=='$'){
  long long n=integer_text(s,1,e-1);if(n<0||n>1048576)throw runtime_error("Invalid bulk size");
  const size_t end=e+2+size_t(n);if(s.size()<end+2)return {};
  if(s.compare(end,2,"\r\n"))throw runtime_error("Invalid bulk terminator");
  r.value=s.substr(e+2,size_t(n));r.used=end+2;
 }else if(r.type!='+'&&r.type!=':'&&r.type!='-')throw runtime_error("Unexpected RESP type");
 if(r.type=='-')throw runtime_error("Server: "+r.value);return r;
}
// Offsets survive input-string relocation. Only complete bulk elements advance
// the cursor, so fragmented receives never rescan already accepted payloads.
struct ArrayScan {
 size_t pos=0;long long expected=-1;vector<pair<size_t,size_t>> spans;
 void reset(){pos=0;expected=-1;spans.clear();}
 Reply scan(const string&s){
  if(s.empty())return {};if(s[0]!='*')return parse(s);
  if(expected<0){auto e=s.find("\r\n");if(e==string::npos)return {};
   expected=integer_text(s,1,e-1);if(expected<0||expected>2*kFields)throw runtime_error("Invalid array size");pos=e+2;}
  while(spans.size()<size_t(expected)){
   if(pos>=s.size())return {};if(s[pos]!='$')throw runtime_error("Non-bulk array element");
   auto e=s.find("\r\n",pos);if(e==string::npos)return {};
   long long n=integer_text(s,pos+1,e-pos-1);if(n<0||n>1048576)throw runtime_error("Invalid bulk size");
   size_t begin=e+2,end=begin+size_t(n);if(s.size()<end+2)return {};
   if(s.compare(end,2,"\r\n"))throw runtime_error("Invalid bulk terminator");
   spans.emplace_back(begin,size_t(n));pos=end+2;
  }
  return Reply{'*',"",pos};
 }
};
struct Stats{vector<uint32_t> lat;uint64_t sum=0;void add(uint64_t n){uint32_t us=min<uint64_t>(4294967295ULL,(n+500)/1000);lat.push_back(us);sum+=us;}};
struct Client{ArrayScan array;vector<unsigned char> seen;int fd=-1,id=0;string out,in;size_t sent=0;uint64_t started=0,pair_start=0,seq=0;int stage=0,key=0,slot=0,loadkey=0,loadpos=0,loadcount=0;string expected;};
map<string,string> opts;string op,phase,host,prefix;int port,connections,threads,keys;double seconds;uint64_t seed,load_seed=101;atomic<bool> failed{false};atomic<int> ready{0};atomic<uint64_t> start_ns{0},end_ns{0};mutex errlock;string error_msg;vector<map<string,Stats>> stats;vector<vector<uint64_t>> persecond;

// Diagnostic counters never draw RNG values or issue Redis commands. Each
// thread owns its row; connection rows are cache-line isolated. Key ownership
// uses the tested server's Redis CRC16 slot modulo its worker count.
struct WorkCount {uint64_t completed=0,total_ns=0,max_ns=0,over_100ms=0;};
struct alignas(64) ThreadWork {array<WorkCount,16> owners{};};
struct alignas(64) ConnectionWork {uint64_t completed=0;unsigned local_port=0;};
vector<ThreadWork> work_threads;
vector<ConnectionWork> work_connections;
vector<unsigned> key_owners;
bool workdist_enabled=false;
unsigned diagnostic_owner(const string& key){
 uint16_t crc=0;
 for(unsigned char ch:key){crc^=uint16_t(ch)<<8;for(int b=0;b<8;b++)crc=(crc&0x8000)?uint16_t((crc<<1)^0x1021):uint16_t(crc<<1);}
 return (crc&0x3fffU)%16;
}
void prepare_workdist(){
 workdist_enabled=(phase!="load");
 if(!workdist_enabled)return;
 // This diagnostic is scoped to ordinary literal keys and 16 server workers.
 // Reject hash tags rather than silently accounting a different owner.
 if(prefix.find('{')!=string::npos||prefix.find('}')!=string::npos)throw runtime_error("workdist prefix cannot contain hash tags");
 if(!opts.count("--workdist-out")&&!opts.count("--out"))throw runtime_error("workdist requires --out or --workdist-out");
 work_threads.resize(threads);work_connections.resize(connections);key_owners.resize(keys);
 for(int k=0;k<keys;k++)key_owners[k]=diagnostic_owner(prefix+":"+to_string(k));
}
void record_workdist(int tid,const Client&c,uint64_t elapsed){
 auto&w=work_threads[tid].owners[key_owners[c.key]];
 w.completed++;w.total_ns+=elapsed;w.max_ns=max(w.max_ns,elapsed);w.over_100ms+=(elapsed>100000000ULL);
 work_connections[c.id].completed++;
}
void save_workdist(uint64_t expected_completed){
 if(!workdist_enabled)return;
 uint64_t total=0;for(auto&t:work_threads)for(auto&w:t.owners)total+=w.completed;
 uint64_t conn_total=0;for(auto&c:work_connections)conn_total+=c.completed;
 if(total!=expected_completed||conn_total!=total)throw runtime_error("workdist completion count mismatch");
 const string path=opts.count("--workdist-out")?opts.at("--workdist-out"):opts.at("--out")+".workdist.json";
 ofstream f(path);if(!f)throw runtime_error("Cannot open workdist output");
 f<<fixed<<setprecision(6)<<"{\"schema_version\":1,\"phase\":\""<<phase<<"\",\"seed\":"<<seed<<",\"server_workers\":16,\"keys\":"<<keys<<",\"completed\":"<<total<<",\"threads\":[";
 for(int tid=0;tid<threads;tid++){
  if(tid)f<<",";uint64_t count=0;for(auto&w:work_threads[tid].owners)count+=w.completed;
  f<<"{\"thread\":"<<tid<<",\"rng_seed\":"<<uint64_t(seed+0x9e3779b97f4a7c15ULL*(tid+1))<<",\"completed\":"<<count<<",\"owners\":[";
  for(unsigned owner=0;owner<16;owner++){
   if(owner)f<<",";const auto&w=work_threads[tid].owners[owner];
   f<<"{\"owner\":"<<owner<<",\"completed\":"<<w.completed<<",\"total_ns\":"<<w.total_ns<<",\"avg_ms\":"<<(w.completed?double(w.total_ns)/w.completed/1e6:0)<<",\"max_ms\":"<<double(w.max_ns)/1e6<<",\"over_100ms\":"<<w.over_100ms<<"}";
  }
  f<<"]}";
 }
 f<<"],\"connections\":[";
 for(int id=0;id<connections;id++){if(id)f<<",";const auto&c=work_connections[id];f<<"{\"client_id\":"<<id<<",\"thread\":"<<id%threads<<",\"local_port\":"<<c.local_port<<",\"completed\":"<<c.completed<<"}";}
 f<<"]}\n";if(!f)throw runtime_error("Cannot write workdist output");
}

// Same SplitMix-derived body as original data()/expected_small() on x86-64.
// Explicit little endian keeps the fixture reproducible on the local test host.
void put32le(char* dst,uint32_t value){for(unsigned i=0;i<4;i++)dst[i]=char(value>>(8*i));}
uint32_t get32le(const char* src){uint32_t value=0;for(unsigned i=0;i<4;i++)value|=uint32_t(static_cast<unsigned char>(src[i]))<<(8*i);return value;}
void expected_small(char* dst,uint64_t field,int key){
 uint64_t x=load_seed^(uint64_t(key)*0x9e3779b97f4a7c15ULL)^(field*0xd6e8feb86659fd93ULL);
 for(size_t i=0;i<kValueBytes;i+=8){x+=0x9e3779b97f4a7c15ULL;uint64_t z=x;z=(z^(z>>30))*0xbf58476d1ce4e5b9ULL;z=(z^(z>>27))*0x94d049bb133111ebULL;z^=z>>31;for(unsigned j=0;j<8;j++)dst[i+j]=char(z>>(8*j));}
 put32le(dst,uint32_t(field));put32le(dst+4,uint32_t(key));
}
string field_value(unsigned field,int key){string value(kValueBytes,'\0');expected_small(value.data(),field,key);return value;}
string keyname(int key){return prefix+":"+to_string(key);}
unsigned field_slot(const string& bytes,size_t off,size_t n){
 if(n<2||n>5||bytes[off]!='f'||(n>2&&bytes[off+1]=='0'))throw runtime_error("Invalid field shape");
 unsigned field=0;auto first=bytes.data()+off+1;auto last=bytes.data()+off+n;auto parsed=from_chars(first,last,field);
 if(parsed.ec!=errc()||parsed.ptr!=last||field>=kFields)throw runtime_error("Invalid field ID");
 return field;
}
unsigned check_value(const Client& c,size_t off,size_t length){
 if(length!=kValueBytes)throw runtime_error("Field value size");
 unsigned field=get32le(c.in.data()+off);if(field>=kFields)throw runtime_error("Invalid value field ID");
 if(get32le(c.in.data()+off+4)!=uint32_t(c.key))throw runtime_error("Value key ID mismatch");
 char expected[kValueBytes];expected_small(expected,field,c.key);
 if(memcmp(expected,c.in.data()+off,kValueBytes))throw runtime_error("Field payload mismatch");
 return field;
}
void check_array(Client&c,const Reply&r){
 const size_t width=op=="hgetall"?2:1;
 if(r.type!='*'||c.array.spans.size()!=kFields*width)throw runtime_error("Whole-read cardinality mismatch");
 if(r.used!=c.in.size())throw runtime_error("Unexpected extra reply");
 c.seen.assign(kFields,0);
 for(size_t i=0;i<c.array.spans.size();i+=width){
  const auto [off,n]=c.array.spans[i];unsigned field;
  if(op=="hvals")field=check_value(c,off,n);
  else{
   field=field_slot(c.in,off,n);
   if(op=="hgetall"){
    const auto [value_off,value_size]=c.array.spans[i+1];
    if(check_value(c,value_off,value_size)!=field)throw runtime_error("Field/value ID mismatch");
   }
  }
  if(c.seen[field]++)throw runtime_error("Duplicate field/member");
 }
 for(auto present:c.seen)if(present!=1)throw runtime_error("Missing field/member");
}
string make_load(Client&c){
 if(op!="hgetall")throw runtime_error("Load is supported only with --op hgetall");
 vector<string> args={"HSET",keyname(c.loadkey)};
 c.loadcount=min(64,int(kFields)-c.loadpos);
 for(int i=0;i<c.loadcount;i++){unsigned field=c.loadpos+i;args.push_back("f"+to_string(field));args.push_back(field_value(field,c.loadkey));}
 return resp(args);
}
string make_run(Client&c,mt19937_64&rng){
 // Preserve BOTH RNG draws from the original full-read client, even though
 // the slot is not used by these commands. Removing it changes the key stream.
 if(phase=="validate"){if(c.seq>=3)throw runtime_error("Unexpected fourth validation request");c.key=c.seq==0?0:c.seq==1?keys/2:keys-1;c.seq++;}
 else {c.key=rng()%keys;c.seq++;c.slot=rng()%256;}
 const string command=op=="hgetall"?"HGETALL":op=="hkeys"?"HKEYS":"HVALS";
 return resp({command,keyname(c.key)});
}
void check(Client&c,const Reply&r){
 if(phase=="load"){
  if(r.type!=':'||integer_text(r.value,0,r.value.size())!=c.loadcount)throw runtime_error("HSET load count mismatch (use a fresh prefix)");
 }else check_array(c,r);
}
string command_name(const Client&){return op=="hgetall"?"HGETALL":op=="hkeys"?"HKEYS":"HVALS";}
#ifndef BENCH_HASH_VALIDATION_ONLY
int connect_server(){int fd=socket(AF_INET,SOCK_STREAM,0),one=1;if(fd<0)throw runtime_error("socket");setsockopt(fd,IPPROTO_TCP,TCP_NODELAY,&one,sizeof one);sockaddr_in a{};a.sin_family=AF_INET;a.sin_port=htons(port);if(inet_pton(AF_INET,host.c_str(),&a.sin_addr)!=1)throw runtime_error("Invalid IPv4 host");if(connect(fd,(sockaddr*)&a,sizeof a))throw runtime_error("connect: "+string(strerror(errno)));fcntl(fd,F_SETFL,O_NONBLOCK);return fd;}
void worker(int tid){vector<Client> cs;int ep=-1;try{
 cpu_set_t mask;CPU_ZERO(&mask);CPU_SET(tid,&mask);if(sched_setaffinity(0,sizeof mask,&mask))throw runtime_error("affinity");
 mt19937_64 rng(seed+0x9e3779b97f4a7c15ULL*(tid+1));ep=epoll_create1(0);
 for(int id=tid;id<connections;id+=threads){Client c;c.id=id;c.loadkey=id;c.fd=connect_server();if(workdist_enabled){sockaddr_in local{};socklen_t len=sizeof local;if(getsockname(c.fd,(sockaddr*)&local,&len))throw runtime_error("getsockname");work_connections[id].local_port=ntohs(local.sin_port);}cs.push_back(move(c));}
 auto arm=[&](int idx,bool add){epoll_event ev{};ev.events=EPOLLIN|(cs[idx].sent<cs[idx].out.size()?EPOLLOUT:0);ev.data.u32=idx;if(epoll_ctl(ep,add?EPOLL_CTL_ADD:EPOLL_CTL_MOD,cs[idx].fd,&ev))throw runtime_error("epoll_ctl");};
 ready++;while(!start_ns&&!failed)this_thread::yield();if(failed)throw runtime_error("cancelled");
 int active=0;for(int i=0;i<(int)cs.size();i++){auto&c=cs[i];if(phase=="load"&&c.loadkey>=keys){close(c.fd);c.fd=-1;continue;}c.out=phase=="load"?make_load(c):make_run(c,rng);c.started=c.pair_start=ns();arm(i,true);active++;}
 epoll_event events[256];uint64_t lastprogress=ns();
 while(active&&!failed){int count=epoll_wait(ep,events,256,100);if(count<0&&errno!=EINTR)throw runtime_error("epoll_wait");if(ns()-lastprogress>120000000000ULL)throw runtime_error("120s without progress");
  for(int i=0;i<count;i++){int idx=events[i].data.u32;auto&c=cs[idx];if(c.fd<0)continue;auto ev=events[i].events;
   if(ev&(EPOLLERR|EPOLLHUP))throw runtime_error("socket closed/error");
   if(ev&EPOLLOUT){while(c.sent<c.out.size()){ssize_t n=send(c.fd,c.out.data()+c.sent,c.out.size()-c.sent,MSG_NOSIGNAL);if(n>0)c.sent+=n;else if(errno==EAGAIN||errno==EWOULDBLOCK)break;else throw runtime_error("send failed");}arm(idx,false);}
   if(ev&EPOLLIN){char buf[65536];for(;;){ssize_t n=recv(c.fd,buf,sizeof buf,0);if(n>0)c.in.append(buf,n);else if(n<0&&(errno==EAGAIN||errno==EWOULDBLOCK))break;else throw runtime_error("recv failed");}
    if(c.in.size()>4*1048576)throw runtime_error("Oversized reply");Reply r=phase!="load"?c.array.scan(c.in):parse(c.in);if(!r.used)continue;if(r.used!=c.in.size())throw runtime_error("Unexpected extra reply");check(c,r);lastprogress=ns();uint64_t now=lastprogress;
    string metric=phase=="load"?"LOAD":command_name(c);stats[tid][metric].add(now-c.started);if(workdist_enabled)record_workdist(tid,c,now-c.started);
    bool next=true;
    if(phase=="load"){c.loadpos+=c.loadcount;int total=kFields;if(c.loadpos>=total){c.loadkey+=connections;c.loadpos=0;}next=c.loadkey<keys&&!b8::interrupted;}
    else {stats[tid]["OPERATIONS"].add(now-c.pair_start);size_t bucket=(now-start_ns)/1000000000ULL;if(bucket<persecond[tid].size())persecond[tid][bucket]++;c.stage=0;next=!b8::interrupted&&(phase=="validate"?c.seq<3:now<start_ns+uint64_t(seconds*1e9));}
    if(!next){epoll_ctl(ep,EPOLL_CTL_DEL,c.fd,nullptr);close(c.fd);c.fd=-1;active--;continue;}
    c.out=phase=="load"?make_load(c):make_run(c,rng);c.in.clear();c.array.reset();c.sent=0;c.started=ns();if(c.stage==0)c.pair_start=c.started;arm(idx,false);
   }
  }
 }
 uint64_t n=ns(),old=end_ns;while(old<n&&!end_ns.compare_exchange_weak(old,n)){}
 }catch(const exception&e){failed=true;lock_guard<mutex>g(errlock);if(error_msg.empty())error_msg=e.what();}
 for(auto&c:cs)if(c.fd>=0)close(c.fd);if(ep>=0)close(ep);
}
int main(int argc,char**argv){try{
 opts=b8::arguments(argc,argv);
 op=opts.at("--op");phase=opts.at("--phase");host=opts.at("--host");prefix=opts.at("--prefix");
 if(op!="hgetall"&&op!="hkeys"&&op!="hvals")throw runtime_error("Supported ops: hgetall, hkeys, hvals");
 if(phase!="load"&&phase!="warm"&&phase!="run"&&phase!="profile"&&phase!="validate")throw runtime_error("Supported phases: load, warm, run, profile, validate");
 if(phase=="load"&&op!="hgetall")throw runtime_error("Load is supported only with --op hgetall");
 if(prefix.empty()||prefix.find_first_of("\"\\\r\n\t{}")!=string::npos)throw runtime_error("Invalid prefix");
 port=stoi(opts.count("--port")?opts.at("--port"):"6379");connections=stoi(opts.at("--connections"));const int requested_threads=stoi(opts.at("--threads"));threads=min(connections,requested_threads);keys=stoi(opts.at("--keys"));seconds=stod(opts.at("--seconds"));seed=stoull(opts.at("--seed"));load_seed=stoull(opts.count("--load-seed")?opts.at("--load-seed"):"101");
 if(connections<1||connections>1280||requested_threads<1||threads>CPU_SETSIZE||keys<1||port<1||port>65535||!isfinite(seconds)||seconds<=0||seconds>86400)throw runtime_error("Argument bounds");
 if(phase=="validate"&&(connections!=1||requested_threads!=1))throw runtime_error("Validation requires one connection and one thread");
 b8::validate(opts,op,phase,host,prefix,connections,stoi(opts.at("--threads")),keys,seconds,port,{"hgetall","hkeys","hvals"});
 stats.resize(threads);persecond.assign(threads,vector<uint64_t>(size_t(seconds)+1,0));
 prepare_workdist();
 vector<thread>ts;for(int t=0;t<threads;t++)ts.emplace_back(worker,t);while(ready<threads&&!failed)this_thread::sleep_for(chrono::milliseconds(1));start_ns=ns();for(auto&t:ts)t.join();if(failed)throw runtime_error(error_msg);
 double elapsed=(end_ns-start_ns)/1e9;map<string,Stats>all;for(auto&group:stats)for(auto&[name,s]:group){auto&a=all[name];a.sum+=s.sum;a.lat.insert(a.lat.end(),s.lat.begin(),s.lat.end());}
 if(workdist_enabled){Client unused;save_workdist(all.at(command_name(unused)).lat.size());}
 ostringstream result;result<<fixed<<setprecision(6)<<"{"<<b8::metadata(op,prefix,threads,seed,b8::test_mode(opts))<<"\"op\":\""<<op<<"\",\"phase\":\""<<phase<<"\",\"connections\":"<<connections<<",\"keys\":"<<keys<<",\"load_seed\":"<<load_seed<<",\"dataset\":\""<<kDataset<<"\",\"fields_per_key\":"<<kFields<<",\"value_bytes\":"<<kValueBytes<<",\"elapsed_seconds\":"<<elapsed<<",\"errors\":0,\"metrics\":{";
 bool first=true;for(auto&[name,s]:all){if(!first)result<<",";first=false;sort(s.lat.begin(),s.lat.end());auto pct=[&](double p){return s.lat[min(s.lat.size()-1,size_t(ceil(p*s.lat.size()))-1)]/1000.0;};result<<"\""<<name<<"\":{\"count\":"<<s.lat.size()<<",\"qps\":"<<s.lat.size()/elapsed<<",\"avg_ms\":"<<s.sum/double(s.lat.size())/1000<<",\"p50_ms\":"<<pct(.5)<<",\"p99_ms\":"<<pct(.99)<<",\"p999_ms\":"<<pct(.999)<<",\"max_ms\":"<<s.lat.back()/1000.0<<"}";}
 result<<"}";if(phase=="validate")result<<",\"validation_keys\":[0,"<<keys/2<<","<<keys-1<<"]";result<<",\"operations_per_second\":[";for(size_t i=0;i<size_t(seconds);i++){uint64_t n=0;for(auto&v:persecond)n+=v[i];if(i)result<<",";result<<n;}result<<"]}\n";cout<<result.str();if(opts.count("--out")){ofstream f(opts["--out"]);if(!f)throw runtime_error("Cannot open result output");f<<result.str();if(!f)throw runtime_error("Cannot write result output");}return b8::interrupted?130:0;
 }catch(const exception&e){cerr<<"ERROR: "<<e.what()<<"\n";return 1;}}

#endif  // BENCH_HASH_VALIDATION_ONLY
