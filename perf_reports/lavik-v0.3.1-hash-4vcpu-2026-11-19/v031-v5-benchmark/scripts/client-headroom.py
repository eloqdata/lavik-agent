#!/usr/bin/env python3
"""Summarize sampled client resources within successful measurement windows."""
import argparse
import bisect
import datetime
import json
import pathlib
import statistics
import subprocess

p = argparse.ArgumentParser()
p.add_argument('raw', type=pathlib.Path)
p.add_argument('--sar', type=pathlib.Path, required=True)
p.add_argument('--out', type=pathlib.Path, required=True)
a = p.parse_args()
host = json.loads(subprocess.check_output(
    ['sadf', '-j', str(a.sar), '--', '-u', '-P', 'ALL', '-r', '-n', 'DEV'],
    text=True))['sysstat']['hosts'][0]
samples = []
for row in host['statistics']:
    if 'timestamp' not in row:
        continue
    stamp = row['timestamp']
    assert stamp['utc'] == 1
    epoch = datetime.datetime.fromisoformat(stamp['date'] + 'T' + stamp['time']).replace(
        tzinfo=datetime.timezone.utc).timestamp()
    samples.append((epoch, row))
samples.sort(key=lambda x: x[0])
times = [t for t, _ in samples]
results = []
for path in sorted(a.raw.rglob('invocation.json')):
    invocation = json.loads(path.read_text())
    if invocation.get('args', {}).get('phase') != 'measure':
        continue
    exitpath = path.with_name('exit.json')
    if not exitpath.exists():
        continue
    receipt = json.loads(exitpath.read_text())
    if receipt['exit_code'] or receipt['errors']:
        continue
    start, end = invocation['started_epoch'], receipt['finished_epoch']
    selected = [r for _, r in samples[bisect.bisect_left(times, start):bisect.bisect_right(times, end)]]
    record = {'path': str(path.parent.relative_to(a.raw)), 'samples': len(selected)}
    if not selected:
        record['coverage'] = 'none; resource sampling began after this run'
        results.append(record)
        continue
    all_busy, core_busy, avail, rx, tx = [], {}, [], [], []
    for row in selected:
        for cpu in row['cpu-load']:
            busy = 100 - cpu['idle']
            if cpu['cpu'] == 'all':
                all_busy.append(busy)
            else:
                core_busy.setdefault(cpu['cpu'], []).append(busy)
        avail.append(row['memory']['avail'] * 1024)
        for iface in row['network']['net-dev']:
            if iface['iface'] == 'eth0':  # ens1 is the accelerated VF of the same NIC.
                rx.append(iface['rxkB'] * 1024)
                tx.append(iface['txkB'] * 1024)
    record.update(cpu_busy_mean_percent=statistics.mean(all_busy),
                  cpu_busy_max_percent=max(all_busy),
                  busiest_core_mean_percent=max(statistics.mean(v) for v in core_busy.values()),
                  hottest_core_sample_percent=max(max(v) for v in core_busy.values()),
                  memory_available_min_bytes=min(avail),
                  rx_mean_bytes_per_second=statistics.mean(rx),
                  rx_max_bytes_per_second=max(rx), tx_mean_bytes_per_second=statistics.mean(tx))
    results.append(record)
a.out.write_text(json.dumps({'host': host['nodename'], 'cpu_count': host['number-of-cpus'],
                             'windows': results}, indent=2) + '\n')
print(json.dumps({'windows': len(results), 'with_samples': sum(r['samples'] > 0 for r in results)}))
