"""Eight-point state-preserving ZSet crossover; no automatic retry or reset."""
from pathlib import Path
import argparse
import fcntl
import json
import os
import secrets
import shlex
import shutil
import signal
import subprocess as sp
import time
import traceback
import runner as b
from clients import interface as client
from experiment import (NAME, HOST, KEYS, CONNECTIONS, THREADS, MEMBERS, REVISIONS,
                        WARM_SECONDS, FORMAL_SECONDS, OBSERVATION_SECONDS,
                        METRICS, SEQUENCE, stem, needs_load, expected_entries)

OWNS_RUN = False
class InterruptedRun(BaseException):
    """Never swallowed by subprocess.wait or a generic except Exception."""

def interrupted(signum, _frame):
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    raise InterruptedRun('Runner interrupted by signal ' + str(signum))


def prepare_clients():
    from provenance import validate_client
    manifest = validate_client(b.R, require_binary=True)
    b.save(b.R / 'client-manifest.json', manifest)
    return manifest


def snapshot_client(path):
    b.save(path, {'time': time.time(), **{name: Path('/proc/' + name).read_text()
           for name in ('stat', 'meminfo', 'net/dev', 'net/snmp', 'net/netstat', 'softirqs')}})


def counter_calls(snapshot, command):
    raw = snapshot.get('info_commandstats', snapshot.get('info', {}).get('commandstats'))
    if not isinstance(raw, str):
        raise RuntimeError('Missing commandstats snapshot')
    values = dict(line.split(':', 1) for line in raw.splitlines() if ':' in line)
    name = 'cmdstat_' + command.lower()
    fields = dict(part.strip().split('=', 1) for part in values.get(name, 'calls=0').split(',') if '=' in part)
    return int(fields['calls'])


def reconcile_counts(before, after, value, op, phase):
    expected = {'ZADD': value['metrics']['LOAD']['count']} if phase == 'load' else {
        name.split('_', 1)[0]: value['metrics'][name]['count'] for name in METRICS[op]}
    observed = {name: counter_calls(after, name) - counter_calls(before, name) for name in expected}
    if expected != observed:
        raise RuntimeError('Checked client replies differ from commandstats: ' + repr((expected, observed)))
    return {'expected': expected, 'observed': observed, 'matched': True}


def execute(variant, size, op, phase, owned, state):
    point = stem(variant, size, op)
    label = point + '-' + ('c80' if phase == 'run' else phase)
    directory = b.R / 'results' / label
    directory.mkdir(parents=True, exist_ok=False)
    args = client.command(size, op, phase, directory / 'result.json', state, host=HOST, port=6379)
    seconds = WARM_SECONDS if phase == 'warm' else FORMAL_SECONDS if phase == 'run' else 1
    b.save(directory / 'command.json', args)
    b.save(directory / 'case.json', {'label': label, 'variant': variant, 'size': size, 'op': op, 'phase': phase,
           'keys': KEYS, 'connections': CONNECTIONS, 'client_threads': THREADS, 'seconds': seconds,
           'shape': client.shape(size), 'pipeline': 1, 'revision': owned['revision'],
           'binary_sha256': owned['binary_sha256'], 'active': owned, 'profiled': False,
           'observed': phase == 'run', 'observation_seconds': OBSERVATION_SECONDS if phase == 'run' else 0,
           'client_binary_sha256': b.sha(args[0]), 'state_path': str(state) if state else None})
    if state:
        b.state_bytes(state)
        shutil.copyfile(state, directory / 'state-before.bin')
    before = b.remote('snapshot', label + '-before.json')
    if before['active'] != owned:
        raise RuntimeError('Server identity changed before workload')
    if (before.get('defrag_paused') != 'no' or before.get('transactions_drained') is not True):
        raise RuntimeError('Lavik snapshot has defrag paused or pending transactions')
    b.save(directory / 'server-before.json', before)
    snapshot_client(directory / 'client-before.json')
    b.event('START ' + label)
    started = time.time()
    jobs, files = [], []
    with (directory / 'run.log').open('w') as output:
        process = sp.Popen(args, stdout=output, stderr=sp.STDOUT)
        try:
            if phase == 'run':
                time.sleep(3)
                if process.poll() is not None:
                    raise RuntimeError('Client exited before observation')
                identity = b.identity(process.pid, args[0])
                b.save(directory / 'client-identity.json', identity)
                if b.get_active(variant, owned['label'], owned['owner_token']) != owned:
                    raise RuntimeError('Server changed during formal point')
                for side, item, root in [('server', owned, b.SR), ('client', identity, str(b.R))]:
                    observer = ['python3', root + '/observe.py', str(item['pid']), '45',
                                root + '/observations/' + label, '--expected-exe', item['binary'],
                                '--expected-start', str(item['start_ticks'])]
                    if side == 'server':
                        observer = b.SSH + [shlex.join(['sudo', *observer])]
                    log = (directory / (side + '-observe.log')).open('w')
                    files.append(log)
                    jobs.append(sp.Popen(observer, stdout=log, stderr=sp.STDOUT))
            code = process.wait(timeout=1800 if phase == 'load' else seconds + 240)
            if code:
                raise sp.CalledProcessError(code, args)
            for job in jobs:
                if job.wait(timeout=60):
                    raise RuntimeError('Observation failed: ' + label)
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=180)
            b.save(directory / 'client-exit.json', {'returncode': process.returncode, 'time': time.time()})
            for job in jobs:
                if job.poll() is None:
                    job.wait(timeout=60)
            for handle in files:
                handle.close()
    after = b.remote('snapshot', label + '-after.json')
    if after['active'] != owned:
        raise RuntimeError('Server identity changed after workload')
    if (after.get('defrag_paused') != 'no' or after.get('transactions_drained') is not True):
        raise RuntimeError('Lavik snapshot has defrag paused or pending transactions')
    b.save(directory / 'server-after.json', after)
    snapshot_client(directory / 'client-after.json')
    b.save(directory / 'timing.json', {'start': started, 'end': time.time()})
    value = client.validate_result(json.loads((directory / 'result.json').read_text()), size, op, phase)
    b.save(directory / 'command-counts.json', reconcile_counts(before, after, value, op, phase))
    from validation import transaction_delta
    b.save(directory / 'transactions.json', transaction_delta(before, after, size, phase))
    if state:
        data = b.state_bytes(state)
        shutil.copyfile(state, directory / 'state-after.bin')
        old = (directory / 'state-before.bin').read_bytes()
        changed = sum(a != z for a, z in zip(old[8:], data[8:]))
        count = 0 if phase == 'load' else value['metrics']['OPERATIONS']['count']
        if ((phase == 'load' or op == 'zincr') and old != data) or (op == 'zswap' and phase != 'load' and (changed > count or changed % 2 != count % 2)):
            raise RuntimeError('Paired operation state parity mismatch')
        b.save(directory / 'state-manifest.json', {'path': str(state), 'changed_flags': changed,
               'before': {'sha256': b.sha(directory / 'state-before.bin'), 'bytes': len(old)},
               'after': {'sha256': b.sha(directory / 'state-after.bin'), 'bytes': len(data)}})
    (directory / 'COMPLETE').write_text(time.strftime('%FT%TZ', time.gmtime()))
    metric = value['metrics']['LOAD' if phase == 'load' else 'OPERATIONS']
    b.event(f'DONE {label}: {metric["qps"]:.2f} ' + ('pairs/s' if op == 'zswap' and phase != 'load' else 'ops/s'))
    return value


def ready_check(ready, owned, previous):
    if ready['active'] != owned:
        raise RuntimeError('Ready response belongs to another service')
    recovery = ready['recovery']
    expected = {'mode': 'fresh', 'checkpoint': None} if previous is None else {
        'mode': 'checkpoint', 'checkpoint': {'generation': previous['checkpoint_generation'],
                                           'entries': previous['checkpoint_entries']}}
    if ({k: recovery[k] for k in ('mode', 'checkpoint')} != expected
            or ready.get('normal_request_ready') is not True
            or recovery.get('recovery_collection_complete') is not True
            or len(recovery.get('storage_devices', [])) != 6):
        raise RuntimeError('Recovered checkpoint does not match the previous clean stop: ' + repr(recovery))


def case_run(index, previous, state_chain):
    variant, size, op = SEQUENCE[index]
    point = stem(variant, size, op)
    marker = b.R / 'families' / (point + '.json')
    if marker.exists():
        raise RuntimeError('Case already has artifacts; no automatic retry: ' + point)
    state = b.R / 'states' / (size + '.bin')
    load = needs_load(variant, size, op)
    if load:
        if size in state_chain:
            raise RuntimeError('A namespace may only be loaded once')
        client.initialize_state(state)
    elif size not in state_chain or b.sha(state) != state_chain[size]:
        raise RuntimeError('Cross-case state continuity failed')
    b.state_bytes(state)
    token, label = secrets.token_hex(16), 'session-' + point
    b.save(marker, {'state': 'started', 'index': index, 'time': time.time(), 'variant': variant,
                   'size': size, 'op': op, 'owner_token': token, 'server_session': label})
    values = {}
    try:
        started = b.remote('start', variant, label, token)
        owned = b.get_active(variant, label, token)
        if started != owned or owned['revision'] != REVISIONS[variant]:
            raise RuntimeError('Service start identity mismatch')
        ready = json.loads(b.shell(['sudo', 'cat', b.SR + '/' + label + '/ready.json']))
        ready_check(ready, owned, previous)
        b.save(b.R / 'families' / (point + '-ready.json'), ready)
        if load:
            values['load'] = execute(variant, size, op, 'load', owned, state)
        b.validate_sample(size, client.prefix(size), point + '-loaded', state)
        values['warm'] = execute(variant, size, op, 'warm', owned, state)
        b.validate_sample(size, client.prefix(size), point + '-before', state)
        values['formal'] = execute(variant, size, op, 'run', owned, state)
        b.validate_sample(size, client.prefix(size), point + '-after', state)
    finally:
        stopped = b.remote('stop-owned', variant, label, token)
        b.save(b.R / 'families' / (point + '-stop.json'), stopped)
    if (stopped.get('clean_stop_confirmed') is not True or stopped.get('active') != owned
            or stopped.get('clean_checkpoint_confirmed') is not True
            or stopped.get('checkpoint_entries') != expected_entries(index)
            or (previous is not None and stopped['checkpoint_generation'] != previous['checkpoint_generation'] + 1)):
        raise RuntimeError('Clean checkpoint/identity mismatch')
    state_chain[size] = b.sha(state)
    b.save(marker, {'state': 'complete', 'index': index, 'time': time.time(), 'variant': variant,
                   'size': size, 'op': op, 'owner_token': token, 'server_session': label,
                   'active': owned, 'ready': ready, 'stop': stopped, 'results': values,
                   'state_after': dict(state_chain), 'loaded_namespace': load})
    return stopped


def completed_prefix(resume):
    done, previous, chain, missing = [], None, {}, False
    for index, (variant, size, op) in enumerate(SEQUENCE):
        point = stem(variant, size, op)
        path = b.R / 'families' / (point + '.json')
        if not path.exists():
            missing = True
            continue
        row = json.loads(path.read_text())
        if not resume or row.get('state') != 'complete' or missing or row['index'] != index:
            raise RuntimeError('Non-resumable/partial case: ' + point)
        ready_check(row['ready'], row['active'], previous)
        directory = b.R / 'results' / (point + '-c80')
        if not (directory / 'COMPLETE').is_file():
            raise RuntimeError('Completed family lacks formal result')
        value = client.validate_result(json.loads((directory / 'result.json').read_text()), size, op, 'run')
        if value != row['results']['formal'] or not row['stop']['clean_stop_confirmed']:
            raise RuntimeError('Completed family differs from raw result')
        previous, chain = row['stop'], row['state_after']
        done.append(index)
    for size, digest in chain.items():
        if b.sha(b.R / 'states' / (size + '.bin')) != digest:
            raise RuntimeError('Paused state differs from last completed case')
    return done, previous, dict(chain)


def main(resume=False):
    shared = (b.R.parent / '.benchmark-runner.lock').open('a')
    fcntl.flock(shared, fcntl.LOCK_EX | fcntl.LOCK_NB)
    lock = (b.R / 'runner.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    b.other_benchmark_preflight()
    global OWNS_RUN
    OWNS_RUN = True
    b.client_preflight()
    manifest = prepare_clients()
    for name in ('families', 'states', 'results', 'observations', 'validations'):
        (b.R / name).mkdir(exist_ok=True)
    if (b.R / 'STARTED').exists() != resume:
        raise RuntimeError('Explicit resume is only for a clean paused experiment')
    if resume:
        if not (b.R / 'paused.json').is_file() or (b.R / 'failure.json').exists() or (b.R / 'pause-after-case').exists():
            raise RuntimeError('Only a clean pause can be resumed after explicitly removing its marker')
    else:
        with (b.R / 'STARTED').open('x') as handle:
            handle.write(time.strftime('%FT%TZ', time.gmtime()))
    done, previous, chain = completed_prefix(resume)
    plan = {'experiment': NAME, 'sequence': SEQUENCE, 'keys': KEYS, 'connections': CONNECTIONS,
            'client_threads': THREADS, 'pipeline': 1, 'members': MEMBERS, 'revisions': REVISIONS,
            'warm_seconds': 90, 'formal_seconds': 60, 'observation_seconds': 45,
            'seeds': client.SEEDS, 'client_manifest': manifest, 'profiled': False,
            'loads': ['main-compact-zincr', 'main-grouped-zincr'],
            'state_and_data_preserved_across_versions': True, 'runs_per_point': 1}
    if resume and json.loads((b.R / 'plan.json').read_text()) != json.loads(json.dumps(plan)):
        raise RuntimeError('Plan changed since pause')
    b.save(b.R / 'plan.json', plan)
    for index in range(len(SEQUENCE)):
        if index in done:
            continue
        previous = case_run(index, previous, chain)
        if (b.R / 'pause-after-case').exists():
            b.save(b.R / 'paused.json', {'state': 'paused', 'time': time.time(),
                   'completed_points': index + 1, 'clean_stop_confirmed': True})
            return 75
    (b.R / 'SUITE_COMPLETE').write_text(time.strftime('%FT%TZ', time.gmtime()))
    b.save(b.R / 'completion.json', {'state': 'complete', 'formal_results': 8,
           'loads': 2, 'time': time.time(), 'last_stop': previous, 'state_after': chain})
    b.event('COMPLETE: eight crossover points; state and checkpoints preserved')
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        code = main(args.resume)
    except BaseException:
        if OWNS_RUN:
            b.save(b.R / 'failure.json', {'time': time.time(), 'traceback': traceback.format_exc()})
            b.event('FAILED; no automatic retry')
        raise
    raise SystemExit(code)

