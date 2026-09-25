"""Execute repository-owned examples against the pinned real Lavik binary.

No generated shell is accepted. The agent can select an existing recipe ID only.
stdout is a machine-readable transcript; failure is never converted to a pass.
"""
import json
import os
import platform
import signal
import subprocess
import sys
import time
from pathlib import Path

recipe_id = sys.argv[1]
recipes = json.loads(Path('/verify/recipes.json').read_text())
recipe = next(item for item in recipes if item['id'] == recipe_id)
result = {'recipeId': recipe_id, 'platform': platform.platform(), 'steps': [], 'status': 'failed'}
server = None

def execute(argv, timeout=15):
    proc = subprocess.run(argv, capture_output=True, text=True, timeout=timeout)
    if proc.returncode:
        raise RuntimeError(f'{argv}: exit {proc.returncode}: {proc.stderr}')
    return proc.stdout.rstrip('\n')

def start_server(log):
    proc = subprocess.Popen(['bash', '/verify/start.sh'], stdout=log, stderr=subprocess.STDOUT)
    for _ in range(150):
        if proc.poll() is not None:
            raise RuntimeError('Lavik stopped during startup')
        try:
            if execute(['redis-cli', '--raw', 'PING'], 1) == 'PONG':
                return proc
        except (RuntimeError, subprocess.TimeoutExpired):
            pass
        time.sleep(.1)
    proc.kill()
    proc.wait()
    raise RuntimeError('Lavik did not become ready in 15 seconds')

def stop_server(proc):
    # The published foreground command deliberately does not replace the user's
    # shell with exec. Signal the binary, then let Bash reap it and report status.
    children = Path(f'/proc/{proc.pid}/task/{proc.pid}/children').read_text().split()
    targets = [int(pid) for pid in children
               if Path(f'/proc/{pid}/exe').resolve() == Path.cwd() / 'lavik']
    if not targets and Path(f'/proc/{proc.pid}/exe').resolve() == Path.cwd() / 'lavik':
        targets = [proc.pid]
    if len(targets) != 1:
        raise RuntimeError('Expected exactly one foreground Lavik process')
    os.kill(targets[0], signal.SIGTERM)
    if proc.wait(timeout=30) != 0:
        raise RuntimeError('Unclean shutdown')

try:
    # Keep the shared image's PATH for other manual harnesses. Only this recipe
    # models a fresh unpacked package, where users must enter its directory and
    # invoke ./lavik explicitly. Matrix containers already start in that folder.
    if not Path('lavik').is_file() and Path('/opt/lavik/lavik').is_file():
        os.chdir('/opt/lavik')
    os.environ['PATH'] = os.pathsep.join(
        entry for entry in os.environ['PATH'].split(os.pathsep)
        if Path(entry).resolve() != Path.cwd()
    )
    result['binaryVersion'] = execute(['./lavik', '--version'])
    if subprocess.run(['bash', '-c', 'command -v lavik'], capture_output=True).returncode == 0:
        raise RuntimeError('Test must not hide missing executable paths with a preconfigured PATH')
    result['executableOnPath'] = False
    result['workingDirectory'] = str(Path.cwd())
    result['sourceCommit'] = Path('REVISION').read_text().strip()
    result['packageVersion'] = Path('VERSION').read_text().strip()
    if result['sourceCommit'] != os.environ['EXPECTED_COMMIT']:
        raise RuntimeError('Package commit does not match the release lock')
    if result['packageVersion'].lstrip('v') != os.environ['EXPECTED_RELEASE']:
        raise RuntimeError('Package version does not match the release lock')
    if result['binaryVersion'] != 'lavik ' + os.environ['EXPECTED_RELEASE']:
        raise RuntimeError('Binary version does not match the release lock')
    with open('/tmp/server.log', 'w') as log:
        server = start_server(log)
        for step in recipe['steps']:
            if step['argv'][0] != 'redis-cli':
                raise RuntimeError('Only the installed redis-cli executable is permitted in recipes')
            actual = execute(step['argv'])
            result['steps'].append({'argv': step['argv'], 'expected': step['expected'], 'actual': actual})
            if actual != step['expected']:
                raise AssertionError(f"Expected {step['expected']!r}, received {actual!r}")
        # Check a graceful restart separately; this is not a crash-durability test.
        execute(['redis-cli', '--raw', 'SET', 'verification:restart', 'retained'])
        stop_server(server)
        server = start_server(log)
        if execute(['redis-cli', '--raw', 'GET', 'verification:restart']) != 'retained':
            raise AssertionError('Value missing after graceful restart')
        result['gracefulRestart'] = 'passed'
        stop_server(server)
        result['status'] = 'passed'
except Exception as error:
    result['error'] = str(error)
finally:
    if server is not None and server.poll() is None:
        server.kill()
        server.wait()
    if result['status'] != 'passed' and Path('/tmp/server.log').exists():
        result['serverLog'] = Path('/tmp/server.log').read_text()[-12000:]
        for logfile in Path('/tmp/lavik-example/logs').glob('*.log'):
            result['serverLog'] += logfile.read_text()[-12000:]
    print(json.dumps(result, ensure_ascii=False))
sys.exit(0 if result['status'] == 'passed' else 1)
