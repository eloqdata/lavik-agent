#!/usr/bin/env python3
"""Render comparison figures from the independently audited summary."""
import argparse,json,pathlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
p=argparse.ArgumentParser();p.add_argument('audit',type=pathlib.Path);p.add_argument('--out',type=pathlib.Path,default=pathlib.Path('.'));a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
rows=json.loads(a.audit.read_text())['rows']
colors={'lavik':'#2563eb','redis':'#ea580c','kvrocks':'#9333ea','dragonfly':'#15803d'}
names={'lavik':'Lavik','redis':'Redis','kvrocks':'Kvrocks','dragonfly':'Dragonfly'}
workloads=['C','B','A'];labels=['C: 100% read','B: 95% read','A: 50% read']
plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False,'axes.titleweight':'bold','svg.fonttype':'path'})
datasets=sorted({r['records'] for r in rows})
for kind in ['throughput','read-p99']:
 fig,grid=plt.subplots(1,len(datasets),figsize=(6*len(datasets),4.8),sharey=True,squeeze=False)
 for ax,n in zip(grid[0],datasets):
  present=[x for x in colors if any(r['product']==x and r['records']==n for r in rows)]
  width=.18
  for i,product in enumerate(present):
   for j,w in enumerate(workloads):
    matches=[r for r in rows if r['product']==product and r['records']==n and r['workload']==w]
    if not matches:continue
    r=matches[0];x=j+(i-(len(present)-1)/2)*width
    if kind=='throughput':
     v=r['mean_qps']/1000
     ax.bar(x,v,width*.9,color=colors[product],yerr=[[(r['mean_qps']-r['min_qps'])/1000],[(r['max_qps']-r['mean_qps'])/1000]],capsize=2,error_kw={'elinewidth':.8})
     ax.annotate(f'{v:.0f}',(x,v),xytext=(0,5),textcoords='offset points',ha='center',fontsize=8)
    else:
     v=r['read_p99_ms']
     if v is not None:ax.scatter(x,v,color=colors[product],s=38,zorder=3)
  ax.set_xticks(range(3),labels);ax.set_title(f'{n//1000000}M records · {n*1024/1024**3:.2f} GiB values')
  ax.set_axisbelow(True);ax.grid(axis='y',color='#e5e7eb',linewidth=.7)
  if kind=='throughput':ax.set_ylabel('Mean successful operations/s (thousands)');ax.set_ylim(bottom=0);ax.margins(y=.17)
  else:ax.set_ylabel('Mean of three READ p99 values (ms, log scale)');ax.set_yscale('log');ax.margins(y=.25)
 fig.suptitle('8 × 128 B Hash · native processes · 4 vCPU · 128 connections',fontsize=13,fontweight='bold')
 fig.legend(handles=[Patch(facecolor=c,label=names[x]) for x,c in colors.items()],loc='lower center',ncol=4,bbox_to_anchor=(.5,.07),frameon=False)
 note=('Three 60-second runs per point. Throughput whiskers: min–max. ' if kind=='throughput' else 'Mean of three per-run READ p99 values. Logarithmic latency axis. ')
 note+=('100M: Dragonfly experimental Hash tiering; A failed in warmup (OOM). Redis RAM mode not run.' if 100000000 in datasets else '10M comparison; 100M acquisition is in progress.')
 fig.text(.5,.02,note,ha='center',fontsize=8,color='#4b5563')
 fig.tight_layout(rect=[0,.14,1,.94])
 fig.savefig(a.out/(kind+'.svg'),bbox_inches='tight');fig.savefig(a.out/(kind+'.png'),dpi=160,bbox_inches='tight');plt.close(fig)
