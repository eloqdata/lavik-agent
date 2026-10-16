from pathlib import Path
import subprocess as sp,shlex
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'outputs/main-large-objects-c80-20261015';OUT.mkdir(parents=True,exist_ok=True)
SSH=['ssh','-o','ControlPath=none','-F','/Users/chen/Documents/Codex/2026-10-10/standard-l16aos-v4/work/ssh.conf']
for host,remote in [('client','/opt/benchmark/main-large-objects-c80-20261015'),('server','/mnt/dev/benchmark/main-large-objects-c80-20261015')]:
    # Exclude live datasets; only this experiment's scripts, commands and logs are here.
    # rsync-style incremental collection can be added after a point is complete.
    with (OUT/(host+'-archive.tar.gz')).open('wb') as f:
        sp.run(SSH+[host,'sudo tar --warning=no-file-changed --exclude=*.bin --exclude=bench --exclude=__pycache__ --exclude=sources --exclude=*.tar.gz -czf - -C '+shlex.quote(remote)+' .'],stdout=f,check=True)
print(OUT)
