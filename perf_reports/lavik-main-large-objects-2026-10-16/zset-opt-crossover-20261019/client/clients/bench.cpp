#include <csignal>
#include <set>
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
#include <cmath>
#include <cstdio>
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
using namespace std;
using Clock=chrono::steady_clock;
volatile sig_atomic_t interrupted=0;
void stop_requested(int){interrupted=1;}
bool test_mode=false;
uint64_t ns(){return chrono::duration_cast<chrono::nanoseconds>(Clock::now().time_since_epoch()).count();}
string resp(const vector<string>& a){string s="*"+to_string(a.size())+"\r\n";for(auto&v:a)s+="$"+to_string(v.size())+"\r\n"+v+"\r\n";return s;}
struct Reply {char type;string value;size_t used=0;};
Reply parse(const string&s){if(s.empty())return {};auto e=s.find("\r\n");if(e==string::npos)return {};Reply r{s[0],s.substr(1,e-1),e+2};if(r.type=='$'){long n=stol(r.value);if(n<0)throw runtime_error("Unexpected null bulk");if(s.size()<e+2+n+2)return {};r.value=s.substr(e+2,n);r.used=e+2+n+2;}else if(r.type!='+'&&r.type!=':'&&r.type!='-')throw runtime_error("Unexpected RESP type");if(r.type=='-')throw runtime_error("Server: "+r.value);return r;}
struct Stats{vector<uint32_t> lat;uint64_t sum=0;void add(uint64_t n){uint32_t us=min<uint64_t>(4294967295ULL,(n+500)/1000);lat.push_back(us);sum+=us;}};
struct Client{int fd=-1,id=0;string out,in;size_t sent=0;uint64_t started=0,pair_start=0,seq=0;int stage=0,key=0,slot=0,loadkey=0,loadpos=0,loadcount=0;string expected;};
map<string,string> opts;string op,phase,host,prefix;int port,connections,threads,keys,members;double seconds;uint64_t seed;atomic<bool> failed{false};atomic<int> ready{0};atomic<uint64_t> start_ns{0},end_ns{0};mutex errlock;string error_msg;vector<map<string,Stats>> stats;vector<vector<uint64_t>> persecond;
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
// Read-only for ZINCRBY. Only ZREM/ZADD changes and persists these flags.
void load_state(const string& path){
 ifstream f(path,ios::binary);if(!f)throw runtime_error("state file required");
 int nc=0,nk=0;f.read((char*)&nc,4);f.read((char*)&nk,4);
 if(!f||nc!=1280||nk!=keys)throw runtime_error("state shape mismatch");
 for(int slot=0;slot<1280;slot++){
  auto&v=toggles[slot];f.read((char*)v.data(),v.size());
  if(!f)throw runtime_error("truncated state");
  for(uint8_t flag:v)if(flag>1||(slot>=80&&flag))throw runtime_error("invalid state flags");
 }
 if(f.peek()!=ifstream::traits_type::eof())throw runtime_error("trailing state data");
}
void save_state(const string& path){
 string temp=path+".tmp";ofstream f(temp,ios::binary|ios::trunc);
 int capacity=1280;f.write((char*)&capacity,4);f.write((char*)&keys,4);
 for(auto&v:toggles)f.write((char*)v.data(),v.size());f.flush();
 if(!f)throw runtime_error("state write failed");f.close();
 if(rename(temp.c_str(),path.c_str()))throw runtime_error("state rename failed");
}
string make_load(Client&c){string k=keyname(c.loadkey);c.loadcount=1;
 if(op=="set"||op=="setrange")return resp({"SET",k,data(1048576,c.loadkey,0)});
 if(op=="hash"){vector<string>a={"HSET",k};c.loadcount=min(64,4096-c.loadpos);for(int i=0;i<c.loadcount;i++){a.push_back("f"+to_string(c.loadpos+i));a.push_back(data(256,c.loadpos+i,c.loadkey));}return resp(a);}
 if(op=="list"){vector<string>a={"RPUSH",k};c.loadcount=min(64,4096-c.loadpos);for(int i=0;i<c.loadcount;i++)a.push_back(data(256,c.loadpos+i,c.loadkey));return resp(a);}
 if(op=="zincr"||op=="zswap"){vector<string>a={"ZADD",k};c.loadcount=min(128,members-c.loadpos);for(int i=0;i<c.loadcount;i++){a.push_back(to_string(c.loadpos+i));a.push_back(member(c.loadpos+i,false));}return resp(a);}
 if(op=="stream")return resp({"XADD",k,"*","payload",data(256,c.loadpos,c.loadkey)});
 throw runtime_error("unknown op");}
string make_run(Client&c,mt19937_64&rng){if(c.stage==0){c.key=rng()%keys;c.seq++;c.slot=rng()%members;}string k=keyname(c.key);c.expected.clear();
 if(op=="set")return resp({"SET",k,data(1048576,c.seq,c.id)});
 if(op=="setrange")return resp({"SETRANGE",k,to_string(rng()%(1048576-256+1)),data(256,c.seq,c.id)});
 if(op=="hash")return resp({"HSET",k,"f"+to_string(rng()%4096),data(256,c.seq,c.id)});
 if(op=="list")return c.stage==0?resp({"LPUSH",k,data(256,c.seq,c.id)}):resp({"RPOP",k});
 if(op=="zincr")return resp({"ZINCRBY",k,(rng()&1)?"32768":"-32768",member(c.slot,c.slot<80 && toggles[c.slot][c.key])});
 if(op=="zswap"){bool alt=toggles[c.id][c.key];return c.stage==0?resp({"ZREM",k,member(c.id,alt)}):resp({"ZADD",k,to_string(c.seq%32768),member(c.id,!alt)});}
 if(op=="stream")return resp({"XADD",k,"MAXLEN","=","4096","*","payload",data(256,c.seq,c.id)});
 throw runtime_error("unknown op");}
void check(const Client&c,const Reply&r){auto integer=[&](long expected){if(r.type!=':'||([&](){size_t used=0;long n=stol(r.value,&used);if(used!=r.value.size())throw runtime_error("invalid integer reply");return n;})()!=expected)throw runtime_error("Unexpected integer reply: "+r.value+" expected "+to_string(expected));};
 if(phase=="load"){
  if(op=="set"||op=="setrange"){if(r.type!='+'||r.value!="OK")throw runtime_error("SET load reply");}
  else if(op=="hash"||op=="zincr"||op=="zswap")integer(c.loadcount);
  else if(op=="list")integer(c.loadpos+c.loadcount);
  else if(op=="stream"){if(r.type!='$'||r.value.find('-')==string::npos)throw runtime_error("XADD load reply");}
  return;
 }
 if(op=="set"){if(r.type!='+'||r.value!="OK")throw runtime_error("SET reply");}
 else if(op=="setrange")integer(1048576);
 else if(op=="hash")integer(0);
 else if(op=="zswap")integer(1);
 else if(op=="list"){if(c.stage==0){if(r.type!=':'||stol(r.value)<4097||stol(r.value)>4096+connections)throw runtime_error("LPUSH length");}else if(r.type!='$'||r.value.size()!=256)throw runtime_error("RPOP value length");}
 else if(op=="zincr"){if(r.type!='$')throw runtime_error("ZINCRBY reply");size_t used=0;double score=stod(r.value,&used);if(used!=r.value.size()||!isfinite(score))throw runtime_error("invalid ZINCRBY score");}
 else if(op=="stream"){if(r.type!='$'||r.value.find('-')==string::npos)throw runtime_error("XADD reply");}
}
string command_name(const Client&c){if(op=="list")return c.stage?"RPOP":"LPUSH";if(op=="zswap")return c.stage?"ZADD":"ZREM";return map<string,string>{{"set","SET"},{"setrange","SETRANGE"},{"hash","HSET"},{"zincr","ZINCRBY"},{"stream","XADD_MAXLEN"}}.at(op);}
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
    Reply r=parse(c.in);if(!r.used)continue;if(r.used!=c.in.size())throw runtime_error("Unexpected extra reply");check(c,r);lastprogress=ns();uint64_t now=lastprogress;
    string metric=phase=="load"?"LOAD":command_name(c);stats[tid][metric].add(now-c.started);
    bool paired=(op=="list"||op=="zswap")&&phase!="load";bool next=true;
    if(phase=="load"){c.loadpos+=c.loadcount;int total=(op=="set"||op=="setrange")?1:(op=="zincr"||op=="zswap")?members:4096;if(c.loadpos>=total){c.loadkey+=connections;c.loadpos=0;}next=c.loadkey<keys&&!interrupted;}
    else if(paired&&c.stage==0)c.stage=1;
    else {stats[tid]["OPERATIONS"].add(now-c.pair_start);size_t bucket=(now-start_ns)/1000000000ULL;if(bucket<persecond[tid].size())persecond[tid][bucket]++;if(op=="zswap")toggles[c.id][c.key]^=1;c.stage=0;next=!interrupted&&now<start_ns+uint64_t(seconds*1e9);}
    if(!next){epoll_ctl(ep,EPOLL_CTL_DEL,c.fd,nullptr);close(c.fd);c.fd=-1;active--;continue;}
    c.out=phase=="load"?make_load(c):make_run(c,rng);c.in.clear();c.sent=0;c.started=ns();if(c.stage==0)c.pair_start=c.started;arm(idx,false);
   }
  }
 }
 uint64_t n=ns(),old=end_ns;while(old<n&&!end_ns.compare_exchange_weak(old,n)){}
 }catch(const exception&e){failed=true;lock_guard<mutex>g(errlock);if(error_msg.empty())error_msg=e.what();}
 for(auto&c:cs)if(c.fd>=0)close(c.fd);if(ep>=0)close(ep);
}
int main(int argc,char**argv){try{
 const set<string> allowed={"--op","--phase","--host","--prefix","--port","--members","--connections","--threads","--keys","--seconds","--seed","--out","--state","--test-mode"};
 for(int i=1;i<argc;i+=2){if(i+1>=argc||!allowed.count(argv[i])||opts.count(argv[i]))throw runtime_error("Unknown, duplicate or incomplete argument");opts[argv[i]]=argv[i+1];}
 op=opts.at("--op");phase=opts.at("--phase");host=opts.at("--host");prefix=opts.at("--prefix");port=stoi(opts.count("--port")?opts.at("--port"):"6379");connections=stoi(opts.at("--connections"));threads=stoi(opts.at("--threads"));keys=stoi(opts.at("--keys"));members=stoi(opts.at("--members"));seconds=stod(opts.at("--seconds"));seed=stoull(opts.at("--seed"));
 for(const char*k:{"--connections","--threads","--keys","--members","--port","--seed"})if(opts.count(k)){const string&v=opts.at(k);if(v.empty()||v.find_first_not_of("0123456789")!=string::npos)throw runtime_error("Invalid integer argument");}
 {size_t used=0;stod(opts.at("--seconds"),&used);if(used!=opts.at("--seconds").size())throw runtime_error("Invalid duration");}
 if(connections<1||connections>80||threads<1||threads>connections||keys<1||port<1||port>65535||!isfinite(seconds)||seconds<=0)throw runtime_error("bounds");
 if((members!=256&&members!=32768)||(op!="zincr"&&op!="zswap")||(phase!="warm"&&phase!="run"&&phase!="load")||!opts.count("--state")||!opts.count("--out"))throw runtime_error("Only state-aware ZSet workloads supported");
 if(prefix!=(members==256?"zset-opt:compact":"zset-opt:grouped"))throw runtime_error("Crossover namespace mismatch");
 if(phase=="load"&&op!="zincr")throw runtime_error("Initial load only with zincr");
 test_mode=opts.count("--test-mode")&&opts.at("--test-mode")=="1";
 if(opts.count("--test-mode")&&!test_mode)throw runtime_error("Explicit test mode must be 1");
 if(test_mode){if(host!="127.0.0.1"||keys>8||connections>8||threads>4||seconds>2)throw runtime_error("Loopback fake-test bounds");}
 else if(keys!=8192||connections!=80||threads!=16||seconds!=(phase=="load"?1:phase=="warm"?90:60)||seed!=uint64_t(phase=="load"?101:phase=="warm"?10180:20180))throw runtime_error("Fixed crossover dimensions or seeds differ");
 signal(SIGTERM,stop_requested);signal(SIGINT,stop_requested);

 mt19937_64 gen(17);payload.resize(1048576);for(char&c:payload)c=char(33+gen()%90);stats.resize(threads);persecond.assign(threads,vector<uint64_t>(size_t(seconds)+1,0));toggles.assign(1280,vector<uint8_t>(keys,0));
 load_state(opts.at("--state"));if(phase=="load")for(auto&v:toggles)for(auto f:v)if(f)throw runtime_error("load requires zero initial state");
 vector<thread>ts;for(int t=0;t<threads;t++)ts.emplace_back(worker,t);while(ready<threads&&!failed)this_thread::sleep_for(chrono::milliseconds(1));start_ns=ns();for(auto&t:ts)t.join();if(failed)throw runtime_error(error_msg);
 double elapsed=(end_ns-start_ns)/1e9;map<string,Stats>all;for(auto&group:stats)for(auto&[name,s]:group){auto&a=all[name];a.sum+=s.sum;a.lat.insert(a.lat.end(),s.lat.begin(),s.lat.end());}
 if(op=="zswap"&&phase!="load")save_state(opts.at("--state"));
 ostringstream result;result<<fixed<<setprecision(6)<<"{\"op\":\""<<op<<"\",\"phase\":\""<<phase<<"\",\"connections\":"<<connections<<",\"keys\":"<<keys<<",\"members\":"<<members<<",\"threads\":"<<threads<<",\"seed\":"<<seed<<",\"prefix\":\""<<prefix<<"\",\"pipeline\":1,\"test_mode\":"<<(test_mode?"true":"false")<<",\"interrupted\":"<<(interrupted?"true":"false")<<",\"data_shape\":{\"structure\":\"zset\",\"members_per_key\":"<<members<<",\"member_bytes\":32,\"logical_payload_bytes\":"<<members*32<<"},\"elapsed_seconds\":"<<elapsed<<",\"errors\":0,\"metrics\":{";
 bool first=true;for(auto&[name,s]:all){if(!first)result<<",";first=false;sort(s.lat.begin(),s.lat.end());auto pct=[&](double p){return s.lat[min(s.lat.size()-1,size_t(ceil(p*s.lat.size()))-1)]/1000.0;};result<<"\""<<name<<"\":{\"count\":"<<s.lat.size()<<",\"qps\":"<<s.lat.size()/elapsed<<",\"avg_ms\":"<<s.sum/double(s.lat.size())/1000<<",\"p50_ms\":"<<pct(.5)<<",\"p99_ms\":"<<pct(.99)<<",\"p999_ms\":"<<pct(.999)<<",\"max_ms\":"<<s.lat.back()/1000.0<<"}";}
 result<<"},\"operations_per_second\":[";for(size_t i=0;i<size_t(seconds);i++){uint64_t n=0;for(auto&v:persecond)n+=v[i];if(i)result<<",";result<<n;}result<<"]}\n";cout<<result.str();if(opts.count("--out")){ofstream f(opts["--out"]);if(!f)throw runtime_error("Cannot open output");f<<result.str();if(!f)throw runtime_error("Cannot write output");}return interrupted?130:0;
 }catch(const exception&e){cerr<<"ERROR: "<<e.what()<<"\n";return 1;}}
