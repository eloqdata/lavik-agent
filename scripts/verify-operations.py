"""Verify the published beta.1 operator guide in bounded Docker; never reads repo .env."""
import base64
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import time
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
CACHE = ROOT / '.cache/ctl-docs/final'
CACHE.mkdir(parents=True, exist_ok=True)
lock = json.loads((ROOT / 'content/releases/0.1.0.json').read_text())
assets = json.loads((ROOT / 'content/downloads/0.1.0.json').read_text())['assets']
arch = {'arm64': 'aarch64', 'aarch64': 'aarch64', 'x86_64': 'x86_64', 'AMD64': 'x86_64'}[platform.machine()]

def digest(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def inputs():
    paths = ['scripts/verify-operations.py'] + [str(p) for p in Path('verification/operations').rglob('*') if p.is_file()]
    return {p: digest(p) for p in sorted(paths)}
before = inputs()

def command(argv, timeout=300, stdout=True, input=None):
    p = subprocess.run(argv, cwd=ROOT, text=True, input=input, capture_output=True, timeout=timeout)
    if p.returncode:
        raise RuntimeError(f'{argv[0:3]}: {p.stderr[-2500:]} {p.stdout[-2500:]}')
    return p.stdout if stdout else p

def dexec(name, argv, **kwargs): return command(['docker', 'exec', name, *argv], **kwargs)

def monitor(name):
    """Use the upstream stack plus the displayed loopback override, isolated from host ports."""
    directory = CACHE / ('monitor-' + uuid.uuid4().hex[:8])
    directory.mkdir()
    # Execute the exact download snippet in its own new directory, never the repo root.
    p = subprocess.run(['bash', '-euo', 'pipefail', '-c', 'umask 077; source "$1"', 'monitor-download', str(ROOT / 'verification/operations/snippets/monitor-download.sh')], cwd=directory, capture_output=True, text=True, timeout=120)
    if p.returncode: raise RuntimeError(p.stderr)
    directory /= 'lavik-monitoring-beta1'
    inventory = json.loads(Path('evidence/operations/0.1.0/sources.json').read_text())
    checked = {}
    for source in inventory['sources']:
        if source['path'].startswith('deploy/monitoring/'):
            relative = source['path'].removeprefix('deploy/monitoring/')
            assert digest(directory / relative) == source['sha256'], relative
            checked[relative] = source['sha256']
    subprocess.run(['bash', '-euo', 'pipefail', str(ROOT / 'verification/operations/snippets/monitor-config-ha.sh')], cwd=directory, check=True)
    # Generate and validate the exact published Linux host-network override.
    # Replace docker only for this generation pass; actual Compose invocations follow.
    snippet = Path('verification/operations/snippets/monitor-local.sh').read_text()
    config_script = snippet[:snippet.index('# --quiet')]
    subprocess.run(['bash', '-euo', 'pipefail'], input=config_script, cwd=directory, text=True, check=True)
    assert (directory / '.env').stat().st_mode & 0o777 == 0o600
    project = 'lavik-ctl-' + uuid.uuid4().hex[:10]
    common = ['docker', 'compose', '--project-name', project, '--project-directory', str(directory), '--env-file', str(directory / '.env'), '-f', str(directory / 'compose.yaml'), '-f', str(directory / 'compose.local.yaml')]
    command([*common, 'config', '--quiet'])
    # Share the fixture's loopback namespace, not the Mac/VM host network. No host ports.
    isolated = directory / 'compose.test.yaml'
    isolated.write_text(f'services:\n  prometheus:\n    network_mode: "container:{name}"\n    extra_hosts: !reset []\n  grafana:\n    network_mode: "container:{name}"\n    extra_hosts: !reset []\n')
    compose = [*common, '-f', str(isolated)]
    result = {'status': 'failed', 'downloadUmask': '077', 'credentialsMode': '0600', 'upstreamFiles': checked, 'composeVersion': command(['docker', 'compose', 'version', '--short']).strip(), 'networkScope': 'Published Linux host-network override validated; runtime uses one isolated Docker network namespace in place of host networking. No host ports exposed.'}
    try:
        command([*compose, 'up', '-d'], timeout=180)
        command([*compose, 'ps'])
        credentials = dict(line.split('=', 1) for line in (directory / '.env').read_text().splitlines())
        # Do not emit the random test password or full Compose configuration.
        auth = base64.b64encode(('admin:' + credentials['GRAFANA_ADMIN_PASSWORD']).encode()).decode()
        def request(url, authenticated=False):
            code = 'import json,sys,urllib.request; x=json.load(sys.stdin); r=urllib.request.Request(x["url"],headers=x["headers"]); print(urllib.request.urlopen(r,timeout=10).read().decode())'
            p = subprocess.run(['docker', 'exec', '-i', name, 'python3', '-c', code], input=json.dumps({'url': url, 'headers': {'Authorization': 'Basic ' + auth} if authenticated else {}}), text=True, capture_output=True, timeout=20)
            if p.returncode: raise RuntimeError(p.stderr[-1000:])
            return json.loads(p.stdout)
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            try:
                health = request('http://127.0.0.1:3000/api/health')
                targets = request('http://127.0.0.1:9090/api/v1/targets')['data']['activeTargets']
                if health['database'] == 'ok' and len(targets) == 2 and all(t['health'] == 'up' for t in targets): break
            except (RuntimeError, KeyError): pass
            time.sleep(1)
        else: raise RuntimeError('Grafana or both Prometheus targets did not become healthy')
        dashboard = request('http://127.0.0.1:3000/api/dashboards/uid/lavik-overview', True)['dashboard']
        datasource = request('http://127.0.0.1:3000/api/datasources/uid/prometheus/health', True)
        query = request('http://127.0.0.1:9090/api/v1/query?query=up%7Bjob%3D%22lavik%22%7D')
        assert len(query['data']['result']) == 2
        assert all(v['value'][1] == '1' for v in query['data']['result'])
        assert dashboard['uid'] == 'lavik-overview' and dashboard['panels']
        assert datasource['status'] == 'OK'
        result.update({'status': 'passed', 'grafanaHealth': health, 'dashboard': {'uid': dashboard['uid'], 'title': dashboard['title'], 'panels': len(dashboard['panels'])}, 'datasourceHealth': datasource, 'targets': [{'scrapeUrl': t['scrapeUrl'], 'health': t['health'], 'lastError': t['lastError']} for t in targets], 'upQuery': query['data']['result']})
        # Change discovery to one target, then restore both; require each actual
        # one-shot generator exit and Prometheus observation, not submission.
        result['targetRefresh'] = []
        original_env = (directory / '.env').read_text()
        for wanted in [['127.0.0.1:9101'], ['127.0.0.1:9101', '127.0.0.1:9102']]:
            changed_env = '\n'.join('LAVIK_TARGETS=' + ','.join(wanted) if line.startswith('LAVIK_TARGETS=') else line for line in original_env.splitlines()) + '\n'
            (directory / '.env').write_text(changed_env)
            command([*compose, 'up', '--force-recreate', '--exit-code-from', 'target-config', 'target-config'])
            generator_id = command([*compose, 'ps', '-aq', 'target-config']).strip()
            state = json.loads(command(['docker', 'inspect', generator_id]))[0]['State']
            assert state['Status'] == 'exited' and state['ExitCode'] == 0
            expected_urls = sorted('http://' + target + '/metrics' for target in wanted)
            deadline = time.monotonic() + 65
            while time.monotonic() < deadline:
                discovered = request('http://127.0.0.1:9090/api/v1/targets')['data']['activeTargets']
                if sorted(t['scrapeUrl'] for t in discovered) == expected_urls and all(t['health'] == 'up' for t in discovered): break
                time.sleep(1)
            else: raise RuntimeError('Prometheus did not discover refreshed healthy targets')
            result['targetRefresh'].append({'requested': wanted, 'generatorStatus': state['Status'], 'generatorExitCode': state['ExitCode'], 'targets': [{'scrapeUrl': t['scrapeUrl'], 'health': t['health'], 'lastError': t['lastError']} for t in discovered]})
        result['images'] = {service: json.loads(command(['docker', 'image', 'inspect', image]))[0]['RepoDigests'] for service, image in [('prometheus', 'prom/prometheus:v3.11.3'), ('grafana', 'grafana/grafana:13.1.0'), ('busybox', 'busybox:1.37.0')]}
        return result
    finally:
        # These are only this test's fresh named volumes, never the user's stack.
        command([*compose, 'down', '--volumes', '--remove-orphans'])
        (directory / '.env').unlink(missing_ok=True)

reports = []
monitoring = None
for variant in ('minimal', 'standard'):
    filename = f'lavik-{lock["tag"]}-linux-{arch}' + ('-minimal' if variant == 'minimal' else '') + '.tar.gz'
    asset = next(a for a in assets if a['name'] == filename)
    archive = ROOT / '.cache' / filename
    if not archive.exists(): urllib.request.urlretrieve(asset['browser_download_url'], archive)
    expected = asset['digest'].removeprefix('sha256:')
    assert digest(archive) == expected
    context = CACHE / ('image-' + variant)
    shutil.copytree('verification/operations', context, dirs_exist_ok=True)
    shutil.copyfile(archive, context / 'package.tar.gz')
    image = 'lavik-operations:' + variant
    build = command(['docker', 'build', '--build-arg', 'ARCHIVE_SHA256=' + expected, '-t', image, str(context)], timeout=600)
    (CACHE / (variant + '-build.log')).write_text(build)
    image_id = command(['docker', 'image', 'inspect', image, '--format', '{{.Id}}']).strip()
    for layout in ('single', 'ha'):
        name = 'lavik-ops-' + uuid.uuid4().hex[:12]
        hold = variant == 'minimal' and layout == 'ha'
        args = ['docker', 'run', '-d', '--name', name, '--network=none', '--add-host', 'prometheus:127.0.0.1', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--security-opt=seccomp=unconfined', '--memory=4g', '--cpus=4', '--pids-limit=256', '--ulimit', 'memlock=536870912:536870912', '--tmpfs', '/tmp:rw,exec,nosuid,nodev,size=2g', '-e', 'EXPECTED_COMMIT=' + lock['commit'], '-e', 'LAVIK_MONITOR_HOLD=' + ('1' if hold else '0'), image_id, layout]
        try:
            command(args)
            if hold:
                deadline = time.monotonic() + 160
                while time.monotonic() < deadline:
                    if command(['docker', 'inspect', name, '--format', '{{.State.Running}}']).strip() != 'true': raise RuntimeError(command(['docker', 'logs', name])[-3000:])
                    exists = command(['docker', 'exec', name, 'sh', '-c', 'test -f /tmp/monitor-ready && echo ready || true']).strip()
                    if exists == 'ready': break
                    if command(['docker', 'inspect', name, '--format', '{{.State.Running}}']).strip() != 'true': raise RuntimeError(command(['docker', 'logs', name])[-3000:])
                    time.sleep(1)
                else: raise RuntimeError('Fixture did not become ready for monitoring')
                monitoring = monitor(name)
                dexec(name, ['touch', '/tmp/monitor-done'])
            exit_code = command(['docker', 'wait', name], timeout=600).strip()
            raw = command(['docker', 'logs', name])
            (CACHE / f'{variant}-{layout}.json').write_text(raw)
            execution = json.loads(raw)
            assert exit_code == '0' and execution['status'] == 'passed', f'{variant}/{layout} failed; inspect private report'
            reports.append({'variant': variant, 'arch': arch, 'filename': filename, 'sha256': expected, 'imageId': image_id, 'dockerArgv': args, 'execution': execution})
            print(f'{variant}/{layout}: passed', flush=True)
        finally:
            (CACHE / f'{variant}-{layout}-last.log').write_text(command(['docker', 'logs', name]))
            command(['docker', 'rm', '-f', name])
assert before == inputs(), 'Inputs changed during execution'
assert monitoring and monitoring['status'] == 'passed'
report = {'release': lock['release'], 'sourceCommit': lock['commit'], 'verifiedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'nativeArch': arch, 'fileHashes': before, 'scope': 'Native Linux Docker, both package variants, co-located Meta/Data processes using kernel TCP/io_uring. Creation, client operations, metrics, leader reads, controlled failover, graceful restart and automatic failover. Grafana/Prometheus use an isolated shared network namespace instead of the Linux host. No SPDK, real host/network partition, TLS, SLA, power-loss or post-crash node-rejoin certification.', 'packages': reports, 'monitoring': monitoring}
Path('evidence/operations/0.1.0/verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print('Recorded verified operator-guide evidence.', flush=True)
