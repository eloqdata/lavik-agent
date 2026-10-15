import pathlib,json,subprocess as sp
R=pathlib.Path('/opt/benchmark/large-objects-20261014')
points=[]
for p in (R/'results').glob('*/*/r*/c*.json'):
 if not p.stem[1:].isdigit():continue
 try:points.append({'path':str(p.relative_to(R)),**json.loads(p.read_text())})
 except json.JSONDecodeError:pass
summary={}
for row in points:
 product=row['path'].split('/')[1];summary[product]=summary.get(product,0)+1
print(json.dumps({'status':json.loads((R/'status.json').read_text()),'completed_points':len(points),'target':420,'by_product':summary,'smokes':[p.parent.name for p in (R/'smoke').glob('*/COMPLETE')],'recent_points':[{'path':p['path'],'ops_s':p['metrics']['OPERATIONS']['qps'],'p999_ms':p['metrics']['OPERATIONS']['p999_ms']} for p in sorted(points,key=lambda p:p['path'])[-5:]]},indent=2))
