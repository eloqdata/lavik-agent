"""Read-only validation and optional JSON summaries for this eight-point crossover."""
from pathlib import Path
import argparse
import hashlib
import json
import struct
from analysis_common import jload, require, marker, sha, metric, observation
from clients import interface as client
from experiment import (NAME, CLIENT_ROOT, SERVER_ROOT, KEYS, MEMBERS, REVISIONS,
                        SEQUENCE, METRICS, stem, needs_load, expected_entries)
from provenance import validate_client, variants
from validation import info, transaction_delta


def state_bytes(path):
    data = Path(path).read_bytes()
    require(len(data) == 8 + 1280 * KEYS and struct.unpack('<ii', data[:8]) == (1280, KEYS), 'Invalid state dimensions')
    require(all(v in (0, 1) for v in data[8:]) and not any(data[8 + 80 * KEYS:]), 'Invalid active/inactive flags')
    return data


def counters(snapshot, command):
    return dict(part.strip().split('=', 1) for part in info(snapshot, 'commandstats').get(
        'cmdstat_' + command.lower(), 'calls=0').split(',') if '=' in part)


def phase_check(root, variant, size, op, phase, owned, build, previous_state):
    label = stem(variant, size, op) + '-' + ('c80' if phase == 'run' else phase)
    rel = 'results/' + label
    directory = root / 'client' / rel
    marker(directory / 'COMPLETE')
    raw, case, command = (jload(directory / name) for name in ('result.json', 'case.json', 'command.json'))
    client.validate_result(raw, size, op, phase)
    state = CLIENT_ROOT + '/states/' + size + '.bin'
    require(command == client.command(size, op, phase, CLIENT_ROOT + '/' + rel + '/result.json', state), label + ': command changed')
    expected = {'label': label, 'variant': variant, 'size': size, 'op': op, 'phase': phase,
                'keys': KEYS, 'connections': 80, 'client_threads': 16, 'seconds': client.SECONDS[phase],
                'shape': client.shape(size), 'pipeline': 1, 'revision': owned['revision'],
                'binary_sha256': owned['binary_sha256'], 'active': owned, 'profiled': False,
                'observed': phase == 'run', 'observation_seconds': 45 if phase == 'run' else 0,
                'client_binary_sha256': build['clients']['bench']['binary_sha256'], 'state_path': state}
    require(case == expected, label + ': case changed')
    require(jload(directory / 'client-exit.json')['returncode'] == 0, label + ': client did not exit normally')
    metrics = {name: metric(value, raw['elapsed_seconds'], label + '/' + name) for name, value in raw['metrics'].items()}
    if phase != 'load':
        buckets = raw['operations_per_second']
        require(len(buckets) == client.SECONDS[phase] and all(type(x) is int and x >= 0 for x in buckets)
                and sum(buckets) <= metrics['OPERATIONS']['count'], label + ': per-second totals invalid')
    before, after = (jload(directory / ('server-' + when + '.json')) for when in ('before', 'after'))
    for when, snapshot in (('before', before), ('after', after)):
        require(snapshot == jload(root / 'server/snapshots' / (label + '-' + when + '.json')), label + ': snapshot copies differ')
        require(snapshot['active'] == owned and snapshot.get('defrag_paused') == 'no'
                and snapshot.get('transactions_drained') is True, label + ': snapshot identity/defrag/drain differs')
    expected_counts = {'ZADD': metrics['LOAD']['count']} if phase == 'load' else {name: metrics[name]['count'] for name in METRICS[op]}
    actual = {}
    for command_name, count in expected_counts.items():
        first, last = counters(before, command_name), counters(after, command_name)
        actual[command_name] = int(last['calls']) - int(first['calls'])
        require(all(int(last.get(k, 0)) - int(first.get(k, 0)) == 0 for k in ('failed_calls', 'rejected_calls')), label + ': failed commands')
    require(expected_counts == actual, label + ': commandstats differs from replies')
    require(jload(directory / 'command-counts.json') == {'expected': expected_counts, 'observed': actual, 'matched': True}, label + ': count receipt differs')
    tx = transaction_delta(before, after, size, phase)
    require(tx == jload(directory / 'transactions.json'), label + ': transaction receipt differs')
    timing = jload(directory / 'timing.json')
    require(before['time'] <= timing['start'] < after['time'] <= timing['end'] and raw['elapsed_seconds'] <= timing['end'] - timing['start'] + .001,
            label + ': phase chronology differs')
    sb, sa = (state_bytes(directory / ('state-' + when + '.bin')) for when in ('before', 'after'))
    require(sb == previous_state if previous_state is not None else not any(sb[8:]), label + ': namespace state continuity broken')
    changed = sum(a != b for a, b in zip(sb[8:], sa[8:]))
    if phase == 'load' or op == 'zincr':
        require(sb == sa, label + ': read-only state was changed')
    else:
        count = metrics['OPERATIONS']['count']
        require(changed <= count and changed % 2 == count % 2, label + ': state parity differs')
    sm = {'path': state, 'changed_flags': changed,
          'before': {'sha256': hashlib.sha256(sb).hexdigest(), 'bytes': len(sb)},
          'after': {'sha256': hashlib.sha256(sa).hexdigest(), 'bytes': len(sa)}}
    require(jload(directory / 'state-manifest.json') == sm, label + ': state receipt differs')
    result = {'label': label, 'metrics': metrics, 'elapsed_seconds': raw['elapsed_seconds'],
              'source_sha256': sha(directory / 'result.json'), 'raw_dir': 'client/' + rel,
              'command_counts': actual, 'transactions': tx, 'state': sm, 'timing': timing}
    if phase == 'run':
        ci = jload(directory / 'client-identity.json')
        require(ci['binary'] == command[0] and ci['binary_sha256'] == case['client_binary_sha256'], label + ': observed client changed')
        result['observations'] = {side: observation(root, side, label, identity, timing)
                                  for side, identity in (('server', owned), ('client', ci))}
    return result, sa


def sample_check(root, point, size, when, state):
    path = root / 'client/validations' / (point + '-' + when + '.json')
    rows = jload(path)
    require(set(rows) == {client.prefix(size) + ':' + str(i) for i in (0, 4096, 8191)}, point + ': sampled key set differs')
    for row in rows.values():
        require(row['members'] == MEMBERS[size] and row['member_bytes'] == 32 and row['shape_verified'] is True
                and row['state_sha256'] == hashlib.sha256(state).hexdigest()
                and len(row['payload_sha256']) == 64, point + ': sample/state differs')
    return {'path': str(path.relative_to(root)), 'sha256': sha(path)}


def analyze(root, partial=False, write_outputs=True):
    root = Path(root).resolve()
    build = validate_client(root / 'client')
    versions = variants(root / 'client')
    require(versions == variants(root / 'server'), 'Host variant manifests differ')
    runtime = jload(root / 'client/runtime-manifest.json')
    require(runtime == jload(root / 'server/runtime-manifest.json') and runtime['experiment'] == NAME, 'Runtime manifests differ')
    for side in ('client', 'server'):
        for name, digest in runtime[side].items():
            require(sha(root / side / name) == digest, 'Collected runtime source changed: ' + side + '/' + name)
    require(not any((root / 'client' / name).exists() for name in ('failure.json', 'suite-failure.json')), 'Experiment has a failure marker')
    plan = jload(root / 'client/plan.json')
    require(plan['sequence'] == [list(x) for x in SEQUENCE] and plan['members'] == MEMBERS
            and plan['revisions'] == REVISIONS and plan['client_manifest'] == build
            and plan['loads'] == ['main-compact-zincr', 'main-grouped-zincr'], 'Plan identity or sequence differs')
    points, states, previous, pending = [], {}, None, []
    for index, (variant, size, op) in enumerate(SEQUENCE):
        point = stem(variant, size, op)
        fp = root / 'client/families' / (point + '.json')
        if not fp.exists() or jload(fp).get('state') != 'complete':
            pending.append(point)
            continue
        require(not pending, 'Completed points are not a contiguous prefix')
        family = jload(fp)
        active, stop, ready = family['active'], family['stop'], family['ready']
        version = versions[variant]
        require(family['index'] == index and family['variant'] == variant and family['size'] == size and family['op'] == op
                and family['loaded_namespace'] == needs_load(variant, size, op), point + ': family identity differs')
        require(active['product'] == variant and active['label'] == 'session-' + point and active['root'] == SERVER_ROOT
                and all(active[k] == version[k] for k in ('revision', 'binary', 'binary_sha256')), point + ': service identity differs')
        session = root / 'server' / ('session-' + point)
        require(ready == jload(session / 'ready.json') == jload(root / 'client/families' / (point + '-ready.json')), point + ': ready copies differ')
        expected_recovery = {'mode': 'fresh', 'checkpoint': None} if previous is None else {
            'mode': 'checkpoint', 'checkpoint': {'generation': previous['checkpoint_generation'], 'entries': previous['checkpoint_entries']}}
        require(ready['active'] == active and {k: ready['recovery'][k] for k in ('mode', 'checkpoint')} == expected_recovery
                and ready.get('normal_request_ready') is True
                and ready['recovery'].get('recovery_collection_complete') is True
                and len(ready['recovery'].get('storage_devices', [])) == 6, point + ': checkpoint recovery chain differs')
        require(stop == jload(session / 'stop.json') == jload(root / 'client/families' / (point + '-stop.json')), point + ': stop copies differ')
        require(stop['active'] == active and stop['clean_stop_confirmed'] is True and stop['clean_checkpoint_confirmed'] is True
                and stop['returncode'] == 0 and stop['checkpoint_entries'] == expected_entries(index)
                and isinstance(stop['checkpoint_generation'], int) and stop['checkpoint_generation'] > 0,
                point + ': clean checkpoint differs')
        if previous is not None:
            require(stop['checkpoint_generation'] == previous['checkpoint_generation'] + 1
                    and active['time'] > previous['time'], point + ': stop/start sequence differs')
        phases = {}
        state = states.get(size)
        if needs_load(variant, size, op):
            require(state is None, point + ': repeated namespace load')
            phases['load'], state = phase_check(root, variant, size, op, 'load', active, build, state)
        else:
            require(state is not None and not (root / 'client/results' / (point + '-load')).exists(), point + ': missing/reloaded namespace')
        samples = [sample_check(root, point, size, 'loaded', state)]
        phases['warm'], state = phase_check(root, variant, size, op, 'warm', active, build, state)
        samples.append(sample_check(root, point, size, 'before', state))
        phases['formal'], state = phase_check(root, variant, size, op, 'run', active, build, state)
        samples.append(sample_check(root, point, size, 'after', state))
        states[size] = state
        require(family['state_after'] == {s: hashlib.sha256(data).hexdigest() for s, data in states.items()}, point + ': cross-case state summary differs')
        require(set(family['results']) == set(phases), point + ': family phase set differs')
        for name, phase in phases.items():
            require(family['results'][name] == jload(root / phase['raw_dir'] / 'result.json'), point + ': family raw result differs')
        points.append({**phases['formal'], 'variant': variant, 'size': size, 'op': op,
                       'revision': active['revision'], 'binary_sha256': active['binary_sha256'],
                       'shape': client.shape(size), 'connections': 80, 'unit': 'pairs/s' if op == 'zswap' else 'ops/s',
                       'errors': 0, 'validation': {'load': phases.get('load'), 'warm': phases['warm'],
                       'samples': samples, 'ready': ready, 'stop': stop, 'state_continuity': True}})
        previous = stop
    require(partial or not pending, 'Experiment incomplete: ' + ', '.join(pending))
    if not pending:
        marker(root / 'client/SUITE_COMPLETE')
        completion = jload(root / 'client/completion.json')
        require(completion['state'] == 'complete' and completion['formal_results'] == 8 and completion['loads'] == 2
                and completion['last_stop'] == previous, 'Completion receipt differs')
        for size, state in states.items():
            require(state_bytes(root / 'client/states' / (size + '.bin')) == state, 'Final persisted state differs')
    result = {'schema_version': 1, 'experiment': NAME, 'complete': not pending, 'completed_points': len(points),
              'expected_points': 8, 'pending': pending, 'points': points,
              'client_manifest_sha256': sha(root / 'client/client-build-manifest.json'),
              'runtime_manifest_sha256': sha(root / 'client/runtime-manifest.json'),
              'interpretation': 'Fixed main-then-candidate order; namespaces and pair state continue across versions. One run per point, not independent resets.'}
    rows = [{'variant': p['variant'], 'size': p['size'], 'op': p['op'], 'revision': p['revision'],
             **p['metrics']['OPERATIONS'], 'unit': p['unit'], 'connections': 80, 'errors': 0,
             'raw_path': p['raw_dir'] + '/result.json', 'source_sha256': p['source_sha256']} for p in points]
    if write_outputs:
        for name, value in [('comparison.json', result), ('reviewed_rows.json', {'complete': not pending, 'rows': rows})]:
            temporary = root / (name + '.partial')
            temporary.write_text(json.dumps(value, indent=2) + '\n')
            temporary.replace(root / name)
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2] / 'outputs' / NAME)
    parser.add_argument('--partial', action='store_true')
    args = parser.parse_args()
    result = analyze(args.root, args.partial)
    print(json.dumps({'complete': result['complete'], 'completed_points': result['completed_points'], 'pending': result['pending']}))
