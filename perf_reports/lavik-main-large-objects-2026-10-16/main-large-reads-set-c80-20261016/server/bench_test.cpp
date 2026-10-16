#include <functional>
#define main benchmark_main
#include "bench.cpp"
#undef main
#include <cassert>
void expect_reject(const function<void()>&fn){bool failed_test=false;try{fn();}catch(const exception&){failed_test=true;}assert(failed_test);}
int main(){
 {ArrayScan scan;string s;string wire="*3\r\n$3\r\na\0b\r\n$0\r\n\r\n$2\r\nzz\r\n"s;for(size_t i=0;i<wire.size();i++){s+=wire[i];auto r=scan.scan(s);assert((r.used!=0)==(i+1==wire.size()));}assert(scan.spans.size()==3);scan.reset();expect_reject([&]{scan.scan("*-1\r\n");});scan.reset();expect_reject([&]{scan.scan("*1\r\n$-1\r\n");});scan.reset();expect_reject([&]{scan.scan("*1\r\n$1\r\nx!!");});}
 for(string operation:{"hgetall","zrange","smembers"}){
  op=operation;seed=101;load_seed=101;Client c;c.key=7;vector<string>vals;
  if(op=="hgetall")for(int i=4095;i>=0;i--){vals.push_back("f"+to_string(i));vals.push_back(data(256,i,c.key));}
  else for(int i=0;i<32768;i++){int slot=op=="smembers"?32767-i:i;vals.push_back(member(slot,false));if(op=="zrange")vals.push_back(to_string(slot));}
  string wire=resp(vals);Reply reply;for(size_t i=0;i<wire.size();i+=997){c.in.append(wire,i,min(size_t(997),wire.size()-i));reply=c.array.scan(c.in);}assert(reply.used==wire.size());check_array(c,reply);
  if(op=="hgetall"){auto off=c.array.spans[1].first;c.in[off]^=1;expect_reject([&]{check_array(c,reply);});c.in[off]^=1;}
  else {auto off=c.array.spans[0].first;c.in[off+31]='b';expect_reject([&]{check_array(c,reply);});c.in[off+31]='a';}
  auto first=c.array.spans[0];c.array.spans[op=="smembers"?1:2]=first;expect_reject([&]{check_array(c,reply);});
 }
 op="sswap";keys=16;prefix="test";toggles.assign(1280,vector<uint8_t>(keys,0));Client c;c.id=3;mt19937_64 rng(1);auto add=make_run(c,rng);assert(add==resp({"SADD",keyname(c.key),member(3,true)}));c.stage=1;assert(make_run(c,rng)==resp({"SREM",keyname(c.key),member(3,false)}));
 cout<<"PASS fragmented arrays, binary fields, cardinality/order/value checks, corruption/duplicate rejection, Set add/remove pair\n";
}
