import pathlib,subprocess,traceback
import argparse
a=argparse.ArgumentParser();a.add_argument('--confirm-discard',action='store_true');options=a.parse_args()
if not options.confirm_discard:a.error('Dedicated scratch disk will be erased; --confirm-discard required')
p=pathlib.Path('/opt/bench/fio-v5-kit')
try:
 subprocess.run(['python3',str(p/'host.py'),'prepare'],check=True)
 subprocess.run(['python3',str(p/'fio-screen.py'),'--confirm-discard'],check=True)
except BaseException:
 pathlib.Path('/opt/bench/fio-v5-failure.txt').write_text(traceback.format_exc());raise
finally:
 if pathlib.Path('/opt/bench/fio-v5-host/timers-before.json').exists():subprocess.run(['python3',str(p/'host.py'),'finish'],check=True)
subprocess.run(['tar','czf','/opt/bench/fio-v5-evidence.tgz','-C','/opt/bench','fio-screen','fio-v5-host','fio-v5-kit','new-host-identity'],check=True)
subprocess.run(['chown','bench:bench','/opt/bench/fio-v5-evidence.tgz'],check=True)
pathlib.Path('/opt/bench/fio-v5-SHA256SUMS').write_text(subprocess.check_output(['sha256sum','/opt/bench/fio-v5-evidence.tgz'],text=True))
