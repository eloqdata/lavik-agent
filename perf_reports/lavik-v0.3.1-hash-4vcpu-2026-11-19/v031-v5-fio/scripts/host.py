#!/usr/bin/env python3
import pathlib,subprocess,json,time,os,sys,socket
assert os.geteuid()==0
root=pathlib.Path('/opt/bench/fio-v5-host');mode=sys.argv[1];host=socket.gethostname();prefix='bench-fio-v5-host';timers=['apt-daily','apt-daily-upgrade','fwupd-refresh','man-db','motd-news','update-notifier-download','update-notifier-motd','e2scrub_all','fstrim']
def active(n):return subprocess.run(['systemctl','is-active','--quiet',n],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
def run(cmd):return subprocess.run(cmd,check=True,capture_output=True,text=True)
if mode=='prepare':
 root.mkdir(exist_ok=False)
 state={'epoch':time.time(),'hostname':host,'timers':[{'unit':n+'.timer','was_active':active(n+'.timer')} for n in timers]};(root/'timers-before.json').write_text(json.dumps(state,indent=2)+'\n')
 for r in state['timers']:
  if r['was_active']:run(['systemctl','stop',r['unit']])
 for _ in range(300):
  busy=[n for n in timers if active(n+'.service')]
  if not busy:break
  time.sleep(1)
 else:raise RuntimeError('Maintenance services still busy: '+str(busy))
 for cmd in [['uname','-a'],['lscpu'],['free','-b'],['lsblk','-o','NAME,SIZE,MODEL,SERIAL,MOUNTPOINTS']]:
  (root/(cmd[0]+'.txt')).write_text(run(cmd).stdout)
 run(['systemd-run','--unit',prefix+'-sar','--collect','-p','StandardOutput=append:'+str(root/'sar.log'),'sar','-o',str(root/'resources.sar'),'1'])
 if host.startswith('bench-server-v5'):run(['systemd-run','--unit',prefix+'-pidstat','--collect','-p','StandardOutput=append:'+str(root/'pidstat.log'),'pidstat','-H','-u','-w','-p','ALL','5'])
 print('Prepared',host)
elif mode=='finish':
 state=json.loads((root/'timers-before.json').read_text())
 for unit in [prefix+'-sar',prefix+'-pidstat']:
  if active(unit):run(['systemctl','stop',unit])
 for r in state['timers']:
  if r['was_active']:run(['systemctl','start',r['unit']])
 rows=[dict(r,is_active=active(r['unit'])) for r in state['timers']];assert all(r['is_active']==r['was_active'] for r in rows)
 (root/'timers-restored.json').write_text(json.dumps({'epoch':time.time(),'timers':rows},indent=2)+'\n')
 with (root/'resources.json').open('w') as f:subprocess.run(['sadf','-j',str(root/'resources.sar'),'--','-u','ALL','-P','ALL','-r','-q','-w','-n','DEV'],stdout=f,check=True)
 with (root/'journal.log').open('w') as f:subprocess.run(['journalctl','--since','@'+str(int(state['epoch'])),'-o','short-iso'],stdout=f,check=True)
 run(['chown','-R','bench:bench',str(root)]);print('Restored and exported',host)
else:raise ValueError(mode)
