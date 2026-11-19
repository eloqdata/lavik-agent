import argparse,json,pathlib
p=argparse.ArgumentParser();p.add_argument('server',type=pathlib.Path);p.add_argument('--hardware',type=pathlib.Path,required=True);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args()
hardware=json.loads(a.hardware.read_text())
identity=json.loads((a.server/'v031-v5-peer-prepare/identity.json').read_text())
for original,current in [('scratch_pci','nvme_pci'),('scratch_serial','nvme_serial'),('scratch_bytes','nvme_bytes'),('os_pci','os_nvme_pci')]:
 assert identity[original]==hardware[current],(original,identity[original],hardware[current])
launches=[]
for product in ['redis','kvrocks','dragonfly']:
 for path in sorted((a.server/product).glob('*/launch.json')):
  cmd=json.loads(path.read_text())
  assert cmd[0]=='systemd-run'
  for parameter in ['AllowedCPUs=0-3','CPUAffinity=0-3','MemoryMax=28G','MemorySwapMax=0']:assert parameter in cmd,(path,parameter)
  if product=='redis':
   for key,value in {'--io-threads':'4','--maxmemory':'24gb','--maxmemory-policy':'noeviction','--save':'','--appendonly':'no'}.items():assert cmd[cmd.index(key)+1]==value,(path,key)
  elif product=='kvrocks':
   config={}
   for line in (path.parent/'bench.conf').read_text().splitlines():
    fields=line.split()
    if len(fields)>1 and not fields[0].startswith('#'):config[fields[0]]=' '.join(fields[1:])
   assert config['workers']=='4' and config['rocksdb.block_cache_size']=='8192',path
  else:
   for parameter in ['--proactor_threads=4','--maxmemory=24gb','--cache_mode=false','--snapshot_cron=']:assert parameter in cmd,(path,parameter)
   tiered='n100000000-' in path.parent.name
   assert any(x.startswith('--tiered_prefix=') for x in cmd)==tiered,path
   if tiered:
    for parameter in ['--tiered_experimental_hash_support=true','--listpack_max_field_len=256','--listpack_max_bytes=2048']:assert parameter in cmd,(path,parameter)
  launches.append({'product':product,'dataset':path.parent.name,'command':cmd})
assert len(launches)==5,len(launches)
a.out.write_text(json.dumps({'same_nvme_identity':True,'validated_launches':len(launches),'launches':launches},indent=2)+'\n')
print(json.dumps({'same_nvme_identity':True,'validated_launches':len(launches)}))
