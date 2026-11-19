import pathlib,json,re,sys
root=pathlib.Path(sys.argv[1]);rows=[]
for f in sorted(root.rglob('invocation.json')):
 inv=json.loads(f.read_text());a=inv.get('args',{})
 if a.get('phase')!='measure':continue
 intervals=[]
 for line in f.with_name('ycsb.log').read_text().splitlines():
  if ' sec: ' not in line:continue
  vals={}
  for op,part in re.findall(r'\[(READ|UPDATE): ([^]]+)\]',line):
   m=re.search(r'(?:^|, )99\.9=([0-9.]+)(?:,|$)',part)
   if m:vals[op]=float(m[1])
  if vals:intervals.append({'utc':line[:23],**vals})
 rows.append({'path':str(f.parent.relative_to(root)),'intervals':intervals,'intervals_with_any_p999_over_2ms':sum(max(v for k,v in x.items() if k!='utc')>2000 for x in intervals),'max_interval_read_p999_us':max((x.get('READ',0) for x in intervals),default=0),'max_interval_write_p999_us':max((x.get('UPDATE',0) for x in intervals),default=0)})
pathlib.Path(sys.argv[2]).write_text(json.dumps(rows,indent=2)+'\n');print('Extracted interval latencies:',len(rows),'measurement windows')
