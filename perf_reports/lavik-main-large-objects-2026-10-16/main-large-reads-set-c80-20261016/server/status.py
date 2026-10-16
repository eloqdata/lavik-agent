import subprocess as sp,shlex
SSH=['ssh','-o','ControlPath=none','-o','ConnectTimeout=15','-F','/Users/chen/Documents/Codex/2026-10-10/standard-l16aos-v4/work/ssh.conf']
code="""from pathlib import Path
import json,subprocess as sp
r=Path('/opt/benchmark/main-large-reads-set-c80-20261016')
state=json.loads((r/'status.json').read_text());print(state)
if state['message'].startswith('results/') and state['message'].endswith('/load'):
 op=state['message'].split('/')[2];expected=8192*{'hgetall':64,'zrange':256,'sswap':256,'smembers':256}[op]
 info=sp.check_output(['redis-cli','-h','10.84.1.4','--raw','INFO','stats'],text=True,timeout=15)
 n=int(next(x.split(':')[1] for x in info.splitlines() if x.startswith('total_commands_processed:')))
 print('LOAD APPROX commands',n,'/',expected,'=',round(n/expected*100,1),'percent')
print(sp.check_output(['systemctl','show',r.name,'-p','ActiveState','-p','Result'],text=True))
print('COMPLETE POINTS',len(list((r/'results').glob('*/*/r1/COMPLETE'))),'/16')
for p in sorted((r/'results').glob('*/*/r1/c80.json'),key=lambda p:p.stat().st_mtime)[-1:]:
 d=json.loads(p.read_text());print(str(p.relative_to(r)),d['metrics']['OPERATIONS'], 'validated', (p.parent/'COMPLETE').exists())
for p in r.glob('failure*.json'):print(p.name,p.read_text())
"""
sp.run(SSH+['client','sudo python3 -c '+shlex.quote(code)],check=True)
