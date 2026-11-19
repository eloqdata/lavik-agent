import pathlib,json,html,statistics,sys
root=pathlib.Path(sys.argv[1]);a=json.loads((root/'audit.json').read_text());rt=json.loads((root/'runtime-audit.json').read_text());hardware=json.loads((root/'hardware.json').read_text())
assert a['valid_points']==8 and a['valid_measurement_windows']==24 and rt['validated_windows']==24
assert not a['invalid_or_interrupted'] and not a['incomplete_points'] and not a['failed_warmups']
labels={'C':'纯读','B':'95:5','A':'50:50','B-mature':'95:5（持续更新后）','A-mature':'50:50（持续更新后）'}
rows=[]
for r in sorted(a['summary'],key=lambda r:(r['records'],list(labels).index(r['label']))):
 w=[x for x in rt['windows'] if x['scope']==r['scope'] and x['label'] in [r['label']+'-r'+str(i) for i in [1,2,3]]];assert len(w)==3
 wp='—' if r['update_p999_us'] is None else f"{r['update_p999_us']/1000:.3f}"
 rows.append(f"<tr><td>{r['records']/1e6:g}M</td><td>{labels[r['label']]}</td><td>{r['mean_qps']:,.0f}</td><td>{r['read_p999_us']/1000:.3f}</td><td>{wp}</td></tr>")
ht='<tr>'+''.join('<th>'+x+'</th>' for x in ['记录数','负载（读:写）','QPS','读 p999（ms）','写 p999（ms）'])+'</tr>'
text='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lavik v0.3.1 复测</title><style>body{font:16px/1.65 system-ui,sans-serif;color:#17283a;background:#f6f8fa;margin:0;padding:40px}main{max-width:1120px;margin:auto}h1{font-size:30px}table{border-collapse:collapse;background:white;width:100%;font-variant-numeric:tabular-nums}th,td{text-align:left;border-bottom:1px solid #dde3e9;padding:12px}th{background:#e9f0f7}code{background:#e8edf2;padding:2px 5px}a{color:#155aa3}.note{padding:15px;background:#fff;border-left:4px solid #1c73aa}.small{font-size:14px;color:#4c5b69}</style><main><h1>Lavik v0.3.1 复测</h1>'''
text+=f"<p>服务端 <b>{html.escape(hardware['server_sku'])}</b>，4 vCPU / 32 GiB，单块本地 NVMe、原生 SPDK。客户端 <b>{html.escape(hardware['client_sku'])}</b>，16 vCPU / 32 GiB。</p>"
text+='<p>8 个测试点、24 个有效测量窗口。每点先预热 60 秒，再测量 3 × 60 秒；128 个压测连接，不限速。每条记录 8 个字段 × 128 B，均匀访问，HGETALL 读取、LAVIK.HREPLACE 整条更新，关闭YCSB扫描索引。</p>'
text+='<p class="note">使用 v0.3.1，4 个 worker、24 GiB 引擎内存上限；后台参数保持发布版本默认值。QPS 和 p999 均为三次测量值的算术平均；p999 并非合并全部请求后重算的百分位。两组“持续更新后”在 10M 基础 C/B/A 后额外进行 300 秒 50:50 更新，再分别预热和测量。</p>'
text+='<table>'+ht+''.join(rows)+'</table>'
text+='<p class="small">同一机器的竞品结果见<a href="../v031-v5-comparison/report.html">完整对比报告</a>。</p>'
text+='<p>原始数据和校验：<a href="audit.json">结果复核</a> · <a href="runtime-audit.json">运行配置与命令计数复核</a> · <a href="hardware.json">硬件记录</a> · <a href="client-evidence.tgz">客户端原始记录</a> · <a href="server-evidence.tgz">服务端原始记录</a></p></main></html>'
(root/'report.html').write_text(text)
print(root/'report.html')
