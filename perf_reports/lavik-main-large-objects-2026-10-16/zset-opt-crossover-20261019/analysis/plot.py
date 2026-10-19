#!/usr/bin/env python3
"""Render only the complete, validated eight-point ZSet crossover."""
from pathlib import Path
import argparse
import hashlib
import json
import math

NAME = 'zset-opt-crossover-20261019'
FIGURE = 'zset-opt-crossover.svg'
REVISIONS = {'main': '684894d973878ca0e0649b54404ce77521f1695f',
             'candidate': '32bdd6b474733c2850b80e3cc217461075e73af5'}
GROUPS = (('compact', 'zincr'), ('compact', 'zswap'),
          ('grouped', 'zincr'), ('grouped', 'zswap'))
VALUES = ('variant', 'size', 'op', 'qps', 'avg_ms', 'p999_ms', 'unit')


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def validate(document):
    if document.get('complete') is not True:
        raise ValueError('Charts require all eight validated points')
    rows = document.get('rows', [])
    expected = {(variant, size, op) for variant in REVISIONS for size, op in GROUPS}
    if len(rows) != 8 or {(r['variant'], r['size'], r['op']) for r in rows} != expected:
        raise ValueError('Missing or duplicate crossover point')
    for row in rows:
        if (row['revision'] != REVISIONS[row['variant']] or row['connections'] != 80
                or row['errors'] != 0 or row['unit'] != ('pairs/s' if row['op'] == 'zswap' else 'ops/s')):
            raise ValueError('Point identity, dimensions, or units differ')
        for name in ('qps', 'avg_ms', 'p999_ms'):
            if not math.isfinite(row[name]) or row[name] <= 0:
                raise ValueError('Invalid chart metric: ' + name)
    return rows


def render(source, destination, preview=False):
    rows = validate(json.loads(source.read_text()))
    # Import plotting only after input validation; no partial or fallback figure.
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.patches import Patch
    from matplotlib.ticker import MaxNLocator, FuncFormatter
    lookup = {(r['variant'], r['size'], r['op']): r for r in rows}
    colors = {'main': '#647b96', 'candidate': '#df9235'}
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10,
                         'svg.fonttype': 'none', 'svg.hashsalt': NAME,
                         'text.color': '#27364a', 'axes.labelcolor': '#526176',
                         'xtick.color': '#607087', 'ytick.color': '#27364a'})
    fig, axes = plt.subplots(1, 2, figsize=(9.6, 3.55), sharey=True)
    fig.patch.set_facecolor('white')
    fig.subplots_adjust(left=.19, right=.985, bottom=.12, top=.77, wspace=.24)
    centers = [0, .82, 1.87, 2.69]
    labels = ['8 KiB · ZINCRBY', '8 KiB · ZREM / ZADD',
              '1 MiB · ZINCRBY', '1 MiB · ZREM / ZADD']
    for ax, metric, divisor, title in zip(axes, ('qps', 'p999_ms'), (1000, 1),
            ('Throughput (kops/s; pairs: kpairs/s)', 'p99.9 latency (ms)')):
        maximum = max(r[metric] / divisor for r in rows)
        for index, (size, op) in enumerate(GROUPS):
            if index % 2 == 0:
                ax.axhspan(centers[index] - .37, centers[index] + .37,
                           color='#f4f6f9', zorder=0, linewidth=0)
            for variant, offset in (('main', -.13), ('candidate', .13)):
                value = lookup[variant, size, op][metric] / divisor
                y = centers[index] + offset
                ax.barh(y, value, height=.16, color=colors[variant], zorder=3)
                label = f'{value:,.1f}' if metric == 'qps' else f'{value:.3f}'
                ax.text(value + maximum * .017, y, label, va='center', fontsize=8.8)
        ax.set_xlim(0, maximum * 1.26)
        ax.set_ylim(centers[-1] + .43, -.43)
        ax.set_title(title, loc='left', fontsize=10.4, fontweight='semibold', pad=12)
        ax.set_yticks(centers, labels, fontsize=9.4)
        ax.xaxis.set_major_locator(MaxNLocator(4, min_n_ticks=3))
        ax.xaxis.set_major_formatter(FuncFormatter(lambda x, _: f'{x:g}'))
        ax.grid(axis='x', color='#e0e6ed', linewidth=.6, zorder=1)
        ax.tick_params(axis='both', length=0, pad=6)
        for spine in ax.spines.values():
            spine.set_visible(False)
    fig.suptitle('ZSet point updates · 80 connections', x=.19, y=.99,
                 ha='left', fontsize=14, fontweight='semibold')
    fig.legend([Patch(facecolor=colors[v]) for v in REVISIONS],
               ['main 684894d', 'candidate 32bdd6b'], loc='upper left',
               bbox_to_anchor=(.185, .925), ncol=2, frameon=False,
               handlelength=1.2, columnspacing=2, fontsize=9.6)
    destination.mkdir(parents=True, exist_ok=True)
    fig.savefig(destination / FIGURE, metadata={'Date': None})
    if preview:
        fig.savefig(destination / 'zset-opt-crossover.preview.png', dpi=160)
    plt.close(fig)
    receipt = {'complete': True, 'experiment': NAME, 'source_sha256': sha(source),
               'plot_script_sha256': sha(__file__),
               'figures': {FIGURE: sha(destination / FIGURE)},
               'values': [{k: row[k] for k in VALUES} for row in rows]}
    (destination / 'chart-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    return destination / FIGURE


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--preview', action='store_true', help='Local preview only; never published')
    args = parser.parse_args()
    print(render(args.source, args.destination, args.preview))
