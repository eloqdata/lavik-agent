"""One clean session per point; manual Lavik/SPDK and peer/filesystem phases."""
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
from experiment import (NAME, KEYS, CONNECTIONS, THREADS, SHAPES, READ_OPS,
                        WARM_SECONDS, FORMAL_SECONDS, OBSERVATION_SECONDS,
                        LOAD_COMMANDS, METRICS, PAIRED, sequence)

OWNS_RUN = False


class InterruptedRun(BaseException):
    """Not OSError/InterruptedError: subprocess.wait must not swallow a signal."""


def interrupted(signum, _frame):
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    raise InterruptedRun('Runner interrupted by signal ' + str(signum))


def prepare_clients():
    manifest = json.loads((b.R / 'client-build-manifest.json').read_text())
    tests = json.loads((b.R / 'linux-client-tests.json').read_text())
    expected = {'bench', 'bench_sswap', 'bench_hash', 'bench_lrange', 'bench_workdist'}
    if set(manifest['clients']) != expected or 'PENDING' in json.dumps(manifest):
        raise RuntimeError('Five client identities must be finalized')
    for name, entry in manifest['clients'].items():
        if Path(entry['binary']) != b.R / 'clients' / name:
            raise RuntimeError('Unexpected client binary path')
        if b.sha(entry['binary']) != entry['binary_sha256']:
            raise RuntimeError('Client binary SHA mismatch: ' + name)
        source = b.R / 'clients' / (name + '.cpp')
        if b.sha(source) != entry['source_sha256']:
            raise RuntimeError('Client source SHA mismatch: ' + name)
        if tests['source_sha256'].get(name + '.cpp') != entry['source_sha256'] or tests['binary_sha256'].get(name) != entry['binary_sha256']:
            raise RuntimeError('Linux test source/binary differs: ' + name)
    header = b.sha(b.R / 'clients/bench8k.h')
    declared_header = manifest.get('header_sha256', manifest.get('shared_headers', {}).get('bench8k.h'))
    if header != declared_header or tests['source_sha256'].get('bench8k.h') != header:
        raise RuntimeError('Shared client header SHA mismatch')
    if b.sha(b.R / 'clients/interface.py') != manifest['interface_sha256']:
        raise RuntimeError('Client command interface SHA mismatch')
    if (tests.get('status') != 'passed' or tests.get('passed') != len(tests.get('tests', []))
            or tests.get('passed', 0) <= 0 or not tests.get('platform', '').startswith('Linux')):
        raise RuntimeError('Expected completed full Linux client tests')
    if client.SEEDS != {'load': 101, 'validate': 101, 'warm': 10180, 'run': 20180}:
        raise RuntimeError('Unexpected random seeds')
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
    expected = {LOAD_COMMANDS[op]: value['metrics']['LOAD']['count']} if phase == 'load' else {
        name.split('_', 1)[0]: value['metrics'][name]['count'] for name in METRICS[op]}
    observed = {name: counter_calls(after, name) - counter_calls(before, name) for name in expected}
    if expected != observed:
        raise RuntimeError('Checked client replies differ from commandstats: ' + repr((expected, observed)))
    return {'expected': expected, 'observed': observed, 'matched': True}


def execute(product, op, phase, owned, state):
    stem = product + '-' + op
    label = stem + '-' + ('c80' if phase == 'run' else phase)
    directory = b.R / 'results' / label
    directory.mkdir(parents=True, exist_ok=False)
    args = client.command(op, phase, directory / 'result.json', state)
    seconds = WARM_SECONDS if phase == 'warm' else FORMAL_SECONDS if phase == 'run' else 1
    b.save(directory / 'command.json', args)
    b.save(directory / 'case.json', {'label': label, 'product': product, 'op': op, 'phase': phase,
           'keys': KEYS, 'connections': CONNECTIONS, 'client_threads': THREADS, 'seconds': seconds,
           'shape': client.shape(op), 'pipeline': 1, 'revision': owned['revision'],
           'binary_sha256': owned['binary_sha256'], 'active': owned, 'profiled': False,
           'observed': phase == 'run', 'observation_seconds': OBSERVATION_SECONDS if phase == 'run' else 0,
           'client_binary_sha256': b.sha(args[0]), 'state_path': str(state) if state else None})
    if state:
        b.state_bytes(state)
        shutil.copyfile(state, directory / 'state-before.bin')
    before = b.remote('snapshot', label + '-before.json')
    if before['active'] != owned:
        raise RuntimeError('Server identity changed before workload')
    if product == 'lavik' and (before.get('defrag_paused') != 'no' or before.get('transactions_drained') is not True):
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
                if b.get_active(product, owned['label'], owned['owner_token']) != owned:
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
                process.wait(timeout=60)
            for job in jobs:
                if job.poll() is None:
                    job.wait(timeout=60)
            for handle in files:
                handle.close()
    after = b.remote('snapshot', label + '-after.json')
    if after['active'] != owned:
        raise RuntimeError('Server identity changed after workload')
    if product == 'lavik' and (after.get('defrag_paused') != 'no' or after.get('transactions_drained') is not True):
        raise RuntimeError('Lavik snapshot has defrag paused or pending transactions')
    b.save(directory / 'server-after.json', after)
    snapshot_client(directory / 'client-after.json')
    b.save(directory / 'timing.json', {'start': started, 'end': time.time()})
    value = client.validate_result(json.loads((directory / 'result.json').read_text()), op, phase)
    b.save(directory / 'command-counts.json', reconcile_counts(before, after, value, op, phase))
    if state:
        data = b.state_bytes(state)
        shutil.copyfile(state, directory / 'state-after.bin')
        old = (directory / 'state-before.bin').read_bytes()
        changed = sum(a != z for a, z in zip(old[8:], data[8:]))
        count = 0 if phase == 'load' else value['metrics']['OPERATIONS']['count']
        if (phase == 'load' and old != data) or changed > count or changed % 2 != count % 2:
            raise RuntimeError('Paired operation state parity mismatch')
        b.save(directory / 'state-manifest.json', {'path': str(state), 'changed_flags': changed,
               'before': {'sha256': b.sha(directory / 'state-before.bin'), 'bytes': len(old)},
               'after': {'sha256': b.sha(directory / 'state-after.bin'), 'bytes': len(data)}})
    (directory / 'COMPLETE').write_text(time.strftime('%FT%TZ', time.gmtime()))
    metric = value['metrics']['LOAD' if phase == 'load' else 'OPERATIONS']
    b.event(f'DONE {label}: {metric["qps"]:.2f} ' + ('pairs/s' if op in PAIRED and phase != 'load' else 'ops/s'))
    return value


def validate_sample(op, stem, when, state):
    label = stem + '-' + when
    if op not in READ_OPS:
        return b.validate_write(op, client.prefix(op), label, state)
    directory = b.R / 'validations' / label
    directory.mkdir(parents=True, exist_ok=False)
    args = client.command(op, 'validate', directory / 'result.json')
    b.save(directory / 'command.json', args)
    with (directory / 'run.log').open('w') as handle:
        # Popen allows the same signal-safe cleanup as timed workloads.
        process = sp.Popen(args, stdout=handle, stderr=sp.STDOUT)
        try:
            if process.wait(timeout=180):
                raise RuntimeError('Read sample validation failed: ' + label)
        finally:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=60)
    value = client.validate_result(json.loads((directory / 'result.json').read_text()), op, 'validate')
    (directory / 'COMPLETE').write_text(time.strftime('%FT%TZ', time.gmtime()))
    return value


def case_run(product, op):
    stem = product + '-' + op
    marker = b.R / 'families' / (stem + '.json')
    if marker.exists():
        raise RuntimeError('Case already has artifacts; no automatic retry: ' + stem)
    token = secrets.token_hex(16)
    label = 'session-' + stem
    b.save(marker, {'state': 'started', 'time': time.time(), 'product': product, 'op': op,
                    'owner_token': token, 'server_session': label})
    state = None
    if op in client.STATEFUL:
        state = b.R / 'states' / (stem + '.bin')
        state.parent.mkdir(exist_ok=True)
        client.initialize_state(state, op)
    values = {}
    try:
        started = b.remote('start', product, label, token)
        owned = b.get_active(product, label, token)
        if started != owned:
            raise RuntimeError('Start response differs from active identity')
        if product == 'lavik':
            reset = b.remote('reset-data', product, label, token)
            if reset.get('completed') is not True:
                raise RuntimeError('Fresh-data reset was not confirmed')
            b.save(b.R / 'families' / (stem + '-reset.json'), reset)
        values['load'] = execute(product, op, 'load', owned, state)
        validate_sample(op, stem, 'loaded', state)
        values['warm'] = execute(product, op, 'warm', owned, state)
        validate_sample(op, stem, 'before', state)
        values['formal'] = execute(product, op, 'run', owned, state)
        validate_sample(op, stem, 'after', state)
    finally:
        stopped = b.remote('stop-owned', product, label, token)
        b.save(b.R / 'families' / (stem + '-stop.json'), stopped)
    if stopped.get('clean_stop_confirmed') is not True or stopped.get('active') != owned:
        raise RuntimeError('Clean stop/identity mismatch')
    if product == 'lavik' and (stopped.get('clean_checkpoint_confirmed') is not True
                               or stopped.get('checkpoint_entries') != KEYS):
        raise RuntimeError('Lavik checkpoint did not confirm 8192 entries')
    b.save(marker, {'state': 'complete', 'time': time.time(), 'product': product, 'op': op,
                    'owner_token': token, 'server_session': label, 'active': owned, 'stop': stopped,
                    'results': values})
    return values['formal']


def completed_prefix(phase, resume):
    done = []
    missing = False
    for product, op in sequence(phase):
        stem = product + '-' + op
        path = b.R / 'families' / (stem + '.json')
        if not path.exists():
            missing = True
            continue
        row = json.loads(path.read_text())
        if not resume or row.get('state') != 'complete' or missing:
            raise RuntimeError('Non-resumable/partial case: ' + stem)
        if row['product'] != product or row['op'] != op or not row['stop']['clean_stop_confirmed']:
            raise RuntimeError('Completed-case identity/stop mismatch')
        directory = b.R / 'results' / (stem + '-c80')
        if not (directory / 'COMPLETE').is_file():
            raise RuntimeError('Completed family lacks formal completion')
        value = client.validate_result(json.loads((directory / 'result.json').read_text()), op, 'run')
        if value != row['results']['formal']:
            raise RuntimeError('Completed family differs from raw result')
        done.append((product, op))
    return done


def main(phase, resume=False):
    shared_lock = (b.R.parent / '.benchmark-runner.lock').open('a')
    fcntl.flock(shared_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    lock = (b.R / 'runner.lock').open('a')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    b.other_benchmark_preflight()
    global OWNS_RUN
    OWNS_RUN = True
    b.client_preflight()
    manifest = prepare_clients()
    if phase == 'peers':
        if not (b.R / 'LAVIK_COMPLETE').is_file():
            raise RuntimeError('Lavik phase must complete before manual storage transition')
        ready = json.loads(b.shell(['sudo', 'cat', b.SR + '/raid-ready.json']))
        b.save(b.R / 'peer-storage-receipt.json', ready)
    for name in ('families', 'states', 'results', 'observations', 'validations'):
        (b.R / name).mkdir(exist_ok=True)
    marker = b.R / (phase.upper() + '_STARTED')
    if marker.exists() != resume:
        raise RuntimeError('Explicit --resume is required only for a paused phase')
    if resume:
        if not (b.R / (phase + '-paused.json')).is_file() or (b.R / (phase + '-failure.json')).exists():
            raise RuntimeError('Only a clean pause can be resumed')
        if (b.R / 'pause-after-case').exists():
            raise RuntimeError('Remove pause-after-case explicitly before resuming')
    else:
        with marker.open('x') as handle:
            handle.write(time.strftime('%FT%TZ', time.gmtime()))
    done = completed_prefix(phase, resume)
    plan = {'experiment': NAME, 'phase': phase, 'sequence': sequence(phase), 'keys': KEYS,
            'connections': CONNECTIONS, 'client_threads': THREADS, 'pipeline': 1, 'shapes': SHAPES,
            'warm_seconds': 90, 'formal_seconds': 60, 'observation_seconds': 45,
            'seeds': client.SEEDS, 'client_manifest': manifest, 'profiled': False,
            'fresh_service_and_data_per_operation': True, 'runs_per_point': 1}
    plan_path = b.R / (phase + '-plan.json')
    if resume and json.loads(plan_path.read_text()) != json.loads(json.dumps(plan)):
        raise RuntimeError('Plan changed since clean pause')
    b.save(plan_path, plan)
    results = {}
    for product, op in sequence(phase):
        stem = product + '-' + op
        if (product, op) in done:
            results[stem] = json.loads((b.R / 'families' / (stem + '.json')).read_text())['results']['formal']
            continue
        results[stem] = case_run(product, op)
        b.save(b.R / (phase + '-summary.json'), results)
        if (b.R / 'pause-after-case').exists():
            b.save(b.R / (phase + '-paused.json'), {'state': 'paused', 'phase': phase,
                    'time': time.time(), 'completed_points': len(results), 'last_completed': stem,
                    'clean_stop_confirmed': True})
            b.event('PAUSED after clean completed case ' + stem)
            return 75
    (b.R / (phase.upper() + '_COMPLETE')).write_text(time.strftime('%FT%TZ', time.gmtime()))
    b.save(b.R / (phase + '-completion.json'), {'phase': phase, 'status': 'complete',
            'formal_results': len(sequence(phase)), 'time': time.time()})
    b.event('COMPLETE ' + phase + ': ' + str(len(sequence(phase))) + ' points; no storage transition performed')
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=('lavik', 'peers'))
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        code = main(args.phase, args.resume)
    except BaseException:
        if OWNS_RUN:
            b.save(b.R / (args.phase + '-failure.json'), {'time': time.time(), 'traceback': traceback.format_exc()})
            b.event('FAILED ' + args.phase)
        raise
    raise SystemExit(code)
