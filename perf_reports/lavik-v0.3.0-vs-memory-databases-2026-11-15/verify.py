"""Verify the archived bytes, raw measurements and derived comparisons."""
import csv
import hashlib
import json
import math
from pathlib import Path
import statistics
import tarfile

ROOT = Path(__file__).resolve().parent

def read(name):
    return list(csv.DictReader((ROOT / 'metadata' / name).open()))

for line in (ROOT / 'SHA256SUMS').read_text().splitlines():
    digest, name = line.split('  ', 1)
    assert hashlib.sha256((ROOT / name).read_bytes()).hexdigest() == digest, name

archives = {name: tarfile.open(ROOT / 'raw' / f'{name}.tar.gz', 'r:gz')
            for name in ['2vcpu', '16vcpu']}

def raw_bytes(relative_path):
    parts = Path(relative_path).parts
    assert parts[0] == 'raw' and parts[1] in archives
    return archives[parts[1]].extractfile('/'.join(parts[1:])).read()

manifest = json.loads((ROOT / 'raw/MANIFEST.json').read_text())['files']
for entry in manifest:
    content = raw_bytes(entry['path'])
    assert len(content) == entry['bytes']
    assert hashlib.sha256(content).hexdigest() == entry['sha256']

rows = read('memtier-points.csv')
assert len(rows) == 272
for row in rows:
    prefix = '2vcpu' if row['suite'] == 'small' else '16vcpu'
    path = Path('raw') / prefix / row['source'].removeprefix('/opt/bench020/')
    receipt = json.loads(raw_bytes(path))
    stem = str(path).removesuffix('.result.json')
    command = json.loads(raw_bytes(stem + '.command.json'))
    expected_seconds = int(next(arg.split('=', 1)[1] for arg in command if arg.startswith('--test-time=')))
    stats = json.loads(raw_bytes(stem + '.json'))['ALL STATS']
    runtime, totals = stats['Runtime'], stats['Totals']
    assert runtime['Time unit'] == 'MILLISECONDS'
    assert str(runtime['Interrupted']).lower() == 'false'
    assert runtime['Total duration'] >= expected_seconds * 1000
    assert totals['Connection Errors'] == 0 and totals['Count'] > 0
    assert float(row['qps']) == receipt['qps'] == totals['Ops/sec']
    if row['operation'] == 'GET':
        assert totals['Misses/sec'] == 0
    for metric, key in [('p50_ms', 'p50.00'), ('p99_ms', 'p99.00'),
                        ('p999_ms', 'p99.90'), ('p9999_ms', 'p99.99')]:
        assert float(row[metric]) == receipt[metric] == totals['Percentile Latencies'][key]

comparisons = read('memtier-comparison.csv')
assert len(comparisons) == 44
for row in comparisons:
    pair = {version: next(point for point in rows if point['phase'] == 'initial'
                         and point['version'] == version and all(point[key] == row[key]
                         for key in ['suite', 'keys', 'operation', 'connections']))
            for version in ['v020', 'main']}
    for metric, field in [('qps', 'qps_delta_percent'), ('p99_ms', 'p99_delta_percent'),
                          ('p999_ms', 'p999_delta_percent')]:
        delta = (float(pair['main'][metric]) / float(pair['v020'][metric]) - 1) * 100
        assert math.isclose(float(row[field]), delta, abs_tol=1e-10)

rechecks = read('memtier-recheck-summary.csv')
assert len(rechecks) == 8
for row in rechecks:
    for version in ['v020', 'main']:
        points = [point for point in rows if point['version'] == version
                  and all(point[key] == row[key] for key in
                          ['phase', 'suite', 'keys', 'operation', 'connections'])]
        assert len(points) == int(row['windows_per_version'])
        for metric in ['qps', 'p99_ms', 'p999_ms']:
            assert float(row[f'{version}_{metric}_median']) == statistics.median(float(p[metric]) for p in points)
for archive in archives.values():
    archive.close()
print(json.dumps({'raw_files': len(manifest), 'raw_reconciled_points': len(rows),
                  'matched_cells': len(comparisons), 'recheck_groups': len(rechecks),
                  'checksums': 'passed'}))
