#!/usr/bin/env python3
"""Run the pinned upstream smoke suite on published images; never read repo .env."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = ROOT / 'verification/docker-images/upstream'
COMMIT = 'a1770a78b52e0bb9ec32e20b92af6282e73efabd'
RELEASE_COMMIT = '3955b98d43b312324aa8d52775df52cfb111c0d0'
TAGS = ['eloqdata/lavik:0.1.0-beta.1', 'eloqdata/lavik:0.1.0-beta.1-cluster']
ENV = {k: v for k, v in os.environ.items() if k in ('PATH', 'HOME', 'TMPDIR', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_CONFIG')}
ENV['PYTHONDONTWRITEBYTECODE'] = '1'


def hashes():
    files = sorted((ROOT / 'verification/docker-images').rglob('*'))
    files += [Path(__file__).resolve()]
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in files if p.is_file() and '__pycache__' not in p.parts}


def run(*args):
    return subprocess.check_output(args, env=ENV, text=True, timeout=120).strip()


def identity(tag):
    info = json.loads(run('docker', 'image', 'inspect', tag))[0]
    # An ephemeral tmpfs avoids creating an anonymous /data volume.
    cmd = ['docker', 'run', '--rm', '--network=none', '--tmpfs', '/data', info['Id']]
    version = run(*cmd, 'lavik', '--version')
    revision = run(*cmd, 'cat', '/usr/share/doc/lavik/REVISION')
    binary = run(*cmd, 'sha256sum', '/usr/local/bin/lavik').split()[0]
    assert version == 'lavik 0.1.0-beta.1', version
    assert revision == RELEASE_COMMIT, revision
    assert info['RepoDigests'], 'Published registry digest required'
    return dict(tag=tag, imageId=info['Id'], repoDigests=info['RepoDigests'],
                architecture=info['Architecture'], version=version,
                revision=revision, binarySha256=binary)


def main():
    before = hashes()
    images = [identity(tag) for tag in TAGS]
    assert images[0]['architecture'] == images[1]['architecture']
    arch = images[0]['architecture']
    assert arch in ('arm64', 'amd64')
    platform = 'linux/' + arch
    with tempfile.TemporaryDirectory(prefix='lavik-image-docs-') as work:
        # Upstream uses only unique resource names and deletes only those resources.
        result = subprocess.run([sys.executable, str(UPSTREAM / 'smoke-test.py'), '--platform', platform],
                                cwd=work, env=ENV, text=True, stdout=subprocess.PIPE,
                                stderr=subprocess.STDOUT, timeout=1200)
    print(result.stdout, flush=True)
    if result.returncode:
        raise RuntimeError('Upstream Docker smoke suite failed')
    checks = [
        'standalone recovery preserves data and allocation',
        'cluster bootstrap', 'cluster READY', 'follower receives writes',
        'follower promoted by lavik-ctl', 'old primary follows new primary',
        'bootstrap accepts recovered state', 'recovered cluster READY',
        'cluster recovery preserves Genesis and data, and serves writes',
    ]
    assert all('PASS: ' + check in result.stdout for check in checks)
    assert before == hashes(), 'Inputs changed during verification'
    assert images == [identity(tag) for tag in TAGS], 'Image tags changed during verification'
    report = dict(status='passed', checkedAt=datetime.now(timezone.utc).isoformat(),
                  packagingCommit=COMMIT, sourceCommit=RELEASE_COMMIT,
                  version='0.1.0-beta.1', platform=platform, images=images,
                  fileHashes=before, checks=checks, stdout=result.stdout,
                  scope='Native local Docker; published images; single-node replacement, allocation preservation, primary/follower replication, controlled failover and full Compose recovery. No native AMD64 runtime, multi-host HA, SPDK, auth/TLS or throughput certification.')
    (ROOT / 'evidence/docker-images/0.1.0/verification.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
