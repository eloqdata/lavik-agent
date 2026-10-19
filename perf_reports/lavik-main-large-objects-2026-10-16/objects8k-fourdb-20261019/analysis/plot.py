"""Render measured 8 KiB results; no illustrative or fallback values."""
from pathlib import Path
import argparse
import hashlib
import json
import math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
from matplotlib.ticker import MaxNLocator, FuncFormatter, LogLocator, NullLocator

PRODUCTS = ('lavik', 'redis', 'valkey', 'kvrocks')
LABELS = ('Lavik main', 'Redis 8.10.2', 'Valkey 9.1.2', 'Kvrocks 2.17.0')
COLORS = ('#e89a32', '#c85359', '#4389bd', '#7a6bb0')
GROUPS = {
    'reads': ('hgetall', 'hkeys', 'hvals', 'smembers', 'lrange', 'zrange'),
    'writes': ('set', 'setrange', 'hash', 'list', 'zincr', 'zswap', 'stream', 'sswap'),
}
COMMANDS = {'hgetall': 'HGETALL', 'hkeys': 'HKEYS', 'hvals': 'HVALS',
            'smembers': 'SMEMBERS', 'lrange': 'LRANGE', 'zrange': 'ZRANGE\nWITHSCORES',
            'set': 'SET', 'setrange': 'SETRANGE', 'hash': 'HSET',
            'list': 'LPUSH / RPOP', 'zincr': 'ZINCRBY', 'zswap': 'ZREM / ZADD',
            'stream': 'XADD MAXLEN', 'sswap': 'SADD / SREM'}

def render(source, destination):
    document = json.loads(source.read_text())
    if not isinstance(document, dict) or document.get('complete') is not True:
        raise ValueError('Charts require the complete, validated four-database experiment')
    rows = document['rows']
    expected = {(p, op) for p in PRODUCTS for ops in GROUPS.values() for op in ops}
    if len(rows) != 56 or {(r['product'], r['op']) for r in rows} != expected:
        raise ValueError('Missing or duplicate formal points')
    for row in rows:
        if row['connections'] != 80 or row['errors'] != 0:
            raise ValueError('Unvalidated result')
        for key in ('qps', 'avg_ms', 'p999_ms'):
            if not math.isfinite(row[key]) or row[key] <= 0:
                raise ValueError('Invalid metric')
    lookup = {(r['product'], r['op']): r for r in rows}
    destination.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10,
                         'svg.fonttype': 'none', 'svg.hashsalt': 'objects8k-fourdb',
                         'axes.labelcolor': '#475569', 'text.color': '#263445',
                         'xtick.color': '#64748b', 'ytick.color': '#263445'})
    for group, ops in GROUPS.items():
        fig, axes = plt.subplots(1, 2, figsize=(10.2, .81 * len(ops) + 1.05), sharey=True)
        fig.patch.set_facecolor('white')
        fig.subplots_adjust(left=.18, right=.98, bottom=.08, top=.855, wspace=.20)
        centers = [i * .93 for i in range(len(ops))]
        offsets = (-.255, -.085, .085, .255)
        for column, (metric, divisor, title) in enumerate([
                ('qps', 1000, 'Throughput (kQPS; paired commands: kpairs/s)' if group == 'writes'
                 else 'Throughput (kQPS)'),
                ('p999_ms', 1, 'p99.9 latency (ms)')]):
            ax = axes[column]
            maximum = max(lookup[p, op][metric] / divisor for p in PRODUCTS for op in ops)
            minimum = min(lookup[p, op][metric] / divisor for p in PRODUCTS for op in ops)
            log_latency = metric == 'p999_ms' and maximum / minimum > 50
            for index, op in enumerate(ops):
                if index % 2 == 0:
                    ax.axhspan(centers[index] - .43, centers[index] + .43,
                               color='#f5f7fa', zorder=0, lw=0)
                for product, offset, color in zip(PRODUCTS, offsets, COLORS):
                    value = lookup[product, op][metric] / divisor
                    y = centers[index] + offset
                    if log_latency:
                        ax.scatter(value, y, s=23, color=color, zorder=3)
                    else:
                        ax.barh(y, value, height=.125, color=color, zorder=3)
                    label = f'{value:,.1f}' if metric == 'qps' and value >= 1 else f'{value:.3f}'
                    ax.text(value * 1.16 if log_latency else value + maximum * .017,
                            y, label, va='center', ha='left',
                            fontsize=8.8, color='#334155', zorder=4)
            if log_latency:
                ax.set_xscale('log')
                ax.set_xlim(minimum / 1.6, maximum * 3.5)
                ax.xaxis.set_major_locator(LogLocator(base=10, numticks=6))
                ax.xaxis.set_minor_locator(NullLocator())
                title = 'p99.9 latency (ms, log scale)'
            else:
                ax.set_xlim(0, maximum * 1.23)
                ax.xaxis.set_major_locator(MaxNLocator(4, min_n_ticks=3))
            ax.set_ylim(centers[-1] + .49, -.49)
            ax.set_title(title, loc='left', fontsize=10.7, fontweight='semibold', pad=12)
            ax.xaxis.set_major_formatter(FuncFormatter(
                (lambda x, _: f'{x:,.0f}' if x >= 1 else f'{x:g}')
                if metric == 'qps' else (lambda x, _: f'{x:g}')))
            ax.grid(axis='x', color='#e2e8f0', linewidth=.6, zorder=1)
            ax.tick_params(axis='both', length=0, pad=7, labelsize=9)
            for spine in ax.spines.values():
                spine.set_visible(False)
            ax.set_yticks(centers, [COMMANDS[op] for op in ops], fontsize=9.6)
        fig.suptitle(f'8 KiB {group} · 80 connections', x=.18, y=.985,
                     ha='left', fontsize=14, fontweight='semibold')
        fig.legend([Patch(facecolor=c) for c in COLORS], LABELS,
                   loc='upper left', bbox_to_anchor=(.175, .95), ncol=4,
                   frameon=False, handlelength=1.2, columnspacing=1.5, fontsize=9.5)
        path = destination / ('objects8k-' + group)
        fig.savefig(path.with_suffix('.svg'), metadata={'Date': None})
        fig.savefig(path.with_suffix('.preview.png'), dpi=150)
        plt.close(fig)
        print(path.with_suffix('.svg'))
    sha = lambda p: hashlib.sha256(Path(p).read_bytes()).hexdigest()
    receipt = {'complete': True, 'source_sha256': sha(source),
               'plot_script_sha256': sha(__file__),
               'figures': {f'objects8k-{group}.svg': sha(destination / f'objects8k-{group}.svg')
                           for group in GROUPS},
               'values': [{k: row[k] for k in ('product', 'op', 'qps', 'p999_ms', 'unit')}
                          for row in rows]}
    (destination / 'chart-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    render(args.source, args.destination)
