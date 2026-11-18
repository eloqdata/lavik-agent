#define _GNU_SOURCE
#include <spdk/env.h>
#include <spdk/nvme.h>
#include <pthread.h>
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <time.h>
#include <stdatomic.h>
static struct spdk_nvme_ctrlr *ctrl; static struct spdk_nvme_ns *ns;
static int mode, wsize=53760, rsize=0; static uint64_t hz,deadline,start; static atomic_int failed;
typedef struct worker W;
typedef struct req {W *w; void *buf; uint64_t submitted; int write,active;} R;
struct worker {int id; struct spdk_nvme_qpair *q,*wq; R reads[32],wr; uint64_t seed,offset,nextwrite,readn,writen,readticks,writeticks,maxgap,prev,polls,gap100,gap1000;};
static uint64_t rng(W*w){w->seed^=w->seed<<13;w->seed^=w->seed>>7;return w->seed^=w->seed<<17;}
static void done(void *arg,const struct spdk_nvme_cpl*c){R*r=arg;W*w=r->w;uint64_t now=spdk_get_ticks();if(spdk_nvme_cpl_is_error(c))atomic_store(&failed,1);if(r->submitted>=start){if(r->write){w->writen++;w->writeticks+=now-r->submitted;}else{w->readn++;w->readticks+=now-r->submitted;}}r->active=0;}
static void *run(void *arg){W*w=arg;cpu_set_t cp;CPU_ZERO(&cp);CPU_SET(w->id,&cp);pthread_setaffinity_np(pthread_self(),sizeof(cp),&cp);w->q=spdk_nvme_ctrlr_alloc_io_qpair(ctrl,NULL,0);w->wq=mode==2?spdk_nvme_ctrlr_alloc_io_qpair(ctrl,NULL,0):w->q;if(!w->q||!w->wq){atomic_store(&failed,1);return NULL;}
 for(int i=0;i<33;i++){R*r=i<32?&w->reads[i]:&w->wr;r->w=w;r->write=i==32;r->buf=spdk_dma_zmalloc(i==32?wsize:4096,4096,NULL);if(!r->buf){atomic_store(&failed,1);return NULL;}memset(r->buf,0x5a,i==32?wsize:4096);}
 w->nextwrite=spdk_get_ticks();w->offset=(2ULL<<40)+(uint64_t)w->id*(256ULL<<20);
 while(!atomic_load(&failed)) {uint64_t now=spdk_get_ticks();int active=0;if(w->prev&&now>=start){w->polls++;uint64_t gap=now-w->prev;if(gap>w->maxgap)w->maxgap=gap;if(gap>hz/10000)w->gap100++;if(gap>hz/1000)w->gap1000++;}w->prev=now;
  for(int i=0;i<32;i++){R*r=&w->reads[i];if(!r->active&&now<deadline){uint64_t v=rng(w);uint32_t bytes=rsize?rsize:((v%100)<56?1536:2048);uint64_t off=(1ULL<<30)+((rng(w)%((8ULL<<30)/512-8))*512);if(rsize==4096)off&=~4095ULL;r->submitted=spdk_get_ticks();int rc=spdk_nvme_ns_cmd_read(ns,w->q,r->buf,off/512,bytes/512,done,r,0);if(rc){fprintf(stderr,"read rc %d\n",rc);atomic_store(&failed,1);}else r->active=1;}active+=r->active;}
  R*r=&w->wr;if(mode&&!r->active&&now<deadline&&now>=w->nextwrite){r->submitted=spdk_get_ticks();int rc=spdk_nvme_ns_cmd_write(ns,w->wq,r->buf,w->offset/512,wsize/512,done,r,0);if(rc){fprintf(stderr,"write rc %d\n",rc);atomic_store(&failed,1);}else r->active=1;w->offset+=wsize;if(w->offset+wsize>(2ULL<<40)+(uint64_t)(w->id+1)*(256ULL<<20))w->offset=(2ULL<<40)+(uint64_t)w->id*(256ULL<<20);w->nextwrite=now+hz*(uint64_t)wsize/(1280*1024);}
  active+=r->active;int rc=spdk_nvme_qpair_process_completions(w->q,0);if(rc<0)atomic_store(&failed,1);if(w->wq!=w->q&&spdk_nvme_qpair_process_completions(w->wq,0)<0)atomic_store(&failed,1);if(now>=deadline&&!active)break;
 }
 for(int i=0;i<32;i++)spdk_dma_free(w->reads[i].buf);spdk_dma_free(w->wr.buf);if(w->wq!=w->q)spdk_nvme_ctrlr_free_io_qpair(w->wq);spdk_nvme_ctrlr_free_io_qpair(w->q);return NULL;}
static bool probe(void*a,const struct spdk_nvme_transport_id*t,struct spdk_nvme_ctrlr_opts*o){return !strcmp(t->traddr,"97b2:00:00.0");}
static void attach(void*a,const struct spdk_nvme_transport_id*t,struct spdk_nvme_ctrlr*c,const struct spdk_nvme_ctrlr_opts*o){ctrl=c;ns=spdk_nvme_ctrlr_get_ns(c,1);}
int main(int argc,char**argv){mode=argc>1?atoi(argv[1]):0;wsize=argc>2?atoi(argv[2]):53760;rsize=argc>3?atoi(argv[3]):0;struct spdk_env_opts opts;spdk_env_opts_init(&opts);opts.name="queue_probe";opts.core_mask="0xf";opts.mem_size=1024;opts.env_context="-a 97b2:00:00.0";if(spdk_env_init(&opts)<0)return 1;struct spdk_nvme_transport_id tid={};spdk_nvme_trid_populate_transport(&tid,SPDK_NVME_TRANSPORT_PCIE);snprintf(tid.traddr,sizeof(tid.traddr),"97b2:00:00.0");if(spdk_nvme_probe(&tid,NULL,probe,attach,NULL)||!ns)return 2;
 const struct spdk_nvme_ctrlr_data*d=spdk_nvme_ctrlr_get_data(ctrl);if(strncmp(d->sn,"0baff889821a310b0001",20)||spdk_nvme_ns_get_sector_size(ns)!=512||spdk_nvme_ns_get_size(ns)!=2879775571968ULL)return 3;
 hz=spdk_get_ticks_hz();start=spdk_get_ticks()+5*hz;deadline=start+60*hz;W workers[4]={};pthread_t threads[4];for(int i=0;i<4;i++){workers[i].id=i;workers[i].seed=12345+i;pthread_create(&threads[i],NULL,run,&workers[i]);}for(int i=0;i<4;i++)pthread_join(threads[i],NULL);
 uint64_t n=0,wt=0,rt=0,wn=0,mg=0,loops=0,g100=0,g1000=0;for(int i=0;i<4;i++){loops+=workers[i].polls;g100+=workers[i].gap100;g1000+=workers[i].gap1000;n+=workers[i].readn;rt+=workers[i].readticks;wn+=workers[i].writen;wt+=workers[i].writeticks;if(workers[i].maxgap>mg)mg=workers[i].maxgap;}printf("{\"mode\":%d,\"write_size\":%d,\"read_size\":%d,\"read_iops\":%.3f,\"read_mean_us\":%.3f,\"write_mib_s\":%.3f,\"write_mean_us\":%.3f,\"max_loop_gap_us\":%.3f,\"poll_loops_per_s\":%.3f,\"gaps_over100us\":%lu,\"gaps_over1ms\":%lu,\"errors\":%d}\n",mode,wsize,rsize,n/60.,n?rt*1e6/hz/n:0,wn*(double)wsize/60/1048576,wn?wt*1e6/hz/wn:0,mg*1e6/hz,loops/60.,g100,g1000,atomic_load(&failed));spdk_nvme_detach(ctrl);spdk_env_fini();return atomic_load(&failed);}
