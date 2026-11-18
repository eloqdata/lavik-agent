#define _POSIX_C_SOURCE 200809L
#include <errno.h>
#include <fcntl.h>
#include <linux/nvme_ioctl.h>
#include <signal.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/ioctl.h>
#include <time.h>
#include <unistd.h>
static volatile sig_atomic_t stopping=0;
static void stop(int signum){(void)signum;stopping=1;}
static int64_t ns(clockid_t clock){struct timespec t;clock_gettime(clock,&t);return (int64_t)t.tv_sec*1000000000+t.tv_nsec;}
int main(int argc,char **argv){
 if(argc!=3){fprintf(stderr,"usage: nvme-flush /dev/VERIFIED_NAMESPACE rate_hz\n");return 2;}
 int rate=atoi(argv[2]);if(rate<1||rate>1000)return 2;
 int fd=open(argv[1],O_RDWR);if(fd<0){perror("open");return 1;}
 signal(SIGTERM,stop);signal(SIGINT,stop);setvbuf(stdout,NULL,_IOLBF,0);
 puts("epoch_ns,duration_ns,result,errno");
 int64_t period=1000000000/rate,next=ns(CLOCK_MONOTONIC);
 while(!stopping){
  struct nvme_passthru_cmd cmd={0};cmd.opcode=0x00;cmd.nsid=1;cmd.timeout_ms=10000;
  int64_t wall=ns(CLOCK_REALTIME),start=ns(CLOCK_MONOTONIC);errno=0;
  int result=ioctl(fd,NVME_IOCTL_IO_CMD,&cmd),saved_errno=errno;
  int64_t end=ns(CLOCK_MONOTONIC);
  printf("%lld,%lld,%d,%d\n",(long long)wall,(long long)(end-start),result,saved_errno);
  if(result!=0){close(fd);return 1;}
  next+=period;while(next<end)next+=period;
  struct timespec wake={.tv_sec=next/1000000000,.tv_nsec=next%1000000000};
  while(!stopping && clock_nanosleep(CLOCK_MONOTONIC,TIMER_ABSTIME,&wake,NULL)==EINTR){}
 }
 close(fd);return 0;
}
