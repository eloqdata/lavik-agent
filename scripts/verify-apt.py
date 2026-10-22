#!/usr/bin/env python3
"""Install signed APT packages in a disposable native Ubuntu container."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid
import concurrent.futures
import urllib.request
import urllib.parse
import urllib.error
import time
from datetime import datetime, timezone
ROOT = Path(__file__).resolve().parents[1]
ENV = {k:v for k,v in os.environ.items() if k in ('PATH','HOME','TMPDIR','DOCKER_HOST','DOCKER_CONTEXT','DOCKER_CONFIG')}

def run(*args):
    return subprocess.check_output(args,text=True,env=ENV,timeout=180).strip()

def inputs():
    files=list((ROOT/'packaging/apt').rglob('*')) + [ROOT/'scripts/build-apt.sh',ROOT/'scripts/stage-apt.ts',ROOT/'scripts/verify-apt.py']
    return {str(f.relative_to(ROOT)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(files) if f.is_file()}

def verify_live_files(manifest, metadata_only=False):
    """Bind deployed bytes to the reviewed repository, not just its version label."""
    def verify(f):
        url = 'https://lavik.dev/apt/' + urllib.parse.quote(f['path'], safe='/~')
        request = urllib.request.Request(url, headers={'Cache-Control': 'no-cache', 'User-Agent': 'LavikAPTReleaseVerifier/0.1.0'})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(request, timeout=120) as response:
                    data = response.read(f['size'] + 1)
                break
            except urllib.error.HTTPError as error:
                if error.code not in (429, 500, 502, 503, 504) or attempt == 2: raise
            except OSError:
                if attempt == 2: raise
            time.sleep(attempt + 1)
        assert len(data) == f['size'] and hashlib.sha256(data).hexdigest() == f['sha256'], f"Deployed APT file differs from reviewed bytes: {f['path']}"
        return f['path']
    files = [f for f in manifest['files'] if not metadata_only or not f['path'].startswith('pool/')]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        return sorted(pool.map(verify, files))

def main():
    before=inputs()
    manifest=json.loads((ROOT/'packages/apt/manifest.json').read_text())
    image='ubuntu:24.04@sha256:b3cc40b72b93588182b5410f723c7aaf142363311c2aa993d8a453ddcbb3ae15'
    name='lavik-apt-test-'+uuid.uuid4().hex[:10]
    source=sys.argv[1] if len(sys.argv)>1 else '.cache/apt-staged'
    key=ROOT/'packages/apt/lavik-archive-keyring.asc'
    key_entry=next(f for f in manifest['files'] if f['path']=='lavik-archive-keyring.asc')
    assert hashlib.sha256(key.read_bytes()).hexdigest()==key_entry['sha256'],'Reviewed public key mismatch'
    command=['docker','run','--rm','--name',name,'--security-opt','seccomp=unconfined','--memory','2g','--cpus','2','--ulimit','memlock=536870912:536870912','-v',str(ROOT/'packaging/apt/test-install.sh')+':/test.sh:ro','-v',str(ROOT/'packaging/apt/templates')+':/templates:ro','-v',str(key)+':/reviewed-key.asc:ro','-e','LAVIK_APT_KEY_FINGERPRINT='+manifest['fingerprint']]
    deployed_files=[]
    if source=='live':
        deployed_files=verify_live_files(manifest)
        print(f'Verified {len(deployed_files)} deployed APT files against reviewed hashes',flush=True)
        command += ['-e','LAVIK_APT_URL=https://lavik.dev/apt']
    else:
        repository=(ROOT/source).resolve()
        for f in manifest['files']:
            assert hashlib.sha256((repository/f['path']).read_bytes()).hexdigest()==f['sha256'],f['path']
        command += ['-v',str(repository)+':/repository:ro']
    command += [image,'bash','/test.sh']
    try:
        result=subprocess.run(command,text=True,env=ENV,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=900)
        print(result.stdout,flush=True)
        assert result.returncode==0,'APT runtime verification failed'
        checks=[l for l in result.stdout.splitlines() if l.startswith('PASS: ')]
        assert len(checks)==3,checks
        assert before==inputs(),'Inputs changed during execution'
        if source=='live': verify_live_files(manifest,metadata_only=True)
        report=dict(status='passed',checkedAt=datetime.now(timezone.utc).isoformat(),source=source,release=manifest['release'],version=manifest['version'],sourceCommit=manifest['sourceCommit'],fingerprint=manifest['fingerprint'],artifactSha256=manifest['artifact']['sha256'],imageId=json.loads(run('docker','image','inspect',image))[0]['Id'],architecture=json.loads(run('docker','image','inspect',image))[0]['Architecture'],checks=checks,fileHashes=before,scope='Native Ubuntu 24.04 Docker; both package variants; signed APT install, unit static validation and exact ExecStart as service user, commands, graceful restart, allocation and conffile preservation, purge/reinstall recovery, invalid-key rejection. Container does not boot systemd; service-manager enable/restart not runtime-certified. No SPDK hardware or multi-host testing.')
        if source=='live': report['deployedFilesVerified']=deployed_files
        target=Path(sys.argv[2]) if len(sys.argv)>2 else ROOT/f"evidence/apt/{manifest['release']}/verification.json"
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(json.dumps(report,indent=2)+'\n')
    finally:
        subprocess.run(['docker','rm','-f',name],env=ENV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
if __name__=='__main__':main()
