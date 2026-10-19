"""Source and build provenance checks shared by runtime and offline tools."""
from pathlib import Path
import hashlib
import json
from experiment import CLIENT_ROOT, REVISIONS, BYCORF


def sha(path):
    with Path(path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def validate_client(root, require_binary=False):
    root = Path(root)
    manifest = json.loads((root / 'client-build-manifest.json').read_text())
    tests = json.loads((root / 'linux-client-tests.json').read_text())
    if manifest.get('status') != 'complete' or set(manifest['clients']) != {'bench'}:
        raise ValueError('Expected the one finalized crossover client')
    entry = manifest['clients']['bench']
    if entry['binary'] != CLIENT_ROOT + '/clients/bench':
        raise ValueError('Unexpected client binary path')
    if sha(root / 'clients/bench.cpp') != entry['source_sha256'] or tests['source_sha256'] != entry['source_sha256']:
        raise ValueError('Client source differs from build/tests')
    if (tests.get('status') != 'passed' or tests.get('mode') != 'full-linux-client'
            or not tests.get('platform', '').startswith('Linux') or tests.get('passed') != 31
            or len(tests.get('checks', [])) != 31 or tests['binary_sha256'] != entry['binary_sha256']):
        raise ValueError('Expected the full 31-pass Linux client receipt')
    for name, key in [('interface.py', 'interface_sha256'), ('test_client.py', 'test_script_sha256'),
                      ('source-manifest.json', 'source_manifest_sha256')]:
        if sha(root / 'clients' / name) != manifest[key]:
            raise ValueError('Client metadata differs: ' + name)
    if tests['test_script_sha256'] != manifest['test_script_sha256'] or sha(root / 'linux-client-tests.json') != manifest['linux_test_receipt']['sha256']:
        raise ValueError('Client test receipt differs')
    if require_binary and sha(entry['binary']) != entry['binary_sha256']:
        raise ValueError('Client executable changed')
    return manifest


def variants(root):
    out = {}
    for variant, revision in REVISIONS.items():
        row = json.loads((Path(root) / (variant + '-manifest.json')).read_text())
        if (row['product'] != variant or row['revision'] != revision
                or row['base_revision'] != REVISIONS['main'] or row['bycorf_revision'] != BYCORF):
            raise ValueError('Wrong variant/dependency identity: ' + variant)
        out[variant] = row
    return out
