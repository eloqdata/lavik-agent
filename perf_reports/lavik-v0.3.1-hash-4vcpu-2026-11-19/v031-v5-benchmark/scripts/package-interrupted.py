import pathlib,subprocess,json,time,shutil
root=pathlib.Path('/opt/bench');out=root/'v031-v5-benchmark';scope=out/'v031-n100000000-default';partial=scope/'lavik/A-warmup';excluded=root/'v031-excluded'
assert subprocess.run(['systemctl','is-active','--quiet','bench-v031-v5-campaign'],capture_output=True).returncode!=0
if partial.exists():
 excluded.mkdir(exist_ok=True);dest=excluded/'user-fio-switch-100m-A-warmup';shutil.move(partial,dest);(dest/'exclusion.json').write_text(json.dumps({'epoch':time.time(),'reason':'User requested immediate fio validation and replacement machine if it fails. A warmup was interrupted before any A measurement. Completed C/B triplicates remain available.'},indent=2)+'\n')
(out/'interrupted.json').write_text(json.dumps({'epoch':time.time(),'completed_canonical_points':7,'completed_formal_windows':21,'not_run':'100M A','reason':'Explicit user priority: fio; replace server if fio reproduces issue.'},indent=2)+'\n')
kit=root/'v031-v5-kit';ssh=['ssh','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4']
for folder in [out,root/'v031-version-controls']:
 subprocess.run(['python3',str(kit/'audit-results.py'),str(folder),'--out',str(folder/'audit.json')],check=True)
 subprocess.run(['python3',str(kit/'audit-runtime.py'),str(folder),str(folder/'runtime-audit.json')],check=True)
 subprocess.run(['python3',str(kit/'client-headroom.py'),str(folder),'--sar',str(root/'v031-v5-host/resources.sar'),'--out',str(folder/'client-headroom.json')],check=True)
subprocess.run(ssh+['bash','-c',"'set -e; cd /opt/bench; sha256sum v031-release/lavik-v0.3.1-linux-x86_64/lavik > v031-release/binary-after.sha256; sudo tar czf v031-v5-server-evidence.tgz spdk-runs/v031-* v031-v5-host v031-v5-server-control.py v031-v5-host.py v031-release/help.txt v031-release/binary.sha256 v031-release/binary-after.sha256 v031-release/ldd.txt; sudo chown bench:bench v031-v5-server-evidence.tgz; sha256sum v031-v5-server-evidence.tgz'"],check=True)
subprocess.run(['scp','-q','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4:/opt/bench/v031-v5-server-evidence.tgz',str(root/'v031-v5-server-evidence.tgz')],check=True)
subprocess.run(['tar','czf',str(root/'v031-v5-client-evidence.tgz'),'-C',str(root),'v031-v5-benchmark','v031-v5-kit','v031-v5-host','v031-excluded','v031-v5-campaign.log','replacement-kit/verify.py'],check=True)
subprocess.run(['tar','czf',str(root/'v031-controls-client-evidence.tgz'),'-C',str(root),'v031-version-controls','v031-preflight-no-git','v031-v5-host-preflight','v031-preflight.log'],check=True)
s=subprocess.check_output(['sha256sum',str(root/'v031-v5-client-evidence.tgz'),str(root/'v031-v5-server-evidence.tgz'),str(root/'v031-controls-client-evidence.tgz')],text=True);(root/'v031-interrupted-SHA256SUMS').write_text(s);(root/'v031-interrupted-evidence-complete').touch();print(s,flush=True)
