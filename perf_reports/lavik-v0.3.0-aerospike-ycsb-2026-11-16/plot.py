"""Regenerate figures using the established Aerospike report style."""
import csv
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Patch
from matplotlib.ticker import FuncFormatter
ROOT = Path(__file__).resolve().parent
windows = list(csv.DictReader((ROOT/'metadata/windows.csv').open()))
operations = list(csv.DictReader((ROOT/'metadata/operations.csv').open()))
plt.rcParams.update({'font.family':'sans-serif','font.sans-serif':['DejaVu Sans','Arial','sans-serif'],
 'font.size':11,'text.color':'#17202a','axes.labelcolor':'#17202a',
 'xtick.color':'#566573','ytick.color':'#566573','svg.fonttype':'none',
 'svg.hashsalt':'lavik-v030','axes.spines.top':False,'axes.spines.right':False,
 'axes.spines.left':False,'axes.spines.bottom':False,'xtick.major.size':0,'ytick.major.size':0})
specs=[('aerospike','#8a939b','Aerospike CE 8.1.2.4-4'),('uring','#1473e6','Lavik v0.3.0 · io_uring')]
for target in [100000,0]:
 fig,axes=plt.subplots(2,1,figsize=(12,8.5))
 fig.subplots_adjust(left=.09,right=.98,bottom=.09,top=.81,hspace=.34)
 for i,(backend,color,label) in enumerate(specs):
  values={r['workload']:float(r['qps']) for r in windows if r['backend']==backend and int(r['target_ops_sec'])==target}
  bars=axes[0].bar([x+(i-.5)*.36 for x in range(4)],[values[w] for w in 'ABCD'],.34,color=color)
  axes[0].bar_label(bars,labels=[f'{values[w]/1000:.1f}k' for w in 'ABCD'],padding=3,fontsize=10)
  lat={(r['workload'],r['operation']):float(r['p999_ms']) for r in operations if r['backend']==backend and int(r['target_ops_sec'])==target}
  for x,w in enumerate('ABCD'):
   for j,op in enumerate(['READ','INSERT' if w=='D' else 'UPDATE']):
    if (w,op) not in lat: continue
    axes[1].bar(x+(i-.5)*.36+(j-.5)*.16,lat[w,op],.15,color=color,edgecolor='white',linewidth=.5,hatch='///' if j else None)
 for ax in axes:
  ax.set_xticks(range(4),['A','B','C','D-Uniform'])
  ax.set_xlim(-.6,3.6)
  ax.grid(axis='y',color='#e5e9ed',linewidth=.8)
  ax.set_axisbelow(True)
 axes[0].set_ylim(0,max(float(r['qps']) for r in windows if int(r['target_ops_sec'])==target)*1.05)
 axes[1].set_ylim(0,max(float(r['p999_ms']) for r in operations if int(r['target_ops_sec'])==target)*1.05)
 axes[0].set_ylabel('Total operations / s')
 axes[0].yaxis.set_major_formatter(FuncFormatter(lambda x,_:f'{x/1000:,.0f}k'))
 axes[1].set_ylabel('Operation p99.9 / ms')
 fig.text(.045,.938,f'Lavik v0.3.0 vs Aerospike · {"100K target" if target else "Unlimited"}',fontsize=22,weight='bold')
 fig.text(.045,.917,'YCSB A / B / C / D-Uniform · 100M initial records · 300 seconds per cell',fontsize=11,color='#566573')
 handles=[Patch(facecolor=c,label=l) for _,c,l in specs]+[Patch(facecolor='#8a939b',label='READ'),Patch(facecolor='#8a939b',edgecolor='white',hatch='///',label='UPDATE / INSERT')]
 fig.legend(handles=handles,loc='upper center',bbox_to_anchor=(.5,.88),ncol=4,frameon=False,fontsize=10)
 fig.text(.045,.025,'One run per cell · complete-window HDR percentiles · different storage layouts and CPU policies',fontsize=10,color='#566573')
 output=ROOT/('ycsb-100k.svg' if target else 'ycsb-unlimited.svg')
 fig.savefig(output,metadata={'Date':None})
 output.write_text('\n'.join(line.rstrip() for line in output.read_text().splitlines())+'\n')
 plt.close(fig)
