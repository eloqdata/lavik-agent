"""Execute published readiness blocks against published images in isolated Docker projects."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import uuid

root = Path(__file__).resolve().parents[3]
source = root / 'verification/docs/0.2.0'
identity = 'lavik-ready-' + uuid.uuid4().hex[:10]
steps = []
files = {}
env = dict(os.environ, COMPOSE_PROJECT_NAME=identity, LAVIK_PRIMARY_PORT='0',
           LAVIK_FOLLOWER_PORT='0', LAVIK_DOCKER_IMAGE='eloqdata/lavik:0.2.0-cluster')
def execute(name, cwd, text=None):
    original = (source / name).read_text()
    files[name] = hashlib.sha256(original.encode()).hexdigest()
    result = subprocess.run(['bash', '-euo', 'pipefail', '-c', text or original],
                            cwd=cwd, env=env, text=True, capture_output=True, timeout=420)
    steps.append(dict(file=name, exitCode=result.returncode, stdout=result.stdout, stderr=result.stderr))
    if result.returncode:
        raise RuntimeError(json.dumps(steps[-1]))
    print('PASS:', name, flush=True)

with tempfile.TemporaryDirectory(prefix=identity) as temporary:
    work = Path(temporary)
    for file in (root / 'packaging/docker/0.2.0').iterdir():
        if file.is_file(): shutil.copyfile(file, work / file.name)
    try:
        # Execute the complete published pull/start block, changing only resource
        # identifiers and the host port to avoid existing user resources.
        start = (source / 'docker-start.sh').read_text().replace('--name lavik ', '--name ' + identity + ' ')
        start = start.replace('-p 127.0.0.1:6379:6379', '-p 127.0.0.1::6379')
        start = start.replace('-v lavik-data:/data', '-v ' + identity + ':/data')
        start = start.replace('docker exec lavik ', 'docker exec ' + identity + ' ')
        execute('docker-start.sh', work, start)
        for name in ['docker-client.sh', 'docker-restart.sh']:
            text = (source / name).read_text().replace('docker exec lavik ', 'docker exec ' + identity + ' ')
            text = text.replace('docker stop --time 60 lavik', 'docker stop --time 60 ' + identity)
            text = text.replace('docker start lavik', 'docker start ' + identity)
            text = text.replace('docker logs --tail 50 lavik', 'docker logs --tail 50 ' + identity)
            execute(name, work, text)
        assert 'hello from Lavik' in steps[-1]['stdout']
    finally:
        subprocess.run(['docker', 'rm', '-f', identity], capture_output=True)
        subprocess.run(['docker', 'volume', 'rm', identity], capture_output=True)
    try:
        execute('compose-download.sh', work)
        work = work / 'lavik-0.2.0-build/lavik-0.2.0-docker'
        execute('compose-start.sh', work)
        # Successful cluster-status must be reached after polling on cold startup and restart.
        assert re.search(r'"cluster_ready"\s*:\s*true', steps[-1]['stdout']), steps[-1]['stdout']
        execute('compose-restart.sh', work)
        assert re.search(r'"cluster_ready"\s*:\s*true', steps[-1]['stdout']), steps[-1]['stdout']
    finally:
        subprocess.run(['docker', 'compose', 'down', '-v'], cwd=work, env=env, capture_output=True)
receipt = dict(status='passed', checkedAt=datetime.now(timezone.utc).isoformat(),
               scope='Published container readiness, complete tag pull, public bundle download/checksum/extraction and Compose pull, cold startup and restart on native ARM64 published images.',
               fileHashes=files, steps=steps)
(root / 'evidence/docs/0.2.0/container-readiness.json').write_text(json.dumps(receipt, indent=2) + '\n')
