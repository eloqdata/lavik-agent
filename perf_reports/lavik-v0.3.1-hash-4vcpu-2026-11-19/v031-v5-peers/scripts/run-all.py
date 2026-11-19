import pathlib,subprocess,json,hashlib,os,time,traceback
root=pathlib.Path('/opt/bench');kit=root/'v031-v5-peers-kit';out=root/'v031-v5-peers'
assert (root/'v031-v5-evidence-complete').exists()
preservation=json.loads((root/'v031-v5-peer-preparation.json').read_text())
assert preservation.get('lavik_archives_downloaded_and_verified') is True or preservation.get('lavik_archives_verified_on_both_hosts') is True
for side in ['client','server']:
 assert hashlib.file_digest((root/('v031-v5-'+side+'-evidence.tgz')).open('rb'),'sha256').hexdigest()==preservation[side+'_evidence_sha256']
os.environ['JAVA_HOME']='/opt/bench/java-17-openjdk-amd64';os.environ['PATH']=os.environ['JAVA_HOME']+'/bin:'+os.environ['PATH']
out.mkdir(exist_ok=False)
ssh=['ssh','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4']
server_prepared=False
try:
 jar=root/'YCSB-247a2d4/redis/target/redis-binding-0.18.0-SNAPSHOT.jar'
 assert hashlib.file_digest(jar.open('rb'),'sha256').hexdigest()=='440f273f17660740f7713d21d4eee167232688fd033dbdc52aace9c6b3ee0df1'
 (out/'hardware.json').write_bytes((root/'v031-v5-hardware.json').read_bytes())
 (out/'source-lock.json').write_bytes((kit/'source-lock.json').read_bytes())
 subprocess.run(['sudo','python3',str(kit/'host.py'),'prepare'],check=True)
 server_prepared=True;subprocess.run(ssh+['sudo','python3','/opt/bench/v031-v5-peers-host.py','prepare'],check=True)
 subprocess.run(ssh+['sudo','python3','/opt/bench/v031-v5-prepare-native.py'],check=True)
 subprocess.run(['python3',str(kit/'peers-campaign.py')],check=True)
except BaseException:
 (out/'run-all-failure.txt').write_text(traceback.format_exc());raise
finally:
 for product in ['redis','kvrocks','dragonfly']:
  subprocess.run(ssh+['sudo','systemctl','stop','bench-db-'+product],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 if (root/'v031-v5-peers-host/timers-before.json').exists():subprocess.run(['sudo','python3',str(kit/'host.py'),'finish'],check=True)
 if server_prepared:subprocess.run(ssh+['sudo','python3','/opt/bench/v031-v5-peers-host.py','finish'],check=True)
subprocess.run(['python3',str(kit/'audit-results.py'),str(out),'--out',str(out/'audit.json')],check=True)
a=json.loads((out/'audit.json').read_text())
assert not a['incomplete_points'] and not a['failed_warmups'],a
# Retain failed loads explicitly; no incomplete/failed measurements enter results.
assert all(pathlib.Path(x['path']).name.endswith('-load') for x in a['invalid_or_interrupted']),a['invalid_or_interrupted']
assert a['valid_points']==len(json.loads((out/'summary.json').read_text()))
subprocess.run(['python3',str(kit/'client-headroom.py'),str(out),'--sar',str(root/'v031-v5-peers-host/resources.sar'),'--out',str(out/'client-headroom.json')],check=True)
subprocess.run(ssh+['sudo','python3','/opt/bench/v031-v5-package-peer-server.py'],check=True)
scp=['scp','-q','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts')]
subprocess.run(scp+['bench@10.83.0.4:/opt/bench/v031-v5-peers-server-evidence.tgz',str(root/'v031-v5-peers-server-evidence.tgz')],check=True)
expected=subprocess.check_output(ssh+['cat','/opt/bench/v031-v5-peers-server-SHA256SUMS'],text=True).split()[0]
assert hashlib.file_digest((root/'v031-v5-peers-server-evidence.tgz').open('rb'),'sha256').hexdigest()==expected
subprocess.run(['tar','czf',str(root/'v031-v5-peers-client-evidence.tgz'),'-C',str(root),'v031-v5-peers','v031-v5-peers-kit','v031-v5-peers-host','v031-v5-peers-campaign.log'],check=True)
sums=subprocess.check_output(['sha256sum',str(root/'v031-v5-peers-client-evidence.tgz'),str(root/'v031-v5-peers-server-evidence.tgz')],text=True)
(root/'v031-v5-peers-evidence-SHA256SUMS').write_text(sums);(root/'v031-v5-peers-evidence-complete').touch();print(sums,flush=True)
