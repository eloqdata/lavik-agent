import pathlib,json,html
p=pathlib.Path(__file__).resolve().parent.parent;f=p/'report.html';s=f.read_text();a=json.loads((p/'controls-audit.json').read_text());rt=json.loads((p/'controls-runtime-audit.json').read_text());parts=[]
for r in sorted(a['summary'],key=lambda x:x['scope']):
 version='v0.3.0' if 'v030' in r['scope'] else 'v0.3.1';gc=[x['gc_success_during_sampled_window'] for x in rt['windows'] if x['scope']==r['scope']];parts.append('<tr>'+''.join('<td>'+v+'</td>' for v in [version,f"{r['mean_qps']:,.0f}",f"{r['read_p999_us']/1000:.3f} ms",f"{r['update_p999_us']/1000:.3f} ms",' / '.join(str(int(x)) for x in gc)])+'</tr>')
section='<h2>95:5 异常：同数据版本对照</h2><p>1000 万条基础与成熟数据测试出现低吞吐后，在同一批数据上先运行官方 v0.3.0，再运行官方 v0.3.1；各预热 60 秒、测量 3×60 秒，每次切换前正常停止数据库，不重新灌入数据。两版均使用默认 defrag 参数。这些诊断对照与主表的八个点分别统计。</p><table><tr><th>版本</th><th>QPS</th><th>读 p999</th><th>写 p999</th><th>三轮成功 defrag</th></tr>'+''.join(parts)+'</table><p>两版都出现了明显低吞吐，因此不能把此次异常只归因于升级 v0.3.1。顺序测量期间数据仍有更新，物理布局和设备状态也可能变化，这不是完全相同状态的随机交错版本实验。</p>'
trace=p/'trace-analysis.json'
if trace.exists():
 data=json.loads(trace.read_text());tr=[]
 for group in data:
  for command,row in group['commands'].items():
   tr.append('<li>'+html.escape(command)+f"：保留 {row['retained_samples']} 条采样慢请求；平均 read_io / 请求总耗时为 {row['mean_read_io_fraction']*100:.1f}%，平均总耗时 {row['mean_total_us']/1000:.3f} ms。"+'</li>')
 if tr:section+='<p>在新版正式三轮结束后，额外采集 30 秒诊断，随后恢复诊断开关和原配置；这段不计入任何正式均值。</p><ul>'+''.join(tr)+'</ul><p>这些是筛选过的慢请求样本，不代表全量延迟分布。read_io 包含 I/O 完成和协程恢复等待，不能据此单独判断是 NVMe 硬件、后端轮询还是调度问题；本轮不宣称已定位唯一根因。</p>'
section+='<p><a href="controls-audit.json">版本对照独立审计</a> · <a href="controls-runtime-audit.json">版本与参数核验</a> · <a href="trace-analysis.json">采样慢请求阶段分析</a> · <a href="controls-client-evidence.tgz">对照客户端原始记录</a></p>'
s=s.replace('<h2>与此前 v0.3.0 同机结果对照</h2>',section+'<h2>与此前 v0.3.0 同机结果对照</h2>');f.write_text(s);print('Annotated diagnostic controls')
