import subprocess as sp,shlex
SSH=['ssh','-o','ControlPath=none','-o','ConnectTimeout=15','-F','/Users/chen/Documents/Codex/2026-10-10/standard-l16aos-v4/work/ssh.conf']
code="""from pathlib import Path
import json,subprocess as sp
r=Path('/opt/benchmark/main-large-objects-c80-20261015')
print((r/'status.json').read_text())
print(sp.check_output(['systemctl','show',r.name,'-p','ActiveState','-p','Result'],text=True))
for p in sorted((r/'results').glob('*/*/r1/c80.json')):
 d=json.loads(p.read_text());print(str(p.relative_to(r)),d['metrics']['OPERATIONS'], 'validated', (p.parent/'COMPLETE').exists())
for p in r.glob('failure*.json'):print(p.name,p.read_text())
"""
sp.run(SSH+['client','sudo python3 -c '+shlex.quote(code)],check=True)
