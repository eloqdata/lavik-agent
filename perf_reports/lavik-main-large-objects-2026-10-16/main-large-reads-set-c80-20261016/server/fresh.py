import json,os,pathlib,subprocess,time,socket
P=pathlib.Path
R=P('/mnt/dev/benchmark/main-large-reads-set-c80-20261016')
SETUP='/mnt/dev/benchmark/pr347-set1m-20261015/sources/pr/bycorf/third_party/spdk/scripts/setup.sh'
def inventory():
    found=[]
    expected={f'4d4fd73b0687ec77000{i}' for i in range(1,7)}
    for ctrl in P('/sys/class/nvme').glob('nvme*'):
        serial=(ctrl/'serial').read_text().strip()
        if serial not in expected: continue
        pci=(ctrl/'device').resolve()
        blocks=list(P('/sys/class/block').glob(ctrl.name+'n*'))
        assert len(blocks)==1,(ctrl,blocks)
        block=blocks[0]; dev='/dev/'+block.name
        assert not list(block.glob(block.name+'p*'))
        assert not list((block/'holders').iterdir())
        assert subprocess.run(['findmnt','-rn','-S',dev],stdout=subprocess.DEVNULL).returncode!=0
        deadline=time.monotonic()+60
        while subprocess.run(['fuser',dev],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0:
            if time.monotonic()>deadline: raise RuntimeError('Device busy: '+dev)
            time.sleep(.5)
        assert (block/'nsid').read_text().strip()=='1'
        assert (pci/'driver').resolve().name=='nvme'
        found.append({'serial':serial,'bdf':pci.name,'device':dev,'bytes':int((block/'size').read_text())*512})
    assert {d['serial'] for d in found}==expected
    assert len(found)==6 and all(d['bytes']==1919850381312 for d in found)
    return sorted(found,key=lambda d:d['serial'])

def setup(mode,devices,directory):
    env=dict(os.environ,PCI_ALLOWED=' '.join(d['bdf'] for d in devices),DRIVER_OVERRIDE='vfio-pci',HUGEMEM='8192',TARGET_USER='azureuser')
    with (directory/('driver-'+mode+'.log')).open('a') as f:
        subprocess.run([SETUP,mode],env=env,stdout=f,stderr=subprocess.STDOUT,check=True)
    for d in devices:
        assert (P('/sys/bus/pci/devices')/d['bdf']/'driver').resolve().name==('vfio-pci' if mode=='config' else 'nvme')


def main(label):
    assert not (R/'active.json').exists()
    try:
        socket.create_connection(('10.84.1.4',6379),1).close()
        raise RuntimeError('Benchmark port occupied')
    except ConnectionRefusedError:pass
    # Never reset VFIO while any Lavik instance is alive, even on another port.
    for p in P('/proc').glob('[0-9]*/comm'):
        try:assert p.read_text().strip()!='lavik' or (p.parent/'stat').read_text().split()[2]=='Z',str(p)
        except FileNotFoundError:pass
    directory=R/('fresh-'+label);directory.mkdir(exist_ok=False)
    devices=json.loads((R/'spdk-devices.json').read_text())
    assert {d['bdf'] for d in devices}=={'2401:00:00.0','221c:00:00.0','7f10:00:00.0','399c:00:00.0','c0ef:00:00.0','6319:00:00.0'}
    setup('reset',devices,directory)
    current=inventory()
    assert {(d['serial'],d['bdf']) for d in current}=={(d['serial'],d['bdf']) for d in devices}
    (directory/'verified-devices.json').write_text(json.dumps(current,indent=2))
    for d in current:subprocess.run(['blkdiscard',d['device']],check=True)
    setup('config',current,directory)
    (R/'spdk-devices.json').write_text(json.dumps(current,indent=2))
    print('Fresh six-device SPDK storage ready',flush=True)
