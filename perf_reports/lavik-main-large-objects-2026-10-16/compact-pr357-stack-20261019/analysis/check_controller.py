"""Local fixtures only: no real Redis endpoint, SSH, subprocess, or data changes."""
from pathlib import Path
from unittest.mock import patch
import copy
import json
import tempfile
import unittest
import analyze
import run
import provenance
from clients import interface as client
from experiment import OPS

class Checks(unittest.TestCase):
    def ready(self,owned=None):
        checkpoint={'generation':8,'entries':16384}
        return {'active':owned or {},'loaded_checkpoint':checkpoint,'normal_request_ready':True,
                'recovery':{'mode':'checkpoint','checkpoint':checkpoint,'recovery_collection_complete':True,
                            'storage_devices':[{}]*6}}

    def test_01_exact_shared_client_interface(self):
        for op in OPS:
            for phase in ('load','warm','run')+(('validate',) if op in client.READ_OPS else ()):
                relative='fixtures/'+op+'-'+phase
                state=analyze.CROOT+'/states/unit.bin' if op in client.STATEFUL else None
                command=client.command(op,phase,analyze.CROOT+'/'+relative+'/result.json',state)
                analyze.check_command(command,op,phase,relative,state)
                self.assertTrue(command[0].startswith(provenance.ORIGINAL+'/clients/'))

    def test_02_checkpoint_readiness(self):
        previous={'checkpoint_generation':8,'checkpoint_entries':16384}
        run.ready_check(self.ready(),{},previous)
        for kind in ('generation','entries','normal','collection','device_count'):
            value=copy.deepcopy(self.ready())
            if kind in ('generation','entries'):value['loaded_checkpoint'][kind]-=1
            elif kind=='normal':value['normal_request_ready']=False
            elif kind=='collection':value['recovery']['recovery_collection_complete']=False
            else:value['recovery']['storage_devices'].pop()
            with self.subTest(kind=kind),self.assertRaises(RuntimeError):run.ready_check(value,{},previous)

    def exercise(self,root,start_failure=False,bad_checkpoint=False):
        previous={'checkpoint_generation':8,'checkpoint_entries':16384}
        owned={'revision':provenance.STACK,'binary':'/fixture/lavik','binary_sha256':'a'*64}
        stopped={'active':owned,'clean_stop_confirmed':True,'clean_checkpoint_confirmed':True,
                 'checkpoint_generation':9,'checkpoint_entries':8192}
        ready=self.ready(owned)
        if bad_checkpoint:ready['loaded_checkpoint']={'generation':7,'entries':16384}
        actions=[];phases=[]
        def remote(action,*_):
            actions.append(action)
            if action=='start':
                if start_failure:raise RuntimeError('lost SSH response after owned start')
                return owned
            if action=='reset-data':return {'completed':True}
            if action=='stop-owned':return stopped
            raise AssertionError(action)
        def execute(product,op,phase,active,state):
            phases.append(phase);return {'phase':phase}
        with patch.object(run.b,'R',root),patch.object(run.b,'remote',remote),patch.object(run.b,'get_active',return_value=owned),patch.object(run.b,'shell',return_value=json.dumps(ready)),patch.object(run,'execute',execute),patch.object(run,'validate_sample'),patch.object(provenance,'stack',return_value=owned):
            if start_failure or bad_checkpoint:
                with self.assertRaises(RuntimeError):run.case_run('lavik','hgetall',previous)
            else:
                result,stop=run.case_run('lavik','hgetall',previous)
                self.assertEqual(result,{'phase':'run'});self.assertEqual(stop,stopped)
                family=json.loads((root/'families/lavik-hgetall.json').read_text())
                self.assertEqual(family['state'],'complete');self.assertEqual(family['ready'],ready)
        return actions,phases

    def test_03_one_flush_and_order(self):
        with tempfile.TemporaryDirectory() as directory:
            actions,phases=self.exercise(Path(directory))
        self.assertEqual(actions,['start','reset-data','stop-owned'])
        self.assertEqual(phases,['load','warm','run'])

    def test_04_lost_start_response_cleans_only_owned(self):
        with tempfile.TemporaryDirectory() as directory:
            actions,phases=self.exercise(Path(directory),start_failure=True)
        self.assertEqual(actions,['start','stop-owned']);self.assertEqual(phases,[])

    def test_05_wrong_recovery_prevents_reset(self):
        with tempfile.TemporaryDirectory() as directory:
            actions,phases=self.exercise(Path(directory),bad_checkpoint=True)
        self.assertEqual(actions,['start','stop-owned']);self.assertEqual(phases,[])

    def test_06_original_receipts_and_namespace_shape(self):
        root=Path(__file__).resolve().parent
        self.assertEqual(provenance.initial(root)['checkpoint_generation'],8)
        self.assertEqual(len(provenance.clients(root)['clients']),5)
        self.assertEqual(len(OPS),14)
        for op in OPS:self.assertEqual(client.shape(op)['logical_payload_bytes'],8192)

if __name__=='__main__':unittest.main(verbosity=2)
