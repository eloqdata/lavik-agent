import pathlib, subprocess, json, time, hashlib

base=pathlib.Path('/opt/bench')
approval=json.loads((base/'v031-v5-peer-preparation.json').read_text())
assert approval.get('lavik_archives_downloaded_and_verified') is True or approval.get('lavik_archives_verified_on_both_hosts') is True
archive=base/'v031-v5-server-evidence.tgz'
assert hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()==approval['server_evidence_sha256']
assert hashlib.file_digest((base/'v031-v5-client-evidence.tgz').open('rb'),'sha256').hexdigest()==approval['client_evidence_sha256']
identity=json.loads((base/'new-host-identity/identity.json').read_text())
pci=identity['scratch_pci'];os_pci=identity['os_pci'];assert pci!=os_pci
out=base/'v031-v5-peer-prepare';out.mkdir(exist_ok=False)
def run(cmd):
 r=subprocess.run(cmd,capture_output=True,text=True)
 with (out/'commands.jsonl').open('a') as f:f.write(json.dumps({'cmd':cmd,'epoch':time.time(),'code':r.returncode,'stdout':r.stdout,'stderr':r.stderr})+'\n')
 assert r.returncode==0,(cmd,r.stderr)
 return r.stdout
for product in ['lavik','redis','kvrocks','dragonfly']:
 assert subprocess.run(['systemctl','is-active','--quiet','bench-db-'+product]).returncode!=0
assert pathlib.Path('/sys/bus/pci/devices/'+os_pci+'/driver').resolve().name=='nvme'
run(['env','PCI_ALLOWED='+pci,'PCI_BLOCKED='+os_pci,'DRIVER_OVERRIDE=vfio-pci',str(base/'probe-kit/scripts/setup.sh'),'reset'])
assert pathlib.Path('/sys/bus/pci/devices/'+pci+'/driver').resolve().name=='nvme'
controllers=[p for p in pathlib.Path('/sys/class/nvme').glob('nvme*') if (p/'device').resolve().name==pci]
assert len(controllers)==1
ctl=controllers[0];assert (ctl/'serial').read_text().strip()==identity['scratch_serial']
dev='/dev/'+ctl.name+'n1'
assert int(run(['blockdev','--getsize64',dev]))==identity['scratch_bytes']
assert subprocess.run(['findmnt','-rn','-S',dev],capture_output=True).returncode!=0
assert not json.loads(run(['lsblk','-J','-o','NAME,MOUNTPOINTS',dev]))['blockdevices'][0].get('children')
# The complete Lavik evidence is preserved before reusing its disposable namespace.
run(['blkdiscard','--force',dev])
run(['mkfs.ext4','-F','-E','lazy_itable_init=0,lazy_journal_init=0','-L','BENCH_SCRATCH',dev])
run(['mkdir','-p','/mnt/bench']);run(['mount',dev,'/mnt/bench']);run(['chown','bench:bench','/mnt/bench'])
previous=json.loads((base/'v031-v5-vfio-before.json').read_text())['previous']
pathlib.Path('/sys/module/vfio/parameters/enable_unsafe_noiommu_mode').write_text('1\n' if previous=='Y' else '0\n')
pathlib.Path('/sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages').write_text('0\n')
run(['swapoff','-a']);run(['lsblk','-b','-o','NAME,SIZE,MODEL,SERIAL,MOUNTPOINTS'])
run(['findmnt','-M','/mnt/bench'])
for product,path in [('redis','bin/redis-server'),('kvrocks','bin/kvrocks'),('dragonfly','dragonfly-release/dragonfly-x86_64')]:
 run([str(base/path),'--version'])
 dependencies=run(['ldd',str(base/path)]);assert 'not found' not in dependencies
hashes={p:hashlib.file_digest((base/p).open('rb'),'sha256').hexdigest() for p in ['bin/redis-server','bin/kvrocks','dragonfly-release/dragonfly-x86_64']}
(out/'binary-sha256.json').write_text(json.dumps(hashes,indent=2)+'\n')
(out/'identity.json').write_text(json.dumps(identity,indent=2)+'\n')
run(['chown','-R','bench:bench',str(out)])
print('Prepared native peers on the same verified NVMe allocation',flush=True)
