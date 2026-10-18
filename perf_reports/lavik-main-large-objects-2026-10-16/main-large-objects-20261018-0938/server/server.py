"""Identity-checked control for the pinned latest-main SPDK rerun."""
from pathlib import Path
import fcntl
import hashlib
import json
import os
import re
import resource
import signal
import socket
import subprocess as sp
import sys
import time

R = Path('/mnt/dev/benchmark/main-large-objects-20261018-0938')
HOST = '10.84.1.4'
CLI = '/usr/bin/redis-cli'
EXPECTED = {
    'main': R / 'sources/main/build-gcc13/lavik',
}

REVISIONS = {
    'main': '9c68079a7dd775db647cf55fe578a6cd43426a82',
}
DEPENDENCIES = {'bycorf': '68095c7b330c3c14efc43239b93feff22512f2e8', 'bycorf/third_party/abseil': '76bb24329e8bf5f39704eb10d21b9a80befa7c81', 'bycorf/third_party/dpdk': '37a1a9b926b4678141931f2f22e7a877b5b565c2', 'bycorf/third_party/liburing': 'd41bf9220ec39277ff235379e9089d9e0fd6c2a5', 'bycorf/third_party/spdk': 'd519b163cbc0e2f28c35d9bc86d610da368b032c', 'third_party/mimalloc': 'acf2fdd329f9dc2a7ffe3f12a133fe7175e39378', 'bycorf/third_party/spdk/isa-l': 'c196241ae89b1aa4f62efeb849a937c011b3a926', 'bycorf/third_party/spdk/isa-l-crypto': '07d0b253843ace996aa5a44f538c9b83b085aba6'}
BDFS = {'2401:00:00.0', '221c:00:00.0', '7f10:00:00.0',
        '399c:00:00.0', 'c0ef:00:00.0', '6319:00:00.0'}

def save(path, value):
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, indent=2) + '\n')
    tmp.replace(path)


def sha(path):
    with open(path, 'rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def cli(*args):
    return sp.check_output([CLI, '-h', HOST, '-p', '6379', '--raw', *args],
                           text=True, timeout=300).strip()


def stat(pid):
    raw = Path(f'/proc/{pid}/stat').read_text()
    fields = raw[raw.rfind(')') + 1:].split()
    return {'state': fields[0], 'start_ticks': fields[19]}


def port_open():
    try:
        with socket.create_connection((HOST, 6379), 1):
            return True
    except ConnectionRefusedError:
        return False


def identity():
    a = json.loads((R / 'active.json').read_text())
    if a['root'] != str(R) or a['product'] not in EXPECTED:
        raise RuntimeError('Unexpected active root/variant')
    if Path(a['binary']) != EXPECTED[a['product']] or a['args'][3] != a['binary']:
        raise RuntimeError('Unexpected active executable path')
    observed = stat(a['pid'])
    if observed['start_ticks'] != a['start_ticks']:
        raise RuntimeError('Active PID reused')
    if observed['state'] in ('Z', 'X', 'x'):
        raise RuntimeError('Active server already exited')
    if not os.path.samefile(f'/proc/{a["pid"]}/exe', a['binary']):
        raise RuntimeError('Active PID executable mismatch')
    return a


def stop():
    path = R / 'active.json'
    if not path.exists():
        if port_open():
            raise RuntimeError('Unowned server listener; refusing stop')
        return
    a = identity()
    os.kill(a['pid'], signal.SIGTERM)
    deadline = time.monotonic() + 300
    while Path(f'/proc/{a["pid"]}').exists():
        current = stat(a['pid'])
        if current['start_ticks'] != a['start_ticks']:
            raise RuntimeError('PID reused during stop')
        if current['state'] in ('Z', 'X', 'x'):
            break
        if time.monotonic() > deadline:
            raise RuntimeError('Clean stop timed out; not killing')
        time.sleep(.5)
    if port_open():
        raise RuntimeError('Listener remains after server exit')
    log = (R / a['label'] / 'logs/lavik.log').read_text()
    required = ('shutdown requested by signal 15',
                'all active requests drained; flushing storage buffers',
                'published shutdown checkpoint generation=',
                'all storage buffers durably flushed')
    if not all(message in log for message in required):
        raise RuntimeError('Server exited without confirmed clean checkpoint')
    save(R / a['label'] / 'stop.json', {'time': time.time(), 'active': a,
                                      'clean_checkpoint_confirmed': True})
    path.rename(R / ('stopped-' + str(time.time_ns()) + '.json'))


def start(product, label):
    if product not in EXPECTED or not re.fullmatch(r'session-[a-z0-9-]+', label):
        raise ValueError('Unexpected variant/session label')
    if (R / 'active.json').exists() or port_open():
        raise RuntimeError('Existing active state or listener')
    for other in R.parent.glob('*/active.json'):
        if other.parent != R:
            raise RuntimeError('Other benchmark active state: ' + str(other))
    # A legacy controller may not take the shared lock. Refuse any live Lavik
    # process even before its listener/active marker has appeared.
    for candidate in Path('/proc').iterdir():
        if not candidate.name.isdecimal():
            continue
        try:
            executable = Path(os.readlink(candidate / 'exe')).name
            if executable == 'lavik' or executable.startswith('lavik-'):
                raise RuntimeError('Another Lavik process is alive: ' + candidate.name)
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            pass
    if not (R / 'BUILD_COMPLETE').exists():
        raise RuntimeError('Build completion missing')
    if (R / 'build-failure.json').exists():
        raise RuntimeError('Build failure marker exists')
    manifest = json.loads((R / 'build-manifest.json').read_text())
    entry = manifest['variants'][product]
    binary = Path(entry['binary'])
    if binary != EXPECTED[product] or sha(binary) != entry['sha256']:
        raise RuntimeError('Pinned binary identity mismatch')
    source = json.loads((R / 'source-manifest.json').read_text())
    if manifest['source'] != source:
        raise RuntimeError('Build and source manifests disagree')
    if entry['revision'] != REVISIONS[product] or source['variants'][product]['revision'] != REVISIONS[product]:
        raise RuntimeError('Unexpected source revision')
    if {item['path']: item['sha'] for item in source['dependencies']} != DEPENDENCIES:
        raise RuntimeError('Unexpected dependency revisions')
    huge = Path('/sys/kernel/mm/hugepages/hugepages-2048kB/free_hugepages')
    deadline = time.monotonic() + 120
    while int(huge.read_text()) < 4096:
        if time.monotonic() > deadline:
            raise RuntimeError('Hugepages not released after previous server exit')
        time.sleep(.5)
    time.sleep(2)
    devices = json.loads((R / 'spdk-devices.json').read_text())
    if len(devices) != 6 or {d['bdf'] for d in devices} != BDFS:
        raise RuntimeError('Expected six distinct SPDK devices')
    for device in devices:
        pci = Path('/sys/bus/pci/devices') / device['bdf'] / 'driver'
        if pci.resolve().name != 'vfio-pci':
            raise RuntimeError('Device is not bound to vfio-pci: ' + str(pci))
    directory = R / label
    directory.mkdir(exist_ok=False)
    env = dict(os.environ)
    for key in ('MIMALLOC_PAGE_FULL_RETAIN', 'LAVIK_DIAG_SMEMBERS_LIMIT'):
        env.pop(key, None)
    env.update(BYCORF_EAL_ARGS=' '.join('-a ' + v['bdf'] for v in devices),
               BYCORF_DPDK_MEMORY_MB='8192')
    args = ['taskset', '-c', '0-15', str(binary), '--storage=spdk',
            '--bind=' + HOST, '--threads=16', '--pin-workers', '--metrics-port=0',
            '--spdk-max-completions-per-poll=16', '--log-dir=' + str(directory / 'logs'),
            '--shutdown-checkpoint'] + ['--data-file=spdk://' + v['bdf'] + '/1' for v in devices]
    save(directory / 'launch.json', {'args': args, 'binary_sha256': entry['sha256'],
         'manifest_sha256': sha(R / 'build-manifest.json'),
         'environment': {k: v for k, v in env.items() if k.startswith('BYCORF_')}})
    with (directory / 'server.log').open('w') as log:
        process = sp.Popen(args, stdout=log, stderr=sp.STDOUT, env=env,
                           start_new_session=True)
    save(R / 'active.json', {'root': str(R), 'pid': process.pid, 'product': product,
         'label': label, 'binary': str(binary), 'args': args,
         'binary_sha256': entry['sha256'], 'revision': entry['revision'],
         'start_ticks': stat(process.pid)['start_ticks']})
    for _ in range(600):
        if process.poll() is not None:
            raise RuntimeError('Server exited during startup: ' + str(process.returncode))
        try:
            if cli('PING') == 'PONG':
                break
        except (OSError, sp.SubprocessError):
            pass
        time.sleep(.5)
    else:
        raise RuntimeError('Server startup timeout')
    identity()
    if cli('CONFIG', 'GET', 'defrag-paused').splitlines() != ['defrag-paused', 'no']:
        raise RuntimeError('Defrag is not enabled')
    print(json.dumps({'started': label, 'pid': process.pid}))


def snapshot(name):
    if not re.fullmatch(r'[a-z0-9-]+\.json', name):
        raise ValueError('Invalid snapshot name')
    a = identity()
    pid = a['pid']
    data = {'time': time.time(), 'active': a}
    for name_ in ('stat', 'meminfo', 'diskstats', 'net/dev'):
        data[name_] = Path('/proc/' + name_).read_text()
    for name_ in ('stat', 'status', 'io'):
        data['process_' + name_] = Path(f'/proc/{pid}/{name_}').read_text()
    data['info'] = {part: cli('INFO', part) for part in
                    ('server', 'memory', 'stats', 'commandstats')}
    data['defrag'] = cli('CONFIG', 'GET', 'defrag-paused')
    if data['defrag'].splitlines() != ['defrag-paused', 'no']:
        raise RuntimeError('Defrag is not enabled')
    (R / 'snapshots').mkdir(exist_ok=True)
    save(R / 'snapshots' / name, data)


def reset_data(dataset):
    # A new journal is required for each explicitly designated load session.
    # Never repeat FLUSHDB after an uncertain SSH/command outcome.
    if not re.fullmatch(r'(?:smoke-)?(?:hashread|setread|listread|zsetread|hashwrite|listwrite)(?:-(?:main|pr))?', dataset):
        raise ValueError('Unsupported dataset reset')
    a = identity()
    if a['label'] != 'session-load-' + dataset:
        raise RuntimeError('Dataset reset requires its designated load session')
    journal = R / (dataset + '-reset.json')
    with journal.open('x') as handle:
        json.dump({'time': time.time(), 'active': a, 'state': 'issued'}, handle)
    response = cli('FLUSHDB')
    if response != 'OK':
        raise RuntimeError('FLUSHDB failed: ' + response)
    save(journal, {'time': time.time(), 'active': a, 'state': 'completed',
                   'response': response})


if __name__ == '__main__':
    if os.geteuid() != 0 or Path(__file__).resolve().parent != R:
        raise RuntimeError('Run as root from the exact experiment directory')
    if os.uname().release != '6.17.0-1022-azure':
        raise RuntimeError('Unexpected server kernel')
    resource.setrlimit(resource.RLIMIT_NOFILE, (65535, 65535))
    resource.setrlimit(resource.RLIMIT_MEMLOCK, (resource.RLIM_INFINITY, resource.RLIM_INFINITY))
    with (R.parent / '.benchmark-control.lock').open('a') as shared_lock, \
            (R / 'control.lock').open('a') as lock:
        fcntl.flock(shared_lock, fcntl.LOCK_EX)
        fcntl.flock(lock, fcntl.LOCK_EX)
        action = sys.argv[1]
        if action == 'start' and len(sys.argv) == 4:
            start(*sys.argv[2:])
        elif action == 'stop' and len(sys.argv) == 2:
            stop()
        elif action == 'snapshot' and len(sys.argv) == 3:
            snapshot(sys.argv[2])
        elif action == 'reset-data' and len(sys.argv) == 3:
            reset_data(sys.argv[2])
        else:
            raise ValueError('Unsupported control action/arguments')
