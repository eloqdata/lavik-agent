#!/usr/bin/env python3
"""Revalidate a serial/BDF/size allowlist before clearing dedicated test NVMe."""
import os,pathlib,resource,subprocess as sp,time
import runner as b
P=pathlib.Path
SETUP='/opt/bench020/downloads/spdk/scripts/setup.sh'
def inventory():
    approved={d['serial']:d for d in b.C['nvmes']};found=[]
    for ctrl in P('/sys/class/nvme').glob('nvme*'):
        serial=(ctrl/'serial').read_text().strip()
        if serial not in approved:continue
        a=approved[serial];pci=(ctrl/'device').resolve()
        blocks=list(P('/sys/class/block').glob(ctrl.name+'n*'));assert len(blocks)==1
        block=blocks[0];dev='/dev/'+block.name
        assert pci.name==a['bdf'] and 'Direct Disk' in (ctrl/'model').read_text()
        assert not list(block.glob(block.name+'p*')) and not list((block/'holders').iterdir())
        assert sp.run(['findmnt','-rn','-S',dev],stdout=sp.DEVNULL).returncode!=0
        deadline=time.monotonic()+60
        while sp.run(['fuser',dev],stdout=sp.DEVNULL,stderr=sp.DEVNULL).returncode==0:
            if time.monotonic()>deadline:raise RuntimeError('Device busy: '+dev)
            time.sleep(.5)
        assert dev not in b.out(['swapon','--noheadings','--show=NAME']).splitlines()
        assert (block/'nsid').read_text().strip()==str(a['nsid'])
        assert (pci/'driver').resolve().name=='nvme'
        size=int((block/'size').read_text())*512;assert size==a['bytes']
        found.append(dict(a,device=dev))
    assert len(found)==len(approved) and {d['serial'] for d in found}==set(approved)
    return sorted(found,key=lambda d:d['serial'])
def setup(mode,devices,directory):
    env=dict(os.environ,PCI_ALLOWED=' '.join(d['bdf'] for d in devices),DRIVER_OVERRIDE='vfio-pci',HUGEMEM=str(b.C['huge_mib']),TARGET_USER='azureuser')
    with (directory/('driver-'+mode+'.log')).open('a') as f:sp.run([SETUP,mode],env=env,stdout=f,stderr=sp.STDOUT,check=True)
    for d in devices:assert (P('/sys/bus/pci/devices')/d['bdf']/'driver').resolve().name==('vfio-pci' if mode=='config' else 'nvme')
def main(keys,label):
    resource.setrlimit(resource.RLIMIT_MEMLOCK,(resource.RLIM_INFINITY,resource.RLIM_INFINITY))
    directory=b.R/('storage' if keys==10**9 else 'memory')/label
    if (directory/'COMPLETE').exists():return
    directory.mkdir(parents=True,exist_ok=False)
    assert not (b.R/'active-server.json').exists()
    devices=inventory();b.write(directory/'devices-before.json',devices)
    huge=P('/sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages');sp.run(['modprobe','vfio-pci'],check=True)
    unsafe=P('/sys/module/vfio/parameters/enable_unsafe_noiommu_mode')
    saved={'hugepages':huge.read_text().strip(),'vfio_noiommu':unsafe.read_text().strip()};b.write(directory/'host-state-before.json',saved)
    b.event('clearing verified disposable namespaces for '+label)
    for d in devices:sp.run(['blkdiscard',d['device']],check=True)
    try:
        if not list(P('/sys/kernel/iommu_groups').glob('*')):unsafe.write_text('1')
        setup('config',devices,directory)
        # Defaults are inherited from the pinned v0.2.0 package. Match the
        # historical override: no daily sweep, completion cap 16, defrag enabled.
        args=[b.LAVIK,'--storage=spdk','--bind='+b.S,'--tomb-raider-interval-ms=0','--spdk-max-completions-per-poll=16','--log-dir='+str(directory/'logs')]+['--data-file=spdk://'+d['bdf']+'/'+str(d['nsid']) for d in devices]
        if keys==10**9:args+=['--shutdown-checkpoint']
        env=dict(os.environ,BYCORF_EAL_ARGS=' '.join('-a '+d['bdf'] for d in devices),BYCORF_DPDK_MEMORY_MB=str(b.C['huge_mib']))
        b.write(directory/'eal-environment.json',{k:v for k,v in env.items() if k.startswith('BYCORF_')})
        with b.server(args,directory,env=env) as pid:
            assert b.cli('DBSIZE')=='0'
            b.write(directory/'defrag-runtime-config.json',b.verify_defrag())
            assert b.cli('CONFIG','GET','spdk-max-completions-per-poll').splitlines()==['spdk-max-completions-per-poll','16']
            b.memtier(directory,'fill',keys,'fill',160 if b.C['kind']=='small' else 640,pid=pid)
            b.write(directory/'validation-before.json',b.validate(keys))
            if keys!=10**9:b.memtier(directory,'warmup',keys,'GET',seconds=10,pid=pid)
            b.sweep(directory,keys,60 if keys==10**9 else 30,pid)
    finally:
        if not (b.R/'active-server.json').exists():
            setup('reset',devices,directory);b.write(directory/'devices-after.json',inventory())
            huge.write_text(saved['hugepages']);unsafe.write_text('1' if saved['vfio_noiommu']=='Y' else '0')
            b.write(directory/'host-state-after.json',{'hugepages':huge.read_text().strip(),'vfio_noiommu':unsafe.read_text().strip()})
    (directory/'COMPLETE').write_text(str(time.time())+'\n');b.event('COMPLETE '+label)
