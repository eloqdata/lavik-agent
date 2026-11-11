import json, pathlib, subprocess, sys, time
unit,product,n,stage=sys.argv[1:];n=int(n)
cg=subprocess.check_output(['systemctl','show',unit,'--property=ControlGroup','--value'],text=True).strip();assert cg
root=pathlib.Path('/sys/fs/cgroup')/cg.lstrip('/')
def value(name):
 p=root/name
 return int(p.read_text()) if p.exists() else None
procs=[]
for p in root.rglob('cgroup.procs'):
 for line in p.read_text().split():
  pid=int(line)
  try:
   raw=pathlib.Path(f'/proc/{pid}/smaps_rollup').read_text();fields={}
   for row in raw.splitlines():
    parts=row.split()
    if len(parts)==3 and parts[2]=='kB':fields[parts[0].rstrip(':')]=int(parts[1])*1024
   procs.append({'pid':pid,'comm':pathlib.Path(f'/proc/{pid}/comm').read_text().strip(),'memory':fields})
  except FileNotFoundError:pass
huge={p.name:int(p.read_text()) for p in root.glob('hugetlb.*.current') if '.rsvd.' not in p.name}
private_huge=sum(p['memory'].get('Private_Hugetlb',0) for p in procs)
shared_huge=sum(p['memory'].get('Shared_Hugetlb',0) for p in procs)
result={'private_hugetlb_bytes':private_huge,'shared_hugetlb_mapping_bytes':shared_huge,'hugetlb_source':'cgroup' if huge else 'private smaps (no shared mapping)' if shared_huge==0 else 'unavailable total', 'at':time.time(),'product':product,'members':n,'stage':stage,'control_group':cg,'rss_bytes':sum(p['memory'].get('Rss',0) for p in procs),'pss_bytes':sum(p['memory'].get('Pss',0) for p in procs),'cgroup_memory_bytes':value('memory.current'),'cgroup_peak_bytes':value('memory.peak'),'hugetlb_bytes':sum(huge.values()) if huge else private_huge if shared_huge==0 else None,'hugetlb_cgroup':huge,'processes':procs,'memory_stat':(root/'memory.stat').read_text() if (root/'memory.stat').exists() else None,'host_meminfo':pathlib.Path('/proc/meminfo').read_text(),'cpu_stat':(root/'cpu.stat').read_text(),'io_stat':(root/'io.stat').read_text() if (root/'io.stat').exists() else None}
if product=='kvrocks':
 import os
 fs=os.statvfs('/mnt/gaming1111-storage')
 result['filesystem_used_bytes']=(fs.f_blocks-fs.f_bfree)*fs.f_frsize
 result['filesystem_total_bytes']=fs.f_blocks*fs.f_frsize
print(json.dumps(result))
