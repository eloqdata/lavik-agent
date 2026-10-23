import json,pathlib,subprocess,hashlib,sys
root=pathlib.Path('/opt/bench020');kind=sys.argv[1]
assert kind in ['large','small']
devices=[]
for ctrl in pathlib.Path('/sys/class/nvme').glob('nvme*'):
 if 'Direct Disk' not in (ctrl/'model').read_text():continue
 blocks=list(pathlib.Path('/sys/class/block').glob(ctrl.name+'n*'));assert len(blocks)==1
 b=blocks[0];dev='/dev/'+b.name
 assert not list(b.glob(b.name+'p*')) and not list((b/'holders').iterdir())
 assert subprocess.run(['findmnt','-rn','-S',dev],stdout=subprocess.DEVNULL).returncode!=0
 size=int((b/'size').read_text())*512
 assert size==(1919850381312 if kind=='large' else 1439887785984)
 devices.append(dict(serial=(ctrl/'serial').read_text().strip(),bdf=(ctrl/'device').resolve().name,nsid=int((b/'nsid').read_text()),bytes=size,device=dev))
assert len(devices)==(6 if kind=='large' else 1)
c=dict(kind=kind,release='v0.2.0',revision='2908f86f2770e9c6e8acc6585b3bedb4b44d1cd5',server_private='10.96.1.4' if kind=='large' else '10.96.0.4',client_private='10.96.0.5',server_cpus='0-15' if kind=='large' else '0-1',workers=16 if kind=='large' else 2,io_threads=[1,2,4,8,16] if kind=='large' else [1,2],huge_mib=8192 if kind=='large' else 2048,nvmes=devices,versions={'redis':{'version':'8.10.2'},'valkey':{'version':'9.1.2'}},lavik_binary_sha256=hashlib.file_digest((root/'downloads/lavik-v0.2.0-linux-x86_64/lavik').open('rb'),'sha256').hexdigest())
(root/'config.json').write_text(json.dumps(c,indent=2)+'\n');print(json.dumps(c,indent=2))
