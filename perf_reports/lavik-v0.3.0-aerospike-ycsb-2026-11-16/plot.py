"""Regenerate the io_uring / Aerospike report figures from recorded windows."""
import csv
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

ROOT = Path(__file__).resolve().parent

def read(name):
    return list(csv.DictReader((ROOT / 'metadata' / name).open()))

windows = read('windows.csv')
operations = read('operations.csv')
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10,
                     'svg.fonttype': 'none', 'svg.hashsalt': 'lavik-v030',
                     'axes.spines.top': False, 'axes.spines.right': False})
specs = [('aerospike', '#008579', 'Aerospike CE 8.1.2.4'),
         ('uring', '#1768ac', 'Lavik v0.3.0 io_uring')]
cells = [('A', 'READ'), ('A', 'UPDATE'), ('B', 'READ'), ('B', 'UPDATE'),
         ('C', 'READ'), ('D', 'READ'), ('D', 'INSERT')]
for target in [0, 100000]:
    fig, axes = plt.subplots(2, 1, figsize=(12, 8), layout='constrained')
    for i, (backend, color, label) in enumerate(specs):
        values = {r['workload']: float(r['qps']) for r in windows
                  if r['backend'] == backend and int(r['target_ops_sec']) == target}
        bars = axes[0].bar([x+(i-.5)*.3 for x in range(4)],
                           [values[w] for w in 'ABCD'], .28, color=color, label=label)
        axes[0].bar_label(bars, labels=[f'{values[w]/1000:.1f}K' for w in 'ABCD'], padding=3, fontsize=9)
        latency = {(r['workload'], r['operation']): float(r['p999_ms']) for r in operations
                   if r['backend'] == backend and int(r['target_ops_sec']) == target}
        bars = axes[1].bar([x+(i-.5)*.3 for x in range(7)],
                           [latency[c] for c in cells], .28, color=color)
        axes[1].bar_label(bars, labels=[f'{latency[c]:.3f}' for c in cells], padding=3, fontsize=8)
    axes[0].set_xticks(range(4), ['A · 50% read', 'B · 95% read', 'C · all read', 'D · read / insert'])
    axes[1].set_xticks(range(7), [f'{w}\n{op}' for w, op in cells])
    axes[0].legend(frameon=False, ncols=2, fontsize=10, loc='upper left')
    axes[0].set_ylabel('Operations / second')
    axes[0].yaxis.set_major_formatter(FuncFormatter(lambda x, _: f'{x/1000:,.0f}K'))
    axes[1].set_ylabel('p99.9 latency (ms)')
    for ax in axes:
        ax.set_ylim(0, ax.get_ylim()[1]*1.20)
        ax.grid(axis='y', alpha=.2)
        ax.set_axisbelow(True)
    fig.suptitle(f'100M-record YCSB | {"Unlimited" if target == 0 else "100K target"} | Lavik v0.3.0 io_uring',
                 fontsize=16, fontweight='bold')
    fig.supxlabel('16-vCPU server | 16 assigned client CPUs / 256 workers | 300s | Storage layouts differ', fontsize=10)
    output = ROOT / ('ycsb-unlimited.svg' if target == 0 else 'ycsb-100k.svg')
    fig.savefig(output, metadata={'Date': None})
    output.write_text('\n'.join(line.rstrip() for line in output.read_text().splitlines()) + '\n')
    plt.close(fig)

