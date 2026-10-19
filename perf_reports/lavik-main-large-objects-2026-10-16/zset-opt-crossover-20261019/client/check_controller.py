"""Local controller safety fixtures; no SSH, database, or benchmark operation."""
from pathlib import Path
import contextlib
import hashlib
import io
import json
import platform
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch
import run
import runner
import suite
from experiment import SEQUENCE, REVISIONS, expected_entries, stem
from validation import transaction_delta


class ControllerTests(unittest.TestCase):
    def test_cancellation_interrupts_subprocess_wait(self):
        for module, kind in ((run, run.InterruptedRun), (suite, suite.InterruptedSuite)):
            child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(5)'])
            old = {s: signal.getsignal(s) for s in (signal.SIGALRM, signal.SIGTERM, signal.SIGINT)}
            try:
                signal.signal(signal.SIGALRM, lambda *_: module.interrupted(signal.SIGTERM, None))
                signal.setitimer(signal.ITIMER_REAL, .04)
                with self.assertRaises(kind):
                    child.wait(timeout=1)
            finally:
                signal.setitimer(signal.ITIMER_REAL, 0)
                for s, handler in old.items():
                    signal.signal(s, handler)
                child.terminate()
                child.wait(timeout=3)

    def harness(self, root, lost=False, wrong_recovery=False):
        active, calls, phases, checkpoints = {}, [], [], []
        def remote(action, *args):
            calls.append((action, args))
            variant, label, owner = args
            if action == 'start':
                active.clear()
                active.update(product=variant, label=label, owner_token=owner, revision=REVISIONS[variant])
                if lost:
                    raise RuntimeError('Simulated start response lost')
                return dict(active)
            self.assertEqual(action, 'stop-owned')
            index = [stem(*point) for point in SEQUENCE].index(label.removeprefix('session-'))
            receipt = {'active': dict(active), 'clean_stop_confirmed': True,
                       'clean_checkpoint_confirmed': True, 'checkpoint_entries': expected_entries(index),
                       'checkpoint_generation': 101 + len(checkpoints), 'returncode': 0}
            checkpoints.append(receipt)
            return receipt
        def shell(_):
            checkpoint = None if not checkpoints else {
                'generation': checkpoints[-1]['checkpoint_generation'],
                'entries': checkpoints[-1]['checkpoint_entries']}
            recovery = {'mode': 'fresh' if checkpoint is None else 'checkpoint', 'checkpoint': checkpoint,
                        'storage_devices': [dict(id=i) for i in range(6)], 'recovery_collection_complete': True}
            if wrong_recovery:
                recovery['mode'] = 'checkpoint'
            return json.dumps({'active': dict(active), 'recovery': recovery, 'normal_request_ready': True})
        def execute(variant, size, op, phase, owned, state):
            phases.append((variant, size, op, phase))
            if op == 'zswap':
                data = bytearray(state.read_bytes());data[8] ^= 1;state.write_bytes(data)
            return {'fixture_only': phase}
        contexts = [patch.object(runner, 'R', root), patch.object(runner, 'remote', remote),
                    patch.object(runner, 'shell', shell), patch.object(runner, 'get_active', lambda *_: dict(active)),
                    patch.object(runner, 'validate_sample', lambda *_: {}), patch.object(run, 'execute', execute)]
        return contexts, calls, phases, checkpoints

    def test_eight_cases_two_loads_and_dynamic_checkpoints(self):
        with tempfile.TemporaryDirectory() as td, contextlib.ExitStack() as stack:
            root = Path(td)
            (root / 'states').mkdir()
            contexts, calls, phases, checkpoints = self.harness(root)
            for context in contexts:stack.enter_context(context)
            previous, chain = None, {}
            for index in range(8):previous = run.case_run(index, previous, chain)
            self.assertEqual([x[:3] for x in phases if x[3] == 'load'], [SEQUENCE[0], SEQUENCE[2]])
            self.assertEqual(len(phases), 18)
            self.assertEqual([c['checkpoint_entries'] for c in checkpoints], [8192,8192,16384,16384,16384,16384,16384,16384])
            self.assertEqual([c['checkpoint_generation'] for c in checkpoints], list(range(101,109)))
            self.assertEqual(len([a for a,args in calls if a == 'stop-owned']), 8)
            self.assertEqual(set(chain), {'compact','grouped'})
            self.assertEqual(set(a for a,args in calls), {'start','stop-owned'})

    def test_lost_start_response_still_stops_owned_service(self):
        with tempfile.TemporaryDirectory() as td, contextlib.ExitStack() as stack:
            root=Path(td);(root/'states').mkdir()
            contexts,calls,_,_=self.harness(root,lost=True)
            for context in contexts:stack.enter_context(context)
            with self.assertRaisesRegex(RuntimeError,'response lost'):run.case_run(0,None,{})
            self.assertEqual([a for a,args in calls],['start','stop-owned'])

    def test_wrong_recovery_rejects_before_workload(self):
        with tempfile.TemporaryDirectory() as td, contextlib.ExitStack() as stack:
            root=Path(td);(root/'states').mkdir()
            contexts,calls,phases,_=self.harness(root,wrong_recovery=True)
            for context in contexts:stack.enter_context(context)
            with self.assertRaisesRegex(RuntimeError,'checkpoint'):run.case_run(0,None,{})
            self.assertEqual(phases,[])
            self.assertEqual(calls[-1][0],'stop-owned')

    def test_partial_case_cannot_resume(self):
        with tempfile.TemporaryDirectory() as td, patch.object(runner,'R',Path(td)):
            runner.save(Path(td)/'families/main-compact-zincr.json',{'state':'started'})
            with self.assertRaisesRegex(RuntimeError,'Non-resumable'):run.completed_prefix(True)

    def test_transaction_layout_guards(self):
        keys=('tx_commit_batches','tx_commit_batch_transactions','tx_commit_input_fences','tx_commit_merged_fences','tx_commit_backpressure_waits','tx_cleaner_rounds','tx_cleaner_retired_blocks','tx_commit_queue_depth','storage_tx_commits_pending')
        def snapshot(count=0):
            return {'info':{'stats':'\n'.join(k+':'+str(count if k=='tx_commit_batch_transactions' else 0) for k in keys)}}
        self.assertEqual(transaction_delta(snapshot(),snapshot(),'compact','run')['delta']['tx_commit_batch_transactions'],0)
        with self.assertRaises(ValueError):transaction_delta(snapshot(),snapshot(1),'compact','run')
        with self.assertRaises(ValueError):transaction_delta(snapshot(),snapshot(),'grouped','run')
        self.assertEqual(transaction_delta(snapshot(),snapshot(1),'grouped','run')['delta']['tx_commit_batch_transactions'],1)


if __name__ == '__main__':
    results = unittest.TextTestRunner(stream=sys.stderr, verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(ControllerTests))
    root=Path(__file__).resolve().parent
    receipt={'status':'passed' if results.wasSuccessful() else 'failed','platform':platform.platform(),
             'tests_run':results.testsRun,'failures':len(results.failures),'errors':len(results.errors),
             'skipped':len(results.skipped),'time':time.time(),'remote_operations':0,
             'source_sha256':{name:hashlib.sha256((root/name).read_bytes()).hexdigest()
                              for name in ('run.py','runner.py','suite.py','experiment.py','validation.py','check_controller.py')}}
    print(json.dumps(receipt,indent=2))
    raise SystemExit(0 if results.wasSuccessful() else 1)
