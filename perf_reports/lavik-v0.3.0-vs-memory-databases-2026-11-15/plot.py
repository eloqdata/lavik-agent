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
    fig, axes = plt.subplots(2, 2, figsize=(14, 6.5))
    fig.subplots_adjust(left=.065, right=.77, bottom=.14, top=.88, hspace=.48, wspace=.25)
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
            if cores == 2:
                data = [r for r in data if int(r['connections']) <= 320]
            size = '1B' if keys == 10**9 else f'{keys // 10**6}M'
            label += f' / {size}'
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

        axes[1, col].set_title(f'{operation} p99.9 latency', loc='left', fontweight='bold')
        axes[1, col].set_ylabel('Milliseconds')
    handles, labels = axes[0, 0].get_legend_handles_labels()
    fig.legend(handles, labels, loc='center left', bbox_to_anchor=(.785, .51),
               frameon=False, fontsize=10, labelspacing=1.5)
    fig.suptitle(f'{cores} vCPUs | Lavik v0.3.0 vs Redis / Valkey',
                 fontsize=16, fontweight='bold')
    fig.supxlabel('1 KiB values | Fixed I/O setting per peer / command | Capacity curve has 100x more keys', fontsize=10)
    output = ROOT / f'{cores}vcpu-combined.svg'
    fig.savefig(output, metadata={'Date': None})
    output.write_text('\n'.join(line.rstrip() for line in output.read_text().splitlines()) + '\n')
    plt.close(fig)

# Full throughput sweeps keep every measured peer I/O-thread configuration.
for suite, cores, small, large in [('small', 2, 10**6, 10**8), ('large', 16, 10**7, 10**9)]:
    fig, axes = plt.subplots(3, 2, figsize=(12, 10), layout='constrained')
    for row, product in enumerate(['lavik', 'redis', 'valkey']):
        for col, operation in enumerate(['GET', 'SET']):
            ax = axes[row, col]
            selected = [r for r in ROWS if r['suite'] == suite and r['phase'] == 'initial'
                        and r['product'] == product and r['version'] != 'v020'
                        and r['operation'] == operation
                        and (cores != 2 or int(r['connections']) <= 320)]
            field = 'keys' if product == 'lavik' else 'io_workers'
            configs = sorted({int(r[field]) for r in selected})
            for i, config in enumerate(configs):
                points = sorted([r for r in selected if int(r[field]) == config],
                                key=lambda r: int(r['connections']))
                label = (('1B' if config == 10**9 else f'{config // 10**6}M') + ' keys'
                         if product == 'lavik' else f'I/O {config}')
                ax.plot([int(r['connections']) for r in points], [float(r['qps']) for r in points],
                        marker=['o', 's', '^', 'D', 'v'][i], markersize=4, label=label, linewidth=1.8)
            ticks = sorted({int(r['connections']) for r in selected})
            ax.set_xscale('log', base=2)
            ax.set_xticks(ticks, labels=[str(t) for t in ticks])
            ax.set_ylim(0, max(max(line.get_ydata()) for line in ax.lines) * 1.1)
            ax.set_ylabel('Operations / second')
            ax.yaxis.set_major_formatter(FuncFormatter(lambda x, _: f'{x/1000:,.0f}K'))
            ax.set_xlabel('Connections')
            ax.grid(axis='y', alpha=.2)
            ax.legend(frameon=False, fontsize=9, loc='lower right' if cores == 2 else 'upper left', ncols=2)
            ax.set_title(f'{product.title()} · {operation}', loc='left', fontweight='bold')
    fig.suptitle(f'{cores} vCPUs | All throughput configurations | Lavik v0.3.0 / Redis / Valkey',
                 fontsize=15, fontweight='bold')
    fig.supxlabel('1 KiB values | 2-vCPU plots stop at 320 connections; full results remain in the tables'
                  if cores == 2 else '1 KiB values | Lavik: 10M / 1B keys; Redis and Valkey: 10M keys', fontsize=10)
    output = ROOT / f'{cores}vcpu-all-configurations.svg'
    fig.savefig(output, metadata={'Date': None})
    output.write_text('\n'.join(line.rstrip() for line in output.read_text().splitlines()) + '\n')
    plt.close(fig)

