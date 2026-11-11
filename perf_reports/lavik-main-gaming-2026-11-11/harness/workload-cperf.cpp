#include <arpa/inet.h>
#include <sys/epoll.h>
#include <sys/socket.h>
#include <sys/resource.h>
#include <netinet/tcp.h>
#include <unistd.h>
#include <fcntl.h>
#include <sched.h>
#include <algorithm>
#include <atomic>
#include <chrono>
#include <charconv>
#include <cmath>
#include <cstring>
#include <fstream>
#include <iostream>
#include <iomanip>
#include <map>
#include <mutex>
#include <random>
#include <sstream>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>
using namespace std;
uint64_t now(){return chrono::duration_cast<chrono::nanoseconds>(chrono::steady_clock::now().time_since_epoch()).count();}
void require(bool b,const string&s){if(!b)throw runtime_error(s);}
string resp(const vector<string>&a){string s="*"+to_string(a.size())+"\r\n";for(auto&v:a)s+="$"+to_string(v.size())+"\r\n"+v+"\r\n";return s;}
uint64_t mix(uint64_t x){x+=0x9e3779b97f4a7c15ULL;x=(x^(x>>30))*0xbf58476d1ce4e5b9ULL;x=(x^(x>>27))*0x94d049bb133111ebULL;return x^(x>>31);}
string member(int i,bool added=false){string s(32,'0');s[0]=added?'X':'M';const char*a="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";uint64_t x=mix(i+20261029ULL);for(int j=1;j<24;j++){if(j%9==0)x=mix(x);s[j]=a[x&63];x>>=6;}char b[9];snprintf(b,9,"%08x",i);s.replace(24,8,b);return s;}
// Incremental RESP framing: already consumed elements are never rescanned.
// Only a bounded prefix is retained as token views; large replies remain one
// receive buffer, and full content is verified in separate correctness runs.
struct Frame{
 size_t pos=0;long todo=1,root_count=-1;char root=0;long integer=0;uint64_t bulks=0;vector<pair<size_t,size_t>> spans;bool nil=false;
 void reset(){pos=0;todo=1;root_count=-1;root=0;integer=0;bulks=0;spans.clear();nil=false;}
 bool scan(const string&s){while(todo){if(pos>=s.size())return false;size_t e=s.find("\r\n",pos);if(e==string::npos)return false;char t=s[pos];string val=s.substr(pos+1,e-pos-1);size_t end=e+2;long n=0;
  if(t=='-')throw runtime_error("server error: "+val);
  if(t=='$'||t=='*'||t==':'){n=stol(val);require(n>=-1,"negative length");}
  if(t=='$'&&n>=0){end+=size_t(n)+2;if(end>s.size())return false;require(s.compare(end-2,2,"\r\n")==0,"bulk terminator");}
  if(!root){root=t;root_count=t=='*'?n:-1;integer=t==':'?n:0;nil=t=='$'&&n==-1;}
  --todo;if(t=='*'&&n>=0){require(n<=3000000,"array too large");todo+=n;}else if(t=='$'){bulks++;if(n>=0&&spans.size()<16384)spans.emplace_back(e+2,n);}else require(t==':'||t=='+',"unsupported RESP");pos=end;
 }return true;}
};
// Logarithmic latency histogram: exact microseconds below 2048 us and
// <= 1/1024 relative bucket width thereafter. No request samples are retained.
struct Hist {
 vector<uint64_t> buckets=vector<uint64_t>(32768);
 uint64_t count=0,sum_ns=0,max_ns=0;
 void add(uint64_t ns){uint64_t us=(ns+500)/1000;unsigned shift=us<2048?0:63-__builtin_clzll(us)-10;size_t i=shift*1024+(us>>shift);require(i<buckets.size(),"latency overflow");buckets[i]++;count++;sum_ns+=ns;max_ns=max(max_ns,ns);}
 void merge(const Hist& h){for(size_t i=0;i<buckets.size();i++)buckets[i]+=h.buckets[i];count+=h.count;sum_ns+=h.sum_ns;max_ns=max(max_ns,h.max_ns);}
 double quantile(double q)const{uint64_t target=uint64_t(ceil(q*count)),n=0;for(size_t i=0;i<buckets.size();i++){n+=buckets[i];if(n>=target){unsigned sh=i<2048?0:unsigned(i/1024)-1;uint64_t lower=(i-sh*1024)<<sh;return lower/1000.;}}return 0;}
};
struct Client {int fd=-1,id=0,step=0;uint64_t checked_reads=0,seq=0,k=0,slot=0,write_key=0,write_slot=0,load_key=0,version=0,started=0;string in,out,metric;bool waiting=false;size_t sent=0;Frame frame;};
string host,mode,phase,outpath;int connections,threads;uint64_t epoch_ms=0,ttl_ms=1800000;int creators=0;uint64_t key_count,N=10000000,seed=1107;int hot_percent=5;double seconds;vector<map<string,Hist>> stats;vector<uint64_t> received,completed,noops;vector<vector<uint64_t>> persec;
atomic<int> ready=0;atomic<bool> failed=false;atomic<uint64_t> start=0,finish=0;mutex error_mutex;string error;
string hexid(uint64_t n){char x[17];snprintf(x,sizeof x,"%016llx",(unsigned long long)n);return x;}
uint64_t wall_ms(){return chrono::duration_cast<chrono::milliseconds>(chrono::system_clock::now().time_since_epoch()).count();}
string matchkey(uint64_t k,uint64_t generation){return "game:match:"+hexid(mix(k+1107))+":"+to_string(generation);}
string keyname(uint64_t k){return (mode=="A"?"game:global:":"game:player:")+hexid(mix(k+(mode=="A"?20261030ULL:1107ULL)));}
string field(int f){char x[4];snprintf(x,sizeof x,"f%02d",f);return x;}
string value(uint64_t k,int f,uint64_t v){string s=hexid(k)+hexid(f)+hexid(v);uint64_t x=mix(k^mix(f)^mix(v));while(s.size()<128){x=mix(x);for(int j=0;j<8&&s.size()<128;j++)s.push_back(char(x>>(j*8)));}return s;}
string scalar(const Client&c,size_t i=0){require(i<c.frame.spans.size(),"missing bulk");auto [p,n]=c.frame.spans[i];return c.in.substr(p,n);}
int socket_open(){int fd=socket(AF_INET,SOCK_STREAM,0),one=1;require(fd>=0,"socket");setsockopt(fd,IPPROTO_TCP,TCP_NODELAY,&one,sizeof one);sockaddr_in a{};a.sin_family=AF_INET;a.sin_port=htons(6379);inet_pton(AF_INET,host.c_str(),&a.sin_addr);require(connect(fd,(sockaddr*)&a,sizeof a)==0,"connect: "+string(strerror(errno)));fcntl(fd,F_SETFL,O_NONBLOCK);return fd;}
string make(Client&c,mt19937_64&rng){
 if(mode=="B") {
  if(phase=="load"){
   c.k=c.load_key;c.metric="ZADD_load";vector<string>a={"ZADD",matchkey(c.k,0)};
   for(int i=0;i<50;i++){a.push_back(to_string(i*1024));a.push_back(member(c.k*50+i));}return resp(a);
  }
  if(phase=="verify"){
   c.k=c.load_key;c.metric="ZREVRANGE_verify";return resp({"ZREVRANGE",matchkey(c.k,0),"0","-1","WITHSCORES"});
  }
  if(phase=="ttl"){
   c.k=c.load_key;c.metric="PEXPIREAT";return resp({"PEXPIREAT",matchkey(c.k,0),to_string(epoch_ms+(c.k+1)*ttl_ms/key_count)});
  }
  if(c.id<creators){
   uint64_t event=c.id+uint64_t(creators)*c.seq;c.k=event%key_count;uint64_t generation=1+event/key_count;
   if(c.step==0){c.metric="ZADD_create";vector<string>a={"ZADD",matchkey(c.k,generation)};for(int i=0;i<50;i++){a.push_back(to_string(i*1024));a.push_back(member(c.k*50+i));}return resp(a);}
   c.metric="PEXPIRE_create";return resp({"PEXPIRE",matchkey(c.k,generation),to_string(ttl_ms)});
  }
  c.k=rng()%key_count;auto wall=wall_ms();uint64_t due=epoch_ms+(c.k+1)*ttl_ms/key_count;
  uint64_t generation=wall<due?0:1+(wall-due)/ttl_ms;
  c.slot=rng()%50;c.version=1000000000000ULL+uint64_t(c.id)*1000000000+(++c.seq);c.metric="ZADD_XX_CH";
  return resp({"ZADD",matchkey(c.k,generation),"XX","CH",to_string(c.version),member(c.k*50+c.slot)});
 }
 if(phase=="load") {c.k=c.load_key;c.metric="HSET_load";vector<string>a={"HSET",keyname(c.k)};for(int f=0;f<16;f++){a.push_back(field(f));a.push_back(value(c.k,f,0));}return resp(a);}
 if(phase=="verify"){c.k=c.load_key;c.metric="HGETALL_verify";return resp({"HGETALL",keyname(c.k)});}
 if(mode=="A") {
  if(c.step<8){c.k=rng()%key_count;c.slot=rng()%N;c.metric=(c.step%2)?"ZRANK":"Top100";return (c.step%2)?resp({"ZRANK",keyname(c.k),member(c.slot)}):resp({"ZREVRANGE",keyname(c.k),"0","99","WITHSCORES"});}
  if(c.step==8){c.write_key=rng()%key_count;c.write_slot=c.id+connections*(rng()%((N-1-c.id)/connections+1));}
  c.k=c.write_key;c.slot=c.write_slot;c.metric="ZINCRBY";return resp({"ZINCRBY",keyname(c.k),c.step==8?"2048":"-2048",member(c.slot)});
 }
 uint64_t hot=key_count*hot_percent/100;bool ishot=rng()%100<90;c.k=ishot?rng()%hot:hot+rng()%(key_count-hot);
 if(c.step<9){c.metric=ishot?"HGETALL_hot":"HGETALL_cold";return resp({"HGETALL",keyname(c.k)});}
 c.version=1+(uint64_t(c.id)<<48)+(++c.seq);c.metric=ishot?"HSET_hot":"HSET_cold";return resp({"HSET",keyname(c.k),"f00",value(c.k,0,c.version)});
}
bool creator(const Client&c){return mode=="B"&&phase=="run"&&c.id<creators;}
uint64_t create_due_ms(const Client&c){return epoch_ms+(c.id+uint64_t(creators)*c.seq+1)*ttl_ms/key_count;}
void check(Client&c){auto&f=c.frame;
 if(mode=="B") {
 if(phase=="verify"){require(f.root_count==100&&f.bulks==100,"match cardinality");for(int i=0;i<50;i++)require(scalar(c,2*i)==member(c.k*50+49-i)&&stoll(scalar(c,2*i+1))==(49-i)*1024,"match initial content");return;}
 require(f.root==':',"match integer reply");require((phase=="load"||c.metric=="ZADD_create")?f.integer==50:(phase=="ttl"||c.metric=="PEXPIRE_create")?f.integer==1:(f.integer==0||f.integer==1),"match update/ttl reply");return;}
 if(mode=="C"){
  if(phase=="load"){require(f.root==':'&&f.integer==16,"initial hash size");return;}
  if(c.metric.starts_with("HSET")){require(f.root==':'&&f.integer==0,"update must not create field");return;}
  require(f.root=='*'&&f.root_count==32&&f.spans.size()==32,"hash reply size");unsigned seen=0;
  // Full content is checked before/after timing. During timing retain every
  // shape, key/field/version identity check, and sample the binary suffix.
  // Avoid two allocating strings per field merely to validate a reply.
  const bool full=phase!="run" || ((++c.checked_reads&1023)==1);
  const auto parse_hex=[](string_view s){uint64_t n=0;auto [end,ec]=from_chars(s.data(),s.data()+s.size(),n,16);require(ec==errc{}&&end==s.data()+s.size(),"hex identity");return n;};
  const auto view=[&](size_t at){auto [p,n]=f.spans[at];return string_view(c.in).substr(p,n);};
  for(int j=0;j<16;j++){
   auto name=view(j*2);require(name.size()==3&&name[0]=='f'&&name[1]>='0'&&name[1]<='9'&&name[2]>='0'&&name[2]<='9',"field name");int id=(name[1]-'0')*10+name[2]-'0';require(id<16&&!(seen&(1u<<id)),"duplicate/invalid field");seen|=1u<<id;
   auto v=view(j*2+1);require(v.size()==128,"field bytes");require(parse_hex(v.substr(0,16))==c.k&&parse_hex(v.substr(16,16))==uint64_t(id),"hash identity");auto ver=parse_hex(v.substr(32,16));require(id==0||ver==0,"immutable field changed");if(full)require(v==value(c.k,id,ver),"hash content");
  }return;
 }
 if(c.metric=="ZRANK"){require(f.root==':'&&f.integer>=0&&f.integer<long(N),"rank reply");return;}
 if(c.metric=="ZINCRBY"){require(stoll(scalar(c))==long(c.slot)*1024+(c.step==8?2048:0),"increment reply");return;}
 require(f.root_count==200&&f.bulks==200,"top100 size");double prev=INFINITY;
 for(int j=0;j<100;j++){string m=scalar(c,2*j);require(m.size()==32,"member size");int id=stoi(m.substr(24,8),nullptr,16);require(id>=0&&uint64_t(id)<N&&m==member(id),"member content");double score=stod(scalar(c,2*j+1));require(score<=prev&&(score==double(id)*1024||score==double(id)*1024+2048),"score/order");prev=score;}
}
void worker(int tid){vector<Client>cs;int ep=-1;try{
 cpu_set_t mask;CPU_ZERO(&mask);CPU_SET(tid,&mask);require(sched_setaffinity(0,sizeof mask,&mask)==0,"affinity");mt19937_64 rng(seed+tid*0x9e3779b97f4a7c15ULL);ep=epoll_create1(0);require(ep>=0,"epoll");
 for(int id=tid;id<connections;id+=threads){Client c;c.id=id;c.load_key=id;c.fd=socket_open();cs.push_back(move(c));}
 auto arm=[&](int j,bool add){epoll_event e{};e.events=EPOLLIN|(cs[j].sent<cs[j].out.size()?EPOLLOUT:0);e.data.u32=j;require(epoll_ctl(ep,add?EPOLL_CTL_ADD:EPOLL_CTL_MOD,cs[j].fd,&e)==0,"epoll_ctl");};
 ready++;while(!start&&!failed)this_thread::yield();if(failed)throw runtime_error("cancelled");for(int j=0;j<int(cs.size());j++){auto&c=cs[j];if(creator(c)&&wall_ms()<create_due_ms(c)){c.waiting=true;}else{c.out=make(c,rng);c.started=now();if(creator(c))stats[tid]["creation_lateness"].add((wall_ms()-create_due_ms(c))*1000000);}arm(j,true);}
 int active=cs.size();uint64_t last=now();epoll_event events[128];
 while(active&&!failed){
 int timeout=100;
 for(int j=0;j<int(cs.size());j++){auto&c=cs[j];if(c.fd<0||!c.waiting)continue;
  if(now()>=start+uint64_t(seconds*1e9)){epoll_ctl(ep,EPOLL_CTL_DEL,c.fd,nullptr);close(c.fd);c.fd=-1;active--;continue;}
  uint64_t due=create_due_ms(c),wall=wall_ms();if(wall>=due){c.waiting=false;c.out=make(c,rng);c.sent=0;c.started=now();stats[tid]["creation_lateness"].add((wall-due)*1000000);arm(j,false);}else timeout=min(timeout,int(due-wall));
 }
 int n=epoll_wait(ep,events,128,timeout);require(n>=0||errno==EINTR,"epoll wait");require(now()-last<180000000000ULL,"180s without progress");
  for(int j=0;j<n;j++){int ix=events[j].data.u32;auto&c=cs[ix];if(c.fd<0)continue;require(!(events[j].events&(EPOLLHUP|EPOLLERR)),"socket error");
   if(events[j].events&EPOLLOUT){while(c.sent<c.out.size()){auto z=send(c.fd,c.out.data()+c.sent,c.out.size()-c.sent,MSG_NOSIGNAL);if(z>0)c.sent+=z;else if(z<0&&(errno==EAGAIN||errno==EWOULDBLOCK))break;else throw runtime_error("send");}arm(ix,false);}
   if(events[j].events&EPOLLIN){char buf[65536];for(;;){auto z=recv(c.fd,buf,sizeof buf,0);if(z>0){c.in.append(buf,z);received[tid]+=z;}else if(z<0&&(errno==EAGAIN||errno==EWOULDBLOCK))break;else throw runtime_error("receive");}
    require(c.in.size()<4*1024*1024,"reply cap");if(!c.frame.scan(c.in))continue;require(c.frame.pos==c.in.size(),"trailing reply");uint64_t done=now();check(c);last=done;stats[tid][c.metric].add(done-c.started);stats[tid]["all"].add(done-c.started);completed[tid]++;if(mode=="B"&&phase=="run"&&!creator(c)&&c.frame.integer==0)noops[tid]++;size_t sec=(done-start)/1000000000ULL;if(sec<persec[tid].size())persec[tid][sec]++;
    bool next;if(phase!="run"){c.load_key+=connections;next=c.load_key<key_count;}else if(creator(c)){if(c.step==0){c.step=1;next=true;}else{c.step=0;c.seq++;next=done<start+uint64_t(seconds*1e9);}}else{c.step=(c.step+1)%10;next=c.step!=0||done<start+uint64_t(seconds*1e9);}
    if(!next){epoll_ctl(ep,EPOLL_CTL_DEL,c.fd,nullptr);close(c.fd);c.fd=-1;active--;continue;}
    c.in.clear();c.frame.reset();c.sent=0;
    if(creator(c)&&c.step==0&&wall_ms()<create_due_ms(c)){c.out.clear();c.waiting=true;arm(ix,false);continue;}
    c.out=make(c,rng);c.started=now();if(creator(c)&&c.step==0)stats[tid]["creation_lateness"].add((wall_ms()-create_due_ms(c))*1000000);arm(ix,false);
   }
  }
 }
 uint64_t t=now(),old=finish;while(old<t&&!finish.compare_exchange_weak(old,t)){}
 }catch(const exception&e){failed=true;lock_guard<mutex>l(error_mutex);if(error.empty())error=e.what();}
 for(auto&c:cs)if(c.fd>=0)close(c.fd);if(ep>=0)close(ep);
}
double cpu(const rusage&r){return r.ru_utime.tv_sec+r.ru_utime.tv_usec/1e6+r.ru_stime.tv_sec+r.ru_stime.tv_usec/1e6;}
int main(int argc,char**argv){try{
 if(argc==2&&string(argv[1])=="--self-test"){
  Hist a;for(uint64_t us=1;us<=100;us++)a.add(us*1000);
  require(a.count==100&&a.quantile(.5)==.05&&a.quantile(.99)==.099&&a.quantile(.999)==.1,"histogram quantiles");
  for(uint64_t us:{2047ULL,2048ULL,2049ULL,4095ULL,4096ULL,1000000ULL,180000000ULL}){Hist h;h.add(us*1000);double got=h.quantile(.99)*1000;require(got<=us+1e-6&&us-got<=us/1024.+1,"histogram precision");}
  Hist b;b.add(200000);a.merge(b);require(a.count==101&&a.max_ns==200000,"histogram merge");
  mode="C";phase="run";
  const auto reply=[](uint64_t key){vector<string> a;for(int i=0;i<16;i++){a.push_back(field(i));a.push_back(value(key,i,0));}return resp(a);};
  const auto make_test=[&]{Client c;c.k=42;c.metric="HGETALL_hot";c.in=reply(c.k);require(c.frame.scan(c.in),"test framing");c.checked_reads=1;return c;};
  auto good=make_test();check(good);
  const auto rejected=[](Client c){bool caught=false;try{check(c);}catch(const exception&){caught=true;}require(caught,"validator accepted corruption");};
  auto wrongkey=make_test();wrongkey.in=reply(43);wrongkey.frame.reset();require(wrongkey.frame.scan(wrongkey.in),"test framing");rejected(wrongkey);
  auto wrongfield=make_test();wrongfield.in[wrongfield.frame.spans[1].first+31]='f';rejected(wrongfield);
  auto wrongsuffix=make_test();wrongsuffix.in[wrongsuffix.frame.spans[1].first+127]^=1;wrongsuffix.checked_reads=0;rejected(wrongsuffix);
  phase="verify";wrongsuffix.checked_reads=1;rejected(wrongsuffix);
  cout<<"latency histogram and timed/full Hash validators verified\n";return 0;
 }

 map<string,string>a;for(int i=1;i<argc;i+=2){require(i+1<argc,"arguments");a[argv[i]]=argv[i+1];}host=a.at("--host");mode=a.at("--workload");phase=a.at("--phase");key_count=stoull(a.at("--keys"));N=a.count("--members")?stoull(a.at("--members")):10000000;connections=stoi(a.at("--connections"));threads=min(connections,stoi(a.at("--threads")));seconds=stod(a.at("--seconds"));outpath=a.at("--out");hot_percent=a.count("--hot-percent")?stoi(a.at("--hot-percent")):5;seed=a.count("--seed")?stoull(a.at("--seed")):1107;epoch_ms=a.count("--epoch-ms")?stoull(a.at("--epoch-ms")):0;ttl_ms=a.count("--ttl-ms")?stoull(a.at("--ttl-ms")):1800000;creators=(mode=="B"&&phase=="run")?min(32,max(1,connections/10)):0;
 require((mode=="A"||mode=="B"||mode=="C")&&(phase=="run"||mode!="A"),"workload/phase");require(key_count>=1&&key_count<=100000000&&(mode=="B"||N>=uint64_t(connections))&&N<=100000000&&connections>=1&&threads>=1&&threads<=32&&hot_percent>=1&&hot_percent<=99,"bounds");if(phase!="run")require(key_count>=uint64_t(connections),"loader bounds");
 require(mode!="B"||phase=="load"||phase=="verify"||(epoch_ms>0&&ttl_ms>0),"churn epoch/TTL required");stats.resize(threads);received.resize(threads);completed.resize(threads);noops.resize(threads);persec.assign(threads,vector<uint64_t>(size_t(seconds)+1));rusage before{},after{};if(mode=="B"&&phase=="run"){while(wall_ms()+50<epoch_ms)this_thread::sleep_for(chrono::milliseconds(10));}getrusage(RUSAGE_SELF,&before);vector<thread>ts;for(int t=0;t<threads;t++)ts.emplace_back(worker,t);while(ready<threads&&!failed)this_thread::sleep_for(chrono::milliseconds(1));if(mode=="B"&&phase=="run"){while(wall_ms()<epoch_ms&&!failed)this_thread::sleep_for(chrono::milliseconds(1));}start=now();for(auto&t:ts)t.join();getrusage(RUSAGE_SELF,&after);require(!failed,error);
 double elapsed=(finish-start)/1e9;map<string,Hist> all;uint64_t bytes=0,total=0,noop=0;for(int t=0;t<threads;t++){bytes+=received[t];total+=completed[t];noop+=noops[t];for(auto&[k,h]:stats[t])all[k].merge(h);}ostringstream o;o<<fixed<<setprecision(6)<<"{\"validation\":\"shape_identity_every_reply_full_suffix_1_in_1024_full_verify_outside_timing\",\"workload\":\""<<mode<<"\",\"phase\":\""<<phase<<"\",\"keys\":"<<key_count<<",\"members\":"<<(mode=="A"?N:mode=="B"?50:0)<<",\"fields\":"<<(mode=="C"?16:0)<<",\"field_value_bytes\":"<<(mode=="C"?128:0)<<",\"connections\":"<<connections<<",\"threads\":"<<threads<<",\"hot_percent\":"<<hot_percent<<",\"creator_connections\":"<<creators<<",\"ttl_ms\":"<<ttl_ms<<",\"epoch_ms\":"<<epoch_ms<<",\"elapsed_s\":"<<elapsed<<",\"client_cpu_cores\":"<<(cpu(after)-cpu(before))/elapsed<<",\"response_mib_s\":"<<bytes/elapsed/1048576<<",\"operations\":"<<total<<",\"no_op_updates\":"<<noop<<",\"errors\":0,\"metrics\":{";
 bool first=true;for(auto&[k,h]:all){if(!first)o<<',';first=false;o<<'"'<<k<<"\":{\"count\":"<<h.count<<",\"qps\":"<<h.count/elapsed<<",\"avg_ms\":"<<h.sum_ns/double(h.count)/1e6<<",\"p50_ms\":"<<h.quantile(.5)<<",\"p99_ms\":"<<h.quantile(.99)<<",\"p999_ms\":"<<h.quantile(.999)<<",\"max_ms\":"<<h.max_ns/1e6<<'}';}o<<"},\"per_second\":[";for(size_t i=0;i<size_t(seconds);i++){if(i)o<<',';uint64_t n=0;for(auto&v:persec)n+=v[i];o<<n;}o<<"]}\n";ofstream f(outpath);f<<o.str();require(bool(f),"output");cout<<o.str();return 0;
 }catch(const exception&e){cerr<<"ERROR: "<<e.what()<<'\n';return 1;}}
