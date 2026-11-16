"""Regenerate the two README figures from the complete retained measurements.

Run with Python 3 and Matplotlib. Only initial measurements select peaks;
follow-up windows remain in the CSV and never replace plotted observations.
"""
import csv
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter

ROOT = Path(__file__).resolve().parent
ROWS = list(csv.DictReader((ROOT / 'metadata/memtier-points.csv').open()))
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10,
                     'svg.fonttype': 'none', 'svg.hashsalt': 'lavik-v030',
                     'axes.spines.top': False, 'axes.spines.right': False})
for suite, cores, small, large in [('small', 2, 10**6, 10**8), ('large', 16, 10**7, 10**9)]:
    fig, axes = plt.subplots(2, 2, figsize=(12, 8), layout='constrained')
    specs = [('lavik', small, '#1768ac', 'o', 'Lavik v0.3.0'),
             ('lavik', large, '#ad6800', 's', 'Lavik v0.3.0'),
             ('redis', small, '#b64157', '^', 'Redis 8.10.2'),
             ('valkey', small, '#008579', 'D', 'Valkey 9.1.2')]
    for col, operation in enumerate(['GET', 'SET']):
        for product, keys, color, marker, label in specs:
            data = [r for r in ROWS if r['suite'] == suite and r['phase'] == 'initial'
                    and r['product'] == product and r['version'] != 'v020'
                    and int(r['keys']) == keys and r['operation'] == operation]
            workers = max(data, key=lambda r: float(r['qps']))['io_workers']
            data = sorted([r for r in data if r['io_workers'] == workers],
                          key=lambda r: int(r['connections']))
            size = '1B' if keys == 10**9 else f'{keys // 10**6}M'
            label += f' / {size}'
            if product != 'lavik':
                label += f' (I/O {workers})'
            for row, metric in enumerate(['qps', 'p999_ms']):
                ax = axes[row, col]
                ax.plot([int(r['connections']) for r in data],
                        [float(r[metric]) for r in data], label=label,
                        color=color, marker=marker, markersize=4, linewidth=2)
                ax.set_xscale('log', base=2)
                ticks = [int(r['connections']) for r in data]
                ax.set_xticks(ticks, labels=[str(t) for t in ticks])
                ax.set_xlabel('Connections')
                ax.grid(axis='y', alpha=.2)
        for ax in axes[:, col]:
            ax.set_ylim(0, max(max(line.get_ydata()) for line in ax.lines) * 1.08)
        axes[0, col].set_title(f'{operation} throughput', loc='left', fontweight='bold')
        axes[0, col].set_ylabel('Operations / second')
        axes[0, col].yaxis.set_major_formatter(FuncFormatter(lambda x, _: f'{x/1000:,.0f}K'))
        axes[0, col].legend(frameon=False, fontsize=8.5, loc='lower right')
        axes[1, col].set_title(f'{operation} p99.9 latency', loc='left', fontweight='bold')
        axes[1, col].set_ylabel('Milliseconds')
    fig.suptitle(f'{cores} vCPUs | Lavik v0.3.0 source commit vs Redis / Valkey',
                 fontsize=16, fontweight='bold')
    fig.supxlabel('1 KiB values | Fixed I/O setting per peer / command | Capacity curve has 100x more keys', fontsize=10)
    output = ROOT / f'{cores}vcpu-combined.svg'
    fig.savefig(output, metadata={'Date': None})
    output.write_text('\n'.join(line.rstrip() for line in output.read_text().splitlines()) + '\n')
    plt.close(fig)
