import pathlib,subprocess,json,tarfile,hashlib,shutil
root=pathlib.Path('/opt/bench');out=root/'nvme-rootcause-final-evidence';raw=out/'raw';raw.mkdir(parents=True,exist_ok=True)
assert json.loads((root/'aerospike-diagnostic-results/complete.json').read_text())['windows']==9
ssh=['ssh','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4']
code='''import pathlib,subprocess,json,tarfile,io
r=pathlib.Path('/opt/bench')
for unit in ['bench-db-aerospike','bench-db-lavik','bench-alignment-followup','bench-aerospike-iostat']:
 assert subprocess.run(['systemctl','is-active','--quiet',unit]).returncode!=0
for name in ['fio-alignment','fio-alignment-factorial','spdk-queue-probe']:assert json.loads((r/name/'complete.json').read_text())['windows']==9
with tarfile.open(r/'rootcause-server.tar.xz','w:xz') as t:
 for name in ['fio-alignment','fio-alignment-factorial','spdk-queue-probe','aerospike-diagnosis']:
  t.add(r/name,arcname='server/'+name)
 for name in ['fio-alignment.log','alignment-followup.log','rootcause-iostat.txt','spdk-b-perf.data','fio-alignment.py','fio-alignment-factorial.py','probe-campaign.py','aerospike-server.py','rootcause-audit.json','rootcause-audit.csv']:
  if (r/name).exists():t.add(r/name,arcname='server/'+name)
 commands={'smart':['nvme','smart-log','/dev/nvme1n1','-o','json'],'errors':['nvme','error-log','/dev/nvme1n1','-e','8','-o','json'],'dmesg':['dmesg','--ctime'],'lsblk':['lsblk','-b','-o','NAME,SIZE,SERIAL,MOUNTPOINTS'],'probe_sha256':['sha256sum','/opt/bench/queue_probe'],'aerospike_sha256':['sha256sum','/opt/bench/aerospike-package/usr/bin/asd'],'lscpu':['lscpu'],'date':['date','-u'],'meminfo':['cat','/proc/meminfo'],'perf':['perf','report','-i','/opt/bench/spdk-b-perf.data','--stdio','--no-children','--call-graph','none','--percent-limit','1']}
 metadata={k:subprocess.check_output(v,text=True) for k,v in commands.items()};b=json.dumps(metadata,indent=2).encode();i=tarfile.TarInfo('server/final-host.json');i.size=len(b);t.addfile(i,io.BytesIO(b))
'''
subprocess.run(ssh+['sudo','python3','-'],input=code,text=True,check=True)
subprocess.run(['scp','-O','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4:/opt/bench/rootcause-server.tar.xz',str(out/'server.tar.xz')],check=True)
with tarfile.open(out/'server.tar.xz') as t:t.extractall(raw,filter='data')
for name in ['aerospike-diagnostic-results','aerospike-diagnostic-initial-failed','aerospike-diagnostic-retry1-failed','spdk-rootcause','aerospike-kit']:
 if (root/name).exists():shutil.copytree(root/name,raw/'client'/name,dirs_exist_ok=True)
for name in ['aerospike-diagnosis.log','aerospike-diagnosis-retry1.log','aerospike-diagnosis-retry2.log','spdk-perf-b.log','download-aerospike.log','build-aerospike-ycsb.log','build-spdk-probe.log','build-spdk-probe2.log','build-spdk-probe3.log','build-spdk-probe4.log','build-spdk-probe5.log','build-spdk-probe6.log','queue-probe-build.log','queue_probe.c','build-spdk-probe.sh']:
 if (root/name).exists():shutil.copy2(root/name,raw/'client'/name)
for p in (root/'aerospike-download').glob('*.sha256'):shutil.copy2(p,raw/'client'/p.name)
meta={k:subprocess.check_output(v,text=True) for k,v in {'ycsb_source_sha256':['sha256sum','/opt/bench/YCSB-247a2d4/aerospike/src/main/java/site/ycsb/db/AerospikeClient.java','/opt/bench/YCSB-247a2d4/redis/src/main/java/site/ycsb/db/RedisClient.java','/opt/bench/YCSB-247a2d4/core/src/main/java/site/ycsb/workloads/CoreWorkload.java'],'spdk_commit':['git','-C','/opt/bench/spdk-probe-src','rev-parse','HEAD'],'dpdk_commit':['git','-C','/opt/bench/spdk-probe-src/dpdk','rev-parse','HEAD'],'cc':['cc','--version']}.items()}
meta['ycsb_expected_commit']='247a2d448ebceff11a570a622c49ece161a27ed3';meta['ycsb_checkout']='source archive; no .git directory'
(raw/'client/build-provenance.json').write_text(json.dumps(meta,indent=2)+'\n')
(raw/'STATUS.json').write_text(json.dumps({'rootcause_valid_points':9,'rootcause_valid_windows':27,'aerospike_valid_points':3,'aerospike_valid_windows':9,'excluded':['InitialASload0success/128errorscluster-not-ready','Retry1beforeloadalready-stoppedmonitor','LavikBperfdiagnosticnotformalbenchmark'],'scope':'SPDKstandalone/kernelreproductionandAerospikediagnosis;notcompletefour-productSPDKcomparison'},indent=2)+'\n')
manifest=[{'path':str(p.relative_to(raw)),'bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest()} for p in sorted(raw.rglob('*')) if p.is_file()]
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
with tarfile.open(out/'raw.tar.xz','w:xz') as t:t.add(raw,arcname='raw')
x={'bytes':(out/'raw.tar.xz').stat().st_size,'sha256':hashlib.file_digest((out/'raw.tar.xz').open('rb'),'sha256').hexdigest(),'files':len(manifest)};(out/'archive.json').write_text(json.dumps(x,indent=2)+'\n');print(json.dumps(x))
