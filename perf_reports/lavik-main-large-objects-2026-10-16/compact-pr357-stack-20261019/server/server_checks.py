"""Offline targeted lifecycle checks; never accesses devices or remote hosts."""
from pathlib import Path
import copy
import json
import hashlib
import platform
import sys
import signal
import tempfile
import time
import unittest
from unittest.mock import patch
import server
import preflight_server as common


class Checks(unittest.TestCase):
    def devices(self):
        return [{'bdf': bdf, 'serial': serial, 'bytes': common.DEVICE_BYTES}
                for bdf, serial in common.ALLOW.items()]

    def startup_log(self, generation=8, entries=16384):
        capacity = common.DEVICE_BYTES // (8 * 1024 * 1024) * (8 * 1024 * 1024)
        return ''.join(f'storage device id={i} path=spdk://{d["bdf"]}/1 capacity-bytes={capacity} data-blocks=1\n'
                       for i, d in enumerate(self.devices())) + (
            f'loaded shutdown checkpoint generation={generation} entries={entries}\n'
            'mimalloc recovery collection complete; online purge_delay=60000\n')

    def test_01_exact_checkpoint_required_before_ready(self):
        with self.assertRaises(RuntimeError):
            server.expected_recovery(None)
        expected = server.expected_recovery({'checkpoint_generation': 8, 'checkpoint_entries': 16384})
        evidence = server.startup_evidence(self.startup_log(), expected, self.devices())
        self.assertEqual(evidence['checkpoint'], {'generation': 8, 'entries': 16384})
        self.assertEqual(len(evidence['storage_devices']), 6)
        self.assertIsNone(server.startup_evidence(self.startup_log().replace('loaded shutdown checkpoint generation=8 entries=16384\n', ''), expected, self.devices()))
        self.assertIsNone(server.startup_evidence(self.startup_log().split('mimalloc')[0], expected, self.devices()))
        for generation, entries in ((7, 16384), (8, 8192)):
            with self.assertRaises(RuntimeError):
                server.startup_evidence(self.startup_log(generation, entries), expected, self.devices())
        for before, after in (('2401:00:00.0', '0000:00:00.0'), ('id=1', 'id=0')):
            with self.assertRaises(RuntimeError):
                server.startup_evidence(self.startup_log().replace(before, after, 1), expected, self.devices())

    def test_02_only_fourteen_lavik_sessions_and_valid_owners(self):
        self.assertEqual(len(common.SESSIONS), 14)
        for label in common.SESSIONS:
            server.arguments_valid('lavik', label, 'a' * 32)
        for args in (('redis', common.SESSIONS[0], 'a' * 32), ('lavik', common.SESSIONS[0], 'bad'),
                     ('lavik', 'session-lavik-unknown', 'a' * 32)):
            with self.assertRaises(ValueError):
                server.arguments_valid(*args)

    def test_03_previous_complete_reset_and_exact_checkpoint(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server, 'R', Path(directory)):
            root = Path(directory)
            origin = {'checkpoint_generation': 8, 'checkpoint_entries': 16384}
            with patch.object(common, 'origin_stop', return_value=origin):
                self.assertEqual(server.completed_sequence_before(common.SESSIONS[0]), origin)
                first = root / common.SESSIONS[0]
                first.mkdir()
                active = {'root': str(root), 'product': 'lavik', 'label': first.name}
                stop = {'active': active, 'clean_stop_confirmed': True, 'clean_checkpoint_confirmed': True,
                        'returncode': 0, 'checkpoint_generation': 9, 'checkpoint_entries': 8192}
                reset = {'active': active, 'completed': True, 'command': ['FLUSHDB'], 'response': 'OK'}
                (first / 'stop.json').write_text(json.dumps(stop))
                (first / 'reset-data.json').write_text(json.dumps(reset))
                self.assertEqual(server.completed_sequence_before(common.SESSIONS[1]), stop)
                for changes in ({'checkpoint_entries': 123}, {'checkpoint_generation': 10}):
                    (first / 'stop.json').write_text(json.dumps(stop | changes))
                    with self.assertRaises(RuntimeError): server.completed_sequence_before(common.SESSIONS[1])
                (first / 'stop.json').write_text(json.dumps(stop))
                (first / 'reset-data.json').write_text(json.dumps(reset | {'completed': False}))
                with self.assertRaises(RuntimeError): server.completed_sequence_before(common.SESSIONS[1])

    def test_04_reset_is_owned_ready_and_once_only(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server, 'R', Path(directory)):
            root = Path(directory)
            label, owner = common.SESSIONS[0], 'a' * 32
            session = root / label
            session.mkdir()
            active = {'root': str(root), 'label': label, 'product': 'lavik', 'owner_token': owner,
                      'expected_recovery': {'mode': 'checkpoint', 'checkpoint': {'generation': 8, 'entries': 16384}}}
            ready = {'active': active, 'loaded_checkpoint': active['expected_recovery']['checkpoint'],
                     'normal_request_ready': True, 'recovery': {'recovery_collection_complete': True}}
            with patch.object(server, 'owned_identity', return_value=active), patch.object(server, 'cli', return_value='OK') as cli:
                with self.assertRaises(RuntimeError): server.reset_data('lavik', label, owner)
                cli.assert_not_called()
                (session / 'ready.json').write_text(json.dumps(ready))
                result = server.reset_data('lavik', label, owner)
                self.assertTrue(result['completed'])
                cli.assert_called_once_with('FLUSHDB', timeout=300)
                with self.assertRaises(RuntimeError): server.reset_data('lavik', label, owner)
                cli.assert_called_once()

    def test_05_owned_clean_stop_allows_failed_partial_load(self):
        for reset, entries in ((False, 16384), (True, 123), (True, 8192)):
            with self.subTest(reset=reset, entries=entries), tempfile.TemporaryDirectory() as directory, patch.object(server, 'R', Path(directory)):
                root = Path(directory)
                label, owner = common.SESSIONS[0], 'a' * 32
                session = root / label
                session.mkdir()
                active = {'root': str(root), 'product': 'lavik', 'label': label, 'owner_token': owner,
                          'pid': 12345, 'start_ticks': '17', 'expected_recovery': {'mode': 'checkpoint', 'checkpoint': {'generation': 8, 'entries': 16384}}}
                (root / 'active.json').write_text(json.dumps(active))
                if reset: (session / 'reset-data.json').write_text(json.dumps({'completed': True}))
                def stop_actual(pid, signum):
                    self.assertEqual((pid, signum), (12345, signal.SIGTERM))
                    (session / 'server-exit.json').write_text(json.dumps({'time': time.time(), 'active': active, 'returncode': 0}))
                    (session / 'server.log').write_text('shutdown requested by signal 15\nall active requests drained; flushing storage buffers\n' + f'published shutdown checkpoint generation=9 entries={entries}\n' + 'all storage buffers durably flushed\n')
                with patch.object(server, 'owned_identity', return_value=active), patch.object(common, 'listener_present', return_value=False), patch.object(server.os, 'kill', side_effect=stop_actual):
                    receipt = server.stop_owned('lavik', label, owner)
                self.assertEqual(receipt['checkpoint_generation'], 9)
                self.assertEqual(receipt['checkpoint_entries'], entries)
                self.assertFalse((root / 'active.json').exists())
                with patch.object(common, 'listener_present', return_value=False):
                    self.assertEqual(server.stop_owned('lavik', label, owner), receipt)
                    with self.assertRaises(RuntimeError): server.stop_owned('lavik', label, 'b' * 32)

    def test_06_origin_receipt_is_exact_and_not_reprovisioned(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'new'
            previous = Path(directory) / 'old'
            root.mkdir(); session = previous / 'session-candidate-grouped-zswap'; session.mkdir(parents=True)
            stop = {'clean_stop_confirmed': True, 'clean_checkpoint_confirmed': True, 'returncode': 0,
                    'checkpoint_generation': 8, 'checkpoint_entries': 16384,
                    'active': {'root': str(previous), 'label': session.name}}
            path = session / 'stop.json'
            path.write_text(json.dumps(stop)); (root / 'origin-stop.json').write_bytes(path.read_bytes())
            manifest = {'experiment': root.name, 'source_experiment': previous.name, 'source_stop_path': str(path),
                        'origin_stop': 'origin-stop.json', 'source_stop_sha256': common.sha(path),
                        'checkpoint_generation': 8, 'checkpoint_entries': 16384, 'disk_reprovisioned': False}
            (root / 'initial-recovery.json').write_text(json.dumps(manifest))
            with patch.object(common, 'R', root), patch.object(common, 'PREVIOUS', previous):
                self.assertEqual(common.origin_stop(), stop)
                path.write_text(json.dumps(stop | {'checkpoint_generation': 9}))
                with self.assertRaises(RuntimeError): common.origin_stop()

    def test_07_cancellation_is_not_swallowed_by_exception(self):
        with self.assertRaises(server.Cancelled): server.cancelled(signal.SIGTERM, None)
        self.assertFalse(issubclass(server.Cancelled, Exception))


if __name__ == '__main__':
    result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(Checks))
    root = Path(__file__).resolve().parent
    receipt = {'status': 'passed' if result.wasSuccessful() else 'failed',
               'platform': platform.platform(), 'time': time.time(),
               'tests_run': result.testsRun, 'failures': len(result.failures),
               'errors': len(result.errors), 'skipped': len(result.skipped),
               'remote_operations': 0,
               'source_sha256': {name: hashlib.sha256((root / name).read_bytes()).hexdigest()
                                 for name in ('server.py', 'preflight_server.py', 'server_checks.py')}}
    print(json.dumps(receipt, indent=2))
    sys.exit(0 if result.wasSuccessful() else 1)
