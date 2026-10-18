"""Pinned peer processes, explicit lifecycle ownership and fresh per-family data."""
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
HOST = '10.84.1.4'
CLI = '/usr/bin/redis-cli'
save, sha, stat = common.save, common.sha, common.stat


def label_valid(label):
    return bool(re.fullmatch(r'session-(?:smoke-)?(?:redis|valkey|kvrocks)-(?:hashread|setread|listread|zsetread)', label))


def cli(*args):
    return sp.check_output([CLI, '-h', HOST, '-p', '6379', '--raw', *args],
                           text=True, timeout=300).strip()


def configuration(product):
    wanted = {'redis': {'save': '', 'appendonly': 'no', 'io-threads': '16', 'daemonize': 'no'},
              'valkey': {'save': '', 'appendonly': 'no', 'io-threads': '8', 'daemonize': 'no'},
              'kvrocks': {'workers': '16', 'rocksdb.disable_auto_compactions': 'no', 'daemonize': 'no'}}[product]
    actual = {}
    for key, expected in wanted.items():
        lines = cli('CONFIG', 'GET', key).splitlines()
        if not lines or lines[0] != key:
            raise RuntimeError('CONFIG GET missing: ' + key)
        value = '\n'.join(lines[1:])
        actual[key] = value
        if key == 'rocksdb.disable_auto_compactions':
            valid = value in ('no', 'false', '0')
        else:
            valid = value == expected
        if not valid:
            raise RuntimeError('Unexpected peer setting: ' + repr((key, value, expected)))
    return actual


def identity():
    active = json.loads((R / 'active.json').read_text())
    product = active['product']
    if active['root'] != str(R) or product not in common.PEERS or not label_valid(active['label']):
        raise RuntimeError('Unexpected active root/product/label')
    version, binary, digest = common.PEERS[product]
    if (active['revision'], active['version'], active['binary'], active['binary_sha256']) != (version, version, binary, digest):
        raise RuntimeError('Active manifest identity mismatch')
    if active['args'][:4] != ['taskset', '-c', '0-15', binary]:
        raise RuntimeError('Unexpected active command prefix')
    launch = json.loads((R / active['label'] / 'launch.json').read_text())
    if launch['args'] != active['args'] or launch['binary_sha256'] != digest:
        raise RuntimeError('Active and launch record disagree')
    observed = stat(active['pid'])
    if observed['start_ticks'] != active['start_ticks'] or observed['state'] in ('Z', 'X', 'x'):
        raise RuntimeError('Active PID exited or reused')
    if not os.path.samefile(f'/proc/{active["pid"]}/exe', binary):
        raise RuntimeError('Active PID executable mismatch')
    return active


def supervise(label):
    """Keep a parent alive so clean shutdown has an observed exit status."""
    if not label_valid(label):
        raise ValueError('Invalid supervisor label')
    directory = R / label
    launch = json.loads((directory / 'launch.json').read_text())
    product = launch['product']
    entry = common.verified_manifest()['variants'][product]
    if (launch['root'] != str(R) or launch['label'] != label or
            launch['binary'] != entry['binary'] or launch['binary_sha256'] != entry['sha256'] or
            launch['args'][:4] != ['taskset', '-c', '0-15', entry['binary']] or
            (R / 'active.json').exists()):
        raise RuntimeError('Supervisor launch identity mismatch')
    env = dict(os.environ)
    for key in list(env):
        if key.startswith(('BYCORF_', 'LAVIK_')) or key == 'MIMALLOC_PAGE_FULL_RETAIN':
            env.pop(key)
    env['LC_ALL'] = 'C'
    with (directory / 'server.log').open('w') as log:
        process = sp.Popen(launch['args'], stdout=log, stderr=sp.STDOUT, env=env,
                           start_new_session=True)
        active = {key: launch[key] for key in ('root', 'product', 'revision', 'version',
                  'binary', 'binary_sha256', 'label', 'args', 'data_dir')}
        active.update(pid=process.pid, start_ticks=stat(process.pid)['start_ticks'],
                      supervisor_pid=os.getpid(), started_at=time.time())
        save(R / 'active.json', active)
        code = process.wait()
        save(directory / 'server-exit.json', {'time': time.time(), 'active': active,
             'returncode': code, 'supervisor_pid': os.getpid()})


def prepare_config(product, directory, data_dir):
    if product != 'kvrocks':
        return None
    preflight = json.loads((R / 'preflight-server.json').read_text())
    if sha(common.TEMPLATE) != preflight['kvrocks_template_sha256']:
        raise RuntimeError('Kvrocks template changed after preflight')
    original = common.TEMPLATE.read_text()
    parsed = {}
    for line in original.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        key, value = line.split(None, 1)
        if key in parsed:
            raise RuntimeError('Duplicate Kvrocks template directive: ' + key)
        parsed[key] = value
    expected = {'dir': '/mnt/storage-peers-20261014/kvrocks', 'bind': HOST,
                'port': '6379', 'workers': '16', 'daemonize': 'no',
                'rocksdb.disable_auto_compactions': 'no'}
    if any(parsed.get(key) != value for key, value in expected.items()):
        raise RuntimeError('Kvrocks template critical settings mismatch')
    lines = [f'dir {data_dir}' if line.strip().startswith('dir ') else line
             for line in original.splitlines()]
    config = directory / 'server.conf'
    config.write_text('\n'.join(lines) + '\n')
    return config


def start_impl(product, label):
    if product not in common.PEERS or not label_valid(label) or f'-{product}-' not in label:
        raise ValueError('Unexpected product/session label')
    common.verify_idle()
    common.verify_raid()
    manifest = common.verified_manifest()
    entry = manifest['variants'][product]
    directory, data_dir = R / label, MOUNT / label
    if directory.exists() or data_dir.exists():
        raise RuntimeError('Session directory already exists; refusing implicit reuse')
    directory.mkdir()
    data_dir.mkdir()
    save(directory / 'fresh-data.json', {'time': time.time(), 'root': str(R),
         'data_dir': str(data_dir), 'empty_before_start': not any(data_dir.iterdir()),
         'raid_receipt_sha256': sha(R / 'raid-ready.json')})
    config = prepare_config(product, directory, data_dir)
    binary = entry['binary']
    if product in ('redis', 'valkey'):
        io_threads = '16' if product == 'redis' else '8'
        args = [binary, '--bind', HOST, '--protected-mode', 'no', '--port', '6379',
                '--dir', str(data_dir), '--save', '', '--appendonly', 'no',
                '--io-threads', io_threads, '--maxclients', '10000']
    else:
        args = [binary, '-c', str(config)]
    args = ['taskset', '-c', '0-15'] + args
    launch = {'root': str(R), 'product': product, 'revision': entry['version'],
              'version': entry['version'], 'binary': binary, 'binary_sha256': entry['sha256'],
              'label': label, 'args': args, 'data_dir': str(data_dir), 'time': time.time(),
              'manifest_sha256': sha(R / 'peer-manifest.json'), 'environment': {'LC_ALL': 'C'},
              'config_sha256': sha(config) if config else None}
    save(directory / 'launch.json', launch)
    with (directory / 'supervisor.log').open('w') as log:
        supervisor = sp.Popen(['/usr/bin/python3', str(R / 'server.py'), '_supervise', label],
                              stdin=sp.DEVNULL, stdout=log, stderr=sp.STDOUT,
                              start_new_session=True)
    deadline = time.monotonic() + 300
    while time.monotonic() < deadline:
        if supervisor.poll() is not None:
            raise RuntimeError('Server supervisor exited before readiness')
        try:
            active = identity()
            if cli('PING') == 'PONG':
                config_values = configuration(product)
                info_text = cli('INFO', 'server')
                info = dict(line.split(':', 1) for line in info_text.splitlines()
                            if ':' in line and not line.startswith('#'))
                if info.get(product + '_version') != entry['version']:
                    raise RuntimeError('Live peer version differs from pinned version')
                if 'process_id' in info and int(info['process_id']) != active['pid']:
                    raise RuntimeError('Listener PID differs from owned process')
                save(directory / 'ready.json', {'time': time.time(), 'active': active,
                     'config': config_values, 'info_server': info_text})
                print(json.dumps({'started': label, 'pid': active['pid']}))
                return
        except (FileNotFoundError, ProcessLookupError, sp.CalledProcessError):
            pass
        # taskset may not have exec'd the pinned binary at the first check.
        except RuntimeError as error:
            if str(error) != 'Active PID executable mismatch':
                raise
        time.sleep(.5)
    raise RuntimeError('Server readiness timeout; inspect task-owned process')


def start(product, label):
    try:
        start_impl(product, label)
    except BaseException:
        failure = {'time': time.time(), 'product': product, 'label': label,
                   'traceback': traceback.format_exc(), 'cleanup': 'no owned active process'}
        # Readiness/config failure must not strand a server merely because the
        # remote start call raised before the client's family try/finally.
        try:
            if (R / 'active.json').exists():
                active = json.loads((R / 'active.json').read_text())
                if active.get('root') == str(R) and active.get('product') == product and active.get('label') == label:
                    stop()
                    failure['cleanup'] = 'owned process cleanly stopped'
                else:
                    failure['cleanup'] = 'unrelated active process left untouched'
        except BaseException:
            failure['cleanup_error'] = traceback.format_exc()
        if label_valid(label) and (R / label).is_dir():
            save(R / label / 'startup-failure.json', failure)
        raise


def stop():
    path = R / 'active.json'
    if not path.exists():
        if common.listener_present():
            raise RuntimeError('Unowned listener; refusing stop')
        return
    active = identity()
    directory = R / active['label']
    exit_path = directory / 'server-exit.json'
    if exit_path.exists():
        raise RuntimeError('Server exited before requested clean stop')
    requested_at = time.time()
    os.kill(active['pid'], signal.SIGTERM)
    deadline = time.monotonic() + 300
    while not exit_path.exists():
        try:
            current = stat(active['pid'])
            if current['start_ticks'] != active['start_ticks']:
                raise RuntimeError('PID reused during stop')
        except FileNotFoundError:
            pass
        if time.monotonic() > deadline:
            raise RuntimeError('Clean stop timed out; not killing')
        time.sleep(.25)
    receipt = json.loads(exit_path.read_text())
    if receipt['active'] != active or receipt['returncode'] != 0 or receipt['time'] < requested_at:
        raise RuntimeError('Server did not confirm a successful requested exit')
    if common.listener_present():
        raise RuntimeError('Listener remains after clean exit')
    if active['product'] in ('redis', 'valkey'):
        log = (directory / 'server.log').read_text()
        if 'Received SIGTERM scheduling shutdown' not in log or 'is now ready to exit' not in log:
            raise RuntimeError('Peer shutdown log confirmation missing')
    save(directory / 'stop.json', {'time': time.time(), 'requested_at': requested_at,
         'active': active, 'signal': signal.SIGTERM, 'returncode': receipt['returncode'],
         'clean_stop_confirmed': True})
    path.rename(R / ('stopped-' + str(time.time_ns()) + '.json'))


def snapshot(name):
    if not re.fullmatch(r'[a-z0-9-]+\.json', name):
        raise ValueError('Invalid snapshot name')
    active = identity()
    pid = active['pid']
    data = {'time': time.time(), 'active': active}
    for item in ('stat', 'meminfo', 'diskstats', 'net/dev'):
        data[item] = Path('/proc/' + item).read_text()
    for item in ('stat', 'status', 'io'):
        data['process_' + item] = Path(f'/proc/{pid}/{item}').read_text()
    data['info'] = {part: cli('INFO', part) for part in ('server', 'memory', 'stats', 'commandstats')}
    data['config'] = configuration(active['product'])
    (R / 'snapshots').mkdir(exist_ok=True)
    dest = R / 'snapshots' / name
    if dest.exists():
        raise RuntimeError('Snapshot already exists')
    save(dest, data)


if __name__ == '__main__':
    common.verify_host()
    resource.setrlimit(resource.RLIMIT_NOFILE, (65535, 65535))
    action = sys.argv[1]
    if action == '_supervise' and len(sys.argv) == 3:
        supervise(sys.argv[2])
    else:
        with (R.parent / '.benchmark-control.lock').open('a') as global_lock, \
                (R / 'control.lock').open('a') as lock:
            fcntl.flock(global_lock, fcntl.LOCK_EX)
            fcntl.flock(lock, fcntl.LOCK_EX)
            if action == 'start' and len(sys.argv) == 4:
                start(*sys.argv[2:])
            elif action == 'stop' and len(sys.argv) == 2:
                stop()
            elif action == 'snapshot' and len(sys.argv) == 3:
                snapshot(sys.argv[2])
            else:
                raise ValueError('Unsupported control action/arguments')
