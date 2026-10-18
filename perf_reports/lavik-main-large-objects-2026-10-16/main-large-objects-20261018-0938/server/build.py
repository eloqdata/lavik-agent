from pathlib import Path
import hashlib,json,os,subprocess as sp,time,traceback
R=Path('/mnt/dev/benchmark/main-large-objects-20261018-0938')
D=Path('/mnt/dev/benchmark/pr342-packed-20261017')
ENV=dict(os.environ,GOPATH='/home/azureuser/go',GOCACHE='/mnt/dev/benchmark/go-build-cache',TARGET_ARCHITECTURE='x86-64-v2')
def sha(p):
 with open(p,'rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def log(s):print(time.strftime('%FT%TZ',time.gmtime()),s,flush=True)
def run(args,name):
 log('Running '+name)
 with (R/(name+'.log')).open('w') as f:sp.run(args,stdout=f,stderr=sp.STDOUT,env=ENV,check=True)
def extract(a,d):
 import tarfile
 d.mkdir(parents=True,exist_ok=False)
 with tarfile.open(a) as t:
  for x in t.getmembers():assert not Path(x.name).is_absolute() and '..' not in Path(x.name).parts
 sp.run(['tar','xzf',str(a),'-C',str(d),'--strip-components=1'],check=True)
def main():
 assert os.geteuid()==0 and Path(__file__).resolve().parent==R
 assert sp.check_output(['uname','-r'],text=True).strip()=='6.17.0-1022-azure'
 assert not sp.check_output(['ss','-H','-ltn','sport = :6379'],text=True).strip()
 assert not (R/'BUILD_COMPLETE').exists()
 m=json.loads((R/'source-manifest.json').read_text())
 for d in m['dependencies']:assert sha(D/d['archive'])==d['archive_sha256'],d
 result={'source':m,'compiler':sp.check_output(['/usr/bin/g++-13','--version'],text=True),'variants':{}}
 for name,v in m['variants'].items():
  a=R/v['archive'];assert sha(a)==v['archive_sha256'],name
  S=R/'sources'/name;extract(a,S)
  for d in m['dependencies']:
   target=S/d['path']
   if target.exists():assert not any(target.iterdir());target.rmdir()
   extract(D/d['archive'],target)
  prod=S/'build-gcc13'
  cfg=['cmake','-S',str(S),'-B',str(prod),'-G','Ninja','-DCMAKE_C_COMPILER=/usr/bin/gcc-13','-DCMAKE_CXX_COMPILER=/usr/bin/g++-13','-DLAVIK_MARCH=x86-64-v2','-DCMAKE_BUILD_TYPE=Release','-DLAVIK_ENABLE_OPT=ON','-DLAVIK_KERNEL_BYPASS=ON','-DBUILD_TESTING=OFF','-DBYCORF_SPDK_C_COMPILER=/usr/bin/gcc-13','-DBYCORF_SPDK_CXX_COMPILER=/usr/bin/g++-13']
  run(cfg,name+'-configure');run(['cmake','--build',str(prod),'--parallel','16','--target','lavik'],name+'-build')
  result['variants'][name]={'revision':v['revision'],'binary':str(prod/'lavik'),'sha256':sha(prod/'lavik'),'configure':cfg,'cmake_cache':(prod/'CMakeCache.txt').read_text()}
  (R/'build-manifest.json').write_text(json.dumps(result,indent=2)+'\n')
  log(name+' built '+result['variants'][name]['sha256'])
 (R/'spdk-devices.json').write_text((D/'spdk-devices.json').read_text())
 (R/'BUILD_COMPLETE').write_text(time.strftime('%FT%TZ',time.gmtime())+'\n')
 log('Pinned latest-main Release build complete')
if __name__=='__main__':
 try:main()
 except BaseException:
  (R/'build-failure.json').write_text(json.dumps({'traceback':traceback.format_exc()},indent=2));raise
