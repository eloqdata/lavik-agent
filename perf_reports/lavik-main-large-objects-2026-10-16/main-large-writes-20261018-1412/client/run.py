"""Pinned latest-main large-object write rerun; run detached as root on the benchmark client.

Completed workloads can be skipped on restart. A partially completed family is
never retried automatically, because its scratch data may already have changed.
"""
from pathlib import Path
import argparse
import fcntl
import hashlib
import json
import os
import shlex
import shutil
import signal
import subprocess as sp
import time
import traceback

import runner as b

CLIENTS = {
    'bench': {'source': '/opt/benchmark/main-large-objects-c80-20261015/bench',
              'sha256': 'f596a6f1a5a1a600c5cec3240e0f56a0dd56f338283d5666e38a4c82ccb62b08',
              'source_sha256': 'ab2446bcd3147ebe62b7ca450b5520634469082081b705f6872f314d5ce36780'},
    'bench_sswap': {'source': '/opt/benchmark/main-large-reads-set-c80-20261016/bench',
                    'sha256': '3f52c506cb5927b62c7ca6e295a7e6d14f89865f6685b69841ff9e67a58ca39d',
                    'source_sha256': '325d8822c108d1f1be387fc4d386d16190a33753a5490305cb33b20990e4fae4'},
}
OPS = ('set', 'setrange', 'hash', 'list', 'zincr', 'zswap', 'stream', 'sswap')
PAIRED = ('list', 'zswap', 'sswap')
STATEFUL = ('zswap', 'sswap')
LOAD_COUNTS = {'set': 1, 'setrange': 1, 'hash': 64, 'list': 64,
               'zincr': 256, 'zswap': 256, 'stream': 4096, 'sswap': 256}
METRICS = {'set': ('SET',), 'setrange': ('SETRANGE',), 'hash': ('HSET',),
           'list': ('LPUSH', 'RPOP'), 'zincr': ('ZINCRBY',),
           'zswap': ('ZREM', 'ZADD'), 'stream': ('XADD_MAXLEN',),
           'sswap': ('SADD', 'SREM')}
OWNS_RUN = False


def sha(path):
    with Path(path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def prepare_client():
    rows = {}
    for name, expected in CLIENTS.items():
        source = Path(expected['source'])
        target = b.R / name
        if sha(source) != expected['sha256']:
            raise RuntimeError('Original client binary hash changed: ' + str(source))
        if not target.exists():
            shutil.copy2(source, target)
        if sha(target) != expected['sha256']:
            raise RuntimeError('Staged client binary hash mismatch: ' + name)
        source_file = b.R / (name + '.cpp')
        if sha(source_file) != expected['source_sha256']:
            raise RuntimeError('Staged exact client source hash mismatch: ' + name)
        rows[name] = {'binary_sha256': expected['sha256'], 'copied_from': str(source),
                      'source_sha256': expected['source_sha256']}
    b.save(b.R / 'client-manifest.json', rows)


def command(op, phase, output, seconds, state=None):
    if op not in OPS or phase not in ('load', 'warm', 'run'):
        raise ValueError('Unsupported operation/phase')
    if (phase == 'load' and seconds != 0) or (phase != 'load' and seconds <= 0):
        raise ValueError('Unexpected workload duration')
    name = 'bench_sswap' if op == 'sswap' else 'bench'
    args = [str(b.R / name), '--host', b.HOST, '--op', op, '--phase', phase,
            '--prefix', 'formal:' + op, '--keys', str(b.KEYS),
            '--connections', '80', '--threads', '16', '--seconds', str(seconds),
            '--seed', str(101 if phase == 'load' else 10180 if phase == 'warm' else 20180),
            '--out', str(output)]
    if op == 'sswap':
        args += ['--load-seed', '101']
    if op in STATEFUL and phase != 'load':
        if state is None:
            raise ValueError('Paired toggle workload requires persistent state')
        args += ['--state', str(state)]
    elif state is not None:
        raise ValueError('Unexpected toggle state')
    return args


def result(directory, op, phase, seconds):
    value = json.loads((directory / 'result.json').read_text())
    if (value['errors'] != 0 or value['op'] != op or value['phase'] != phase
            or value['keys'] != b.KEYS or value['connections'] != 80):
        raise RuntimeError('Result identity/error mismatch: ' + str(directory))
    if phase == 'load':
        if set(value['metrics']) != {'LOAD'} or value['metrics']['LOAD']['count'] != b.KEYS * LOAD_COUNTS[op]:
            raise RuntimeError('Incomplete load acknowledgements: ' + str(directory))
    else:
        total = value['metrics']['OPERATIONS']['count']
        if total <= 0 or value['elapsed_seconds'] < seconds:
            raise RuntimeError('Incomplete timed workload: ' + str(directory))
        if set(value['metrics']) != {'OPERATIONS', *METRICS[op]}:
            raise RuntimeError('Unexpected operation metrics: ' + str(directory))
        if any(metric['count'] != total for metric in value['metrics'].values()):
            raise RuntimeError('Operation/command counter mismatch: ' + str(directory))
    return value


def preserve_state(state, directory, phase):
    if state is None:
        return None
    if not state.exists():
        return {'exists': False}
    import struct
    data = state.read_bytes()
    if len(data) != 8 + 1280 * b.KEYS or struct.unpack('<ii', data[:8]) != (1280, b.KEYS):
        raise RuntimeError('Toggle state shape mismatch')
    if any(value not in (0, 1) for value in data[8:]) or any(data[8 + 80 * b.KEYS:]):
        raise RuntimeError('Toggle state values/inactive connection slots mismatch')
    output = directory / ('state-' + phase + '.bin')
    with output.open('xb') as handle:
        handle.write(data)
    return {'exists': True, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
            'capacity': 1280, 'keys': b.KEYS, 'snapshot': output.name}


def snapshot(path):
    b.save(path, {'time': time.time(), **{
        name: Path('/proc/' + name).read_text()
        for name in ('stat', 'meminfo', 'net/dev', 'net/snmp', 'net/netstat', 'softirqs')
    }})


def execute(label, op, phase, seconds, state=None, observe=False):
    directory = b.R / 'results' / label
    directory.mkdir(parents=True, exist_ok=False)
    args = command(op, phase, directory / 'result.json', seconds, state)
    b.save(directory / 'command.json', args)
    active = json.loads(b.shell(['sudo', 'cat', b.SR + '/active.json']))
    if active['root'] != b.SR or active['product'] not in b.VARIANTS:
        raise RuntimeError('Unexpected active server identity')
    b.save(directory / 'case.json', {
        'label': label, 'op': op, 'phase': phase, 'keys': b.KEYS,
        'connections': 80, 'client_threads': 16, 'seconds': seconds,
        'state_path': str(state) if state is not None else None,
        'variant': active['product'], 'revision': active['revision'],
        'binary_sha256': active['binary_sha256'], 'observed': observe,
        'profiled': False, 'observation_seconds': 45 if observe else 0,
    })
    state_before = preserve_state(state, directory, 'before')
    if state is not None and (phase == 'run') != state_before['exists']:
        raise RuntimeError('Warm must start with new state; formal must reuse warm state')
    b.remote('snapshot', label + '-before.json')
    snapshot(directory / 'client-before.json')
    b.event(label)
    start = time.time()
    jobs, logs = [], []
    with (directory / 'run.log').open('w') as output:
        process = sp.Popen(args, stdout=output, stderr=sp.STDOUT)
        try:
            if observe:
                time.sleep(3)
                if process.poll() is not None:
                    raise RuntimeError('Client ended before observation')
                raw = Path(f'/proc/{process.pid}/stat').read_text()
                ticks = raw[raw.rfind(')') + 1:].split()[19]
                client = {'pid': process.pid, 'start_ticks': ticks, 'binary': args[0],
                          'binary_sha256': sha(args[0])}
                b.save(directory / 'client-identity.json', client)
                server = json.loads(b.shell(['sudo', 'cat', b.SR + '/active.json']))
                if server['root'] != b.SR or server['product'] not in b.VARIANTS:
                    raise RuntimeError('Unexpected active server identity')
                for side, identity, root in (('server', server, b.SR),
                                             ('client', client, str(b.R))):
                    observer = ['python3', root + '/observe.py', str(identity['pid']), '45',
                                root + '/observations/' + label,
                                '--expected-exe', identity['binary'],
                                '--expected-start', identity['start_ticks']]
                    if side == 'server':
                        observer = b.SSH + [shlex.join(['sudo', *observer])]
                    log = (directory / (side + '-observe.log')).open('w')
                    logs.append(log)
                    jobs.append(sp.Popen(observer, stdout=log, stderr=sp.STDOUT))
            code = process.wait(timeout=43200 if phase == 'load' else seconds + 240)
            if code:
                raise sp.CalledProcessError(code, args)
            for job in jobs:
                if job.wait(timeout=90):
                    raise RuntimeError('Observer failed: ' + label)
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=30)
            for job in jobs:
                if job.poll() is None:
                    job.wait(timeout=90)
            for log in logs:
                log.close()
    snapshot(directory / 'client-after.json')
    b.remote('snapshot', label + '-after.json')
    b.save(directory / 'timing.json', {'start': start, 'end': time.time()})
    value = result(directory, op, phase, seconds)
    if state is not None:
        state_after = preserve_state(state, directory, 'after')
        if not state_after['exists']:
            raise RuntimeError('Successful paired workload did not save toggle state')
        b.save(directory / 'state-manifest.json', {'path': str(state), 'before': state_before, 'after': state_after})
    (directory / 'COMPLETE').write_text(time.strftime('%FT%TZ', time.gmtime()))
    key = 'LOAD' if phase == 'load' else 'OPERATIONS'
    b.event(f'DONE {label}: {value["metrics"][key]["qps"]:.2f} operations/s')
    return value


def workload_run(op, mode):
    smoke = mode == 'smoke'
    token = ('smoke-' if smoke else '') + op
    marker = b.R / 'families' / (token + '.json')
    if marker.exists():
        stored = json.loads(marker.read_text())
        if stored['state'] == 'complete':
            b.event('SKIP completed workload ' + token)
            return stored['results']
        raise RuntimeError('Partial workload requires inspection before retry: ' + token)
    b.save(marker, {'state': 'started', 'time': time.time()})
    label = token + '-main'
    state = b.R / 'states' / (token + '.bin') if op in STATEFUL else None
    if state is not None:
        state.parent.mkdir(parents=True, exist_ok=True)
        if state.exists():
            raise RuntimeError('Fresh dataset requires fresh toggle state')
    rows = {}
    b.remote('start', 'main', 'session-' + label)
    try:
        b.remote('reset-data', token)
        rows['load'] = execute(token + '-load', op, 'load', 0)
        b.validate(op, token + '-loaded')
        b.validate(op, label + '-before')
        execute(label + '-' + op + '-warm', op, 'warm', 2 if smoke else 90, state)
        rows['c80'] = {op: execute(label + '-' + op + '-c80', op, 'run',
                                  3 if smoke else 60, state, observe=not smoke)}
        b.validate(op, label + '-after')
    finally:
        b.remote('stop')
    b.save(marker, {'state': 'complete', 'time': time.time(), 'results': rows})
    return rows


def other_benchmark_preflight():
    """Catch legacy runners that do not yet participate in the shared lock."""
    excluded = {os.getpid()}
    ancestor = os.getppid()
    while ancestor > 1:
        excluded.add(ancestor)
        try:
            raw = Path(f'/proc/{ancestor}/stat').read_text()
            ancestor = int(raw[raw.rfind(')') + 1:].split()[1])
        except (OSError, ValueError, IndexError):
            break
    runners = {'run.py', 'run_c1.py', 'runner.py'}
    clients = {'bench', 'bench_sswap', 'bench_hash', 'bench_lrange', 'bench_workdist', 'memtier_benchmark'}
    for entry in Path('/proc').iterdir():
        if not entry.name.isdecimal() or int(entry.name) in excluded:
            continue
        try:
            argv = [arg.decode(errors='replace') for arg in (entry / 'cmdline').read_bytes().split(b'\0') if arg]
            executable = Path(os.readlink(entry / 'exe')).name
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            continue
        if executable in clients or any(arg.startswith('/opt/benchmark/') and Path(arg).name in runners for arg in argv):
            raise RuntimeError('Another benchmark process is alive: ' + entry.name)


def main(mode):
    shared_lock = (b.R.parent / '.benchmark-runner.lock').open('a')
    fcntl.flock(shared_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    lock = (b.R / 'runner.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    other_benchmark_preflight()
    global OWNS_RUN
    OWNS_RUN = True
    b.client_preflight()
    prepare_client()
    if mode == 'formal' and not (b.R / 'SMOKE_COMPLETE').exists():
        raise RuntimeError('Complete all eight smoke workloads before formal measurements')
    b.KEYS = 8 if mode == 'smoke' else 8192
    b.save(b.R / (mode + '-plan.json'), {
        'mode': mode, 'variants': {'main': '9c68079a7dd775db647cf55fe578a6cd43426a82'},
        'keys': b.KEYS, 'connections': [80], 'client_threads': 16, 'pipeline': 1,
        'load_connections': 80, 'load_client_threads': 16, 'load_seed': 101,
        'warm_seed': 10180, 'formal_seed': 20180, 'load_seconds': 0,
        'warm_seconds': 2 if mode == 'smoke' else 90,
        'formal_seconds': 3 if mode == 'smoke' else 60,
        'observation_seconds': 0 if mode == 'smoke' else 45,
        'workloads': OPS, 'profiled': False,
        'validation': 'load acknowledgements; three sample keys before and after; every benchmark reply checked',
        'restart_policy': 'each workload starts fresh; FLUSHDB, load, warm and formal use the same server PID; clean stop after each workload',
        'state_policy': 'zswap and sswap preserve per-connection/per-key toggle state from warm to formal; no state reused after a fresh load',
        'paired_operations': PAIRED,
    })
    summary = {}
    for op in OPS:
        summary[op] = workload_run(op, mode)
        b.save(b.R / (mode + '-summary.json'), summary)
    (b.R / (mode.upper() + '_COMPLETE')).write_text(time.strftime('%FT%TZ', time.gmtime()))
    b.event(mode.upper() + ' COMPLETE: eight c80 write workloads')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('smoke', 'formal'))
    arguments = parser.parse_args()
    def interrupted(signum, _frame):
        # Give execute/server_session finally blocks time to drain and checkpoint.
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        raise InterruptedError('Runner interrupted by signal ' + str(signum))
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        main(arguments.mode)
    except BaseException:
        if OWNS_RUN:
            b.save(b.R / (arguments.mode + '-failure.json'), {'time': time.time(), 'traceback': traceback.format_exc()})
            b.event('FAILED ' + arguments.mode)
        raise
