"""Extract current website numbers from pinned raw benchmark windows; no benchmark runs."""
import csv
import hashlib
import json
from pathlib import Path

ARCHIVE_COMMIT = 'bb061b97e9836281e71c219f21570d742313fb8c'
ROOT = Path('perf_reports')
MEMORY = 'lavik-v0.2.0-vs-memory-databases-2026-10-21'
STORAGE = 'lavik-v0.2.0-storage-peers-1tb-2026-10-21'
sources = {}


def read(file):
    path = ROOT / file
    report = file.split('/')[0]
    sums = {}
    for line in (ROOT / report / 'SHA256SUMS').read_text().splitlines():
        sha, name = line.split(maxsplit=1)
        sums[name.lstrip('*').removeprefix('./')] = sha
    data = path.read_bytes()
    sha = hashlib.sha256(data).hexdigest()
    if sums.get(str(path.relative_to(ROOT / report))) != sha:
        raise ValueError('Archive checksum mismatch: ' + str(path))
    sources[str(path)] = sha
    return data.decode()


def measured(directory, point, keys, connections, seconds):
    suffix = point['source'].replace('.result.json', '.json')
    candidates = [p for p in (ROOT / directory / 'raw').rglob(Path(suffix).name) if str(p).endswith('/' + suffix)]
    if len(candidates) != 1:
        raise ValueError('Raw point is missing or ambiguous: ' + suffix)
    file = str(candidates[0].relative_to(ROOT))
    raw = json.loads(read(file))
    config, stats = raw['configuration'], raw['ALL STATS']
    if (config['key_maximum'], config['clients'] * config['threads'], config['test_time'], config['pipeline'], config['data_size']) != (keys, connections, seconds, 1, 1024):
        raise ValueError('Wrong measurement scope: ' + file)
    result = stats['Gets' if point['kind'] == 'GET' else 'Sets']
    if stats['Totals']['Connection Errors'] != 0 or result.get('Misses/sec', 0) != 0:
        raise ValueError('Failed measured point: ' + file)
    qps, p999 = result['Ops/sec'], result['Percentile Latencies']['p99.90']
    if (qps, p999) != (float(point['qps']), float(point['p999_ms'])):
        raise ValueError('CSV and raw output disagree: ' + file)
    return {'qps': qps, 'p999': p999, 'source': 'perf_reports/' + file}


points = list(csv.DictReader(read(MEMORY + '/metadata/results.csv').splitlines()))
memory = []
for product, name in [('lavik-10m', 'Lavik 0.2.0 SPDK'), ('redis', 'Redis 8.10.2'), ('valkey', 'Valkey 9.1.2')]:
    row = {'name': name}
    for op in ['GET', 'SET']:
        candidates = [p for p in points if p['suite'] == '16vcpu-10m' and p['product'] == product and p['kind'] == op]
        peak = max(candidates, key=lambda p: float(p['qps']))
        if int(peak['connections']) != 1280:
            raise ValueError('Review the selected peak concurrency')
        point = measured(MEMORY, peak, 10_000_000, 1280, 30)
        row.update({op.lower(): point['qps'], op.lower()+'P999': point['p999'], op.lower()+'Threads': int(peak['threads']), op.lower()+'Source': point['source']})
    memory.append(row)

points = list(csv.DictReader(read(STORAGE + '/metadata/results.csv').splitlines()))
storage = []
for product, name in [('lavik-1b', 'Lavik 0.2.0'), ('garnet', 'Garnet 2.2.1'), ('dragonfly', 'Dragonfly 2.0.2'), ('pika', 'Pika 3.5.7'), ('kvrocks', 'Apache Kvrocks 2.17.0'), ('tendis', 'Tendis 2.8.4')]:
    row = {'name': name}
    for op in ['GET', 'SET']:
        matching = [p for p in points if p['product'] == product and p['kind'] == op and p['connections'] == '320']
        if len(matching) != 1: raise ValueError('Expected one matched 320-connection point')
        point = measured(STORAGE, matching[0], 1_000_000_000, 320, 60)
        row.update({op.lower(): point['qps'], op.lower()+'P999': point['p999'], op.lower()+'Source': point['source']})
    storage.append(row)

output = {'archiveCommit': ARCHIVE_COMMIT, 'memoryDirectory': MEMORY, 'storageDirectory': STORAGE, 'storageConnections': 320, 'memoryRows': memory, 'storageRows': storage, 'sourceFiles': sources}
Path('packages/benchmarks/exact-data.json').write_text(json.dumps(output, indent=2) + '\n')
print('Generated exact current-release memory and storage rows from', len(sources), 'checksum-verified source files.')
