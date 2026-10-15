"""Derive article tables and plots from archived results; never run a benchmark.
Use an isolated Python environment with matplotlib and hdrhistogram installed.
"""
import csv, hashlib, json, math
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from hdrh.histogram import HdrHistogram

ROOT=Path('evidence/technical/agent-era')
OUT=Path('apps/web/public/blog-assets/agent-era')
OUT.mkdir(parents=True, exist_ok=True)
ROOT.mkdir(parents=True, exist_ok=True)
exact=json.loads(Path('packages/benchmarks/exact-data.json').read_text())
archive='perf_reports/lavik-v0.1.0-spdk-vs-latest-2026-10-13'
source_hashes={}
def read_verified(file):
    p=Path(file); digest=hashlib.sha256(p.read_bytes()).hexdigest()
    root=Path(*p.parts[:2]); relative=str(p.relative_to(root))
    sums={line.split(maxsplit=1)[1].strip().removeprefix('*'):line.split()[0] for line in (root/'SHA256SUMS').read_text().splitlines() if line.strip()}
    if sums[relative]!=digest: raise ValueError('Source checksum differs: '+file)
    source_hashes[file]=digest
    return p.read_text()
rows=[]
for row in exact['memoryRows']:
    for op in ('get','set'):
        file=row[op+'Source']; raw=json.loads(read_verified(file)); stats=raw['ALL STATS'][op.title()+'s']
        hist=HdrHistogram.decode(stats['Percentile Latencies']['Histogram log format']['Compressed Histogram'])
        if hist.get_total_count()!=stats['Count']:raise ValueError('Histogram count mismatch')
        quantiles={f'p{q}':hist.get_value_at_percentile(q)/1000 for q in (50,95,99,99.9)}
        for q in (50,99,99.9):
            if quantiles[f'p{q}']!=stats['Percentile Latencies'][f'p{q:.2f}']:raise ValueError('Histogram unit/precision mismatch')
        rows.append({'system':row['name'],'operation':op.upper(),'qps':stats['Ops/sec'],'averageMs':stats['Average Latency'],'latencyMs':quantiles,'histogramCount':hist.get_total_count(),'source':file})
points=list(csv.DictReader(read_verified(archive+'/metadata/results.csv').splitlines()))
series=[('Lavik · 10M','memory','lavik-spdk',16,16,'#a64626'),('Redis · 10M','memory','redis',16,16,'#345b70'),('Valkey · 10M','memory','valkey',16,8,'#7c7467'),('Lavik · 1B','storage','lavik-spdk',16,16,'#1d7668')]
curves=[]
for label,group,system,get_threads,set_threads,color in series:
    for op,threads in [('GET',get_threads),('SET',set_threads)]:
        selected=sorted([p for p in points if p['group']==group and p['system']==system and p['workload']==op and int(p['server_threads'])==threads],key=lambda p:int(p['connections']))
        if len(selected)!=5:raise ValueError('Missing sweep')
        curves.append({'label':label,'operation':op,'color':color,'points':[{'connections':int(p['connections']),'qps':float(p['qps']),'p999Ms':float(p['p999_ms'])} for p in selected]})
measurements={'provenance':'Original memtier complete-window results, matching archived SHA256SUMS. P95 decoded from the embedded HDR histogram, in microseconds converted to milliseconds; P50/P99/P99.9 and sample counts reconciled against raw JSON. No averaging of interval percentiles.','memory':rows,'curves':curves,'sourceFiles':source_hashes}
(ROOT/'measurements.json').write_text(json.dumps(measurements,indent=2)+'\n')
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'svg.fonttype':'none','svg.hashsalt':'lavik-agent-era','axes.spines.top':False,'axes.spines.right':False,'axes.edgecolor':'#bcb6ab','axes.labelcolor':'#263536','text.color':'#263536','xtick.color':'#4e5754','ytick.color':'#4e5754','figure.facecolor':'#f4f0e8','axes.facecolor':'#f4f0e8'})
fig,axes=plt.subplots(1,2,figsize=(12,5.4))
for ax,op in zip(axes,['GET','SET']):
    for series in [s for s in curves if s['operation']==op]:
        ax.plot([p['connections'] for p in series['points']],[p['qps']/1e6 for p in series['points']],label=series['label'],color=series['color'],marker='o',linewidth=2.2,linestyle='--' if '1B' in series['label'] else '-')
    ax.set_xscale('log',base=2);ax.set_xticks([80,160,320,640,1280],['80','160','320','640','1,280']);ax.set_xlabel('Client connections');ax.set_title(op,loc='left',fontweight='bold');ax.set_ylim(bottom=0);ax.set_ylabel('Million operations / second');ax.grid(axis='y',alpha=.2)
axes[0].legend(loc='upper left',fontsize=8,frameon=False)
fig.suptitle('Lavik on NVMe SSD, Redis and Valkey in DRAM',fontweight='bold',fontsize=16,x=.075,ha='left')
fig.text(.075,.025,'1 KiB values · pipeline 1 · single server, no replicas. 10M: 30s, correlated seeds. 1B: 60s, distinct seeds.',fontsize=9)
fig.tight_layout(rect=[.025,.065,1,.92]);fig.savefig(OUT/'throughput.svg',metadata={'Date':None});plt.close(fig)
fig,axes=plt.subplots(1,2,figsize=(12,5.4))
xs=[.1,.5,1,1.5,3,5,10]
redis=[2*math.ceil(x*1000/(10*.7)) for x in xs]
for ax in axes:
    ax.plot(xs,redis,color='#345b70',marker='o',label='Redis: 10 GB/node, two copies',linewidth=2)
    ax.plot(xs,[3]*len(xs),color='#a64626',marker='o',label='Lavik: 15.36 TB/host, three copies',linewidth=2)
    ax.set_xlabel('Logical value payload (decimal TB)');ax.set_ylabel('Data nodes');ax.grid(axis='y',alpha=.2)
axes[0].set_ylim(bottom=0);axes[0].set_title('Capacity-only node count',loc='left',fontweight='bold')
axes[1].set_yscale('log');axes[1].set_title('Same model · logarithmic node axis',loc='left',fontweight='bold');axes[1].legend(fontsize=8,loc='upper left',frameon=False)
fig.suptitle('Buy capacity without multiplying the serving fleet',fontweight='bold',fontsize=16,x=.075,ha='left')
fig.text(.075,.025,'Illustration: 70% value-space budget; CPU, key-index RAM, network and failure-state throughput still need validation.',fontsize=9)
fig.tight_layout(rect=[.025,.065,1,.92]);fig.savefig(OUT/'capacity.svg',metadata={'Date':None});plt.close(fig)
print('Derived six latency rows and forty measured throughput points; generated two standalone SVG charts.')
