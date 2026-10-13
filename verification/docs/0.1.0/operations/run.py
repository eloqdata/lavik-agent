"""Execute the exact published 0.1.0 snippets inside a disposable Linux container."""
import json
import hashlib
import os
import platform
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.request

layout = sys.argv[1]
assert layout in ('single', 'ha')
package = Path('/tmp/package')
shutil.copytree('/opt/lavik', package)
root = package / (layout + '-stable')
env = {**os.environ, 'LAVIK_BIN_DIR': str(package), 'LAVIK_ROOT': str(root)}
report = {'layout': layout, 'platform': platform.platform(), 'sourceCommit': os.environ['EXPECTED_COMMIT'], 'status': 'failed', 'steps': []}

def run(argv, expected=0, timeout=150, record=True, stdin=None):
    p = subprocess.run(argv, cwd=package, env=env, text=True, input=stdin, capture_output=True, timeout=timeout)
    step = {'argv': argv, 'exitCode': p.returncode, 'stdout': p.stdout.strip(), 'stderr': p.stderr.strip()}
    if stdin is not None:
        step['stdin'] = stdin
    if record:
        report['steps'].append(step)
    if expected is not None and p.returncode != expected:
        raise RuntimeError(json.dumps(step))
    return step

def snippet(name, expected=0):
    return run(['bash', '-euo', 'pipefail', '/verification/snippets/' + name + '.sh'], expected)

def cli(*args, record=True, expected=0):
    return run([str(package / 'lavik-ctl'), *args], expected=expected, record=record)

def leader_socket():
    for i in range(1, (1 if layout == 'single' else 3) + 1):
        socket = str(root / f'meta-{i}/meta-admin.sock')
        reply = cli('--socket', socket, 'status', record=False, expected=None)
        if reply['exitCode'] == 0 and 'leader=1' in reply['stdout']:
            return socket
    raise RuntimeError('No leader found')

def wait_value(port, key='greeting', expected='hello from Lavik'):
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        result = run(['redis-cli', '-c', '-h', '127.0.0.1', '-p', str(port), '--raw', 'GET', key], record=False)
        if result['stdout'] == expected:
            report['steps'].append(result)
            return
        time.sleep(.5)
    raise RuntimeError('Expected value unavailable: ' + json.dumps(result))

def current_status():
    result = cli('cluster-status', '--socket', str(root / 'meta-1/meta-admin.sock'), '--allow-plaintext-admin', '--json', expected=None, record=False)
    if result['exitCode'] not in (0, 2, 3):
        raise RuntimeError(json.dumps(result))
    return json.loads(result['stdout'])

try:
    assert Path('/opt/lavik/REVISION').read_text().strip() == os.environ['EXPECTED_COMMIT']
    version = snippet('versions')['stdout']
    lines = version.splitlines()
    assert len(lines) == 3
    assert lines[0] == 'lavik 0.1.0'
    assert lines[1].startswith('lavik-meta 0.1.0')
    assert lines[2] == 'lavik-ctl 0.1.0'
    cli('--help')
    cli('start', expected=1)
    snippet(layout + '-init')
    snippet(layout + '-start')
    snippet('wait-meta')
    snippet('create')
    snippet('wait-ready')
    status = json.loads(snippet('status')['stdout'])
    report['initialStatus'] = status
    if layout == 'ha':
        snippet('wait-follower')
    client = snippet(layout + '-client')['stdout']
    assert 'hello from Lavik' in client
    if layout == 'ha':
        assert client.splitlines()[:3] == ['OK', '1', 'hello from Lavik']
    else:
        assert client.splitlines()[:2] == ['OK', 'hello from Lavik']
    snippet('inspect')
    snippet('leader-reads')
    report['metrics'] = []
    metric_command = run(['bash', '-euo', 'pipefail', f'/verification/snippets/metrics-{layout}.sh'], record=False)
    report['metricCommand'] = {**{k: v for k, v in metric_command.items() if k != 'stdout'}, 'stdoutSha256': hashlib.sha256(metric_command['stdout'].encode()).hexdigest()}
    for port in ([9101] if layout == 'single' else [9101, 9102]):
        text = urllib.request.urlopen(f'http://127.0.0.1:{port}/metrics', timeout=10).read().decode()
        assert 'lavik_cluster_control_connected 1' in text
        assert 'lavik_commands_total' in text
        report['metrics'].append({'port': port, 'samples': [line for line in text.splitlines() if line.startswith(('lavik_cluster_control_connected ', 'lavik_commands_total', 'lavik_connected_clients '))]})
    # Hold only the isolated HA fixture for the monitoring coordinator. It shares
    # this disposable network namespace instead of the developer's host network.
    if os.environ.get('LAVIK_MONITOR_HOLD') == '1':
        Path('/tmp/monitor-ready').write_text('ready')
        deadline = time.monotonic() + 240
        while not Path('/tmp/monitor-done').exists():
            if time.monotonic() >= deadline:
                raise RuntimeError('Monitoring coordinator timed out')
            time.sleep(.5)
    if layout == 'ha':
        result = snippet('failover')['stdout']
        match = re.search(r'operation=([^\s]+)', result)
        assert match, result
        operation = match.group(1)
        env['LAVIK_LEADER_SOCKET'] = leader_socket()
        env['LAVIK_OPERATION_ID'] = operation
        snippet('follow-operation')
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            reply = cli('--socket', leader_socket(), 'getop', operation, record=False)
            if reply['stdout'].startswith('OK completed'):
                report['controlledFailover'] = reply
                break
            if reply['stdout'].startswith('OK aborted'):
                raise RuntimeError(reply['stdout'])
            time.sleep(.5)
        else:
            raise RuntimeError('Failover did not complete')
        snippet('wait-ready')
        report['afterFailover'] = json.loads(snippet('status')['stdout'])
        assert report['afterFailover']['groups'][0]['owner_node_id'] == '2' * 40
        wait_value(6372)
        # The former owner may still be reparenting after the new owner serves.
        # Confirm replication on the current owner before this isolated crash drill.
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            ack = run(['redis-cli', '-h', '127.0.0.1', '-p', '6372', '--raw'], stdin='SET crash-probe replicated\nWAIT 1 5000\n', record=False)
            if ack['stdout'] == 'OK\n1':
                report['steps'].append(ack)
                break
            time.sleep(.5)
        else:
            raise RuntimeError('Former primary did not synchronize before the crash drill')
    snippet('stop')
    snippet(layout + '-start')
    snippet('wait-meta')
    snippet('wait-ready')
    status = current_status()
    owner = status['groups'][0]['owner_node_id']
    wait_value(6370 + int(owner[0]))
    report['gracefulRestart'] = 'passed'
    if layout == 'ha':
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            ack = run(['redis-cli', '-h', '127.0.0.1', '-p', str(6370 + int(owner[0])), '--raw'], stdin='SET crash-probe replicated\nWAIT 1 5000\n', record=False)
            if ack['stdout'] == 'OK\n1':
                report['steps'].append(ack)
                break
            time.sleep(.5)
        else:
            raise RuntimeError('Replication did not converge after graceful restart')
        pid = int((root / f'data-{owner[0]}.pid').read_text())
        assert Path(f'/proc/{pid}/exe').resolve() == package / 'lavik'
        os.kill(pid, signal.SIGKILL)
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            observed = current_status()
            group = observed.get('groups', [{}])[0]
            if group.get('owner_node_id') != owner and group.get('owner_node_id') in ['1' * 40, '2' * 40] and group.get('serving_ready'):
                report['automaticFailover'] = {'signal': 'SIGKILL', 'failedNode': owner, 'status': observed}
                break
            time.sleep(.5)
        else:
            raise RuntimeError('Automatic failover did not produce a serving primary')
        wait_value(6370 + int(group['owner_node_id'][0]), 'crash-probe', 'replicated')

    snippet('stop')
    report['status'] = 'passed'
except Exception as error:
    report['error'] = str(error)
    report['logs'] = {str(p.relative_to(root)): p.read_text(errors='replace')[-12000:] for p in root.rglob('*.log')}
finally:
    print(json.dumps(report, ensure_ascii=False))
sys.exit(0 if report['status'] == 'passed' else 1)
