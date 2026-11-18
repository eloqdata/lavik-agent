#!/usr/bin/env python3
import json,pathlib,subprocess,sys,time
product=sys.argv[1];out={'epoch':time.time()}
pid=int(subprocess.check_output(['systemctl','show','bench-db-'+product,'-p','MainPID','--value']))
if pid:
 out['cmdline']=pathlib.Path(f'/proc/{pid}/cmdline').read_bytes().replace(b'\0',b' ').decode()
 out['proc_status']=pathlib.Path(f'/proc/{pid}/status').read_text()
 cgroup=pathlib.Path(f'/proc/{pid}/cgroup').read_text().strip().split(':')[-1]
 for name in ['memory.current','memory.peak','memory.events','cpu.stat','io.stat','hugetlb.2MB.current','hugetlb.2MB.events']:
  p=pathlib.Path('/sys/fs/cgroup')/cgroup.lstrip('/')/name
  if p.exists():out[name]=p.read_text()
out['meminfo']=pathlib.Path('/proc/meminfo').read_text()
out['diskstats']=pathlib.Path('/proc/diskstats').read_text()
print(json.dumps(out,indent=2))
