"""Build website numbers from checksum-verified benchmark outputs; no benchmarks run."""
import csv
import hashlib
import json
from pathlib import Path

ARCHIVE_COMMIT = 'd4908e964bba6c0f75f7afcd2054df8bdaaa83f0'
ROOT = Path('perf_reports')
MEMORY = 'lavik-v0.1.0-spdk-vs-latest-2026-10-13'
STORAGE = 'lavik-v0.1.0-storage-peers-1tb-2026-10-14'
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
    relative = str(path.relative_to(ROOT / report))
    if sums.get(relative) != sha:
        raise ValueError('Archive checksum mismatch: ' + str(path))
    sources[str(path)] = sha
    return data.decode()


def memtier(file, operation, keys, connections, seconds):
    raw = json.loads(read(file))
    config, stats = raw['configuration'], raw['ALL STATS']
    if (config['key_maximum'], config['clients'] * config['threads'], config['test_time'], config['pipeline'], config['data_size']) != (keys, connections, seconds, 1, 1024):
        raise ValueError('Wrong measurement scope: ' + file)
    operation_stats = stats['Gets' if operation == 'GET' else 'Sets']
    if stats['Totals']['Connection Errors'] != 0 or operation_stats.get('Misses/sec', 0) != 0:
        raise ValueError('Failed measured point: ' + file)
    return {
        'qps': operation_stats['Ops/sec'],
        'p999': operation_stats['Percentile Latencies']['p99.90'],
        'source': 'perf_reports/' + file,
    }


csv_path = MEMORY + '/metadata/results.csv'
points = list(csv.DictReader(read(csv_path).splitlines()))
memory = []
for system, name, get_threads, set_threads in [
    ('lavik-spdk', 'Lavik 0.1.0 SPDK', 16, 16),
    ('redis', 'Redis 8.10.2', 16, 16),
    ('valkey', 'Valkey 9.1.2', 16, 8),
]:
    row = {'name': name}
    for op, threads in [('GET', get_threads), ('SET', set_threads)]:
        candidates = [p for p in points if p['group'] == 'memory' and p['system'] == system and p['workload'] == op]
        peak = max(candidates, key=lambda p: float(p['qps']))
        if int(peak['server_threads']) != threads or int(peak['connections']) != 1280:
            raise ValueError('Published configuration is no longer the peak')
        raw = memtier(MEMORY + '/raw/' + peak['source'], op, 10_000_000, 1280, 30)
        if raw['qps'] != float(peak['qps']) or raw['p999'] != float(peak['p999_ms']):
            raise ValueError('CSV and raw output disagree')
        row[op.lower()] = raw['qps']
        row[op.lower() + 'P999'] = raw['p999']
        row[op.lower() + 'Threads'] = threads
        row[op.lower() + 'Source'] = raw['source']
    memory.append(row)

storage = []
for system, name in [('lavik-spdk', 'Lavik 0.1.0'), ('garnet', 'Garnet 2.2.1'), ('dragonfly', 'Dragonfly 2.0.2'), ('pika', 'Pika 3.5.7'), ('kvrocks', 'Apache Kvrocks 2.17.0'), ('tendis', 'Tendis 2.8.4')]:
    row = {'name': name}
    base = MEMORY + '/raw/storage/lavik-spdk' if system == 'lavik-spdk' else STORAGE + '/raw/' + system
    for op in ['GET', 'SET']:
        point = memtier(base + '/' + op.lower() + '-c80.json', op, 1_000_000_000, 80, 60)
        row[op.lower()] = point['qps']
        row[op.lower() + 'P999'] = point['p999']
        row[op.lower() + 'Source'] = point['source']
    storage.append(row)

output = {
    'archiveCommit': ARCHIVE_COMMIT,
    'memoryRows': memory,
    'storageRows': storage,
    'sourceFiles': sources,
}
Path('packages/benchmarks/exact-data.json').write_text(json.dumps(output, indent=2, ensure_ascii=False) + '\n')
print('Generated exact memory and storage rows from', len(sources), 'checksum-verified source files.')
