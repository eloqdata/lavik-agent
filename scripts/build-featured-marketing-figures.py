"""Reproduce the featured 0.2.0 article's derived numbers and SVGs offline.
Uses only archived SHA-256-checked benchmark results and dated Azure receipts.
Historical article assets/evidence are deliberately left intact.
"""
import csv, hashlib, json, math
from pathlib import Path
from html import escape
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from hdrh.histogram import HdrHistogram

ROOT=Path('evidence/technical/featured-marketing')
OUT=Path('apps/web/public/blog-assets/featured-marketing')
OUT.mkdir(parents=True,exist_ok=True)
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
write=lambda p,obj:Path(p).write_text(json.dumps(obj,indent=2,ensure_ascii=False)+'\n')
source_hashes={}
def verified(file):
 p=Path(file);root=Path(*p.parts[:2]);rel=str(p.relative_to(root))
 sums={s.split(maxsplit=1)[1].strip().removeprefix('*'):s.split()[0] for s in (root/'SHA256SUMS').read_text().splitlines() if s.strip()}
 if sums[rel]!=sha(p):raise ValueError('Source checksum differs: '+file)
 source_hashes[file]=sha(p)
 return p.read_text()
exact=json.loads(Path('packages/benchmarks/exact-data.json').read_text())
if not all('lavik-v0.2.0-' in r[k+'Source'] for r in exact['memoryRows'] for k in ('get','set')):raise ValueError('Expected 0.2.0 sources')
rows=[]
for row in exact['memoryRows']:
 for op in ('get','set'):
  file=row[op+'Source'];stats=json.loads(verified(file))['ALL STATS'][op.title()+'s']
  hist=HdrHistogram.decode(stats['Percentile Latencies']['Histogram log format']['Compressed Histogram'])
  if hist.get_total_count()!=stats['Count']:raise ValueError('Histogram count mismatch')
  quantiles={f'p{q}':hist.get_value_at_percentile(q)/1000 for q in (50,95,99,99.9)}
  for q in (50,99,99.9):
   if quantiles[f'p{q}']!=stats['Percentile Latencies'][f'p{q:.2f}']:raise ValueError('Quantile precision mismatch')
  rows.append({'system':row['name'],'operation':op.upper(),'qps':stats['Ops/sec'],'averageMs':stats['Average Latency'],'latencyMs':quantiles,'histogramCount':hist.get_total_count(),'source':file})
archive='perf_reports/lavik-v0.2.0-vs-memory-databases-2026-10-21'
points=list(csv.DictReader(verified(archive+'/metadata/results.csv').splitlines()))
series=[('Lavik 0.2.0 · 10M','16vcpu-10m','lavik-10m',16,16,'#a64626'),('Redis · 10M','16vcpu-10m','redis',16,16,'#345b70'),('Valkey · 10M','16vcpu-10m','valkey',16,8,'#7c7467'),('Lavik 0.2.0 · 1B','16vcpu-1b','lavik-1b',16,16,'#1d7668')]
curves=[]
for label,suite,product,gt,st,color in series:
 for op,threads in [('GET',gt),('SET',st)]:
  selected=sorted([p for p in points if p['suite']==suite and p['product']==product and p['kind']==op and int(p['threads'])==threads],key=lambda p:int(p['connections']))
  if [int(p['connections']) for p in selected]!=[160,320,640,1280]:raise ValueError('Missing sweep')
  curves.append({'label':label,'operation':op,'color':color,'points':[{'connections':int(p['connections']),'qps':float(p['qps']),'p999Ms':float(p['p999_ms'])} for p in selected]})
compact={}
for product in ['lavik-1m','lavik-100m']:
 compact[product]={op:max(float(p['qps']) for p in points if p['suite']=='2vcpu' and p['product']==product and p['kind']==op) for op in ['GET','SET']}
ycsv='perf_reports/lavik-v0.2.0-aerospike-ycsb-2026-10-21/metadata/results.csv'
yrows=list(csv.DictReader(verified(ycsv).splitlines()))
mixed=[]
for work in ['A','B']:
 selected=[r for r in yrows if r['product'].startswith('Lavik') and r['workload']==work and r['target_ops_sec']=='0']
 if {r['operation'] for r in selected}!={'READ','UPDATE'}:raise ValueError('Missing YCSB cells')
 mixed.append({'workload':work,'totalQps':float(selected[0]['total_qps']),**{r['operation'].lower()+'P999Ms':float(r['p999_ms']) for r in selected}})
get={r['system']:r['qps'] for r in rows if r['operation']=='GET'}
set_={r['system']:r['qps'] for r in rows if r['operation']=='SET'}
measurements={'version':'0.2.0','provenance':'Original complete-window memtier data checked against SHA256SUMS. P95 decoded from embedded HDR; P50/P99/P99.9 and sample counts reconciled. No benchmark was run to create this article.','memory':rows,'curves':curves,'compactPeaks':compact,'mixed':mixed,'relativePercent':{'getVsRedis':(get['Lavik 0.2.0 SPDK']/get['Redis 8.10.2']-1)*100,'getVsValkey':(get['Lavik 0.2.0 SPDK']/get['Valkey 9.1.2']-1)*100,'setVsRedis':(set_['Lavik 0.2.0 SPDK']/set_['Redis 8.10.2']-1)*100},'sourceFiles':source_hashes}
write(ROOT/'measurements.json',measurements)
# Pricing evidence has unmodified API Items plus query/observation provenance.
prices=json.loads(Path('evidence/technical/featured-020-sales/sources/azure-retail-prices.json').read_text())
def price(region,sku,term=None):
 items=[x for r in prices['queries'] if r['region']==region and r['sku']==sku for p in r['pages'] for x in p['Items'] if 'Windows' not in x['productName'] and x['skuName']==sku.removeprefix('Standard_').replace('_',' ') and x.get('isPrimaryMeterRegion') and x['type']==('Reservation' if term else 'Consumption') and x.get('reservationTerm')==term]
 if len(items)!=1:raise ValueError('Ambiguous price '+str((region,sku,term,len(items))))
 return items[0]['retailPrice']
model=json.loads(Path('evidence/technical/agent-era-voter/sizing.json').read_text())
model.pop('qpsScenario',None)
model.update({'observedAt':prices['retrievedAt'],'status':'Modeled VM costs and raw capacity; not a measured migration, replicated workload or throughput sizing result.','targetDatasetDecimalTB':2.4,'trafficEnvelope':'Read-heavy planning envelope below roughly 1M operations/s; actual acceptance may be lower. Above this, re-size or scale out; no 3-VM claim.','capacityQualification':'2.4 TB is an illustrative retained-data target, not proven usable capacity. Redis primary RAM is 2400 GiB =2.5769803776 decimal TB before keys/overhead. Both deployments require verified key/index memory and operational space reserves.','benchmarkSeparation':'Pricing uses L16as_v4; measurements use L16aos_v4 with different local storage. Benchmarks have no replicas and do not establish a 2.4 TB, 3-VM production envelope.'})
e=price('southeastasia','Standard_E2s_v4');l=price('southeastasia','Standard_L16as_v4')
model['region']='southeastasia'
model['redis'].update(hourlyUSDPerVM=e,monthlyUSDPerVM=e*730,monthlyUSD=300*e*730,annualUSD=300*e*730*12)
model['lavik']['dataVMs'].update(hourlyUSDPerVM=l,monthlyUSDPerVM=l*730)
model['lavik']['voterVM'].update(hourlyUSD=e,monthlyUSD=e*730)
monthly=(2*l+e)*730
model['lavik'].update(hourlyUSDFleet=2*l+e,monthlyUSD=monthly,annualUSD=monthly*12)
model['savings']={'monthlyUSD':model['redis']['monthlyUSD']-monthly,'annualUSD':(model['redis']['monthlyUSD']-monthly)*12,'percentLowerMonthlyVMPrice':(1-monthly/model['redis']['monthlyUSD'])*100,'redisToLavikMonthlyCostRatio':model['redis']['monthlyUSD']/monthly}
model['capacityNormalizedMonthlyUSDPerTB']={k:model[k]['monthlyUSD']/model[k]['capacityDenominatorTB'] for k in ['redis','lavik']}
model['largerRedisOptions']=[]
for n,sku,mem in [(40,'Standard_E16s_v4',128),(20,'Standard_E32s_v4',256)]:
 hourly=price('southeastasia',sku);monthly=n*hourly*730;cap=n/2*mem*2**30/10**12
 model['largerRedisOptions'].append({'nodes':n,'primaries':n//2,'replicas':n//2,'copies':2,'sku':sku,'memoryGiBPerVM':mem,'primaryMemoryGiB':n//2*mem,'hourlyUSDPerVM':hourly,'monthlyUSD':monthly,'capacityDenominatorTB':cap,'monthlyUSDPerTB':monthly/cap,'percentLowerLavikVMPrice':(1-model['lavik']['monthlyUSD']/monthly)*100})
model['capacityChart']['largerRedisFormula']='2*ceil(logical_TB*10^12/(RAM_GiB*2^30)), separately for16,128,256GiB primaries'
model['sourceFiles']={str(p):sha(p) for p in Path('evidence/technical/featured-020-sales/sources').glob('azure-*.json')}
write(ROOT/'sizing.json',model)
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'svg.fonttype':'none','svg.hashsalt':'lavik-featured-marketing','axes.spines.top':False,'axes.spines.right':False,'axes.edgecolor':'#bcb6ab','axes.labelcolor':'#263536','text.color':'#263536','xtick.color':'#4e5754','ytick.color':'#4e5754','figure.facecolor':'#f4f0e8','axes.facecolor':'#f4f0e8'})
fig,axes=plt.subplots(1,2,figsize=(12,5.4))
for ax,op in zip(axes,['GET','SET']):
 for curve in [s for s in curves if s['operation']==op]:ax.plot([p['connections'] for p in curve['points']],[p['qps']/1e6 for p in curve['points']],label=curve['label'],color=curve['color'],marker='o',linewidth=2.2,linestyle='--' if '1B' in curve['label'] else '-')
 ax.set_xscale('log',base=2);ax.set_xticks([160,320,640,1280],['160','320','640','1,280']);ax.set_xlabel('Client connections');ax.set_title(op,loc='left',fontweight='bold');ax.set_ylim(bottom=0);ax.set_ylabel('Million operations / second');ax.grid(axis='y',alpha=.2)
axes[0].legend(loc='upper left',fontsize=8,frameon=False)
fig.suptitle('Lavik 0.2.0 on NVMe; Redis and Valkey in DRAM',fontweight='bold',fontsize=16,x=.075,ha='left')
fig.text(.075,.025,'1 KiB values · pipeline 1 · one server, no replicas. 10M: 30s/16 client threads; 1B: 60s/32 threads.',fontsize=9)
fig.tight_layout(rect=[.025,.065,1,.92]);fig.savefig(OUT/'throughput.svg',metadata={'Date':None});plt.close(fig)
fig,ax=plt.subplots(figsize=(12,5.4));xs=[.1,.5,1,1.5,2.4,2.577,3,3.84,3.840001,5,7.68,7.680001,10]
for ram,color in [(16,'#345b70'),(128,'#7c7467'),(256,'#52755c')]:ax.plot(xs,[2*math.ceil(x*10**12/(ram*2**30)) for x in xs],color=color,marker='o',label=f'Redis: {ram} GiB primary + replica',linewidth=2)
ax.step(xs,[3*math.ceil(x/3.84) for x in xs],where='post',color='#a64626',label='Lavik: 2 data VMs + 1 Meta-only voter per unit',linewidth=2.5)
ax.set_xlabel('Raw primary capacity before overhead (decimal TB)');ax.set_ylabel('VM count (logarithmic scale)');ax.set_yscale('log');ax.set_ylim(2,2000);ax.set_yticks([3,10,30,100,300,1000],['3','10','30','100','300','1,000']);ax.grid(axis='y',alpha=.2);ax.legend(fontsize=9,loc='upper left',frameon=False)
fig.suptitle('Modeled VM counts depend on Redis shard size',fontweight='bold',fontsize=16,x=.075,ha='left')
fig.text(.075,.025,'Two data copies. Capacity only, before overhead/headroom; throughput may require more VMs.',fontsize=9)
fig.tight_layout(rect=[.025,.065,1,.92]);fig.savefig(OUT/'capacity.svg',metadata={'Date':None});plt.close(fig)
for p in OUT.glob('*.svg'):p.write_text('\n'.join(s.rstrip() for s in p.read_text().splitlines())+'\n')
print(json.dumps({'relativePercent':measurements['relativePercent'],'singaporePAYG':model['savings'],'largerRedisOptions':model['largerRedisOptions'],'mixed':mixed},indent=2))
# Explanatory vectors: no raster generation or external assets.
def svg(body,title,desc,h=650):return f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="{h}" viewBox="0 0 1200 {h}" role="img"><title>{escape(title)}</title><desc>{escape(desc)}</desc><rect width="1200" height="{h}" rx="14" fill="#f0eade"/><g font-family="Arial,sans-serif" fill="#233638">{body}</g></svg>'
def text(x,y,t,size=20,fill='#233638',weight=400):return f'<text x="{x}" y="{y}" font-size="{size}" fill="{fill}" font-weight="{weight}">{escape(t)}</text>'
def cube(x,y,n):return f'<path d="M{x} {y}l{n} {-n*.4}l{n} {n*.4}l{-n} {n*.4}Z" fill="#d5aa8e"/><path d="M{x} {y}v{n}l{n} {n*.4}v{-n}Z" fill="#b87652"/><path d="M{x+n} {y+n*.4}v{n}l{n} {-n*.4}v{-n}Z" fill="#864b34"/>'
body=text(55,57,'Modeled: 300 Redis nodes → 3 Lavik VMs',32,weight=700)+text(55,91,'~2.4 TB of retained data · read-heavy workloads below about 1M ops/s',17,fill='#6d4c39')
body+=''.join(cube(60+(i%20)*24,148+(i//20)*21,8) for i in range(300))
body+=text(60,508,'300 memory-optimized Redis VMs',21,weight=700)+text(60,541,'E2s_v4 · 2 vCPUs · 16 GiB · no local SSD',18)+text(60,571,'2,400 GiB primary RAM before overhead',18)+text(60,600,'$33,288/month · small-VM Redis fleet',17)
body+='<path d="M565 300H650M630 282L651 300L630 318" fill="none" stroke="#a64626" stroke-width="4"/>'
for x,y,label in [(730,178,'Primary + Meta'),(950,178,'Follower + Meta'),(840,350,'Meta-only voter')]:
 shape=cube(x,y,55)
 if label=='Meta-only voter':shape=shape.replace('#d5aa8e','#b8c7ae').replace('#b87652','#718664').replace('#864b34','#435640')
 body+=shape+text(x-10,y+106,label,18,weight=700)
body+=text(714,508,'2 data VMs + 1 Meta-only VM',21,weight=700)+text(714,541,'2 × L16as_v4 + 1 × E2s_v4',18)+text(714,571,'3.84 TB local NVMe per data VM',17)+text(714,600,'$2,514.12/month · 92.4% lower VM bill',17)
body+=text(55,663,'Keep more state. Buy fewer servers for RAM.',25,weight=700)
body+=text(55,710,'Singapore · Linux PAYG · 730 h/month · VM costs before disks, backups and traffic.',17)
(OUT/'consolidation.svg').write_text(svg(body,'Modeled: 300 Redis nodes to 3 Lavik VMs','Capacity model for about 2.4 TB of retained data: 300 small Redis VMs compared with two Lavik data VMs and one Meta-only voter. Singapore monthly VM costs are $33,288 and $2,514.12, a 92.4 percent reduction.',750))
body=text(55,57,'The storage path is an architecture decision',31,weight=700)+text(55,91,'Lavik 0.2.0 · simplified request path · kernel TCP in the SPDK benchmark',17)
def box(x,y,w,h,label,sub):return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="#fffaf1" stroke="#b7b2a6"/>'+text(x+18,y+35,label,21,weight=700)+text(x+18,y+65,sub,16)
body+=box(55,135,300,95,'Redis-compatible clients','RESP2 / RESP3')+box(425,135,330,95,'Bycorf workers','Pinned logical CPUs · coroutines')+box(825,135,320,95,'In-memory key index','Owner-local state · routed work')
body+='<path d="M355 181H410M395 171L410 181L395 191M755 181H810M795 171L810 181L795 191M985 230V280H590V325M580 310L590 325L600 310" fill="none" stroke="#a64626" stroke-width="3"/>'
body+=box(425,325,330,95,'Asynchronous storage I/O','SPDK qpairs + completion polling')+box(55,325,300,95,'Append / grouped storage','Focused updates · batched replies')+box(825,325,320,95,'NVMe SSD namespaces','Parallel requests across devices')
body+='<path d="M425 370H370M385 360L370 370L385 380M755 370H810M795 360L810 370L795 380" fill="none" stroke="#a64626" stroke-width="3"/>'
body+=text(55,490,'Owner-local state reduces cross-worker coordination on the request path.',19)+text(55,528,'Storage: userspace SPDK NVMe I/O. Networking: Linux TCP in the experiment.',19)+text(55,574,'Meta: topology and authority via Raft. Data replication: a separate asynchronous protocol.',19)
(OUT/'request-path.svg').write_text(svg(body,'Lavik 0.2.0 request and NVMe SSD I/O path','RESP clients, coroutine workers, memory-resident indexes and asynchronous SPDK queues. Topology consensus and data replication are separate.'))
