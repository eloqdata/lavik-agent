"""Read-only host/source/checkpoint validation for the Lavik-only compact stack."""
from pathlib import Path
import hashlib
import json
import os
import subprocess as sp
import time

R = Path('/mnt/dev/benchmark/compact-pr357-stack-20261019')
PREVIOUS = R.parent / 'zset-opt-crossover-20261019'
KERNEL = '6.17.0-1022-azure'
STACK_REVISION = 'd0084f4a9a869e38ab91ecef6291a89483940123'
BYCORF_REVISION = '86d686724ddd1c5617fb1b62f8131e05571e8423'
ALLOW = dict(zip(('2401:00:00.0', '221c:00:00.0', '7f10:00:00.0',
                  '399c:00:00.0', 'c0ef:00:00.0', '6319:00:00.0'),
                 (f'4d4fd73b0687ec77000{i}' for i in range(1, 7))))
DEVICE_BYTES = 1919850381312
OPS = ('hgetall', 'hkeys', 'hvals', 'smembers', 'lrange', 'zrange', 'set',
       'setrange', 'hash', 'list', 'zincr', 'zswap', 'stream', 'sswap')
SESSIONS = tuple('session-lavik-' + op for op in OPS)
ORIGIN_SPDK_SHA256 = '84e72f2ed542bed0a8ac8b0956ada8a2d9e05b8b4b638b454f1f8fbd9df96b3e'


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


def origin_stop():
    manifest = json.loads((R / 'initial-recovery.json').read_text())
    path = PREVIOUS / 'session-candidate-grouped-zswap/stop.json'
    if (manifest['experiment'] != R.name or manifest['source_experiment'] != PREVIOUS.name
            or manifest['source_stop_path'] != str(path) or manifest['origin_stop'] != 'origin-stop.json'
            or manifest['checkpoint_generation'] != 8 or manifest['checkpoint_entries'] != 16384
            or manifest['disk_reprovisioned'] is not False):
        raise RuntimeError('Initial recovery manifest differs from the authorized origin')
    if sha(path) != manifest['source_stop_sha256'] or sha(R / 'origin-stop.json') != manifest['source_stop_sha256']:
        raise RuntimeError('Original stop receipt changed')
    stopped = json.loads(path.read_text())
    if (stopped.get('clean_stop_confirmed') is not True or stopped.get('clean_checkpoint_confirmed') is not True
            or stopped.get('returncode') != 0 or stopped['checkpoint_generation'] != 8
            or stopped['checkpoint_entries'] != 16384 or stopped['active']['root'] != str(PREVIOUS)
            or stopped['active']['label'] != 'session-candidate-grouped-zswap'):
        raise RuntimeError('Origin is not the exact clean checkpoint 8 / 16384 keys')
    return stopped


def verify_host():
    if os.geteuid() != 0 or Path(__file__).resolve().parent != R:
        raise RuntimeError('Use root and the exact experiment directory')
    if os.uname().release != KERNEL or os.cpu_count() != 16:
        raise RuntimeError('Unexpected kernel or CPU count')
    receipt = json.loads((PREVIOUS / 'spdk-ready.json').read_text())
    if sha(PREVIOUS / 'spdk-ready.json') != ORIGIN_SPDK_SHA256 or receipt['boot_id'] != boot_id():
        raise RuntimeError('Original SPDK identity changed or host rebooted')
    origin_stop()


def verified_variant(product):
    if product != 'lavik':
        raise ValueError('This experiment permits only Lavik')
    entry = json.loads((R / 'stack-manifest.json').read_text())
    if (entry['product'] != 'lavik' or entry['revision'] != STACK_REVISION
            or entry['bycorf_revision'] != BYCORF_REVISION):
        raise RuntimeError('Unexpected stacked source/dependency identity')
    build = Path(entry['build_root'])
    if not (build / 'BUILD_COMPLETE').is_file() or (build / 'build-failure.json').exists():
        raise RuntimeError('Stack build is incomplete or failed')
    if sha(entry['binary']) != entry['binary_sha256']:
        raise RuntimeError('Stack binary changed')
    for kind in ('build', 'source'):
        if sha(entry[kind + '_manifest_path']) != entry[kind + '_manifest_sha256']:
            raise RuntimeError('Stack provenance changed: ' + kind)
    key = entry.get('build_variant', 'candidate')
    actual = json.loads(Path(entry['build_manifest_path']).read_text())['variants'][key]
    if (actual['revision'], actual['binary'], actual['sha256']) != (entry['revision'], entry['binary'], entry['binary_sha256']):
        raise RuntimeError('Stack build manifest does not match binary identity')
    source = json.loads(Path(entry['source_manifest_path']).read_text())['variants'][key]
    if source['revision'] != STACK_REVISION:
        raise RuntimeError('Stack source manifest revision differs')
    return entry


def verify_spdk():
    path = PREVIOUS / 'spdk-ready.json'
    if sha(path) != ORIGIN_SPDK_SHA256:
        raise RuntimeError('Origin SPDK receipt changed')
    receipt = json.loads(path.read_text())
    if receipt['root'] != str(PREVIOUS) or receipt['boot_id'] != boot_id() or receipt.get('sanitized') is not True:
        raise RuntimeError('Wrong SPDK origin or host rebooted')
    verified_devices()
    if {d['bdf']: d['serial'] for d in receipt['devices']} != ALLOW:
        raise RuntimeError('SPDK device identities changed')
    for bdf in ALLOW:
        if (Path('/sys/bus/pci/devices') / bdf / 'driver').resolve().name != 'vfio-pci':
            raise RuntimeError('Scratch controller is not VFIO: ' + bdf)
    if Path('/sys/class/block/md127').exists():
        raise RuntimeError('Unexpected RAID device still present')
    if protected_mounts() != receipt['protected_mounts']:
        raise RuntimeError('Protected system/developer mounts changed')
    return receipt


def preflight():
    verify_host()
    verify_idle()
    variant = verified_variant('lavik')
    media = verify_spdk()
    free = int(Path('/sys/kernel/mm/hugepages/hugepages-2048kB/free_hugepages').read_text())
    if free < 4096:
        raise RuntimeError('Fewer than 8192 MiB of free hugepages')
    return {'time': time.time(), 'root': str(R), 'boot_id': boot_id(), 'kernel': KERNEL,
            'variant': variant, 'spdk': media, 'origin_stop': origin_stop(),
            'free_hugepages': free, 'meminfo': Path('/proc/meminfo').read_text(),
            'disk_reprovisioned': False}


if __name__ == '__main__':
    result = preflight()
    save(R / 'preflight-server.json', result)
    print(json.dumps({'verified': True, 'root': str(R), 'boot_id': result['boot_id']}))
