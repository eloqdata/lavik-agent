#pragma once
#include <cmath>
#include <csignal>
#include <cstdio>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <iomanip>
#include <map>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
namespace b8 {
using namespace std;
inline volatile sig_atomic_t interrupted = 0;
inline void signal_stop(int) { interrupted = 1; }
inline void install_signals() { signal(SIGTERM,signal_stop); signal(SIGINT,signal_stop); }
inline bool test_mode(const map<string,string>& o) { return o.count("--test-mode")&&o.at("--test-mode")=="1"; }
inline map<string,string> arguments(int argc,char**argv) {
 const set<string> allowed={"--op","--phase","--host","--prefix","--port","--connections","--threads","--keys","--seconds","--seed","--load-seed","--out","--workdist-out","--state","--test-mode"};
 map<string,string> o;
 for(int i=1;i<argc;i+=2) { if(i+1>=argc||!allowed.count(argv[i])||o.count(argv[i]))throw runtime_error("Unknown, duplicate or incomplete argument");o[argv[i]]=argv[i+1]; }
 return o;
}
inline void validate(const map<string,string>&o,const string&op,const string&phase,const string&host,const string&prefix,int connections,int threads,int keys,double seconds,int port,const set<string>&allowed_ops) {
 if(!allowed_ops.count(op))throw runtime_error("Unsupported workload for this 8 KiB client");
 const bool read=op=="hgetall"||op=="hkeys"||op=="hvals"||op=="lrange"||op=="smembers"||op=="zrange";
 if(phase!="load"&&phase!="warm"&&phase!="run"&&!(read&&phase=="validate"))throw runtime_error("Unsupported phase");
 if(prefix.empty()||prefix.find_first_not_of("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:_-.")!=string::npos)throw runtime_error("Invalid prefix");
 for(const char*k:{"--connections","--threads","--keys","--port","--seed","--load-seed"})if(o.count(k)) {const string&s=o.at(k);if(s.empty()||s.find_first_not_of("0123456789")!=string::npos)throw runtime_error("Invalid integer argument");}
 if(o.count("--seconds")){size_t consumed=0;stod(o.at("--seconds"),&consumed);if(consumed!=o.at("--seconds").size())throw runtime_error("Invalid seconds");}
 if(port<1||port>65535||connections<1||threads<1||threads>connections||keys<1||!isfinite(seconds)||seconds<=0)throw runtime_error("Argument bounds");
 if(o.count("--test-mode")&&!test_mode(o))throw runtime_error("Test mode must be explicitly 1");
 if(test_mode(o)) { if(host!="127.0.0.1"||keys>8||connections>4||threads>4||seconds>2)throw runtime_error("Fake-server test bounds"); }
 else {if(keys!=8192)throw runtime_error("This experiment requires 8192 keys");if(phase=="validate"){if(connections!=1||threads!=1||seconds!=1)throw runtime_error("Validation requires 1c/1t and one-second metadata");}else if(connections!=80||threads!=16||seconds!=(phase=="warm"?90:phase=="run"?60:1))throw runtime_error("This experiment requires 80c/16t and load1/warm90/run60");}
 if(phase=="validate"&&(connections!=1||threads!=1))throw runtime_error("Validation requires one connection/thread");
 if((op=="zswap"||op=="sswap")&&phase!="load"&&!o.count("--state"))throw runtime_error("Pair state file required");
 if(o.count("--state")&&op!="zswap"&&op!="sswap")throw runtime_error("State supported only for paired Set/ZSet");
 if(!o.count("--out"))throw runtime_error("Result output required");
 install_signals();
}
inline string metadata(const string&op,const string&prefix,int threads,uint64_t seed,bool test) {
 string type=op=="set"||op=="setrange"?"string":op=="hash"||op=="hgetall"||op=="hkeys"||op=="hvals"?"hash":op=="list"||op=="lrange"?"list":op=="zincr"||op=="zswap"||op=="zrange"?"zset":op=="sswap"||op=="smembers"?"set":"stream";
 int items=type=="string"?1:type=="set"||type=="zset"?256:32;
 ostringstream s;s<<"\"threads\":"<<threads<<",\"seed\":"<<seed<<",\"prefix\":\""<<prefix<<"\",\"pipeline\":1,\"test_mode\":"<<(test?"true":"false")<<",\"interrupted\":"<<(interrupted?"true":"false")<<",\"data_shape\":{\"structure\":\""<<type<<"\",\"logical_payload_bytes\":8192,\"items_per_key\":"<<items<<",\"item_bytes\":"<<8192/items<<"},";return s.str();
}
inline void load_state(const string&path,vector<vector<uint8_t>>&v,int keys,int connections,bool require_zero) {
 ifstream f(path,ios::binary);if(!f)throw runtime_error("Missing pair state file");int32_t capacity=0,nkeys=0;f.read((char*)&capacity,4);f.read((char*)&nkeys,4);if(!f||capacity!=1280||nkeys!=keys)throw runtime_error("State shape mismatch");
 for(int id=0;id<1280;id++){f.read((char*)v[id].data(),keys);if(!f)throw runtime_error("Truncated state");for(uint8_t x:v[id])if(x>1||((id>=connections||require_zero)&&x))throw runtime_error("Invalid or nonzero inactive/initial state flag");}
 if(f.peek()!=EOF)throw runtime_error("Trailing state bytes");
}
inline void save_state(const string&path,const vector<vector<uint8_t>>&v,int keys) {
 string temp=path+".tmp";ofstream f(temp,ios::binary|ios::trunc);if(!f)throw runtime_error("Cannot create state checkpoint");int32_t capacity=1280,nkeys=keys;f.write((char*)&capacity,4);f.write((char*)&nkeys,4);for(auto&row:v)f.write((const char*)row.data(),row.size());f.flush();if(!f)throw runtime_error("Cannot write state checkpoint");f.close();if(!f)throw runtime_error("Cannot close state checkpoint");if(rename(temp.c_str(),path.c_str()))throw runtime_error("Cannot atomically publish state checkpoint");
}
inline long integer(const string&s) {size_t used=0;long n=stol(s,&used);if(used!=s.size())throw runtime_error("Invalid integer reply");return n;}
inline void numeric(const string&s) {size_t used=0;double n=stod(s,&used);if(used!=s.size()||!isfinite(n))throw runtime_error("Invalid score reply");}
}
