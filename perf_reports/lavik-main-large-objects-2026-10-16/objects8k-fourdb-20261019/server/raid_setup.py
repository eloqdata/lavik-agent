"""One-shot rebuild of the six explicitly authorized scratch namespaces."""
from pathlib import Path
import fcntl
import json
import os
import subprocess as sp
import time
import preflight_server as common

R, MOUNT, MD = common.R, common.MOUNT, common.MD
SETUP = Path('/mnt/dev/benchmark/zset-compact-20261019/sources/main/bycorf/third_party/spdk/scripts/setup.sh')


def protected_block_names():
    # Resolve parents instead of assuming that NVMe namespace names stay stable.
    names = set()
    for target in ('/', '/mnt/dev'):
        source = common.output(['findmnt', '-n', '-o', 'SOURCE', '-T', target])
        if not source.startswith('/dev/'):
            raise RuntimeError('Cannot resolve protected mount: ' + target)
        names.update(common.output(['lsblk', '-s', '-n', '-o', 'KNAME', source]).splitlines())
    return names


def inventory():
    protected = protected_block_names()
    found = []
    swaps = {line.split()[0] for line in Path('/proc/swaps').read_text().splitlines()[1:]}
    for controller in Path('/sys/class/nvme').glob('nvme*'):
        serial = (controller / 'serial').read_text().strip()
        if serial not in common.ALLOW.values():
            continue
        pci = (controller / 'device').resolve()
        if common.ALLOW.get(pci.name) != serial or (pci / 'driver').resolve().name != 'nvme':
            raise RuntimeError('Scratch controller identity/driver mismatch')
        blocks = [p for p in Path('/sys/class/block').glob(controller.name + 'n*') if not (p / 'partition').exists()]
        if len(blocks) != 1:
            raise RuntimeError('Expected exactly one namespace per scratch controller')
        block = blocks[0]
        device = '/dev/' + block.name
        if block.name in protected or device in swaps:
            raise RuntimeError('Scratch path overlaps a protected disk/swap')
        if list(block.glob(block.name + 'p*')) or list((block / 'holders').iterdir()):
            raise RuntimeError('Scratch namespace has partitions/holders')
        if sp.run(['findmnt', '-rn', '-S', device], stdout=sp.DEVNULL).returncode == 0:
            raise RuntimeError('Scratch namespace mounted')
        if sp.run(['fuser', device], stdout=sp.DEVNULL, stderr=sp.DEVNULL).returncode == 0:
            raise RuntimeError('Scratch namespace open by another process')
        if (block / 'nsid').read_text().strip() != '1' or int((block / 'size').read_text()) * 512 != common.DEVICE_BYTES:
            raise RuntimeError('Scratch namespace ID/capacity mismatch')
        found.append({'serial': serial, 'bdf': pci.name, 'device': device, 'bytes': common.DEVICE_BYTES})
    if len(found) != 6 or {x['bdf']: x['serial'] for x in found} != common.ALLOW:
        raise RuntimeError('Expected complete six-controller scratch set')
    return sorted(found, key=lambda x: x['serial'])


def main():
    common.verify_host()
    with (R.parent / '.benchmark-control.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        common.verify_idle()
        for op in common.OPS:
            session = R / ('session-lavik-' + op)
            stopped = json.loads((session / 'stop.json').read_text())
            reset = json.loads((session / 'reset-data.json').read_text())
            if (not stopped.get('clean_checkpoint_confirmed') or
                    stopped.get('checkpoint_entries') != 8192 or
                    not reset.get('completed') or reset['active'] != stopped['active']):
                raise RuntimeError('Lavik session has not completed cleanly: ' + op)
        devices = common.verified_devices()
        preflight = json.loads((R / 'preflight-server.json').read_text())
        if preflight['root'] != str(R) or preflight['boot_id'] != common.boot_id():
            raise RuntimeError('Fresh preflight receipt missing')
        if (R / 'raid-ready.json').exists() or (R / 'raid-setup').exists():
            raise RuntimeError('Existing RAID setup attempt; inspect instead of repeating')
        if Path('/sys/class/block/md127').exists() or Path(MD).exists():
            raise RuntimeError('Existing md127 device; refusing replacement')
        if sp.run(['findmnt', '-rn', '-M', str(MOUNT)], stdout=sp.DEVNULL).returncode == 0:
            raise RuntimeError('Task mount already occupied')
        if MOUNT.exists() and any(MOUNT.iterdir()):
            raise RuntimeError('Task mount directory is not empty')
        protected_before = protected_block_names()
        for bdf in common.ALLOW:
            if (Path('/sys/bus/pci/devices') / bdf / 'driver').resolve().name != 'vfio-pci':
                raise RuntimeError('All scratch controllers must start bound to VFIO')
        directory = R / 'raid-setup'
        directory.mkdir(exist_ok=False)
        common.save(directory / 'intent.json', {'time': time.time(), 'devices': devices,
                     'protected_block_names': sorted(protected_before), 'setup_sha256': common.sha(SETUP)})
        env = dict(os.environ, PCI_ALLOWED=' '.join(common.ALLOW), DRIVER_OVERRIDE='vfio-pci', TARGET_USER='azureuser')
        with (directory / 'driver-reset.log').open('w') as log:
            sp.run([str(SETUP), 'reset'], env=env, stdout=log, stderr=sp.STDOUT, check=True, timeout=120)
        sp.run(['udevadm', 'settle', '--timeout=60'], check=True)
        current = inventory()
        if protected_block_names() != protected_before:
            raise RuntimeError('Protected device ancestry changed during driver reset')
        common.save(directory / 'verified-devices.json', current)
        # Every destructive operation below uses the already verified device set.
        with (directory / 'commands.log').open('w') as log:
            for device in current:
                sp.run(['blkdiscard', device['device']], check=True, stdout=log, stderr=sp.STDOUT)
            sp.run(['mdadm', '--create', MD, '--level=0', '--raid-devices=6',
                    '--chunk=512', '--metadata=1.2', '--name=objects8k-fourdb', '--run',
                    *[x['device'] for x in current]], input='y\n', text=True,
                   check=True, stdout=log, stderr=sp.STDOUT)
            # SST/database files need far fewer inodes than the default 16 KiB
            # density on this 11.5 TB array. Initialize metadata now so lazy
            # inode/journal initialization cannot perturb formal measurements.
            sp.run(['mkfs.ext4', '-T', 'largefile4', '-m', '0', '-E',
                    'lazy_itable_init=0,lazy_journal_init=0', MD],
                   check=True, stdout=log, stderr=sp.STDOUT)
            MOUNT.mkdir(parents=True, exist_ok=True)
            sp.run(['mount', '-o', 'noatime', MD, str(MOUNT)], check=True, stdout=log, stderr=sp.STDOUT)
        export = dict(line.split('=', 1) for line in common.output(['mdadm', '--detail', '--export', MD]).splitlines() if '=' in line)
        if not export.get('MD_UUID'):
            raise RuntimeError('New RAID UUID missing')
        receipt = {'root': str(R), 'boot_id': common.boot_id(), 'time': time.time(),
                   'devices': current, 'md': MD, 'md_uuid': export['MD_UUID'], 'mountpoint': str(MOUNT),
                   'mount': common.mount_info(), 'detail': common.output(['mdadm', '--detail', MD]),
                   'previous_hugepages': Path('/sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages').read_text().strip()}
        # SPDK no longer runs. Return its reserved RAM to peer databases.
        Path('/sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages').write_text('0')
        common.save(R / 'raid-ready.json', receipt)
        common.verify_raid()
        print(json.dumps({'raid_ready': True, 'md_uuid': receipt['md_uuid'], 'mountpoint': str(MOUNT)}))


if __name__ == '__main__':
    main()
