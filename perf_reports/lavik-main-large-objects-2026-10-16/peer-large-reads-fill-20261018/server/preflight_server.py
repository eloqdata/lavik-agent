"""Read-only checks shared by the peer controller and scratch RAID setup."""
from pathlib import Path
import hashlib
import json
import os
import subprocess as sp
import time

R = Path('/mnt/dev/benchmark/peer-large-reads-fill-20261018')
MOUNT = Path('/mnt/peer-large-reads-fill-20261018')
MD = '/dev/md127'
KERNEL = '6.17.0-1022-azure'
ALLOW = dict(zip(
    ('2401:00:00.0', '221c:00:00.0', '7f10:00:00.0',
     '399c:00:00.0', 'c0ef:00:00.0', '6319:00:00.0'),
    (f'4d4fd73b0687ec77000{i}' for i in range(1, 7))))
DEVICE_BYTES = 1919850381312
PEERS = {
    'redis': ('8.10.2', '/mnt/dev/benchmark/release010-latest/downloads/redis/src/redis-server',
              '34d31ea3bd53b35f4fc4c587742174a2b2f79f92f9514e15a6d83726e3b9ce18'),
    'valkey': ('9.1.2', '/mnt/dev/benchmark/release010-latest/downloads/valkey/src/valkey-server',
               'f33bbe718e212dd4f1adbfb7d1783dd0262c0d34546459c1a3cfc33651d4b946'),
    'kvrocks': ('2.17.0', '/mnt/dev/benchmark/storage-peers-20261014/sources/kvrocks/build/kvrocks',
                '7a3a70738951934540ca5e48d1405899641c7163d6ce282ff48f3e0c2b013d58'),
}
TEMPLATE = Path('/mnt/dev/benchmark/storage-peers-20261014/configs/kvrocks.conf')


def save(path, value):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, indent=2) + '\n')
    tmp.replace(path)


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def output(args):
    return sp.check_output(args, text=True, timeout=60).strip()


def boot_id():
    return Path('/proc/sys/kernel/random/boot_id').read_text().strip()


def stat(pid):
    raw = Path(f'/proc/{pid}/stat').read_text()
    fields = raw[raw.rfind(')') + 1:].split()
    return {'state': fields[0], 'start_ticks': fields[19]}


def verify_host():
    if os.geteuid() != 0 or Path(__file__).resolve().parent != R:
        raise RuntimeError('Use root and the exact experiment directory')
    if os.uname().release != KERNEL or os.cpu_count() != 16:
        raise RuntimeError('Unexpected kernel or CPU count')
    previous = json.loads((R.parent / 'main-large-objects-20261018-0938' /
                           'host-preflight.json').read_text())
    if previous['boot_id'] != boot_id():
        raise RuntimeError('Host rebooted since verified scratch inventory')


def listener_present():
    return bool(output(['ss', '-H', '-ltn', 'sport = :6379']))


def verify_idle():
    markers = list(R.parent.glob('*/active.json'))
    if markers or listener_present():
        raise RuntimeError('Active benchmark marker or listener: ' + repr(markers))
    for proc in Path('/proc').iterdir():
        if not proc.name.isdecimal():
            continue
        try:
            state = stat(proc.name)
            if state['state'] in ('Z', 'X', 'x'):
                continue
            name = Path(os.readlink(proc / 'exe')).name
            if (name in ('redis-server', 'valkey-server', 'kvrocks', 'lavik') or
                    name.startswith(('lavik-', 'bench'))):
                raise RuntimeError(f'Live benchmark executable: {proc.name} {name}')
        except (FileNotFoundError, ProcessLookupError):
            continue


def verified_manifest():
    manifest = json.loads((R / 'peer-manifest.json').read_text())
    if set(manifest['variants']) != set(PEERS):
        raise RuntimeError('Unexpected peer manifest variants')
    for product, (version, binary, digest) in PEERS.items():
        entry = manifest['variants'][product]
        if (entry['version'], entry['binary'], entry['sha256']) != (version, binary, digest):
            raise RuntimeError('Peer manifest identity mismatch: ' + product)
        if sha(binary) != digest:
            raise RuntimeError('Peer binary SHA mismatch: ' + product)
        if version not in entry['version_output']:
            raise RuntimeError('Peer version output mismatch: ' + product)
    if sha(TEMPLATE) != manifest['kvrocks_config_sha256']:
        raise RuntimeError('Kvrocks template differs from pinned peer manifest')
    return manifest


def verified_devices():
    devices = json.loads((R / 'spdk-devices.json').read_text())
    if len(devices) != 6 or {x['bdf']: x['serial'] for x in devices} != ALLOW:
        raise RuntimeError('Scratch allowlist/serial mismatch')
    if any(x['bytes'] != DEVICE_BYTES for x in devices):
        raise RuntimeError('Scratch capacity mismatch')
    return devices


def mount_info():
    result = sp.run(['findmnt', '-J', '-M', str(MOUNT), '-o',
                     'SOURCE,TARGET,FSTYPE,OPTIONS'], text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError('Task RAID mount missing')
    entries = json.loads(result.stdout)['filesystems']
    if len(entries) != 1:
        raise RuntimeError('Ambiguous task mount')
    entry = entries[0]
    if (entry['target'] != str(MOUNT) or entry['fstype'] != 'xfs' or
            'noatime' not in entry['options'].split(',') or
            not os.path.samefile(entry['source'], MD)):
        raise RuntimeError('Unexpected task filesystem')
    return entry


def verify_raid():
    receipt = json.loads((R / 'raid-ready.json').read_text())
    if receipt['root'] != str(R) or receipt['boot_id'] != boot_id():
        raise RuntimeError('RAID receipt does not belong to this run/boot')
    if receipt['md'] != MD or receipt['mountpoint'] != str(MOUNT):
        raise RuntimeError('RAID receipt path mismatch')
    devices = verified_devices()
    if {x['bdf']: x['serial'] for x in receipt['devices']} != ALLOW:
        raise RuntimeError('RAID receipt device mismatch')
    if any(x['bytes'] != DEVICE_BYTES for x in receipt['devices']):
        raise RuntimeError('RAID receipt capacity mismatch')
    md = Path('/sys/class/block/md127')
    if ((md / 'md/level').read_text().strip() != 'raid0' or
            (md / 'md/raid_disks').read_text().strip() != '6'):
        raise RuntimeError('RAID geometry mismatch')
    slaves = {p.name for p in (md / 'slaves').iterdir()}
    if slaves != {Path(x['device']).name for x in receipt['devices']}:
        raise RuntimeError('RAID members changed')
    for device in receipt['devices']:
        block = Path('/sys/class/block') / Path(device['device']).name
        controller = block.resolve().parent
        if ((controller / 'serial').read_text().strip() != device['serial'] or
                (controller / 'device').resolve().name != device['bdf'] or
                int((block / 'size').read_text()) * 512 != DEVICE_BYTES):
            raise RuntimeError('RAID live member identity changed')
    export = dict(line.split('=', 1) for line in output(['mdadm', '--detail', '--export', MD]).splitlines() if '=' in line)
    if export.get('MD_UUID') != receipt['md_uuid']:
        raise RuntimeError('RAID UUID changed')
    return {'receipt': receipt, 'mount': mount_info()}


def main():
    verify_host()
    verify_idle()
    devices = verified_devices()
    verified_manifest()
    data = {'time': time.time(), 'root': str(R), 'boot_id': boot_id(),
            'kernel': os.uname().release, 'devices': devices,
            'drivers': {bdf: (Path('/sys/bus/pci/devices') / bdf / 'driver').resolve().name for bdf in ALLOW},
            'lsblk': json.loads(output(['lsblk', '-J', '-b', '-o', 'NAME,PATH,SIZE,MODEL,SERIAL,FSTYPE,MOUNTPOINTS'])),
            'mounts': output(['findmnt', '-rn']), 'meminfo': Path('/proc/meminfo').read_text(),
            'peer_manifest_sha256': sha(R / 'peer-manifest.json'),
            'kvrocks_template_sha256': sha(TEMPLATE)}
    if set(data['drivers'].values()) != {'vfio-pci'}:
        raise RuntimeError('Initial scratch controllers must all be VFIO')
    save(R / 'preflight-server.json', data)
    print(json.dumps({'idle': True, 'drivers': data['drivers'], 'boot_id': data['boot_id']}))


if __name__ == '__main__':
    main()
