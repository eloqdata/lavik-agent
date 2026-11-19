"""Read device identity; never modify or unmount a disk."""
import argparse,pathlib,subprocess,json,re
p=argparse.ArgumentParser();p.add_argument('--device',required=True);p.add_argument('--os-device',required=True);p.add_argument('--out',default='/opt/bench/new-host-identity/identity.json');a=p.parse_args()
def inspect(dev):
 assert re.fullmatch(r'/dev/nvme\d+n\d+',dev),dev
 ctl=pathlib.Path(dev).name.rsplit('n',1)[0];sys=pathlib.Path('/sys/class/nvme')/ctl
 return {'device':dev,'pci':(sys/'device').resolve().name,'serial':(sys/'serial').read_text().strip(),'bytes':int(subprocess.check_output(['blockdev','--getsize64',dev]))}
scratch,osdisk=inspect(a.device),inspect(a.os_device)
assert scratch['pci']!=osdisk['pci'] and scratch['bytes']>=2*1024**4+1024**3
source=subprocess.check_output(['findmnt','-n','-o','SOURCE','/'],text=True).strip()
ancestors=subprocess.check_output(['lsblk','-s','-nr','-o','PATH',source],text=True).splitlines()
assert a.os_device in ancestors and a.device not in ancestors
info=json.loads(subprocess.check_output(['lsblk','-J','-o','NAME,MOUNTPOINTS',a.device]))['blockdevices'][0]
assert not info.get('children') and not any(info.get('mountpoints',[]))
out=pathlib.Path(a.out);out.parent.mkdir(parents=True,exist_ok=True);assert not out.exists(),out
identity={**{'scratch_'+k:v for k,v in scratch.items()},**{'os_'+k:v for k,v in osdisk.items()}}
out.write_text(json.dumps(identity,indent=2)+'\n');print(json.dumps(identity,indent=2))
