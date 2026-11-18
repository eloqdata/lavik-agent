import subprocess,time
ssh=['ssh','-i','/opt/bench/server-key','-o','UserKnownHostsFile=/opt/bench/server-known-hosts','bench@10.83.0.4']
while subprocess.run(ssh+['systemctl','is-active','--quiet','bench-alignment-followup']).returncode==0:time.sleep(10)
subprocess.run(['python3','/opt/bench/aerospike-kit/campaign.py'],check=True)
