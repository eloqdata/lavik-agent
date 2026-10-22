"""Verify stable migration snippets in isolated Docker; no API keys or host ports."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile
import urllib.request
import uuid

root = Path(__file__).resolve().parent.parent
source = root / 'verification/docs/0.2.0/migration'
fixture = root / '.cache/migration-0.2.0'
fixture.mkdir(parents=True, exist_ok=True)
package = fixture / 'lavik-package'
package.mkdir(exist_ok=True)
lock = json.loads((root / 'content/docs/0.2.0/release.json').read_text())
paths = sorted([p for p in source.rglob('*') if p.is_file()] + [Path(__file__)])
hashes = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
archive = fixture / 'redis-shake.tar.gz'
if not archive.exists():
    urllib.request.urlretrieve('https://github.com/tair-opensource/RedisShake/releases/download/v4.6.2/redis-shake-v4.6.2-linux-arm64.tar.gz', archive)
assert hashlib.sha256(archive.read_bytes()).hexdigest() == '5fc2b7a393f159f8981c1e8d712b63c0866628b99ad030ed3e46c9869c22ff04'
with tarfile.open(archive) as tar: tar.extract('./redis-shake', fixture, filter='data')
image = json.loads(subprocess.check_output(['docker', 'image', 'inspect', 'lavik-operations:minimal'], text=True))[0]
assert image['Architecture'] == 'arm64', 'This receipt runner uses the native ARM64 operations image'
asset = lock['artifacts']['aarch64']
lavik_archive = fixture / asset['filename']
if not lavik_archive.exists():
    urllib.request.urlretrieve(f'https://github.com/eloqdata/lavik/releases/download/v0.2.0/{asset["filename"]}', lavik_archive)
assert hashlib.sha256(lavik_archive.read_bytes()).hexdigest() == asset['sha256']
subprocess.run(['tar', '-xzf', str(lavik_archive), '--strip-components=1', '-C', str(package)], check=True)
redis_image = 'redis@sha256:f0707c78ea880b293ccdeb410c9c0a8ccae93fe7128799b751333a698b0a39a7'
name = 'lavik-migration-extract-' + uuid.uuid4().hex[:10]
try:
    subprocess.run(['docker', 'create', '--platform=linux/arm64', '--name', name, redis_image], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['docker', 'cp', f'{name}:/usr/local/bin/redis-server', str(fixture / 'redis-server')], check=True)
finally:
    subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
report = {'status': 'failed', 'sourceCommit': lock['commit'], 'fileHashes': hashes, 'imageId': image['Id'],
          'lavikArchiveSha256': asset['sha256'], 'redisImage': redis_image,
          'redisShakeArchiveSha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
          'fixtureBinaryHashes': {name: hashlib.sha256((fixture / name).read_bytes()).hexdigest() for name in ['redis-shake', 'redis-server']},
          'limitations': ['Loopback synthetic datasets; no production sizing, TLS tunnels, ACL users, function-catalog mapping, or failure recovery exercise.', 'ARM64 runtime; AMD64 installer checksum comes from the pinned upstream installer.'], 'runs': []}
for src, target in [('single', 'single'), ('single', 'cluster'), ('cluster', 'single'), ('cluster', 'cluster')]:
    name = 'lavik-migration-' + uuid.uuid4().hex[:10]
    args = ['docker', 'run', '--rm', '--name', name, '--network=none', '--read-only', '--cap-drop=ALL',
            '--security-opt=no-new-privileges', '--security-opt=seccomp=unconfined', '--memory=6g', '--cpus=4', '--pids-limit=256',
            '--ulimit', 'memlock=536870912:536870912', '--tmpfs', '/tmp:rw,exec,nosuid,nodev,size=4g', '--tmpfs', '/var/tmp:rw,nosuid,nodev,size=512m',
            '-e', 'EXPECTED_COMMIT=' + lock['commit'], '-e', 'PYTHONDONTWRITEBYTECODE=1',
            '-e', 'SHAKE_BIN=/fixtures/redis-shake', '-e', 'MIGRATION_DIR=/var/tmp/lavik-import-01',
            '--mount', f'type=bind,src={package},dst=/opt/lavik,readonly',
            '--mount', f'type=bind,src={fixture},dst=/fixtures,readonly',
            '--mount', f'type=bind,src={source},dst=/verification,readonly',
            '--entrypoint', 'python3', image['Id'], '/verification/run.py', src, target]
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=300)
        observed = json.loads(result.stdout)
        report['runs'].append(observed)
        print(json.dumps({'source': src, 'target': target, 'status': observed['status'], 'error': observed.get('error')}), flush=True)
        if result.returncode: break
    finally:
        subprocess.run(['docker', 'rm', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
assert hashes == {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}, 'Inputs changed during execution'
if len(report['runs']) == 4 and all(r['status'] == 'passed' for r in report['runs']): report['status'] = 'passed'
(root / 'evidence/docs/0.2.0/migration.json').write_text(json.dumps(report, indent=2) + '\n')
sys.exit(0 if report['status'] == 'passed' else 1)
