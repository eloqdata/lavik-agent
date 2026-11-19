import pathlib,subprocess,json,time
root=pathlib.Path('/opt/bench');ssh=['ssh','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'-o','ConnectTimeout=15','bench@10.83.0.4']
for i in range(90):
 r=subprocess.run(ssh+['test','-f','/opt/bench/fio-v5-SHA256SUMS'],capture_output=True)
 if r.returncode==0:break
 fail=subprocess.run(ssh+['test','-f','/opt/bench/fio-v5-failure.txt'],capture_output=True)
 if fail.returncode==0:raise RuntimeError('fio screening failed to execute; inspect server logs')
 if i%3==0:print('Waiting for nine fio screening windows and timer restoration',flush=True)
 time.sleep(20)
else:raise RuntimeError('fio screen gate timeout')
fio=json.loads(subprocess.check_output(ssh+['cat','/opt/bench/fio-screen/complete.json'],text=True));assert fio['windows']==9
(root/'v031-v5-screen-gate.json').write_text(json.dumps(fio,indent=2)+'\n');assert fio['screen_pass'],('Mixed I/O screen failed; Lavik not started',fio)
subprocess.run(['scp','-q','-i',str(root/'server-key'),'-o','UserKnownHostsFile='+str(root/'server-known-hosts'),'bench@10.83.0.4:/opt/bench/fio-v5-evidence.tgz',str(root/'fio-v5-evidence.tgz')],check=True)
# Formal campaign uses exact same pinned YCSB source and original Java17 runtime.
print('FIO PASS; starting official Lavik v0.3.1 default SPDK campaign',flush=True)
subprocess.run(['python3',str(root/'v031-v5-kit/run-all.py')],check=True)
