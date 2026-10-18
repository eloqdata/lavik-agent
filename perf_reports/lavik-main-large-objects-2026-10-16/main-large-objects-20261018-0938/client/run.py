"""Pinned latest-main large-object rerun; run detached as root on the benchmark client.

Completed families can be skipped on restart. A partially completed family is
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
    'bench_workdist': ('pr342-packed-20261017', 'eab817a14c855063cc2bc338f3ab742a262e631dc40dc77a4b8987a823770d94'),
    'bench_hash': ('pr342-packed-20261017', '67bc9feaf0aedfc48f27aceb4ca75fc597a0904572a19d1aeccbb47c9f9d0e9b'),
    'bench_lrange': ('pr342-packed-20261017', '212c6fae56f6e6490359a645219afea32dd7da0822cd19d8bd6bcbeadbdf13b8'),
    'bench': ('main-large-objects-c80-20261015', 'f596a6f1a5a1a600c5cec3240e0f56a0dd56f338283d5666e38a4c82ccb62b08'),
}
SOURCE_HASHES = {
    'bench_workdist': '682dda4d704bac714ddbf1096ad8335b8d9a3b7060486ff16e693719e63159fc',
    'bench_hash': '5a16774f39bd0565360f8092a42d2ddf8582b8c0befb30b822ab572cf825b14d',
    'bench_lrange': 'a29bec4837d5368f9afad61ea279afe739994642a80f15a116ae428b0da53b54',
}
FAMILIES = {
    'hashread': ('hgetall', 'hkeys', 'hvals'),
    'setread': ('smembers',),
    'listread': ('lrange',),
    'zsetread': ('zrange',),
    'hashwrite': ('hash',),
    'listwrite': ('list',),
}
WRITES = ('hash', 'list')
OWNS_RUN = False


def sha(path):
    with Path(path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def prepare_client():
    """Reuse the exact clients used by earlier measurements, without rebuilding."""
    rows = {}
    for name, (previous, digest) in CLIENTS.items():
        source = b.R.parent / previous / name
        target = b.R / name
        if sha(source) != digest:
            raise RuntimeError('Original client binary hash changed: ' + str(source))
        if not target.exists():
            shutil.copy2(source, target)
        if sha(target) != digest:
            raise RuntimeError('Staged client binary hash mismatch: ' + name)
        row = {'binary_sha256': digest, 'copied_from': str(source)}
        if name in SOURCE_HASHES:
            cpp = Path(str(source) + '.cpp')
            if sha(cpp) != SOURCE_HASHES[name]:
                raise RuntimeError('Original client source hash changed: ' + str(cpp))
            target_cpp = b.R / (name + '.cpp')
            if not target_cpp.exists():
                shutil.copy2(cpp, target_cpp)
            if sha(target_cpp) != SOURCE_HASHES[name]:
                raise RuntimeError('Staged client source hash mismatch: ' + name)
            row['source_sha256'] = SOURCE_HASHES[name]
        rows[name] = row
    b.save(b.R / 'client-manifest.json', rows)


def command(op, phase, output, seconds, connections):
    if connections not in (1, 80):
        raise ValueError('Only c1 and c80 are in this plan')
    if phase == 'load' and connections != 80:
        raise ValueError('Loads use c80')
    if op in b.HASH_OPS:
        args = b.hash_command(op, phase, output)
    elif op in ('lrange', 'zrange'):
        args = b.collection_command(op, phase, output)
    else:
        if op not in ('smembers', *WRITES):
            raise ValueError('Unsupported operation: ' + op)
        args = [str(b.R / ('bench_workdist' if op == 'smembers' else 'bench')),
                '--host', b.HOST, '--op', op, '--phase', phase,
                '--prefix', b.PREFIX if op == 'smembers' else 'formal:' + op,
                '--keys', str(b.KEYS), '--connections', '80', '--threads', '16',
                '--seconds', str(seconds), '--seed',
                '101' if phase == 'load' else '10180' if phase == 'warm' else '20180',
                '--out', str(output)]
        if op == 'smembers':
            args += ['--load-seed', '101']
    args[args.index('--seconds') + 1] = str(seconds)
    args[args.index('--connections') + 1] = str(connections)
    args[args.index('--threads') + 1] = '1' if connections == 1 else '16'
    args[args.index('--seed') + 1] = str(101 if phase == 'load' else
        (10101 if connections == 1 else 10180) if phase == 'warm' else
        (20101 if connections == 1 else 20180))
    return args


def result(directory, op, phase, seconds, connections):
    value = json.loads((directory / 'result.json').read_text())
    if (value['errors'] != 0 or value['op'] != op or value['phase'] != phase
            or value['keys'] != b.KEYS or value['connections'] != connections):
        raise RuntimeError('Result identity/error mismatch: ' + str(directory))
    if phase == 'load':
        count = value['metrics']['LOAD']['count']
        expected = b.KEYS * (256 if op in ('smembers', 'zrange') else 64)
        if count != expected:
            raise RuntimeError('Incomplete load acknowledgements: ' + str(directory))
    else:
        total = value['metrics']['OPERATIONS']['count']
        if total <= 0 or value['elapsed_seconds'] < seconds:
            raise RuntimeError('Incomplete timed workload: ' + str(directory))
        if any(metric['count'] != total for metric in value['metrics'].values()):
            raise RuntimeError('Operation/command counter mismatch: ' + str(directory))
        if op in b.HASH_OPS or op == 'smembers':
            distribution = json.loads((directory / 'result.json.workdist.json').read_text())
            if (distribution['completed'] != total
                    or sum(row['completed'] for row in distribution['threads']) != total
                    or sum(row['completed'] for row in distribution['connections']) != total
                    or len(distribution['threads']) != (1 if connections == 1 else 16)
                    or len(distribution['connections']) != connections):
                raise RuntimeError('Client distribution counter mismatch: ' + str(directory))
    (directory / 'COMPLETE').write_text(time.strftime('%FT%TZ', time.gmtime()))
    return value


def snapshot(path):
    b.save(path, {'time': time.time(), **{
        name: Path('/proc/' + name).read_text()
        for name in ('stat', 'meminfo', 'net/dev', 'net/snmp', 'net/netstat', 'softirqs')
    }})


def execute(label, op, phase, seconds, connections=80, observe=False):
    directory = b.R / 'results' / label
    directory.mkdir(parents=True, exist_ok=False)
    args = command(op, phase, directory / 'result.json', seconds, connections)
    b.save(directory / 'command.json', args)
    active = json.loads(b.shell(['sudo', 'cat', b.SR + '/active.json']))
    if active['root'] != b.SR or active['product'] not in b.VARIANTS:
        raise RuntimeError('Unexpected active server identity')
    b.save(directory / 'case.json', {
        'label': label, 'op': op, 'phase': phase, 'keys': b.KEYS,
        'connections': connections, 'client_threads': 1 if connections == 1 else 16, 'seconds': seconds,
        'variant': active['product'], 'revision': active['revision'],
        'binary_sha256': active['binary_sha256'], 'observed': observe,
        'profiled': False, 'observation_seconds': 45 if observe else 0,
    })
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
            code = process.wait(timeout=7200 if phase == 'load' else seconds + 240)
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
    value = result(directory, op, phase, seconds, connections)
    key = 'LOAD' if phase == 'load' else 'OPERATIONS'
    b.event(f'DONE {label}: {value["metrics"][key]["qps"]:.2f} operations/s')
    return value


class WriteSample(b.Resp):
    def cmd(self, command, key, *extra):
        permitted = {'HLEN': ('formal:hash', ()),
                     'HGET': ('formal:hash', ('f2048',)),
                     'LLEN': ('formal:list', ()),
                     'LINDEX': ('formal:list', ('2048',))}
        prefix, suffix = permitted.get(command, ('', None))
        if not prefix or not key.startswith(prefix + ':') or tuple(map(str, extra)) != suffix:
            raise ValueError('Unexpected write sample command')
        args = [str(arg).encode() for arg in (command, key, *extra)]
        data = b'*' + str(len(args)).encode() + b'\r\n' + b''.join(
            b'$' + str(len(arg)).encode() + b'\r\n' + arg + b'\r\n' for arg in args)
        self.socket.sendall(data)
        return self.read()


def validate(family, label):
    if family == 'hashread':
        return b.validate_hash(label)
    if family == 'setread':
        return b.validate(label)
    if family in ('listread', 'zsetread'):
        return b.validate_collection(FAMILIES[family][0], label)
    op = FAMILIES[family][0]
    rows = {}
    with WriteSample() as connection:
        for index in (0, b.KEYS // 2, b.KEYS - 1):
            key = f'formal:{op}:{index}'
            count = connection.cmd('HLEN' if op == 'hash' else 'LLEN', key)
            value = connection.cmd('HGET' if op == 'hash' else 'LINDEX', key,
                                   'f2048' if op == 'hash' else 2048)
            if count != 4096 or not isinstance(value, bytes) or len(value) != 256:
                raise RuntimeError('Write sample cardinality/value mismatch: ' + key)
            rows[key] = {'cardinality': count, 'value_bytes': len(value),
                         'sample_sha256': hashlib.sha256(value).hexdigest()}
    b.save(b.R / (label + '-validation.json'), rows)
    return rows


def server_session(variant, label, function):
    """Only stop a server after this exact task's start returned successfully."""
    b.remote('start', variant, label)
    try:
        return function()
    finally:
        b.remote('stop')


def family_run(family, mode):
    smoke = mode == 'smoke'
    token = ('smoke-' if smoke else '') + family
    marker = b.R / 'families' / (token + '.json')
    if marker.exists():
        state = json.loads(marker.read_text())
        if state['state'] == 'complete':
            b.event('SKIP completed family ' + token)
            return state['results']
        raise RuntimeError('Partial family requires inspection before retry: ' + token)
    b.save(marker, {'state': 'started', 'time': time.time()})
    operations = FAMILIES[family]
    write = family.endswith('write')
    rows = {}
    def load():
        b.remote('reset-data', token)
        value = execute(token + '-load', operations[0], 'load', 1)
        validate(family, token + '-loaded')
        return value
    # Both connection counts open the same freshly loaded read population;
    # neither benefits from the allocator/cache history of the loader process.
    rows['load'] = server_session('main', 'session-load-' + token, load)
    for connections in ((80,) if write else (80, 1)):
        label = (('smoke-' if smoke else '') + ('c1-' if connections == 1 else '')
                 + family + '-main')
        def measure():
            before = validate(family, label + '-before')
            measurements = {}
            for op in operations:
                execute(label + '-' + op + '-warm', op, 'warm',
                        2 if smoke else 60, connections)
                measurements[op] = execute(label + '-' + op + f'-c{connections}',
                    op, 'run', 3 if smoke else 60, connections, observe=not smoke)
            after = validate(family, label + '-after')
            if not write and family != 'hashread' and before != after:
                raise RuntimeError('Read-only dataset samples changed: ' + label)
            return measurements
        rows[f'c{connections}'] = server_session('main', 'session-' + label, measure)
        b.save(b.R / (token + '-partial-summary.json'), rows)
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
    clients = {'bench', 'bench_hash', 'bench_lrange', 'bench_workdist', 'memtier_benchmark'}
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
    # Hold both locks through the complete suite. Legacy scripts are additionally
    # checked by process identity before touching the server or scratch data.
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
        raise RuntimeError('Complete c80/c1 smoke validation before formal measurements')
    b.KEYS = 8 if mode == 'smoke' else 8192
    b.save(b.R / (mode + '-plan.json'), {
        'mode': mode, 'variants': {'main': '9c68079a7dd775db647cf55fe578a6cd43426a82'},
        'keys': b.KEYS, 'connections': [80, 1], 'pipeline': 1,
        'modes': {'c80': {'connections': 80, 'client_threads': 16, 'warm_seed': 10180, 'formal_seed': 20180},
                  'c1': {'connections': 1, 'client_threads': 1, 'warm_seed': 10101, 'formal_seed': 20101}},
        'load_connections': 80, 'load_client_threads': 16, 'load_seed': 101,
        'warm_seconds': 2 if mode == 'smoke' else 60,
        'formal_seconds': 3 if mode == 'smoke' else 60,
        'observation_seconds': 0 if mode == 'smoke' else 45,
        'families': FAMILIES, 'profiled': False,
        'validation': 'load acknowledgements; three sample keys before and after; every benchmark reply checked',
        'restart_policy': 'load then clean stop; fresh restart before c80 and another fresh restart before c1 on the same read dataset',
        'write_policy': 'fresh dataset and clean restart; HSET and LPUSH/RPOP measured at c80 only',
    })
    summary = {}
    for family in FAMILIES:
        summary[family] = family_run(family, mode)
        b.save(b.R / (mode + '-summary.json'), summary)
    completed = time.strftime('%FT%TZ', time.gmtime())
    (b.R / (mode.upper() + '_COMPLETE')).write_text(completed)
    if mode == 'formal':
        (b.R / 'C1_COMPLETE').write_text(completed)
    b.event(mode.upper() + ' COMPLETE: eight c80 workloads and six c1 full reads')


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
