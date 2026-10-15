import pathlib,subprocess as sp,os,json,sys,time
P=pathlib.Path;R=P('/mnt/dev/benchmark/large-objects-20261014');M='/mnt/storage-peers-20261014';MD='/dev/md127'
SERIALS={f'4d4fd73b0687ec77000{i}' for i in range(1,7)}
SETUP='/mnt/dev/benchmark/pr318/main/bycorf/third_party/spdk/scripts/setup.sh'
def run(a,**kw):return sp.run(list(map(str,a)),check=True,**kw)
def out(a):return sp.check_output(list(map(str,a)),text=True).strip()
def save(n,d):(R/n).write_text(json.dumps(d,indent=2)+'\n')
def inventory():
 v=[]
 for ctrl in P('/sys/class/nvme').glob('nvme*'):
  serial=(ctrl/'serial').read_text().strip()
  if serial not in SERIALS:continue
  blocks=list(P('/sys/class/block').glob(ctrl.name+'n*'));assert len(blocks)==1
  b=blocks[0];assert not list(b.glob(b.name+'p*'))
  v.append({'serial':serial,'bdf':(ctrl/'device').resolve().name,'device':'/dev/'+b.name,'bytes':int((b/'size').read_text())*512})
 assert len(v)==6 and {x['serial'] for x in v}==SERIALS and all(x['bytes']==1919850381312 for x in v)
 return sorted(v,key=lambda x:x['serial'])
def bind(mode,devs):
 env=dict(os.environ,PCI_ALLOWED=' '.join(x['bdf'] for x in devs),DRIVER_OVERRIDE='vfio-pci',HUGEMEM='8192',TARGET_USER='azureuser')
 with (R/('spdk-'+mode+'.log')).open('a') as f:run([SETUP,mode],env=env,stdout=f,stderr=sp.STDOUT)
 for x in devs:assert (P('/sys/bus/pci/devices')/x['bdf']/'driver').resolve().name==('vfio-pci' if mode=='config' else 'nvme')
def to_spdk():
 assert not (R/'active.json').exists()
 devices=inventory();save('spdk-devices.json',devices)
 assert out(['findmnt','-rn','-o','SOURCE','--target',M])==MD
 members={p.name for p in P('/sys/class/block/md127/slaves').iterdir()}
 assert members=={P(x['device']).name for x in devices}
 for x in devices:assert {p.name for p in (P('/sys/class/block')/P(x['device']).name/'holders').iterdir()}=={'md127'}
 save('pre-spdk.json',{'lsblk':out(['lsblk','-J','-o','NAME,SIZE,SERIAL,MOUNTPOINTS']),'raid':out(['mdadm','--detail',MD]),'hugepages':P('/sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages').read_text()})
 run(['umount',M]);run(['mdadm','--stop',MD])
 for x in devices:
  assert not list((P('/sys/class/block')/P(x['device']).name/'holders').iterdir())
  assert sp.run(['findmnt','-rn','-S',x['device']],stdout=sp.DEVNULL).returncode!=0
  run(['mdadm','--zero-superblock',x['device']]);run(['blkdiscard',x['device']])
 run(['modprobe','vfio-pci']);P('/sys/module/vfio/parameters/enable_unsafe_noiommu_mode').write_text('1');bind('config',devices)
 (R/'SPDK_READY').write_text(str(time.time()))
def to_raid():
 assert not (R/'active.json').exists()
 devices=json.loads((R/'spdk-devices.json').read_text());bind('reset',devices);devices=inventory()
 for x in devices:
  assert not list((P('/sys/class/block')/P(x['device']).name/'holders').iterdir())
  run(['blkdiscard',x['device']])
 run(['mdadm','--create',MD,'--level=0','--raid-devices=6','--chunk=512','--metadata=1.2','--name=large-objects-20261014','--force','--run',*[x['device'] for x in devices]],input='y\n',text=True)
 run(['mkfs.xfs','-f',MD]);run(['mount','-o','noatime',MD,M]);P('/sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages').write_text('0')
 save('raid-restored.json',{'devices':devices,'raid':out(['mdadm','--detail',MD]),'mount':out(['findmnt',M])})
 (R/'RAID_READY').write_text(str(time.time()))
if __name__=='__main__':
 assert os.geteuid()==0
 if sys.argv[1]=='spdk':to_spdk()
 elif sys.argv[1]=='raid':to_raid()
