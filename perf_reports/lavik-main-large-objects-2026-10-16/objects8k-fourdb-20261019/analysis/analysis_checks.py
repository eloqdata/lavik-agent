#!/usr/bin/env python3
"""Offline validator unit checks. Synthetic fixtures are not benchmark results."""
from __future__ import annotations
import copy
import json
from pathlib import Path
import struct
import tempfile
import unittest
import analyze as a


def sample_metric(count=6000, elapsed=60):
    return {'count': count, 'qps': round(count / elapsed, 6), 'avg_ms': .2,
            'p50_ms': .1, 'p99_ms': .4, 'p999_ms': .6, 'max_ms': 1.0}


def fixture_raw(op, phase='run'):
    count = a.load_count(op) if phase == 'load' else 3 if phase == 'validate' else 6000
    elapsed = 1 if phase in ('load', 'validate') else a.SECONDS[phase]
    metric = sample_metric(count, elapsed)
    keys = ('LOAD',) if phase == 'load' else ('OPERATIONS', *a.METRICS[op])
    raw = {'op': 'hgetall' if phase == 'load' and op in ('hkeys', 'hvals') else op,
           'phase': phase, 'keys': 8192, 'prefix': 'objects8k:' + op,
           'connections': 1 if phase == 'validate' else 80,
           'threads': 1 if phase == 'validate' else 16,
           'seed': a.SEEDS[phase], 'pipeline': 1, 'errors': 0,
           'test_mode': False, 'interrupted': False, 'data_shape': a.shape(op),
           'elapsed_seconds': elapsed, 'metrics': {key: dict(metric) for key in keys}}
    if op in ('hgetall', 'hkeys', 'hvals'):
        raw['load_seed'] = 101
    if op in ('hgetall', 'hkeys', 'hvals'):
        raw.update(fields_per_key=32, value_bytes=256)
    if phase == 'validate':
        raw['validation_keys'] = [0, 4096, 8191]
    elif phase != 'load':
        raw['operations_per_second'] = [0] * a.SECONDS[phase]
    return raw


def fixture_command(op, phase='run'):
    relative = 'unit/' + op + '-' + phase
    fields = {'--host': '10.84.1.4', '--port': '6379',
              '--op': 'hgetall' if phase == 'load' and op in ('hkeys', 'hvals') else op,
              '--phase': phase, '--prefix': 'objects8k:' + op, '--keys': '8192',
              '--connections': '1' if phase == 'validate' else '80',
              '--threads': '1' if phase == 'validate' else '16', '--seconds': str(a.SECONDS[phase]),
              '--seed': str(a.SEEDS[phase]), '--out': a.CROOT + '/' + relative + '/result.json'}
    if op in a.READS:
        fields['--load-seed'] = '101'
    state = a.CROOT + '/states/unit.bin' if op in a.STATEFUL else None
    if state:
        fields['--state'] = state
    return [a.CROOT + '/clients/' + a.binary_name(op), *[v for pair in fields.items() for v in pair]], relative, state


def fixture_stats(tx=0, queue=0):
    values = {'tx_commit_batches': tx, 'tx_commit_batch_transactions': tx,
              'tx_commit_input_fences': tx, 'tx_commit_merged_fences': 0,
              'tx_commit_backpressure_waits': 0, 'tx_cleaner_rounds': 0,
              'tx_cleaner_retired_blocks': 0, 'tx_commit_queue_depth': queue,
              'storage_tx_commits_pending': 0}
    return {'info': {'stats': '\n'.join(k + ':' + str(v) for k, v in values.items())}}


class Checks(unittest.TestCase):
    def test_01_fixed_dimensions(self):
        self.assertEqual(len(a.SEQUENCE), 56)
        self.assertEqual(len(set(a.SEQUENCE)), 56)
        self.assertEqual(a.SEQUENCE[:14], tuple(('lavik', op) for op in a.OPS))
        for op in a.OPS:
            shape = a.shape(op)
            self.assertEqual(shape['items_per_key'] * shape['item_bytes'], 8192)
        self.assertEqual(a.load_count('stream'), 262144)
        self.assertEqual(a.load_count('zswap'), 16384)
        self.assertEqual(a.load_count('hgetall'), 8192)

    def test_02_metric_rounding_and_tail(self):
        a.metric(sample_metric(), 60, 'unit')
        # An actual short-duration rounding pattern; no fixed relative tolerance.
        count, true_elapsed = 8192, .06535271
        a.metric(sample_metric(count, true_elapsed), round(true_elapsed, 6), 'rounding')
        for field, invalid in (('qps', 99), ('p999_ms', .01), ('avg_ms', 2),
                               ('max_ms', float('nan')), ('count', True), ('count', 0)):
            value = sample_metric()
            value[field] = invalid
            with self.subTest(field=field), self.assertRaises(ValueError):
                a.metric(value, 60, 'invalid')

    def test_03_commands_all_ops_phases(self):
        for op in a.OPS:
            for phase in ('load', 'warm', 'run') + (('validate',) if op in a.READS else ()):
                command, relative, state = fixture_command(op, phase)
                a.check_command(command, op, phase, relative, state)
                wrong = command.copy()
                wrong[wrong.index('--seed') + 1] = '1'
                with self.assertRaises(ValueError):
                    a.check_command(wrong, op, phase, relative, state)
                with self.assertRaises(ValueError):
                    a.check_command(command + ['--seed', '1'], op, phase, relative, state)

    def test_04_exact_raw_loads_and_pairs(self):
        for op in a.OPS:
            for phase in ('load', 'warm', 'run') + (('validate',) if op in a.READS else ()):
                a.check_raw(fixture_raw(op, phase), op, phase, 'unit')
            raw = fixture_raw(op, 'load')
            raw['metrics']['LOAD'] = sample_metric(a.load_count(op) - 1, 1)
            with self.assertRaises(ValueError):
                a.check_raw(raw, op, 'load', 'bad-load')
        for op in a.PAIRED:
            raw = fixture_raw(op)
            raw['metrics'][a.METRICS[op][1]] = sample_metric(5999, 60)
            with self.assertRaises(ValueError):
                a.check_raw(raw, op, 'run', 'incomplete-pair')

    def test_05_raw_rejects_errors_shapes_seeds(self):
        for field, value in (('errors', 1), ('test_mode', True), ('interrupted', True), ('connections', 640),
                             ('threads', 32), ('keys', 81920), ('seed', 20181), ('pipeline', 2),
                             ('data_shape', a.shape('list'))):
            raw = fixture_raw('zswap')
            raw[field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                a.check_raw(raw, 'zswap', 'run', 'bad')
        raw = fixture_raw('hkeys', 'validate')
        raw['validation_keys'] = [0, 1, 8191]
        with self.assertRaises(ValueError):
            a.check_raw(raw, 'hkeys', 'validate', 'bad-sample')
        raw = fixture_raw('hkeys')
        raw['operations_per_second'][0] = 6001
        with self.assertRaises(ValueError):
            a.check_raw(raw, 'hkeys', 'run', 'bad-buckets')

    def test_06_compact_tx_scope(self):
        before, after = fixture_stats(), fixture_stats(5)
        for op in ('zincr', 'zswap', 'zrange'):
            with self.assertRaises(ValueError):
                a.transactions(before, after, 'lavik', op, 5)
            self.assertTrue(a.transactions(before, before, 'lavik', op, 5)['zero_grouped_tx_required'])
        for op in set(a.OPS) - {'zincr', 'zswap', 'zrange'}:
            self.assertFalse(a.transactions(before, after, 'lavik', op, 5)['zero_grouped_tx_required'])
        self.assertIsNone(a.transactions({}, {}, 'redis', 'zincr', 5))
        with self.assertRaises(ValueError):
            a.transactions(before, fixture_stats(queue=1), 'lavik', 'list', 5)
        with self.assertRaises(ValueError):
            a.transactions(after, before, 'lavik', 'list', 5)

    def test_07_server_command_errors(self):
        def snap(calls, failures=0):
            return {'info': {'commandstats': f'cmdstat_zadd:calls={calls},usec=1,failed_calls={failures},rejected_calls=0'}}
        self.assertEqual(a.command_calls(snap(10), 'ZADD') - a.command_calls(snap(1), 'ZADD'), 9)
        a.check_command_errors(snap(1), snap(10), ['ZADD'])
        with self.assertRaises(ValueError):
            a.check_command_errors(snap(1), snap(10, 1), ['ZADD'])

    def test_08_pair_state_parity_and_inactive_slots(self):
        before = struct.pack('<ii', 1280, 8192) + bytes(1280 * 8192)
        after = bytearray(before)
        after[8] = 1
        self.assertEqual(a.state_transition(before, after, 3), 1)
        with self.assertRaises(ValueError):
            a.state_transition(before, after, 2)
        with self.assertRaises(ValueError):
            a.state_transition(before, after, 0, load=True)
        with tempfile.TemporaryDirectory() as name:
            path = Path(name) / 'state.bin'
            path.write_bytes(after)
            a.state_data(path)
            after[8 + 80 * 8192] = 1
            path.write_bytes(after)
            with self.assertRaises(ValueError):
                a.state_data(path)
            path.write_bytes(before[:-1])
            with self.assertRaises(ValueError):
                a.state_data(path)

    def test_09_prefix_allows_active_next_rejects_gap(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            directory = root / 'client/families'
            directory.mkdir(parents=True)
            def family(op, state):
                (directory / ('lavik-' + op + '.json')).write_text(json.dumps({'product': 'lavik', 'op': op, 'state': state}))
            family('hgetall', 'complete')
            family('hkeys', 'started')
            self.assertEqual(len(a.completed_prefix(root)), 1)
            family('hvals', 'complete')
            with self.assertRaises(ValueError):
                a.completed_prefix(root)
            (directory / 'lavik-hvals.json').unlink()
            (directory / 'redis-no-such-op.json').write_text('{}')
            with self.assertRaises(ValueError):
                a.completed_prefix(root)

    def test_10_config_persistence_and_defrag(self):
        fixtures = {
            'lavik': {'defrag-paused': 'no'},
            'redis': {'save': '', 'appendonly': 'no', 'io-threads': '16', 'daemonize': 'no'},
            'valkey': {'save': '', 'appendonly': 'no', 'io-threads': '8', 'daemonize': 'no'},
            'kvrocks': {'workers': '16', 'rocksdb.disable_auto_compactions': 'no',
                        'daemonize': 'no', 'rocksdb.write_options.disable_wal': 'yes'}}
        for product, config in fixtures.items():
            value = {'config': config, 'defrag_paused': 'no', 'transaction_drain_confirmed': True}
            a.check_configuration(value, product)
            bad = copy.deepcopy(value)
            key = 'defrag-paused' if product == 'lavik' else 'rocksdb.disable_auto_compactions' if product == 'kvrocks' else 'appendonly'
            bad['config'][key] = 'yes'
            with self.assertRaises(ValueError):
                a.check_configuration(bad, product)

    def test_11_monitor_cpu_nic_and_observation_window(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            directory = root / 'server/observations/unit'
            directory.mkdir(parents=True)
            (directory / 'COMPLETE').touch()
            identity = {'pid': 12, 'start_ticks': '123', 'binary': '/unit/database'}
            (directory / 'identity.json').write_text(json.dumps({'pid': 12, 'start_ticks': '123', 'exe': '/unit/database', 'seconds': 45, 'profile': False}))
            (directory / 'exit-status.json').write_text('[0]')
            rows = [{'event': 'metadata', 'clock_ticks_per_second': 100}]
            for seconds in (0, 45):
                fields = {'start_ticks': '123', 'utime_ticks': seconds * 100, 'stime_ticks': 0, 'processor': 0}
                net = [0] * 16
                net[8] = seconds * 5000000
                rows.append({'event': 'sample', 'pid': 12, 'time': 100 + seconds,
                             'monotonic_ns': (1 + seconds) * 1000000000,
                             'process_stat_fields': fields, 'tasks': [{'tid': 12, 'stat_fields': fields}],
                             'netdev': 'eth1: ' + ' '.join(map(str, net)),
                             'procstat': 'cpu 100 0 0 100 0 0 0 0',
                             'snmp': 'Tcp: OutSegs RetransSegs\nTcp: ' + str(seconds * 100) + ' ' + str(seconds // 9)})
            rows.append({'event': 'summary', 'completed': True})
            path = directory / 'monitor.jsonl'
            path.write_text('\n'.join(map(json.dumps, rows)))
            value = a.observation(root, 'server', 'unit', identity, {'start': 97, 'end': 157})
            self.assertEqual(value['cpu_cores'], 1)
            self.assertEqual(value['selected_nic_rates']['tx_mbps'], 40)
            self.assertEqual(value['tcp']['retrans_segments_delta'], 5)
            with self.assertRaises(ValueError):
                a.observation(root, 'server', 'unit', identity, {'start': 101, 'end': 157})
            rows[2]['process_stat_fields'] = dict(rows[2]['process_stat_fields'], start_ticks='124')
            path.write_text('\n'.join(map(json.dumps, rows)))
            with self.assertRaises(ValueError):
                a.observation(root, 'server', 'unit', identity, {'start': 97, 'end': 157})

    def test_12_safe_manifest_paths(self):
        with tempfile.TemporaryDirectory() as name:
            root = Path(name)
            (root / 'ok').touch()
            self.assertEqual(a.safe_file(root, 'ok'), root / 'ok')
            for relative in ('../elsewhere', '/tmp/somewhere', 'missing'):
                with self.assertRaises(ValueError):
                    a.safe_file(root, relative)
            (root / 'link').symlink_to(root / 'ok')
            with self.assertRaises(ValueError):
                a.safe_file(root, 'link')

    def test_13_reviewed_pair_unit_and_raw_digest(self):
        point = {'product': 'lavik', 'op': 'zswap', 'metrics': {'OPERATIONS': sample_metric(), 'ZADD': sample_metric()},
                 'unit': 'pairs/s', 'raw_dir': 'client/results/lavik-zswap-c80', 'source_sha256': 'a' * 64}
        row = a.digest_row(point, 'OPERATIONS')
        self.assertEqual(row['unit'], 'pairs/s')
        self.assertEqual(row['connections'], 80)
        self.assertEqual(row['errors'], 0)
        self.assertEqual(row['source_sha256'], 'a' * 64)
        self.assertEqual(a.digest_row(point, 'ZADD')['unit'], 'ops/s')

    def test_14_read_clients_have_distinct_load_seed_metadata(self):
        # These client writers omit load_seed in raw JSON, while their exact
        # commands still carry --load-seed 101 for all phases.
        for op in ('smembers', 'lrange', 'zrange'):
            for phase in ('load', 'warm', 'run', 'validate'):
                raw = fixture_raw(op, phase)
                self.assertNotIn('load_seed', raw)
                a.check_raw(raw, op, phase, 'schema-regression')
                command, relative, state = fixture_command(op, phase)
                a.check_command(command, op, phase, relative, state)
                command[command.index('--load-seed') + 1] = '102'
                with self.assertRaises(ValueError):
                    a.check_command(command, op, phase, relative, state)
                raw['load_seed'] = 102
                with self.assertRaises(ValueError):
                    a.check_raw(raw, op, phase, 'wrong-present-seed')
        for op in ('hgetall', 'hkeys', 'hvals'):
            raw = fixture_raw(op)
            del raw['load_seed']
            with self.assertRaises(ValueError):
                a.check_raw(raw, op, 'run', 'missing-hash-seed')


if __name__ == '__main__':
    unittest.main(verbosity=2)
