"""Read-only host/media validation for the owned eight-point ZSet crossover."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import subprocess as sp
import time

R = Path('/mnt/dev/benchmark/zset-opt-crossover-20261019')
PREVIOUS = R.parent / 'objects8k-fourdb-20261019'
MOUNT = Path('/mnt/storage-peers-20261014/objects8k-fourdb-20261019')
MD = '/dev/md127'
KERNEL = '6.17.0-1022-azure'
ALLOW = dict(zip(('2401:00:00.0', '221c:00:00.0', '7f10:00:00.0',
                  '399c:00:00.0', 'c0ef:00:00.0', '6319:00:00.0'),
                 (f'4d4fd73b0687ec77000{i}' for i in range(1, 7))))
DEVICE_BYTES = 1919850381312
RAID_UUID = '53c4d57c:6a9fb5eb:51ef76a7:ff5d5ff2'
SETUP = Path('/mnt/dev/benchmark/zset-compact-20261019/sources/main/bycorf/third_party/spdk/scripts/setup.sh')
# Authenticated from the exact dependency archive in the already verified
# source manifest. Build snapshots intentionally do not contain .git metadata.
SETUP_SHA256 = '3e79117596cfb7aa04e18bfde5ee0a1ec62c9f4d2754cd18e50a1267ed1e7047'
SPDK_REVISION = 'd519b163cbc0e2f28c35d9bc86d610da368b032c'
SPDK_ARCHIVE_SHA256 = '5f8e23ab5faecbe66aece3e748661410250c1925f35c4655781e01e3b3b91997'
PIN = {
    'main': ('684894d973878ca0e0649b54404ce77521f1695f', 'cec4ef957bd0ea87e40895539866d42399f82b9e28c4ceb174752bb3d6c977e5'),
    'candidate': ('32bdd6b474733c2850b80e3cc217461075e73af5', '8ae509e9a04d7d4c55c5aa9b966421531e26e97b4800c1c2885ea38d8b845ead')}
SEQUENCE = tuple((variant, size, op) for variant in ('main', 'candidate')
                 for size in ('compact', 'grouped') for op in ('zincr', 'zswap'))
SESSIONS = tuple('session-' + '-'.join(point) for point in SEQUENCE)
OLD_OPS = ('hgetall', 'hkeys', 'hvals', 'smembers', 'lrange', 'zrange', 'set',
           'setrange', 'hash', 'list', 'zincr', 'zswap', 'stream', 'sswap')


def save(path, value):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, indent=2) + '\n')
    tmp.replace(path)


def sha(path):
    with Path(path).open('rb') as handle:
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
    receipt = json.loads((R / 'previous-raid-ready.json').read_text())
    if receipt != json.loads((PREVIOUS / 'raid-ready.json').read_text()) or receipt['boot_id'] != boot_id():
        raise RuntimeError('Previous RAID provenance changed or host rebooted')


def listener_present():
    return bool(output(['ss', '-H', '-ltn', 'sport = :6379']))


def verify_idle():
    markers = list(R.parent.glob('*/active.json'))
    if markers or listener_present():
        raise RuntimeError('Active benchmark marker/listener: ' + repr(markers))
    for proc in Path('/proc').iterdir():
        if not proc.name.isdecimal():
            continue
        try:
            if stat(proc.name)['state'] in ('Z', 'X', 'x'):
                continue
            name = Path(os.readlink(proc / 'exe')).name
            if name in ('redis-server', 'valkey-server', 'kvrocks', 'lavik', 'memtier_benchmark') or name.startswith(('lavik-', 'bench')):
                raise RuntimeError('Live benchmark executable: ' + proc.name + ' ' + name)
        except (FileNotFoundError, ProcessLookupError):
            continue


def verified_devices():
    devices = json.loads((R / 'spdk-devices.json').read_text())
    if len(devices) != 6 or {d['bdf']: d['serial'] for d in devices} != ALLOW or any(d['bytes'] != DEVICE_BYTES for d in devices):
        raise RuntimeError('Scratch device allowlist/serial/capacity mismatch')
    return devices


def verified_variant(product):
    if product not in PIN:
        raise ValueError('Unknown binary variant')
    entry = json.loads((R / (product + '-manifest.json')).read_text())
    revision, digest = PIN[product]
    if (entry['product'], entry['revision'], entry['binary_sha256'], entry['base_revision'], entry['bycorf_revision']) != (
            product, revision, digest, PIN['main'][0], '86d686724ddd1c5617fb1b62f8131e05571e8423'):
        raise RuntimeError('Unexpected binary provenance: ' + product)
    build = Path(entry['build_root'])
    if not (build / 'BUILD_COMPLETE').is_file() or (build / 'build-failure.json').exists() or sha(entry['binary']) != digest:
        raise RuntimeError('Incomplete or changed binary build')
    for kind in ('build', 'source'):
        if sha(entry[kind + '_manifest_path']) != entry[kind + '_manifest_sha256']:
            raise RuntimeError('Changed build provenance: ' + kind)
    actual = json.loads(Path(entry['build_manifest_path']).read_text())['variants'][product]
    if (actual['revision'], actual['binary'], actual['sha256']) != (revision, entry['binary'], digest):
        raise RuntimeError('Build manifest variant mismatch')
    return entry


def protected_mounts():
    result = {}
    for target in ('/', '/mnt/dev'):
        entries = json.loads(output(['findmnt', '-J', '-M', target, '-o', 'SOURCE,TARGET,FSTYPE,MAJ:MIN,UUID']))['filesystems']
        if len(entries) != 1 or entries[0]['target'] != target or not entries[0]['source'].startswith('/dev/'):
            raise RuntimeError('Cannot identify protected mount: ' + target)
        value = entries[0]
        value['ancestor_block_names'] = output(['lsblk', '-s', '-n', '-o', 'KNAME', value['source']]).splitlines()
        result[target] = value
    return result


def not_in_use(args):
    result = sp.run(args, text=True, capture_output=True)
    if result.returncode != 1:
        raise RuntimeError('Device/filesystem has users or fuser failed: ' + repr(args) + ' ' + result.stdout + result.stderr)


def inventory(expected_holders=()):
    protected = {name for value in protected_mounts().values() for name in value['ancestor_block_names']}
    swaps = {line.split()[0] for line in Path('/proc/swaps').read_text().splitlines()[1:]}
    if any(name == str(MOUNT) or name.startswith(str(MOUNT) + '/') for name in swaps):
        raise RuntimeError('Scratch filesystem contains active swap')
    found = []
    for controller in Path('/sys/class/nvme').glob('nvme*'):
        serial = (controller / 'serial').read_text().strip()
        if serial not in ALLOW.values():
            continue
        pci = (controller / 'device').resolve()
        if ALLOW.get(pci.name) != serial or (pci / 'driver').resolve().name != 'nvme':
            raise RuntimeError('Scratch controller identity/driver changed')
        blocks = [p for p in Path('/sys/class/block').glob(controller.name + 'n*') if not (p / 'partition').exists()]
        if len(blocks) != 1:
            raise RuntimeError('Expected exactly one namespace on each scratch controller')
        block = blocks[0]
        device = '/dev/' + block.name
        if block.name in protected or device in swaps or list(block.glob(block.name + 'p*')):
            raise RuntimeError('Scratch namespace overlaps protected disk/swap or has partitions')
        if {p.name for p in (block / 'holders').iterdir()} != set(expected_holders):
            raise RuntimeError('Scratch namespace holder mismatch')
        if (block / 'nsid').read_text().strip() != '1' or int((block / 'size').read_text()) * 512 != DEVICE_BYTES:
            raise RuntimeError('Scratch namespace NSID/capacity mismatch')
        mounted = sp.run(['findmnt', '-rn', '-S', device], text=True, capture_output=True)
        if mounted.returncode != 1:
            raise RuntimeError('Member namespace mounted or findmnt failed: ' + device)
        not_in_use(['fuser', device])
        found.append({'serial': serial, 'bdf': pci.name, 'device': device, 'bytes': DEVICE_BYTES})
    if len(found) != 6 or {d['bdf']: d['serial'] for d in found} != ALLOW:
        raise RuntimeError('Incomplete scratch controller inventory')
    return sorted(found, key=lambda d: d['serial'])


def completed_old_sessions():
    receipts = {}
    for product in ('lavik', 'redis', 'valkey', 'kvrocks'):
        for op in OLD_OPS:
            label = 'session-' + product + '-' + op
            path = PREVIOUS / label / 'stop.json'
            stopped = json.loads(path.read_text())
            active = stopped['active']
            if (stopped.get('clean_stop_confirmed') is not True or stopped.get('returncode') != 0 or
                    (active['root'], active['product'], active['label']) != (str(PREVIOUS), product, label)):
                raise RuntimeError('Previous session not cleanly stopped: ' + label)
            receipts[label] = {'sha256': sha(path), 'time': stopped['time']}
    return receipts


def verify_raid():
    receipt = json.loads((R / 'previous-raid-ready.json').read_text())
    if (receipt['root'], receipt['md'], receipt['md_uuid'], receipt['mountpoint']) != (str(PREVIOUS), MD, RAID_UUID, str(MOUNT)):
        raise RuntimeError('Unexpected previous RAID receipt identity')
    devices = inventory(('md127',))
    if devices != sorted(receipt['devices'], key=lambda d: d['serial']):
        raise RuntimeError('RAID member identity differs from receipt')
    md = Path('/sys/class/block/md127')
    if (md / 'md/level').read_text().strip() != 'raid0' or (md / 'md/raid_disks').read_text().strip() != '6':
        raise RuntimeError('Unexpected RAID geometry')
    if {p.name for p in (md / 'slaves').iterdir()} != {Path(d['device']).name for d in devices} or list((md / 'holders').iterdir()):
        raise RuntimeError('Unexpected RAID members/holders')
    export = dict(line.split('=', 1) for line in output(['mdadm', '--detail', '--export', MD]).splitlines() if '=' in line)
    if export.get('MD_UUID') != RAID_UUID:
        raise RuntimeError('Live RAID UUID differs')
    mounts = json.loads(output(['findmnt', '-J', '-S', MD, '-o', 'SOURCE,TARGET,FSTYPE,OPTIONS']))['filesystems']
    if len(mounts) != 1 or mounts[0]['target'] != str(MOUNT) or mounts[0]['fstype'] != 'ext4' or 'noatime' not in mounts[0]['options'].split(','):
        raise RuntimeError('Unexpected RAID mount')
    submounts = output(['findmnt', '-rno', 'TARGET', '-R', '-M', str(MOUNT)]).splitlines()
    if submounts != [str(MOUNT)]:
        raise RuntimeError('Unexpected nested scratch mounts')
    not_in_use(['fuser', '-m', str(MOUNT)])
    not_in_use(['fuser', MD])
    return {'receipt': receipt, 'devices': devices, 'mount': mounts[0], 'md_export': export}


def verify_spdk():
    receipt = json.loads((R / 'spdk-ready.json').read_text())
    if receipt['root'] != str(R) or receipt['boot_id'] != boot_id() or receipt.get('sanitized') is not True:
        raise RuntimeError('Missing owned sanitized SPDK receipt')
    devices = verified_devices()
    if {d['bdf']: d['serial'] for d in receipt['devices']} != ALLOW:
        raise RuntimeError('SPDK receipt device identity changed')
    for bdf in ALLOW:
        if (Path('/sys/bus/pci/devices') / bdf / 'driver').resolve().name != 'vfio-pci':
            raise RuntimeError('Scratch controller is not VFIO: ' + bdf)
    if Path('/sys/class/block/md127').exists():
        raise RuntimeError('Old RAID still present')
    if protected_mounts() != receipt['protected_mounts']:
        raise RuntimeError('Protected system/developer mounts changed')
    return receipt


def preflight(mode):
    verify_host()
    verify_idle()
    verified_devices()
    variants = {product: verified_variant(product) for product in PIN}
    data = {'time': time.time(), 'root': str(R), 'boot_id': boot_id(), 'kernel': KERNEL,
            'protected_mounts': protected_mounts(), 'variants': variants, 'mode': mode,
            'meminfo': Path('/proc/meminfo').read_text(), 'previous_sessions': completed_old_sessions()}
    if mode == 'raid':
        data['raid'] = verify_raid()
        source = json.loads(Path(variants['main']['source_manifest_path']).read_text())
        dependency = [d for d in source['dependencies'] if d['path'] == 'bycorf/third_party/spdk']
        if (len(dependency) != 1 or dependency[0]['sha'] != SPDK_REVISION or
                dependency[0]['archive_sha256'] != SPDK_ARCHIVE_SHA256 or sha(SETUP) != SETUP_SHA256):
            raise RuntimeError('SPDK setup helper differs from the pinned dependency archive')
        data['setup_sha256'] = sha(SETUP)
        data['setup_source'] = {'revision': SPDK_REVISION, 'archive_sha256': SPDK_ARCHIVE_SHA256,
                                'path_in_archive': 'scripts/setup.sh', 'file_sha256': SETUP_SHA256,
                                'source_manifest_sha256': variants['main']['source_manifest_sha256']}
        unsafe = Path('/sys/module/vfio/parameters/enable_unsafe_noiommu_mode')
        data['vfio_noiommu'] = unsafe.read_text().strip() if unsafe.exists() else None
        if data['vfio_noiommu'] != 'Y' and not all((Path('/sys/bus/pci/devices') / bdf / 'iommu_group').exists() for bdf in ALLOW):
            raise RuntimeError('Existing VFIO isolation mode cannot attach these devices')
    elif mode == 'spdk':
        data['spdk'] = verify_spdk()
        data['free_hugepages'] = int(Path('/sys/kernel/mm/hugepages/hugepages-2048kB/free_hugepages').read_text())
        if data['free_hugepages'] < 4096:
            raise RuntimeError('Fewer than 8192 MiB of free hugepages')
    else:
        raise ValueError('Expected raid or spdk mode')
    return data


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('raid', 'spdk'))
    mode = parser.parse_args().mode
    data = preflight(mode)
    save(R / ('preflight-' + mode + '.json'), data)
    print(json.dumps({'verified': True, 'mode': mode, 'boot_id': data['boot_id']}))
