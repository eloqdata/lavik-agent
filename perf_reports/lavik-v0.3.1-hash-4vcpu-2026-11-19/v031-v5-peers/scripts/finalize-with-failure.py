"""Preserve the completed measurements and the explicitly diagnosed failed warmup."""
import pathlib,subprocess,json,hashlib
root=pathlib.Path('/opt/bench');kit=root/'v031-v5-peers-kit';out=root/'v031-v5-peers'
ssh=['ssh','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4']
expected='dragonfly/n100000000-native-unlimited-tiered-listpack-A-t0-warmup'
subprocess.run(['python3',str(kit/'audit-results.py'),str(out),'--out',str(out/'audit.json')],check=True)
a=json.loads((out/'audit.json').read_text())
assert a['valid_points']==14 and a['valid_measurement_windows']==42
assert not a['incomplete_points'] and not a['invalid_or_interrupted']
assert len(a['failed_warmups'])==1 and a['failed_warmups'][0]['path']==expected
assert 'ERR Out of memory' in (out/expected/'ycsb.log').read_text()
assert len(json.loads((out/'complete.json').read_text())['failures'])==1
subprocess.run(['python3',str(kit/'audit-runtime.py'),str(out),'--out',str(out/'runtime-audit.json')],check=True)
assert json.loads((out/'runtime-audit.json').read_text())['validated_windows']==42
subprocess.run(['python3',str(kit/'client-headroom.py'),str(out),'--sar',str(root/'v031-v5-peers-host/resources.sar'),'--out',str(out/'client-headroom.json')],check=True)
subprocess.run(ssh+['sudo','python3','/opt/bench/v031-v5-package-peer-server.py'],check=True)
scp=['scp','-q','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts')]
subprocess.run(scp+['bench@10.83.0.4:/opt/bench/v031-v5-peers-server-evidence.tgz',str(root/'v031-v5-peers-server-evidence.tgz')],check=True)
expected_hash=subprocess.check_output(ssh+['cat','/opt/bench/v031-v5-peers-server-SHA256SUMS'],text=True).split()[0]
assert hashlib.file_digest((root/'v031-v5-peers-server-evidence.tgz').open('rb'),'sha256').hexdigest()==expected_hash
subprocess.run(['tar','czf',str(root/'v031-v5-peers-client-evidence.tgz'),'-C',str(root),'v031-v5-peers','v031-v5-peers-kit','v031-v5-peers-host','v031-v5-peers-campaign.log'],check=True)
sums=subprocess.check_output(['sha256sum',str(root/'v031-v5-peers-client-evidence.tgz'),str(root/'v031-v5-peers-server-evidence.tgz')],text=True)
(root/'v031-v5-peers-evidence-SHA256SUMS').write_text(sums)
(root/'v031-v5-peers-evidence-complete').touch()
print(sums,flush=True)
