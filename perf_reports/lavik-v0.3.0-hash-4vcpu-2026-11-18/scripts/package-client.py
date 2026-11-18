#!/usr/bin/env python3
"""Package completed unlimited-native acquisition, without SSH keys or DB files."""
import hashlib,json,pathlib,shutil,subprocess,tarfile
ROOT=pathlib.Path('/opt/bench');FORMAL=ROOT/'formal-unlimited-native';OUT=ROOT/'evidence-final';RAW=OUT/'raw';RAW.mkdir(exist_ok=True,parents=True)
assert (FORMAL/'complete.json').is_file(),'Acquisition must finish before packaging'
SSH=['ssh','-i',str(ROOT/'server-key'),'-o','UserKnownHostsFile='+str(ROOT/'server-known-hosts'),'bench@10.83.0.4']
subprocess.run(SSH+['sudo','python3','/opt/bench/package-server.py'],check=True)
subprocess.run(['scp','-i',str(ROOT/'server-key'),'-o','UserKnownHostsFile='+str(ROOT/'server-known-hosts'),'bench@10.83.0.4:/opt/bench/server-evidence.tar.gz',str(OUT/'server-evidence.tar.gz')],check=True)
subprocess.run(['sudo','systemctl','stop','bench-hoststats'],check=True)
with tarfile.open(OUT/'server-evidence.tar.gz') as t:t.extractall(RAW,filter='data')
shutil.copytree(FORMAL,RAW/'formal-unlimited-native',dirs_exist_ok=True)
client=RAW/'client';client.mkdir(exist_ok=True)
for name in ['host.txt','client-hoststats.sar','redis-client-build.log','native-build.log','native-redis-build.log','native-kvrocks-build.log','formal-unlimited-native.log']:
 p=ROOT/name
 if p.is_file():shutil.copy2(p,client/name)
for p in (ROOT/'native-bin').glob('*.txt'):shutil.copy2(p,client/p.name)
p=ROOT/'native-build/kvrocks-v2.17.0/build/CMakeCache.txt'
if p.is_file():shutil.copy2(p,client/'kvrocks-CMakeCache.txt')
source_archives=list((ROOT/'native-build').glob('*.tar.gz'))+[ROOT/'ycsb-updated-source.tar.gz']
source_hashes={p.name:hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for p in source_archives if p.is_file()}
(client/'source-archive-sha256.json').write_text(json.dumps(source_hashes,indent=2)+'\n')
versions={}
for name,cmd in {'java':['java','-version'],'maven':['mvn','-version'],'gcc':['gcc','--version'],'cmake':['cmake','--version'],'python':['python3','--version'],'sysstat':['sar','-V']}.items():
 r=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True);versions[name]={'command':cmd,'exit_code':r.returncode,'output':r.stdout}
(client/'toolchain.json').write_text(json.dumps(versions,indent=2)+'\n')
shutil.copy2(ROOT/'kit/common.properties',client/'common.properties')
jar_hashes={str(p.relative_to(ROOT/'YCSB-247a2d4')):hashlib.file_digest(p.open('rb'),'sha256').hexdigest() for module in ['core','redis'] for p in (ROOT/'YCSB-247a2d4'/module/'target').glob('*.jar')}
(client/'ycsb-jar-sha256.json').write_text(json.dumps(jar_hashes,indent=2)+'\n')
files=sorted(p for p in RAW.rglob('*') if p.is_file())
manifest=[{'path':str(p.relative_to(RAW)),'bytes':p.stat().st_size,'sha256':hashlib.file_digest(p.open('rb'),'sha256').hexdigest()} for p in files]
(OUT/'raw-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
for p in files:
 if p.suffix in ('.json','.txt','.log','.properties','.conf') and b'BEGIN OPENSSH PRIVATE KEY' in p.read_bytes():raise RuntimeError('Private key content detected in selected evidence')
with tarfile.open(OUT/'raw.tar.gz','w:gz') as t:t.add(RAW,arcname='raw')
print(json.dumps({'archive':str(OUT/'raw.tar.gz'),'bytes':(OUT/'raw.tar.gz').stat().st_size,'files':len(files),'sha256':hashlib.file_digest((OUT/'raw.tar.gz').open('rb'),'sha256').hexdigest()},indent=2))
