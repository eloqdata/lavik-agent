import argparse,pathlib,json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
p=argparse.ArgumentParser();p.add_argument('audit',type=pathlib.Path);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True);x=json.loads(a.audit.read_text());rows=x['rows'];colors=['#2563eb','#c2410c','#15803d'];labels=['Read only\nbefore writes','95% read\n5% update','Read only\nafter writes']
plt.rcParams.update({'font.size':10,'axes.spines.top':False,'axes.spines.right':False})
fig,axes=plt.subplots(1,3,figsize=(12,4.5))
for ax,key,scale,title,ylabel in zip(axes,['qps','read_p999_ms','device_read_await_ms'],[.001,1,1],['YCSB throughput','YCSB READ p99.9','NVMe mean read await'],['Thousand successful operations/s','Milliseconds','Milliseconds']):
 for i,r in enumerate(rows):
  v=r[key]*scale;ax.bar(i,v,color=colors[i],width=.6,alpha=.8)
  vals=[w[key]*scale for w in x['windows'] if w['point']==r['point']];ax.scatter([i-.12,i,i+.12],vals,color='#111827',s=14,zorder=4)
  ax.annotate(f'{v:.3f}' if key=='device_read_await_ms' else f'{v:.2f}',(i,max(vals)),xytext=(0,7),textcoords='offset points',ha='center',fontsize=10)
 ax.set_xticks(range(3),labels);ax.set_ylabel(ylabel);ax.set_title(title);ax.set_ylim(bottom=0);ax.margins(y=.22);ax.grid(axis='y',alpha=.2);ax.set_axisbelow(True)
fig.suptitle('Aerospike CE 8.1.2.4-4 · same Azure 4-vCPU host · 10M × (8 × 128 B)',fontweight='bold',fontsize=13)
fig.text(.5,.015,'128 YCSB workers, unlimited. Bars: mean of 3 × 60 s; dots: individual runs. Percentiles are averaged, not pooled.',ha='center',fontsize=9)
fig.tight_layout(rect=[0,.07,1,.92]);fig.savefig(a.out/'aerospike-diagnosis.svg',bbox_inches='tight');fig.savefig(a.out/'aerospike-diagnosis.png',dpi=160,bbox_inches='tight')
