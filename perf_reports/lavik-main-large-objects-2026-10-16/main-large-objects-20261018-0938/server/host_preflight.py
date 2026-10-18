from pathlib import Path
import json,os,subprocess as sp,time
R=Path(__file__).resolve().parent
assert R in (Path('/mnt/dev/benchmark/main-large-objects-20261018-0938'),Path('/opt/benchmark/main-large-objects-20261018-0938'))
role='server' if str(R).startswith('/mnt/') else 'client'
assert os.uname().release=='6.17.0-1022-azure'
assert os.cpu_count()==(16 if role=='server' else 32)
assert not list(R.parent.glob('*/active.json'))
for p in Path('/proc').iterdir():
 if not p.name.isdigit(): continue
 try: name=(p/'comm').read_text().strip()
 except OSError: continue
 assert name not in ('lavik','bench','bench_hash','bench_lrange','bench_workdist'), (p.name,name)
values={'time':time.time(),'role':role,'kernel':os.uname().release,'cpu':json.loads(sp.check_output(['lscpu','-J'],text=True)),'boot_id':Path('/proc/sys/kernel/random/boot_id').read_text().strip(),'meminfo':Path('/proc/meminfo').read_text(),'netdev':Path('/proc/net/dev').read_text(),'ip':json.loads(sp.check_output(['ip','-j','address'],text=True))}
if role=='server':
 assert not sp.check_output(['ss','-H','-ltn','sport = :6379'],text=True).strip()
 bdfs=('2401:00:00.0','221c:00:00.0','7f10:00:00.0','399c:00:00.0','c0ef:00:00.0','6319:00:00.0')
 values['storage_drivers']={v:(Path('/sys/bus/pci/devices')/v/'driver').resolve().name for v in bdfs}
 assert set(values['storage_drivers'].values())=={'vfio-pci'}
 values['free_hugepages']=int(Path('/sys/kernel/mm/hugepages/hugepages-2048kB/free_hugepages').read_text())
 assert values['free_hugepages']>=4096
(R/'host-preflight.json').write_text(json.dumps(values,indent=2)+'\n')
print(json.dumps({'role':role,'kernel':values['kernel'],'cpus':os.cpu_count(),'benchmark_idle':True}))
