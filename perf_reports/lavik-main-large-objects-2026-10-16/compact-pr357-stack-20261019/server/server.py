"""Owned per-family checkpoint / explicit FLUSHDB services for the compact stack."""
from pathlib import Path
import fcntl
import json
import os
import re
import resource
import signal
import subprocess as sp
import sys
import time
import traceback
import preflight_server as common

R = common.R
HOST, CLI = '10.84.1.4', '/usr/bin/redis-cli'
save, sha, stat = common.save, common.sha, common.stat
PRODUCTS = ('lavik',)


class Cancelled(BaseException):
    pass


def cancelled(signum, frame):
    raise Cancelled('Server control interrupted by signal ' + str(signum))


def arguments_valid(product, label, owner):
    if product not in PRODUCTS or label not in common.SESSIONS or not label.startswith('session-' + product + '-') or not re.fullmatch('[0-9a-f]{32}', owner):
        raise ValueError('Invalid variant/session/owner token')


def pinned_variant(product):
    value = json.loads((R / 'stack-manifest.json').read_text())
    return {'revision': value['revision'], 'version': value['revision'],
            'binary': value['binary'], 'binary_sha256': value['binary_sha256']}


def configuration(product):
    lines = cli('CONFIG', 'GET', 'defrag-paused').splitlines()
    if lines != ['defrag-paused', 'no']:
        raise RuntimeError('Defrag is paused or CONFIG GET failed')
    return {'defrag-paused': 'no'}


def cli(*args, timeout=30):
    return sp.check_output([CLI, '-h', HOST, '-p', '6379', '--raw', *args],
                           text=True, timeout=timeout).strip()


def info_fields(raw):
    return dict(line.split(':', 1) for line in raw.splitlines() if ':' in line)


def identity():
    active = json.loads((R / 'active.json').read_text())
    arguments_valid(active['product'], active['label'], active['owner_token'])
    if active['root'] != str(R) or active['args'][0] != active['binary']:
        raise RuntimeError('Active executable/root mismatch')
    expected = pinned_variant(active['product'])
    if any(active.get(key) != value for key, value in expected.items()):
        raise RuntimeError('Active binary provenance mismatch')
    current = stat(active['pid'])
    if current['start_ticks'] != active['start_ticks'] or current['state'] in ('Z', 'X', 'x'):
        raise RuntimeError('Active process exited or PID was reused')
    if not os.path.samefile(f'/proc/{active["pid"]}/exe', active['binary']):
        raise RuntimeError('Active process executable mismatch')
    if not set(os.sched_getaffinity(active['pid'])) <= set(active['cpu_affinity']):
        raise RuntimeError('Active CPU affinity mismatch')
    launch = json.loads((R / active['label'] / 'launch.json').read_text())
    if any(launch[key] != active[key] for key in
           ('root', 'product', 'label', 'owner_token', 'binary', 'binary_sha256',
            'args', 'cpu_affinity', 'revision', 'version')):
        raise RuntimeError('Active identity differs from launch receipt')
    return active


def owned_identity(product, label, owner):
    arguments_valid(product, label, owner)
    raw = json.loads((R / 'active.json').read_text())
    if (raw.get('product'), raw.get('label'), raw.get('owner_token')) != (product, label, owner):
        raise RuntimeError('Active process belongs to another start attempt')
    return identity()


def pin_server_cpus():
    os.sched_setaffinity(0, set(range(16)))


def supervise(label, owner):
    """Keep an exit receipt while the actual database executes directly."""
    directory = R / label
    launch = json.loads((directory / 'launch.json').read_text())
    arguments_valid(launch['product'], label, owner)
    if launch['owner_token'] != owner or launch['root'] != str(R):
        raise RuntimeError('Supervisor owner mismatch')
    environment = dict(os.environ)
    for name in ('MIMALLOC_PAGE_FULL_RETAIN', 'LAVIK_DIAG_SMEMBERS_LIMIT',
                 'BYCORF_EAL_ARGS', 'BYCORF_DPDK_MEMORY_MB'):
        environment.pop(name, None)
    environment.update(launch['environment'])
    process = None
    active = None
    try:
        with (directory / 'server.log').open('x') as log:
            process = sp.Popen(launch['args'], stdin=sp.DEVNULL, stdout=log,
                               stderr=sp.STDOUT, env=environment,
                               preexec_fn=pin_server_cpus, start_new_session=True)
        # Popen's handshake has already exec'd args[0]; there is no taskset PID race.
        active = dict(launch, pid=process.pid,
                      start_ticks=stat(process.pid)['start_ticks'], supervisor_pid=os.getpid())
        save(directory / 'process.json', active)
        save(R / 'active.json', active)
        code = process.wait()
        save(directory / 'server-exit.json', {'time': time.time(), 'active': active,
                                              'returncode': code})
    except BaseException:
        save(directory / 'supervisor-failure.json', {'time': time.time(),
             'pid': process.pid if process else None, 'traceback': traceback.format_exc()})
        if process is not None and process.poll() is None:
            process.send_signal(signal.SIGTERM)
            try:
                process.wait(timeout=300)
            except sp.TimeoutExpired:
                save(directory / 'supervisor-cleanup-failure.json',
                     {'time': time.time(), 'pid': process.pid, 'error': 'SIGTERM timeout; not killing'})
        raise


def completed_sequence_before(label):
    """Require every preceding family to have reset and stopped cleanly."""
    index = common.SESSIONS.index(label)
    previous = common.origin_stop()
    for earlier in common.SESSIONS[:index]:
        directory = R / earlier
        stopped = json.loads((directory / 'stop.json').read_text())
        reset = json.loads((directory / 'reset-data.json').read_text())
        active = stopped['active']
        if (stopped.get('clean_stop_confirmed') is not True or stopped.get('clean_checkpoint_confirmed') is not True
                or stopped.get('returncode') != 0 or stopped.get('checkpoint_entries') != 8192
                or stopped['checkpoint_generation'] != previous['checkpoint_generation'] + 1
                or active['label'] != earlier or active['root'] != str(R) or active['product'] != 'lavik'
                or reset.get('completed') is not True or reset.get('active') != active
                or reset.get('command') != ['FLUSHDB'] or reset.get('response') != 'OK'):
            raise RuntimeError('Previous family is incomplete: ' + earlier)
        previous = stopped
    if any((R / later).exists() for later in common.SESSIONS[index:]):
        raise RuntimeError('Current/later session artifacts already exist; no automatic retry')
    return previous


def expected_recovery(previous):
    if previous is None:
        raise RuntimeError('An explicit previous clean checkpoint is required')
    return {'mode': 'checkpoint', 'checkpoint': {
        'generation': previous['checkpoint_generation'], 'entries': previous['checkpoint_entries']}}


def startup_evidence(log, expected, devices):
    """Require complete stderr records, all six storage paths and finished recovery."""
    text = ''.join(line for line in log.splitlines(keepends=True) if line.endswith('\n'))
    loaded = [tuple(map(int, match)) for match in re.findall(
        r'loaded shutdown checkpoint generation=(\d+) entries=(\d+)(?:\s|$)', text)]
    if expected.get('mode') != 'checkpoint' or not isinstance(expected.get('checkpoint'), dict):
        raise RuntimeError('This experiment requires the exact previous checkpoint')
    checkpoint = expected['checkpoint']
    wanted = (checkpoint['generation'], checkpoint['entries'])
    if any(value != wanted for value in loaded) or len(loaded) > 1:
        raise RuntimeError('Recovered checkpoint differs from previous clean stop')
    if not loaded:
        return None
    found = re.findall(r'storage device id=(\d+) path=(spdk://[^ ]+) capacity-bytes=(\d+) ', text)
    if len(found) < 6:
        return None
    capacities = {f'spdk://{d["bdf"]}/1': d['bytes'] // (8 * 1024 * 1024) * (8 * 1024 * 1024) for d in devices}
    if len(found) != 6 or {int(i) for i, _, _ in found} != set(range(6)) or {path: int(size) for _, path, size in found} != capacities:
        raise RuntimeError('Startup storage paths/IDs/capacities differ from the sanitized six namespaces')
    if 'mimalloc recovery collection complete;' not in text:
        return None
    return dict(expected, storage_devices=[{'id': int(i), 'path': path, 'capacity_bytes': int(size)}
                                           for i, path, size in found], recovery_collection_complete=True)


def start(product, label, owner):
    arguments_valid(product, label, owner)
    common.verify_idle()
    previous = completed_sequence_before(label)
    media = common.verify_spdk()
    entry = common.verified_variant(product)
    expected = expected_recovery(previous)
    huge = Path('/sys/kernel/mm/hugepages/hugepages-2048kB/free_hugepages')
    deadline = time.monotonic() + 120
    while int(huge.read_text()) < 4096:
        if time.monotonic() >= deadline:
            raise RuntimeError('Previous SPDK process has not released 8192 MiB hugepages')
        time.sleep(.5)
    directory = R / label
    directory.mkdir(exist_ok=False)
    provenance = R / 'provenance'
    provenance.mkdir(exist_ok=True)
    for kind in ('build', 'source'):
        source = Path(entry[kind + '_manifest_path'])
        target = provenance / (product + '-' + kind + '-manifest.json')
        if target.exists() and target.read_bytes() != source.read_bytes():
            raise RuntimeError('Saved build provenance differs')
        if not target.exists():
            with target.open('xb') as handle:
                handle.write(source.read_bytes())
    devices = media['devices']
    environment = {'LC_ALL': 'C', 'BYCORF_EAL_ARGS': ' '.join('-a ' + d['bdf'] for d in devices),
                   'BYCORF_DPDK_MEMORY_MB': '8192'}
    args = [entry['binary'], '--storage=spdk', '--alsologtostderr', '--bind=' + HOST,
            '--threads=16', '--pin-workers', '--metrics-port=0', '--spdk-max-completions-per-poll=16',
            '--log-dir=' + str(directory / 'logs'), '--shutdown-checkpoint']
    args += ['--data-file=spdk://' + d['bdf'] + '/1' for d in devices]
    launch = dict(pinned_variant(product), root=str(R), product=product, label=label, owner_token=owner,
                  args=args, cpu_affinity=list(range(16)), environment=environment, time=time.time(),
                  manifest_sha256=sha(R / 'stack-manifest.json'), data_dir=None, config_sha256=None,
                  spdk_ready_sha256=sha(common.PREVIOUS / 'spdk-ready.json'), expected_recovery=expected,
                  previous_stop_sha256=sha(Path(previous['active']['root']) / previous['active']['label'] / 'stop.json'))
    save(directory / 'launch.json', launch)
    with (directory / 'supervisor.log').open('x') as log:
        supervisor = sp.Popen([sys.executable, str(R / 'server.py'), '_supervise', label, owner],
                              stdin=sp.DEVNULL, stdout=log, stderr=sp.STDOUT, start_new_session=True)
    try:
        deadline = time.monotonic() + 300
        while True:
            if supervisor.poll() is not None or (directory / 'server-exit.json').exists():
                raise RuntimeError('Server exited during readiness')
            if (R / 'active.json').exists():
                active = owned_identity(product, label, owner)
                evidence = startup_evidence((directory / 'server.log').read_text(), expected, devices)
                try:
                    # EXISTS probes one fixed absent key; unlike PING it must
                    # pass normal request readiness. No keyspace traversal.
                    serving = cli('PING', timeout=5) == 'PONG' and cli('EXISTS', 'compact-pr357-stack:readiness:absent', timeout=5) == '0'
                except (OSError, sp.SubprocessError):
                    serving = False
                if evidence is not None and serving:
                    settings = configuration(product)
                    save(directory / 'ready.json', {'time': time.time(), 'active': active,
                         'config': settings, 'info_server': cli('INFO', 'server'), 'recovery': evidence,
                         'loaded_checkpoint': expected['checkpoint'], 'normal_request_ready': True})
                    return active
            if time.monotonic() >= deadline:
                raise RuntimeError('Server recovery/readiness deadline expired')
            time.sleep(.25)
    except BaseException:
        try:
            if not (R / 'active.json').exists() and supervisor.poll() is None:
                raise RuntimeError('Supervisor alive without active identity; inspect before retry')
            stop_owned(product, label, owner)
        except BaseException as error:
            save(directory / 'start-cleanup-failure.json', {'time': time.time(), 'error': repr(error)})
        raise


def stop_owned(product, label, owner):
    arguments_valid(product, label, owner)
    directory = R / label
    path = R / 'active.json'
    if not path.exists():
        if common.listener_present():
            raise RuntimeError('Unowned listener; refusing stop')
        prior = directory / 'stop.json'
        if prior.exists():
            receipt = json.loads(prior.read_text())
            stopped = receipt['active']
            if (stopped['product'], stopped['label'], stopped['owner_token']) != (product, label, owner):
                raise RuntimeError('Stopped session belongs to another owner')
            return receipt
        if (directory / 'process.json').exists():
            raise RuntimeError('Process launched without a completed stop receipt')
        return {'not_started': True, 'product': product, 'label': label, 'owner_token': owner}
    active = owned_identity(product, label, owner)
    if (directory / 'server-exit.json').exists():
        raise RuntimeError('Server exited before requested clean stop')
    requested = time.time()
    save(directory / 'stop-request.json', {'time': requested, 'active': active, 'signal': int(signal.SIGTERM)})
    os.kill(active['pid'], signal.SIGTERM)
    deadline = time.monotonic() + 300
    while not (directory / 'server-exit.json').exists():
        try:
            if stat(active['pid'])['start_ticks'] != active['start_ticks']:
                raise RuntimeError('PID reused during clean stop')
        except FileNotFoundError:
            pass
        if time.monotonic() >= deadline:
            raise RuntimeError('Clean stop timed out; not killing')
        time.sleep(.25)
    exited = json.loads((directory / 'server-exit.json').read_text())
    if exited['active'] != active or exited['returncode'] != 0 or exited['time'] < requested or common.listener_present():
        raise RuntimeError('Exit status/identity/listener did not confirm clean stop')
    log = (directory / 'server.log').read_text()
    for message in ('shutdown requested by signal 15', 'all active requests drained; flushing storage buffers',
                    'all storage buffers durably flushed'):
        if message not in log:
            raise RuntimeError('Missing clean shutdown log: ' + message)
    published = re.findall(r'published shutdown checkpoint generation=(\d+) entries=(\d+)(?:\s|$)', log)
    if len(published) != 1:
        raise RuntimeError('Expected exactly one published shutdown checkpoint')
    generation, entries = map(int, published[0])
    checkpoint = active['expected_recovery']['checkpoint']
    if checkpoint is None or generation != checkpoint['generation'] + 1:
        raise RuntimeError('Checkpoint generation did not advance exactly once')
    reset_path = directory / 'reset-data.json'
    if reset_path.exists():
        reset = json.loads(reset_path.read_text())
        upper = 8192 if reset.get('completed') is True else max(8192, checkpoint['entries'])
        if not 0 <= entries <= upper:
            raise RuntimeError('Checkpoint entries outside this reset/load attempt bounds')
    elif entries != checkpoint['entries']:
        raise RuntimeError('Data changed before the explicit reset')
    # A clean stop may preserve a partial failed load. Only a completed reset
    # and exactly 8192 entries allow the next family to start.
    result = {'time': time.time(), 'requested_at': requested, 'active': active, 'signal': 15,
              'returncode': 0, 'clean_stop_confirmed': True, 'clean_checkpoint_confirmed': True,
              'checkpoint_generation': generation, 'checkpoint_entries': entries}
    save(directory / 'stop.json', result)
    path.rename(R / ('stopped-' + str(time.time_ns()) + '.json'))
    return result


def reset_data(product, label, owner):
    if product != 'lavik':
        raise ValueError('Only the owned Lavik stack can be reset')
    active = owned_identity(product, label, owner)
    path = R / label / 'reset-data.json'
    if path.exists():
        raise RuntimeError('Reset already attempted; refusing implicit retry')
    ready_path = R / label / 'ready.json'
    if not ready_path.exists():
        raise RuntimeError('Reset requires a ready owned session')
    ready = json.loads(ready_path.read_text())
    if (ready.get('active') != active or ready.get('normal_request_ready') is not True
            or ready.get('loaded_checkpoint') != active['expected_recovery']['checkpoint']
            or ready.get('recovery', {}).get('recovery_collection_complete') is not True):
        raise RuntimeError('Reset requires the exact recovered owned checkpoint')
    receipt = {'time': time.time(), 'active': active, 'command': ['FLUSHDB'], 'completed': False}
    save(path, receipt)
    response = cli('FLUSHDB', timeout=300)
    if response != 'OK':
        raise RuntimeError('FLUSHDB did not return OK')
    if owned_identity(product, label, owner) != active:
        raise RuntimeError('Identity changed during FLUSHDB')
    receipt.update(completed=True, response=response, completed_at=time.time())
    save(path, receipt)
    return receipt


def drained_stats(timeout=60):
    deadline = time.monotonic() + timeout
    while True:
        raw = cli('INFO', 'stats', timeout=min(10, max(.1, deadline - time.monotonic())))
        values = info_fields(raw)
        if all(values.get(key) == '0' for key in ('tx_commit_queue_depth', 'storage_tx_commits_pending')):
            return raw
        if time.monotonic() >= deadline:
            raise RuntimeError('Lavik transaction queue did not drain')
        time.sleep(.1)


def snapshot(name):
    if not re.fullmatch(r'[a-z0-9-]+\.json', name):
        raise ValueError('Invalid snapshot basename')
    path = R / 'snapshots' / name
    if path.exists():
        raise RuntimeError('Snapshot already exists')
    active = identity()
    data = {'time': time.time(), 'active': active, 'config': configuration(active['product'])}
    for item in ('stat', 'meminfo', 'diskstats', 'net/dev'):
        data[item] = Path('/proc/' + item).read_text()
    for item in ('stat', 'status', 'io'):
        data['process_' + item] = Path(f'/proc/{active["pid"]}/{item}').read_text()
    data['proc_stat'], data['proc_status'] = data['process_stat'], data['process_status']
    data['info'] = {part: cli('INFO', part) for part in ('server', 'memory', 'commandstats')}
    data['info']['stats'] = drained_stats()
    for part, value in data['info'].items():
        data['info_' + part] = value
    if active['product'] in PRODUCTS:
        data.update(defrag_paused='no', defrag='defrag-paused\nno',
                    transactions_drained=True, transaction_drain_confirmed=True)
    if identity() != active:
        raise RuntimeError('Identity changed during snapshot')
    path.parent.mkdir(exist_ok=True)
    save(path, data)
    return data


if __name__ == '__main__':
    common.verify_host()
    resource.setrlimit(resource.RLIMIT_NOFILE, (65535, 65535))
    resource.setrlimit(resource.RLIMIT_MEMLOCK, (resource.RLIM_INFINITY, resource.RLIM_INFINITY))
    signal.signal(signal.SIGTERM, cancelled)
    signal.signal(signal.SIGINT, cancelled)
    action = sys.argv[1]
    if action == '_supervise' and len(sys.argv) == 4:
        supervise(*sys.argv[2:])
    else:
        with (R.parent / '.benchmark-control.lock').open('a') as shared, (R / 'control.lock').open('a') as lock:
            fcntl.flock(shared, fcntl.LOCK_EX)
            fcntl.flock(lock, fcntl.LOCK_EX)
            if action in ('start', 'stop-owned', 'reset-data') and len(sys.argv) == 5:
                result = {'start': start, 'stop-owned': stop_owned, 'reset-data': reset_data}[action](*sys.argv[2:])
            elif action == 'snapshot' and len(sys.argv) == 3:
                result = snapshot(sys.argv[2])
            else:
                raise ValueError('Unsupported action/arguments')
            print(json.dumps(result))
