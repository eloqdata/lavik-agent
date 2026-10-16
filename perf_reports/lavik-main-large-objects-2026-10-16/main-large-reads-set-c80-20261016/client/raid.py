from pathlib import Path
import subprocess as sp,json,socket
import fresh
P=Path;R=fresh.R;M='/mnt/storage-peers-20261014';MD='/dev/md127'
assert not (R/'active.json').exists()
try:
 socket.create_connection(('10.84.1.4',6379),1).close();raise RuntimeError('port occupied')
except ConnectionRefusedError:pass
assert not P('/sys/class/block/md127').exists()
assert sp.run(['findmnt','-rn','-M',M],stdout=sp.DEVNULL).returncode!=0
for p in P('/proc').glob('[0-9]*/comm'):
 try:assert p.read_text().strip()!='lavik' or (p.parent/'stat').read_text().split()[2]=='Z'
 except FileNotFoundError:pass
d=R/'raid-setup';d.mkdir(exist_ok=False)
devices=json.loads((R/'spdk-devices.json').read_text());assert {v['bdf'] for v in devices}=={'2401:00:00.0','221c:00:00.0','7f10:00:00.0','399c:00:00.0','c0ef:00:00.0','6319:00:00.0'}
fresh.setup('reset',devices,d);current=fresh.inventory()
assert {(v['serial'],v['bdf']) for v in current}=={(v['serial'],v['bdf']) for v in devices}
for v in current:sp.run(['blkdiscard',v['device']],check=True)
sp.run(['mdadm','--create',MD,'--level=0','--raid-devices=6','--chunk=512','--metadata=1.2','--name=extra-collections','--force','--run',*[v['device'] for v in current]],input='y\n',text=True,check=True)
sp.run(['mkfs.xfs','-f',MD],check=True);P(M).mkdir(exist_ok=True);sp.run(['mount','-o','noatime',MD,M],check=True)
P('/sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages').write_text('0')
(R/'raid-ready.json').write_text(json.dumps({'devices':current,'raid':sp.check_output(['mdadm','--detail',MD],text=True),'mount':sp.check_output(['findmnt','-M',M],text=True)},indent=2))
