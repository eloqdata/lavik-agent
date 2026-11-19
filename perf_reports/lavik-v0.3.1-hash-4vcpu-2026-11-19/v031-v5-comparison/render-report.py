import pathlib,json,html,csv,datetime,hashlib,sys
base=pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path('outputs');out=base/'v031-v5-comparison';out.mkdir(exist_ok=True)
lav=json.loads((base/'v031-v5-benchmark/audit.json').read_text())
peer=json.loads((base/'v031-v5-peers/audit.json').read_text())
hardware=json.loads((base/'v031-v5-benchmark/hardware.json').read_text())
lock=json.loads((base/'v031-v5-peers/source-lock.json').read_text())
assert lav['valid_points']==8 and lav['valid_measurement_windows']==24 and not lav['invalid_or_interrupted']
assert not peer['incomplete_points']
assert len(peer['failed_warmups'])==1 and peer['failed_warmups'][0]['path']=='dragonfly/n100000000-native-unlimited-tiered-listpack-A-t0-warmup'
notes_file=base/'v031-v5-peers/missing-points.json'
missing=json.loads(notes_file.read_text()) if notes_file.exists() else {}
names={'lavik':'Lavik v0.3.1','redis':'Redis '+lock['redis_version'],'kvrocks':'Kvrocks '+lock['kvrocks_version'],'dragonfly':'Dragonfly '+lock['dragonfly_version']}
labels={'C':'纯读','B':'95:5','A':'50:50'}
rows=[]
for n in [10000000,100000000]:
 for w in 'CBA':
  for product in names:
   source=lav if product=='lavik' else peer
   found=[r for r in source['summary'] if r['product']==product and r['records']==n and r['workload']==w and (product!='lavik' or r['label'] in {'C','B','A'})]
   assert len(found)<=1,(product,n,w)
   row={'records':n,'workload':w,'product':product,'version_label':names[product]}
   if found:
    r=found[0];assert len(r['runs'])==3
    row.update({k:r[k] for k in ['mean_qps','qps_min','qps_max','read_mean_us','read_p999_us','update_p999_us']});row.update(status='measured',reason='')
   else:
    if product=='redis' and n==100000000:
     status='not_measured';reason='未测试：原始字段数据已达102.4 GB，超过24 GiB内存上限；该Redis配置无SSD扩展。'
    else:
     entry=missing.get(product+'-'+str(n)+'-'+w);assert entry,(product,n,w,'Missing point requires an evidence-backed explanation')
     status,reason=entry['status'],entry['reason']
    row.update({k:None for k in ['mean_qps','qps_min','qps_max','read_mean_us','read_p999_us','update_p999_us']});row.update(status=status,reason=reason)
   rows.append(row)
extra=sorted([r for r in lav['summary'] if r['label'] in ['B-mature','A-mature']],key=lambda r:['B-mature','A-mature'].index(r['label']));assert len(extra)==2
(out/'results.json').write_text(json.dumps({'hardware':hardware,'rows':rows,'additional_lavik_points':extra},indent=2,ensure_ascii=False)+'\n')
with (out/'results.csv').open('w') as f:
 writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
def latency(value):return '—' if value is None else f'{value/1000:.3f}'
def table(records):
 s='<table><thead><tr><th>读:写</th><th>系统</th><th>QPS</th><th>读 p999（ms）</th><th>写 p999（ms）</th></tr></thead><tbody>'
 for r in records:
  qps=f"{r['mean_qps']:,.0f}" if r['mean_qps'] is not None else ('预热失败' if r['status']=='failed' else '未测试')
  s+=f"<tr><td>{labels[r['workload']]}</td><td>{html.escape(r['version_label'])}</td><td>{qps}</td><td>{latency(r['read_p999_us'])}</td><td>{latency(r['update_p999_us'])}</td></tr>"
 return s+'</tbody></table>'
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lavik 与 Redis、Kvrocks、Dragonfly 同机测试</title><style>body{font:16px/1.6 system-ui,sans-serif;background:#f6f8fa;color:#17283a;margin:0;padding:28px}main{max-width:1080px;margin:auto}h1{font-size:29px}h2{font-size:23px;margin-top:32px}table{border-collapse:collapse;width:100%;background:white;font-variant-numeric:tabular-nums;margin:16px 0}th,td{padding:10px 12px;border-bottom:1px solid #dce3eb;text-align:left}th{background:#e9f0f7}a{color:#155aa3}.note{padding:16px;background:white;border-left:4px solid #1c73aa}.small{font-size:14px;color:#506071}@media(max-width:700px){body{padding:12px}th,td{padding:7px 5px;font-size:13px}}@media print{body{background:white;padding:0}table{break-inside:avoid}}</style><main><h1>Lavik 与 Redis、Kvrocks、Dragonfly 同机测试</h1>'''
def lookup(product,n,w):return next(r for r in rows if r['product']==product and r['records']==n and r['workload']==w)
for n,description in [(10000000,'1,000万条基础C/B/A'),(100000000,'1亿条C/B/A')]:
 comparisons=[]
 for w in 'CBA':
  l,d=lookup('lavik',n,w),lookup('dragonfly',n,w)
  if d['mean_qps']:
   diff=100*(l['mean_qps']/d['mean_qps']-1)
   comparisons.append(labels[w]+('高' if diff>=0 else '低')+f'{abs(diff):.1f}%')
 if comparisons:page+='<p>在本次128连接配置下，'+description+'测量中，Lavik相对Dragonfly的吞吐量：'+ '，'.join(comparisons)+'。</p>'
retained=100*lookup('lavik',100000000,'C')['mean_qps']/lookup('lavik',10000000,'C')['mean_qps']
page+='<p>Dragonfly的1亿条50:50在预热期间返回ERR Out of memory，未取得三轮有效测量；这一点单独标为失败。</p>'
page+=f'<p>数据扩大到1亿条后，Lavik纯读吞吐量为{lookup("lavik",100000000,"C")["mean_qps"]:,.0f} QPS，保留了1,000万条时的{retained:.1f}%。各组读写p999见下表。</p>'
page+='<p>同一台 Azure <b>L4aos_v5</b>：4 vCPU、32 GiB、单块约2.88 TB本地NVMe；独立F16als_v7客户端。全部使用原生进程，逐个运行。Lavik使用SPDK，其余系统按各自原生存储方式运行。</p>'
page+='<p class="note">128个压测连接，不限速；每个测试点预热60秒，再运行3×60秒并取算术平均。每条记录8个字段×128字节，均匀访问、关闭YCSB扫描索引。读取全部字段，更新全部字段：Lavik使用LAVIK.HREPLACE，其余使用HMSET。表中的p999是三轮百分位数的平均值。</p>'
for n,title in [(10000000,'1,000万条'),(100000000,'1亿条')]:
 selected=[r for r in rows if r['records']==n]
 page+='<h2>'+title+'</h2>'+table(selected)
 for note in dict.fromkeys(r['reason'] for r in selected if r['reason']):page+='<p class="small">'+html.escape(note)+'</p>'
page+='<h2>Lavik 1,000万条追加复测</h2><p>基础测试后，继续运行5分钟50:50更新，再分别预热并测量以下两组；同样各取3×60秒平均。</p>'
page+=table([dict(r,version_label='Lavik v0.3.1') for r in extra])
page+='<h2>先用fio筛选NVMe</h2><p>数据库测试前，先执行小块纯随机读、小块随机读叠加5 MiB/s顺序写、4 KiB随机读叠加相同顺序写；三组交错重复三遍，每轮5秒预运行加60秒测量。所有job需无错误，每个混合窗口读IOPS至少保留同轮小块纯读的75%，平均读完成延迟低于1 ms。</p><p>本机三组平均读IOPS分别为431,409、370,348、431,218，九轮检查通过。完整脚本、清盘前的身份校验、参数、判断方法及其适用范围见<a href="../v031-v5-fio/README.md">fio筛选流程</a>。这是针对本次掉速现象的准入检查，不能证明所有长期负载都正常。</p>'
page+='<h2>配置与复现</h2><p>每个数据集灌入后，按纯读、95:5、50:50的顺序测试。Kvrocks在灌入后等待后台整理结束。Lavik使用v0.3.1发布版本，后台参数保持默认。</p><p>Redis开启4个I/O线程；Redis和Dragonfly内存上限24 GiB，关闭快照，Redis关闭AOF。Kvrocks使用4个worker和8 GiB block cache。Dragonfly的1亿条测试开启实验性hash tiering，并使用256字节字段阈值、2048字节listpack阈值。</p><p>服务端均限制在CPU 0–3。Lavik进程内存上限26 GiB，另保留2 GiB SPDK hugepages；其他系统进程内存上限28 GiB。所有配置、源代码版本、原始日志和三轮数值均保留。</p>'
page+='<p><a href="reproduction.txt">复现说明</a> · <a href="cloud-release.json">云资源释放状态</a> · <a href="results.csv">对比CSV</a> · <a href="results.json">完整数值JSON</a> · <a href="../v031-v5-benchmark/report.html">Lavik详细结果与原始记录</a> · <a href="../v031-v5-peers/audit.json">竞品结果复核</a> · <a href="../v031-v5-peers/failure-diagnosis.json">失败诊断</a> · <a href="../v031-v5-peers/source-lock.json">竞品版本与源代码校验</a> · <a href="../v031-v5-peers/scripts/run-all.py">竞品复现入口</a> · <a href="../v031-v5-benchmark/scripts/run-all.py">Lavik复现入口</a></p>'
page+='<p class="small">报告生成于 '+datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds')+'。本报告仅使用此次同一机器分配上的结果。</p></main></html>'
assert 'defrag' not in page.lower() and '回收次数' not in page
(out/'report.html').write_text(page)
(out/'SHA256SUMS').write_text(''.join(hashlib.file_digest((out/name).open('rb'),'sha256').hexdigest()+'  '+name+'\n' for name in ['report.html','results.csv','results.json','reproduction.txt']))
print(out/'report.html')
