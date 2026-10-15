#define main benchmark_entry
#include "bench.cpp"
#undef main
#include <cassert>
int main(){
 seed=101;
 assert(data(256,1,1)==data(256,1,1));
 assert(data(256,1,1)!=data(256,2,1));
 assert(data(256,1,1)!=data(256,1,2));
 ofstream f("/tmp/large-objects-payload-check.bin",ios::binary);
 for(int i=0;i<4096;i++){auto v=data(256,i,0);assert(v.size()==256);f.write(v.data(),v.size());}
}
