#!/usr/bin/env python3
import pathlib,subprocess,time
root=pathlib.Path('/opt/bench');kit=root/'v031-v5-kit';controls=root/'v031-version-controls'
for _ in range(720):
 if subprocess.run(['systemctl','is-active','--quiet','bench-v031-v5-campaign'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0:break
 time.sleep(10)
assert (root/'v031-v5-evidence-complete').exists(),'Main campaign incomplete; control evidence retained unmodified'
if not controls.exists():print('No diagnostic controls were needed');raise SystemExit(0)
subprocess.run(['python3',str(kit/'audit-results.py'),str(controls),'--out',str(controls/'audit.json')],check=True)
subprocess.run(['python3',str(kit/'audit-runtime.py'),str(controls),str(controls/'runtime-audit.json')],check=True)
subprocess.run(['python3',str(kit/'client-headroom.py'),str(controls),'--sar',str(root/'v031-v5-host/resources.sar'),'--out',str(controls/'client-headroom.json')],check=True)
subprocess.run(['tar','czf',str(root/'v031-controls-client-evidence.tgz'),'-C',str(root),'v031-version-controls','v031-preflight-no-git','v031-v5-host-preflight','v031-preflight.log'],check=True)
s=subprocess.check_output(['sha256sum',str(root/'v031-controls-client-evidence.tgz')],text=True);(root/'v031-controls-SHA256SUMS').write_text(s);(root/'v031-controls-evidence-complete').touch();print(s,flush=True)
