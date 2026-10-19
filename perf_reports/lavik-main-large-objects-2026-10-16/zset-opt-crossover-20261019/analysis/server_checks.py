"""Offline lifecycle checks; no device, socket, process or remote operations."""
from pathlib import Path
import copy
import json
import signal
import tempfile
import time
import unittest
from unittest.mock import patch
import server
import preflight_server as common
import restore_spdk


class Checks(unittest.TestCase):
    def devices(self):
        return [{'bdf': bdf, 'serial': serial, 'bytes': common.DEVICE_BYTES}
                for bdf, serial in common.ALLOW.items()]

    def startup_log(self):
        capacity = common.DEVICE_BYTES // (8 * 1024 * 1024) * (8 * 1024 * 1024)
        return ''.join(f'storage device id={i} path=spdk://{d["bdf"]}/1 capacity-bytes={capacity} data-blocks=1\n'
                       for i, d in enumerate(self.devices())) + 'mimalloc recovery collection complete; online purge_delay=10\n'

    def test_01_fresh_start_requires_all_devices_and_finished_recovery(self):
        expected = server.expected_recovery(None)
        self.assertEqual(expected, {'mode': 'fresh', 'checkpoint': None})
        evidence = server.startup_evidence(self.startup_log(), expected, self.devices())
        self.assertEqual(len(evidence['storage_devices']), 6)
        self.assertTrue(evidence['recovery_collection_complete'])
        self.assertIsNone(server.startup_evidence(self.startup_log().split('\n', 1)[1], expected, self.devices()))
        self.assertIsNone(server.startup_evidence(self.startup_log().split('mimalloc')[0], expected, self.devices()))
        with self.assertRaises(RuntimeError):
            server.startup_evidence(self.startup_log() + 'loaded shutdown checkpoint generation=26 entries=8192\n', expected, self.devices())

    def test_02_checkpoint_matches_actual_previous_stop(self):
        expected = server.expected_recovery({'checkpoint_generation': 7, 'checkpoint_entries': 16384})
        self.assertIsNone(server.startup_evidence(self.startup_log(), expected, self.devices()))
        evidence = server.startup_evidence(self.startup_log() + 'loaded shutdown checkpoint generation=7 entries=16384\n', expected, self.devices())
        self.assertEqual(evidence['checkpoint'], expected['checkpoint'])
        for wrong in ('generation=6 entries=16384', 'generation=7 entries=8192'):
            with self.assertRaises(RuntimeError):
                server.startup_evidence(self.startup_log() + 'loaded shutdown checkpoint ' + wrong + '\n', expected, self.devices())

    def test_03_startup_rejects_path_capacity_and_duplicate_ids(self):
        expected = server.expected_recovery(None)
        for before, after in (('2401:00:00.0', '0000:00:00.0'), ('id=1', 'id=0'), ('capacity-bytes=', 'capacity-bytes=1')):
            with self.assertRaises(RuntimeError):
                server.startup_evidence(self.startup_log().replace(before, after, 1), expected, self.devices())

    def test_04_exact_session_and_owner_arguments(self):
        for variant, size, op in common.SEQUENCE:
            server.arguments_valid(variant, 'session-' + '-'.join((variant, size, op)), 'a' * 32)
        for args in (('main', 'session-main-compact-zincr', 'bad'),
                     ('candidate', 'session-main-compact-zincr', 'a' * 32),
                     ('main', 'session-main-compact-reset', 'a' * 32)):
            with self.assertRaises(ValueError):
                server.arguments_valid(*args)

    def test_05_partial_cleanup_checkpoint_cannot_advance(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server, 'R', Path(directory)):
            root = Path(directory)
            first, second = common.SESSIONS[:2]
            self.assertIsNone(server.completed_sequence_before(first))
            (root / first).mkdir()
            stop = {'clean_stop_confirmed': True, 'clean_checkpoint_confirmed': True, 'returncode': 0,
                    'checkpoint_generation': 1, 'checkpoint_entries': 123,
                    'active': {'label': first, 'root': str(root)}}
            (root / first / 'stop.json').write_text(json.dumps(stop))
            with self.assertRaises(RuntimeError):
                server.completed_sequence_before(second)
            stop['checkpoint_entries'] = 8192
            (root / first / 'stop.json').write_text(json.dumps(stop))
            self.assertEqual(server.completed_sequence_before(second), stop)
            (root / second).mkdir()
            with self.assertRaises(RuntimeError):
                server.completed_sequence_before(second)

    def test_06_clean_stop_owned_pid_and_checkpoint_receipt(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server, 'R', Path(directory)):
            root = Path(directory)
            label, owner = common.SESSIONS[0], 'a' * 32
            session = root / label
            session.mkdir()
            active = {'root': str(root), 'product': 'main', 'label': label, 'owner_token': owner,
                      'pid': 12345, 'start_ticks': '17', 'expected_recovery': {'mode': 'fresh', 'checkpoint': None}}
            (root / 'active.json').write_text(json.dumps(active))
            def stop_actual(pid, signum):
                self.assertEqual((pid, signum), (12345, signal.SIGTERM))
                (session / 'server-exit.json').write_text(json.dumps({'time': time.time(), 'active': active, 'returncode': 0}))
                (session / 'server.log').write_text('shutdown requested by signal 15\nall active requests drained; flushing storage buffers\npublished shutdown checkpoint generation=1 entries=0\nall storage buffers durably flushed\n')
            with patch.object(server, 'owned_identity', return_value=active), patch.object(common, 'listener_present', return_value=False), patch.object(server.os, 'kill', side_effect=stop_actual):
                receipt = server.stop_owned('main', label, owner)
            self.assertEqual(receipt['checkpoint_entries'], 0)
            self.assertTrue(receipt['clean_stop_confirmed'])
            self.assertFalse((root / 'active.json').exists())
            with patch.object(common, 'listener_present', return_value=False):
                self.assertEqual(server.stop_owned('main', label, owner), receipt)
                with self.assertRaises(RuntimeError):
                    server.stop_owned('main', label, 'b' * 32)

    def test_07_allowlist_cannot_include_other_device(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(common, 'R', Path(directory)):
            path = Path(directory) / 'spdk-devices.json'
            devices = self.devices()
            path.write_text(json.dumps(devices))
            self.assertEqual(common.verified_devices(), devices)
            for field, value in (('bdf', '0000:00:00.0'), ('serial', 'system-disk'), ('bytes', 500000000000)):
                changed = copy.deepcopy(devices)
                changed[0][field] = value
                path.write_text(json.dumps(changed))
                with self.assertRaises(RuntimeError):
                    common.verified_devices()

    def test_08_restore_default_is_non_destructive_and_partial_attempt_refuses(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(restore_spdk, 'R', Path(directory)):
            root = Path(directory)
            preflight = {'raid': {'devices': self.devices()}}
            with patch.object(common, 'verify_host'), patch.object(common, 'preflight', return_value=preflight), patch.object(restore_spdk, 'run_step') as command:
                restore_spdk.main()
                command.assert_not_called()
                self.assertFalse((root / 'restore-spdk').exists())
                (root / 'restore-spdk').mkdir()
                with self.assertRaises(RuntimeError):
                    restore_spdk.main(apply=True)
                command.assert_not_called()

    def test_09_cancellation_not_swallowed_as_interrupted_error(self):
        for module in (server, restore_spdk):
            with self.assertRaises(module.Cancelled):
                module.cancelled(signal.SIGTERM, None)
            self.assertFalse(issubclass(module.Cancelled, Exception))


if __name__ == '__main__':
    unittest.main(verbosity=2)
