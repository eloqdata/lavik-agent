"""Pinned peer full-read completion suite; run detached as root on the benchmark client.

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
}
SOURCE_HASHES = {
    'bench_workdist': '682dda4d704bac714ddbf1096ad8335b8d9a3b7060486ff16e693719e63159fc',
    'bench_hash': '5a16774f39bd0565360f8092a42d2ddf8582b8c0befb30b822ab572cf825b14d',
    'bench_lrange': 'a29bec4837d5368f9afad61ea279afe739994642a80f15a116ae428b0da53b54',
}
VERSIONS = {'redis': '8.10.2', 'valkey': '9.1.2', 'kvrocks': '2.17.0'}
LOAD_OPS = {'hashread': 'hgetall', 'setread': 'smembers',
            'listread': 'lrange', 'zsetread': 'zrange'}
BASE_CASES = {
    'hashread': ((80, 'hkeys'), (80, 'hvals'), (1, 'hgetall'), (1, 'hkeys'), (1, 'hvals')),
    'setread': ((1, 'smembers'),),
    'listread': ((80, 'lrange'),),
    'zsetread': ((1, 'zrange'),),
}
PLAN = {product: {family: cases + (((1, 'lrange'),) if family == 'listread' and product != 'redis' else ())
                   for family, cases in BASE_CASES.items()} for product in VERSIONS}
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
        if op != 'smembers':
            raise ValueError('Unsupported operation: ' + op)
        args = [str(b.R / 'bench_workdist'),
                '--host', b.HOST, '--op', op, '--phase', phase,
                '--prefix', b.PREFIX,
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


def execute(product, label, op, phase, seconds, connections=80, observe=False):
    directory = b.R / 'results' / label
    directory.mkdir(parents=True, exist_ok=False)
    args = command(op, phase, directory / 'result.json', seconds, connections)
    b.save(directory / 'command.json', args)
    active = json.loads(b.shell(['sudo', 'cat', b.SR + '/active.json']))
    if (active['root'] != b.SR or active['product'] != product
            or active['revision'] != VERSIONS[product]
            or not label.startswith(active['label'].removeprefix('session-') + '-')):
        raise RuntimeError('Unexpected active server identity')
    b.save(directory / 'case.json', {
        'label': label, 'op': op, 'phase': phase, 'keys': b.KEYS,
        'connections': connections, 'client_threads': 1 if connections == 1 else 16, 'seconds': seconds,
        'product': active['product'], 'variant': active['product'], 'revision': active['revision'],
        'server_session': active['label'], 'server_pid': active['pid'],
        'client_binary_sha256': sha(args[0]),
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
                if any(server[key] != active[key] for key in
                       ('root', 'product', 'revision', 'label', 'pid', 'start_ticks', 'binary_sha256')):
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


def validate(family, label):
    if family == 'hashread':
        return b.validate_hash(label)
    if family == 'setread':
        return b.validate(label)
    if family in ('listread', 'zsetread'):
        return b.validate_collection(LOAD_OPS[family], label)
    raise ValueError('Unexpected read family')


def family_run(product, family, mode):
    smoke = mode == 'smoke'
    token = ('smoke-' if smoke else '') + product + '-' + family
    marker = b.R / 'families' / (token + '.json')
    if marker.exists():
        state = json.loads(marker.read_text())
        if state['state'] == 'complete':
            b.event('SKIP completed family ' + token)
            return state['results']
        raise RuntimeError('Partial family requires inspection before retry: ' + token)
    b.save(marker, {'state': 'started', 'product': product, 'family': family, 'time': time.time()})
    rows = {}
    b.remote('start', product, 'session-' + token)
    try:
        # The controller provides a new empty data directory for every session.
        # All reads share the loaded server process, including Redis with save="".
        rows['load'] = execute(product, token + '-load', LOAD_OPS[family], 'load', 1)
        before = validate(family, token + '-loaded')
        validate(family, token + '-before')
        for connections, op in PLAN[product][family]:
            execute(product, token + '-' + op + f'-warm-c{connections}', op, 'warm',
                    2 if smoke else 60, connections)
            rows.setdefault(f'c{connections}', {})[op] = execute(
                product, token + '-' + op + f'-c{connections}', op, 'run',
                3 if smoke else 60, connections, observe=not smoke)
        after = validate(family, token + '-after')
        if family != 'hashread' and before != after:
            raise RuntimeError('Read-only sample changed: ' + token)
    finally:
        b.remote('stop')
    b.save(marker, {'state': 'complete', 'product': product, 'family': family,
                    'time': time.time(), 'results': rows})
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
    runners = {'run.py', 'run_c1.py', 'runner.py', 'suite.py', 'batch.py'}
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


def run_phase(mode):
    if mode == 'formal' and not (b.R / 'SMOKE_COMPLETE').exists():
        raise RuntimeError('Complete all missing-point smoke combinations before formal measurements')
    b.KEYS = 8 if mode == 'smoke' else 8192
    b.save(b.R / (mode + '-plan.json'), {
        'mode': mode, 'versions': VERSIONS, 'keys': b.KEYS, 'pipeline': 1,
        'modes': {'c80': {'connections': 80, 'client_threads': 16, 'warm_seed': 10180, 'formal_seed': 20180},
                  'c1': {'connections': 1, 'client_threads': 1, 'warm_seed': 10101, 'formal_seed': 20101}},
        'load_connections': 80, 'load_client_threads': 16, 'load_seed': 101,
        'load_seconds': 1, 'warm_seconds': 2 if mode == 'smoke' else 60,
        'formal_seconds': 3 if mode == 'smoke' else 60,
        'observation_seconds': 0 if mode == 'smoke' else 45,
        'cases': PLAN, 'profiled': False,
        'formal_points': 26,
        'validation': 'load acknowledgements; three sample keys before and after; every timed reply fully validated by the pinned client',
        'lifecycle': 'fresh empty data directory per product/family; load, warm and formal share one server PID; clean stop after the family',
        'comparison_boundary': 'Latest-main reads restarted after loading; peer reads retain their loader process, as Redis and Valkey persistence is disabled.',
    })
    summary = {}
    for product in VERSIONS:
        summary[product] = {}
        for family in PLAN[product]:
            summary[product][family] = family_run(product, family, mode)
            b.save(b.R / (mode + '-summary.json'), summary)
    (b.R / (mode.upper() + '_COMPLETE')).write_text(time.strftime('%FT%TZ', time.gmtime()))
    b.event(mode.upper() + ' COMPLETE: 26 peer full-read cases')


def main(mode):
    # Keep ownership for the entire smoke+formal sequence when called by suite.py.
    shared_lock = (b.R.parent / '.benchmark-runner.lock').open('a')
    fcntl.flock(shared_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    lock = (b.R / 'runner.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    other_benchmark_preflight()
    global OWNS_RUN
    OWNS_RUN = True
    b.client_preflight()
    prepare_client()
    phases = ('smoke', 'formal') if mode == 'all' else (mode,)
    if mode == 'all':
        with (b.R / 'SUITE_STARTED').open('x') as handle:
            handle.write(time.strftime('%FT%TZ', time.gmtime()))
    for phase in phases:
        try:
            run_phase(phase)
        except BaseException:
            b.save(b.R / (phase + '-failure.json'), {'time': time.time(), 'traceback': traceback.format_exc()})
            raise
    if mode == 'all':
        b.save(b.R / 'suite-completion.json', {'utc': time.strftime('%FT%TZ', time.gmtime()),
               'formal_results': 26, 'status': 'complete'})


def entry(mode):
    def interrupted(signum, _frame):
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        raise InterruptedError('Runner interrupted by signal ' + str(signum))
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        main(mode)
    except BaseException:
        if OWNS_RUN:
            label = 'suite' if mode == 'all' else mode
            b.save(b.R / (label + '-failure.json'), {'time': time.time(), 'traceback': traceback.format_exc()})
            b.event('FAILED ' + label)
        raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('smoke', 'formal'))
    entry(parser.parse_args().mode)
