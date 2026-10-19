"""Owned, one-attempt sessions for the four-database 8 KiB experiment."""
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

R, MOUNT = common.R, common.MOUNT
HOST, CLI = '10.84.1.4', '/usr/bin/redis-cli'
save, sha, stat = common.save, common.sha, common.stat
PRODUCTS = ('lavik', 'redis', 'valkey', 'kvrocks')


def arguments_valid(product, label, owner):
    if (product not in PRODUCTS or label not in
            {'session-' + product + '-' + op for op in common.OPS} or
            not re.fullmatch(r'[0-9a-f]{32}', owner)):
        raise ValueError('Invalid product/session/owner token')


def cli(*args, timeout=30):
    return sp.check_output([CLI, '-h', HOST, '-p', '6379', '--raw', *args],
                           text=True, timeout=timeout).strip()


def info_fields(raw):
    return dict(line.split(':', 1) for line in raw.splitlines() if ':' in line)


def configuration(product):
    wanted = {
        'lavik': {'defrag-paused': 'no'},
        'redis': {'save': '', 'appendonly': 'no', 'io-threads': '16', 'daemonize': 'no'},
        'valkey': {'save': '', 'appendonly': 'no', 'io-threads': '8', 'daemonize': 'no'},
        'kvrocks': {'workers': '16', 'rocksdb.disable_auto_compactions': 'no',
                    'daemonize': 'no', 'rocksdb.write_options.disable_wal': 'yes'},
    }[product]
    result = {}
    for key, expected in wanted.items():
        lines = cli('CONFIG', 'GET', key).splitlines()
        if not lines or lines[0] != key:
            raise RuntimeError('CONFIG GET missing: ' + key)
        value = '\n'.join(lines[1:])
        result[key] = value
        equivalent = ({'no', 'false', '0'} if expected == 'no' else
                      {'yes', 'true', '1'} if expected == 'yes' else {expected})
        if value not in equivalent:
            raise RuntimeError('Unexpected configuration: ' + key + '=' + value)
    return result


def pinned_variant(product):
    if product == 'lavik':
        value = json.loads((R / 'main-manifest.json').read_text())
        return {'revision': value['revision'], 'version': value['revision'],
                'binary': value['binary'], 'binary_sha256': value['binary_sha256']}
    value = json.loads((R / 'peer-manifest.json').read_text())['variants'][product]
    return {'revision': value['version'], 'version': value['version'],
            'binary': value['binary'], 'binary_sha256': value['sha256']}


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


def prepare_config(product, directory, data_dir):
    if product != 'kvrocks':
        return None
    original = common.TEMPLATE.read_text()
    parsed = {}
    for line in original.splitlines():
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        key, value = line.split(None, 1)
        if key in parsed:
            raise RuntimeError('Duplicate Kvrocks directive: ' + key)
        parsed[key] = value
    for key, expected in {'dir': '/mnt/storage-peers-20261014/kvrocks',
                          'bind': HOST, 'port': '6379', 'workers': '16',
                          'daemonize': 'no', 'rocksdb.disable_auto_compactions': 'no'}.items():
        if parsed.get(key) != expected:
            raise RuntimeError('Kvrocks template critical settings mismatch: ' + key)
    path = directory / 'server.conf'
    path.write_text('\n'.join('dir ' + str(data_dir) if line.strip().startswith('dir ')
                              else line for line in original.splitlines()) + '\n')
    return path


def loaded_checkpoint(directory):
    """Observe complete lines from the immediate stderr sink, not buffered INFO logs."""
    path = directory / 'server.log'
    if not path.exists():
        return None
    lines = [line for line in path.read_text().splitlines(keepends=True) if line.endswith('\n')]
    matches = [match.groups() for line in lines for match in re.finditer(
        r'loaded shutdown checkpoint generation=(\d+) entries=(\d+)(?:\s|$)', line)]
    if len(matches) > 1:
        raise RuntimeError('Multiple loaded-checkpoint startup records')
    if not matches:
        return None
    generation, entries = map(int, matches[0])
    return {'generation': generation, 'entries': entries}


def start(product, label, owner):
    arguments_valid(product, label, owner)
    common.verify_idle()
    entry = pinned_variant(product)
    if product == 'lavik':
        common.verified_main()
        devices = common.verified_devices()
        if (R / 'raid-setup').exists() or (R / 'raid-ready.json').exists():
            raise RuntimeError('Lavik SPDK sessions must precede the RAID conversion')
        for device in devices:
            if (Path('/sys/bus/pci/devices') / device['bdf'] / 'driver').resolve().name != 'vfio-pci':
                raise RuntimeError('Scratch device is not VFIO: ' + device['bdf'])
        deadline = time.monotonic() + 120
        while int(Path('/sys/kernel/mm/hugepages/hugepages-2048kB/free_hugepages').read_text()) < 4096:
            if time.monotonic() >= deadline:
                raise RuntimeError('SPDK hugepages have not been released')
            time.sleep(.5)
    else:
        common.verified_manifest()
        common.verify_raid()
    directory = R / label
    directory.mkdir(exist_ok=False)
    data_dir = None if product == 'lavik' else MOUNT / label
    if data_dir is not None:
        data_dir.mkdir(exist_ok=False)
        save(directory / 'fresh-data.json', {'time': time.time(), 'root': str(R),
             'data_dir': str(data_dir), 'empty_before_start': not any(data_dir.iterdir()),
             'raid_receipt_sha256': sha(R / 'raid-ready.json')})
    environment = {'LC_ALL': 'C'}
    config = prepare_config(product, directory, data_dir)
    if product == 'lavik':
        environment.update(BYCORF_EAL_ARGS=' '.join('-a ' + item['bdf'] for item in devices),
                           BYCORF_DPDK_MEMORY_MB='8192')
        args = [entry['binary'], '--storage=spdk', '--alsologtostderr',
                '--bind=' + HOST, '--threads=16', '--pin-workers', '--metrics-port=0',
                '--spdk-max-completions-per-poll=16', '--log-dir=' + str(directory / 'logs'),
                '--shutdown-checkpoint']
        args += ['--data-file=spdk://' + item['bdf'] + '/1' for item in devices]
    elif product in ('redis', 'valkey'):
        args = [entry['binary'], '--bind', HOST, '--protected-mode', 'no', '--port', '6379',
                '--dir', str(data_dir), '--save', '', '--appendonly', 'no',
                '--io-threads', '16' if product == 'redis' else '8', '--maxclients', '10000']
    else:
        args = [entry['binary'], '-c', str(config)]
    launch = dict(entry, root=str(R), product=product, label=label, owner_token=owner,
                  args=args, cpu_affinity=list(range(16)), environment=environment,
                  data_dir=str(data_dir) if data_dir else None, time=time.time(),
                  manifest_sha256=sha(R / ('main-manifest.json' if product == 'lavik' else 'peer-manifest.json')),
                  config_sha256=sha(config) if config else None)
    save(directory / 'launch.json', launch)
    with (directory / 'supervisor.log').open('x') as log:
        supervisor = sp.Popen([sys.executable, str(R / 'server.py'), '_supervise', label, owner],
                              stdin=sp.DEVNULL, stdout=log, stderr=sp.STDOUT,
                              start_new_session=True)
    try:
        deadline = time.monotonic() + 300
        while True:
            if supervisor.poll() is not None or (directory / 'server-exit.json').exists():
                raise RuntimeError('Server exited during readiness')
            if (R / 'active.json').exists():
                active = owned_identity(product, label, owner)
                try:
                    ready = cli('PING', timeout=5) == 'PONG'
                except (OSError, sp.SubprocessError):
                    ready = False
                checkpoint = loaded_checkpoint(directory) if product == 'lavik' else None
                if product == 'lavik' and checkpoint is None:
                    ready = False
                if ready:
                    settings = configuration(product)
                    server_info = cli('INFO', 'server')
                    if product != 'lavik':
                        if info_fields(server_info).get(product + '_version') != entry['version']:
                            raise RuntimeError('Live peer version differs from pinned binary')
                    save(directory / 'ready.json', {'time': time.time(), 'active': active,
                         'config': settings, 'info_server': server_info,
                         'loaded_checkpoint': checkpoint})
                    return active
            if time.monotonic() >= deadline:
                raise RuntimeError('Server PING readiness timed out')
            time.sleep(.25)
    except BaseException:
        # Pre-launch failures do not arrive here; never stop an unrelated listener.
        try:
            if not (R / 'active.json').exists() and supervisor.poll() is None:
                raise RuntimeError('Supervisor is alive without an active identity; inspect before retry')
            stop_owned(product, label, owner)
        except BaseException as error:
            save(directory / 'start-cleanup-failure.json', {'time': time.time(), 'error': repr(error)})
        raise


def stop_owned(product, label, owner):
    arguments_valid(product, label, owner)
    path = R / 'active.json'
    directory = R / label
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
            raise RuntimeError('A process was launched without a completed stop receipt')
        return {'not_started': True, 'product': product, 'label': label, 'owner_token': owner}
    active = owned_identity(product, label, owner)
    if (directory / 'server-exit.json').exists():
        raise RuntimeError('Server exited before the requested clean stop')
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
    exit_status = json.loads((directory / 'server-exit.json').read_text())
    if (exit_status['active'] != active or exit_status['returncode'] != 0 or
            exit_status['time'] < requested or common.listener_present()):
        raise RuntimeError('Exit identity/status/listener did not confirm clean stop')
    result = {'time': time.time(), 'requested_at': requested, 'active': active,
              'signal': int(signal.SIGTERM), 'returncode': 0, 'clean_stop_confirmed': True}
    if product == 'lavik':
        log = (directory / 'server.log').read_text()
        required = ('shutdown requested by signal 15',
                    'all active requests drained; flushing storage buffers',
                    'all storage buffers durably flushed')
        published = re.findall(r'published shutdown checkpoint generation=(\d+) entries=(\d+)(?:\s|$)', log)
        if not all(item in log for item in required) or len(published) != 1:
            raise RuntimeError('Lavik clean checkpoint confirmation missing')
        generation, entries = map(int, published[0])
        result.update(clean_checkpoint_confirmed=True, checkpoint_generation=generation,
                      checkpoint_entries=entries)
    elif product in ('redis', 'valkey'):
        log = (directory / 'server.log').read_text()
        if 'Received SIGTERM scheduling shutdown' not in log or 'is now ready to exit' not in log:
            raise RuntimeError('Peer shutdown log confirmation missing')
    save(directory / 'stop.json', result)
    path.rename(R / ('stopped-' + str(time.time_ns()) + '.json'))
    return result


def reset_data(product, label, owner):
    if product != 'lavik':
        raise ValueError('Only Lavik uses explicit FLUSHDB; peers require fresh directories')
    active = owned_identity(product, label, owner)
    path = R / label / 'reset-data.json'
    if path.exists():
        raise RuntimeError('Reset already attempted; refusing implicit retry')
    if not (R / label / 'ready.json').exists():
        raise RuntimeError('Reset requires a ready owned session')
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
    data['info']['stats'] = drained_stats() if active['product'] == 'lavik' else cli('INFO', 'stats')
    for part, value in data['info'].items():
        data['info_' + part] = value
    if active['product'] == 'lavik':
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
