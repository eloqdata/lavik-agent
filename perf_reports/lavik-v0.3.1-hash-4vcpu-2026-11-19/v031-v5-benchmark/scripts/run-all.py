#!/usr/bin/env python3
import subprocess,pathlib,json,time,traceback,hashlib,os
os.environ['JAVA_HOME']='/opt/bench/java-17-openjdk-amd64'
os.environ['PATH']=os.environ['JAVA_HOME']+'/bin:'+os.environ['PATH']
root=pathlib.Path('/opt/bench');kit=root/'v031-v5-kit';out=root/'v031-v5-benchmark';out.mkdir(exist_ok=False)
ssh=['ssh','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4']
client_prepared=False;server_prepared=False
try:
 subprocess.run(['sudo','python3',str(kit/'host.py'),'prepare'],check=True);client_prepared=True
 server_prepared=True;subprocess.run(ssh+['sudo','python3','/opt/bench/v031-v5-host.py','prepare'],check=True)
 source=(root/'YCSB-247a2d4/lavik/src/main/java/site/ycsb/db/LavikClient.java').read_bytes();blob=hashlib.sha1(b'blob '+str(len(source)).encode()+b'\0'+source).hexdigest();assert blob=='e61fd60b964bbbb838f5b83fa7475aea616d59ef',blob
 jar=hashlib.sha256((root/'YCSB-247a2d4/lavik/target/lavik-binding-0.18.0-SNAPSHOT.jar').read_bytes()).hexdigest();assert jar=='72b927227f1209c41146528d59b77f0c5c67250f0eaff8ffeb657aa79c9fa919',jar
 meta={'started_epoch':time.time(),'ycsb_source_archive_commit':'247a2d448ebceff11a570a622c49ece161a27ed3','verified_driver_git_blob':blob,'lavik_binding_jar_sha256':jar,'provenance':'Reused pinned source archive; binding source matches GitHub blob at pinned commit and JAR matches independently verified prior baseline.'};(out/'campaign.json').write_text(json.dumps(meta,indent=2)+'\n')
 for records in [10000000,100000000]:subprocess.run(['python3',str(kit/'campaign-main.py'),'--records',str(records)],check=True)
 (out/'measurements-complete.json').write_text(json.dumps({'epoch':time.time(),'expected_points':8,'expected_windows':24})+'\n')
except BaseException:
 (out/'failure.txt').write_text(traceback.format_exc());raise
finally:
 # Cleanup also runs after a measurement failure; preserve the NVMe and keep every VM running.
 subprocess.run(ssh+['sudo','systemctl','stop','bench-db-lavik'])
 if (root/'v031-v5-host/timers-before.json').exists():subprocess.run(['sudo','python3',str(kit/'host.py'),'finish'],check=True)
 if server_prepared:subprocess.run(ssh+['sudo','python3','/opt/bench/v031-v5-host.py','finish'],check=True)
subprocess.run(['python3',str(kit/'audit-results.py'),str(out),'--out',str(out/'audit.json')],check=True)
audit=json.loads((out/'audit.json').read_text());assert audit['valid_points']==8 and audit['valid_measurement_windows']==24 and not audit['invalid_or_interrupted'] and not audit['incomplete_points'] and not audit['failed_warmups'],audit
subprocess.run(['python3',str(kit/'audit-runtime.py'),str(out),str(out/'runtime-audit.json')],check=True)
assert json.loads((out/'runtime-audit.json').read_text())['validated_windows']==24
subprocess.run(['python3',str(kit/'client-headroom.py'),str(out),'--sar',str(root/'v031-v5-host/resources.sar'),'--out',str(out/'client-headroom.json')],check=True)
subprocess.run(ssh+['bash','-c',"'set -e; cd /opt/bench; sha256sum v031-release/lavik-v0.3.1-linux-x86_64/lavik > v031-release/binary-after.sha256; sudo tar czf v031-v5-server-evidence.tgz spdk-runs/v031-v5-* v031-v5-host v031-v5-server-control.py v031-v5-host.py v031-release/help.txt v031-release/binary.sha256 v031-release/binary-after.sha256 v031-release/ldd.txt; sudo chown bench:bench v031-v5-server-evidence.tgz; sha256sum v031-v5-server-evidence.tgz'"],check=True)
subprocess.run(['scp','-q','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4:/opt/bench/v031-v5-server-evidence.tgz',str(root/'v031-v5-server-evidence.tgz')],check=True)
subprocess.run(['tar','czf',str(root/'v031-v5-client-evidence.tgz'),'-C',str(root),'v031-v5-benchmark','v031-v5-kit','v031-v5-host','v031-v5-campaign.log','replacement-kit/verify.py'],check=True)
sums=subprocess.check_output(['sha256sum',str(root/'v031-v5-client-evidence.tgz'),str(root/'v031-v5-server-evidence.tgz')],text=True);(root/'v031-v5-evidence-SHA256SUMS').write_text(sums);(root/'v031-v5-evidence-complete').touch();print(sums,flush=True)
