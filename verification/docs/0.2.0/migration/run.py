"""Disposable Docker rehearsal of the published RedisShake configurations.

Only loopback fixtures with literal throwaway passwords. No host ports or .env.
"""
import binascii
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request

SOURCE_PASSWORD = 'replace-source-password'
TARGET_PASSWORD = 'replace-target-password'
source_cluster, target_cluster = [arg == 'cluster' for arg in sys.argv[1:3]]
root = Path('/tmp/migration')
root.mkdir()
processes = []
connections = []
report = {'status': 'failed', 'source': 'cluster' if source_cluster else 'single',
          'target': 'cluster' if target_cluster else 'single',
          'sourceCommit': os.environ['EXPECTED_COMMIT'], 'redisVersion': '7.2.14',
          'redisShakeVersion': '4.6.2', 'checks': []}

class Resp:
    def __init__(self, port, password, redirect=True):
        self.port, self.password, self.redirect = port, password, redirect
        self.socket = socket.create_connection(('127.0.0.1', port), timeout=10)
        self.file = self.socket.makefile('rb')
        connections.append(self)
        assert self.command('AUTH', password) == b'OK'

    def read(self):
        kind = self.file.read(1)
        if not kind: raise EOFError('Connection closed')
        data = self.file.readline().removesuffix(b'\r\n')
        if kind == b'+': return data
        if kind == b'-': raise RuntimeError(data.decode())
        if kind == b':': return int(data)
        if kind == b'$':
            n = int(data)
            if n < 0: return None
            value = self.file.read(n)
            assert self.file.read(2) == b'\r\n'
            return value
        if kind == b'*':
            return None if int(data) < 0 else [self.read() for _ in range(int(data))]
        raise ValueError(kind)

    def command(self, *args):
        values = [x if isinstance(x, bytes) else str(x).encode() for x in args]
        self.socket.sendall(b'*%d\r\n' % len(values) + b''.join(b'$%d\r\n' % len(x) + x + b'\r\n' for x in values))
        try: return self.read()
        except RuntimeError as error:
            if self.redirect and str(error).startswith('MOVED '):
                return Resp(int(str(error).split()[-1].split(':')[-1]), self.password).command(*args)
            raise

def run(argv, **kwargs):
    result = subprocess.run(argv, text=True, capture_output=True, timeout=90, **kwargs)
    if result.returncode: raise RuntimeError(f'{argv}: {result.stdout}\n{result.stderr}')
    return result.stdout

def start(argv, name):
    out = open(root / (name + '.log'), 'w')
    process = subprocess.Popen(argv, stdout=out, stderr=subprocess.STDOUT, start_new_session=True)
    out.close()
    processes.append(process)
    return process

def until(fn, seconds=90):
    deadline = time.monotonic() + seconds
    last = None
    while time.monotonic() < deadline:
        try:
            value = fn()
            if value: return value
        except (OSError, ValueError, RuntimeError, AssertionError) as error: last = error
        time.sleep(.3)
    raise RuntimeError('Timed out: ' + str(last))

def info(client, section):
    return dict(line.split(':', 1) for line in client.command('INFO', section).decode().splitlines() if ':' in line)

def status():
    with urllib.request.urlopen('http://127.0.0.1:18080/status', timeout=5) as response:
        return json.load(response)

def objects(value):
    if isinstance(value, dict):
        yield value
        for child in value.values(): yield from objects(child)
    elif isinstance(value, list):
        for child in value: yield from objects(child)

def snapshot(clients, db):
    result = {}
    for client in clients:
        if not target_cluster and not source_cluster: client.command('SELECT', db)
        cursor = 0
        while True:
            cursor, keys = client.command('SCAN', cursor, 'COUNT', 100)
            for key in keys:
                kind = client.command('TYPE', key)
                if kind == b'string': value = client.command('GET', key)
                elif kind == b'hash':
                    pairs = client.command('HGETALL', key); value = dict(zip(pairs[::2], pairs[1::2]))
                elif kind == b'list': value = client.command('LRANGE', key, 0, -1)
                elif kind == b'set': value = sorted(client.command('SMEMBERS', key))
                elif kind == b'zset': value = client.command('ZRANGE', key, 0, -1, 'WITHSCORES')
                elif kind == b'stream': value = [client.command('XRANGE', key, '-', '+'), client.command('XINFO', 'GROUPS', key), client.command('XPENDING', key, 'workers', '-', '+', 100)]
                else: raise RuntimeError('Unexpected type: ' + str(kind))
                # Pending idle milliseconds change with time; IDs, consumer and deliveries must agree.
                if kind == b'stream': value[2] = [[p[0], p[1], p[3]] for p in value[2]]
                result[key] = (kind, value, client.command('PEXPIRETIME', key))
            if int(cursor) == 0: break
    return result

try:
    assert Path('/opt/lavik/REVISION').read_text().strip() == os.environ['EXPECTED_COMMIT']
    assert run(['/opt/lavik/lavik', '--version']).strip() == 'lavik 0.2.0'
    assert 'v=7.2.14 ' in run(['/fixtures/redis-server', '--version'])
    source_ports = [7000, 7001, 7002] if source_cluster else [6379]
    for port in source_ports:
        directory = root / str(port); directory.mkdir()
        argv = ['/fixtures/redis-server', '--bind', '127.0.0.1', '--port', str(port), '--dir', str(directory),
                '--save', '', '--appendonly', 'no', '--requirepass', SOURCE_PASSWORD,
                '--repl-diskless-sync', 'no']
        if source_cluster: argv += ['--cluster-enabled', 'yes', '--cluster-config-file', 'nodes.conf']
        start(argv, 'redis-' + str(port))
        until(lambda: Resp(port, SOURCE_PASSWORD).command('PING') == b'PONG')
    if source_cluster:
        run(['redis-cli', '--cluster', 'create', *[f'127.0.0.1:{p}' for p in source_ports], '--cluster-replicas', '0', '--cluster-yes'], env={**os.environ, 'REDISCLI_AUTH': SOURCE_PASSWORD})
        until(lambda: all(b'cluster_state:ok' in Resp(port, SOURCE_PASSWORD).command('CLUSTER', 'INFO') for port in source_ports))
    sources = [Resp(port, SOURCE_PASSWORD) for port in source_ports]
    for prefix in ['{a}', '{b}', '{c}']:
        client = sources[0]
        client.command('SET', prefix + ':string', b'binary\x00\xff')
        client.command('HSET', prefix + ':hash', 'field', 'value', 'other', 'two')
        client.command('RPUSH', prefix + ':list', 'first', 'second')
        client.command('SADD', prefix + ':set', 'a', 'b')
        client.command('ZADD', prefix + ':zset', 1.5, 'a', 9, 'b')
        client.command('SET', prefix + ':ttl', 'expires', 'PX', 600000)
        client.command('SET', prefix + ':delete', 'baseline')
        client.command('XADD', prefix + ':stream', '1-0', 'event', 'created')
        client.command('XGROUP', 'CREATE', prefix + ':stream', 'workers', '0')
        client.command('XREADGROUP', 'GROUP', 'workers', 'consumer-1', 'STREAMS', prefix + ':stream', '>')
    if not source_cluster and not target_cluster:
        sources[0].command('SELECT', 1); sources[0].command('SET', 'database-one', 'retained'); sources[0].command('SELECT', 0)

    groups = 2 if target_cluster else 1
    manifest = ['schema_version = 1', f'client_mode = "{"cluster" if target_cluster else "single"}"', 'slot_strategy = "contiguous-even"',
                '[[meta_members]]', 'id = 1', 'raft_endpoint = "tcp://127.0.0.1:7101"',
                'ctl_endpoint = "tcp://127.0.0.1:7201"', 'data_control_endpoint = "tcp://127.0.0.1:7301"']
    for i in range(1, groups * 2 + 1):
        manifest += ['[[data_nodes]]', f'id = "{str(i)*40}"', f'client_endpoint = "tcp://127.0.0.1:{6370+i}"']
    for i in range(groups):
        manifest += ['[[groups]]', f'id = "group-{i+1}"', f'primary = "{str(2*i+1)*40}"', f'replicas = ["{str(2*i+2)*40}"]']
    (root / 'cluster.toml').write_text('\n'.join(manifest) + '\n')
    (root / 'meta').mkdir()
    start(['/opt/lavik/lavik-meta', '--id', '1', '--addr', '127.0.0.1:7101', '--ctl-addr', '127.0.0.1:7201', '--data-control-addr', '127.0.0.1:7301', '--data-dir', str(root / 'meta'), '--initial-cluster-manifest', str(root / 'cluster.toml')], 'meta')
    ctl = ['/opt/lavik/lavik-ctl', '--socket', str(root / 'meta/meta-admin.sock')]
    until(lambda: 'leader=1' in run(ctl + ['status']))
    for i in range(1, groups * 2 + 1):
        directory = root / ('data-' + str(i)); directory.mkdir()
        run(['fallocate', '-l', '512M', str(directory / 'data')])
        start(['/opt/lavik/lavik', '--bind', '127.0.0.1', '--port', str(6370+i), '--metrics-port', '0', '--threads', '1', '--no-pin-workers', '--registered-buffer-mb-per-worker', '64', '--max-memory', '512MiB', '--network', 'kernel', '--storage', 'uring', '--shutdown-checkpoint', '--node-id', str(i)*40, '--announce-ip', '127.0.0.1', '--meta-seed', '127.0.0.1:7301', '--requirepass', TARGET_PASSWORD, '--masterauth', TARGET_PASSWORD, '--data-file', str(directory / 'data'), '--log-dir', str(directory / 'logs')], 'lavik-' + str(i))
    run(ctl + ['cluster-create', '--manifest', str(root / 'cluster.toml'), '--allow-plaintext-admin', '--yes'])
    def cluster_status(): return json.loads(run(ctl + ['cluster-status', '--allow-plaintext-admin', '--json']))
    until(cluster_status)
    targets = [Resp(6371+2*i, TARGET_PASSWORD) for i in range(groups)]
    replicas = [Resp(6372+2*i, TARGET_PASSWORD, redirect=False) for i in range(groups)]
    if target_cluster:
        for client in replicas: assert client.command('READONLY') == b'OK'
    owners_before = cluster_status()
    attempt = Path('/var/tmp/lavik-import-01'); attempt.mkdir(mode=0o700); (attempt/'spool').mkdir()
    config = Path('/verification/redis-cluster.toml' if source_cluster else '/verification/redis-single.toml').read_text()
    if source_cluster != target_cluster:
        reader, writer = config.split('[redis_writer]')
        writer = writer.replace('cluster = true' if source_cluster else 'cluster = false', 'cluster = true' if target_cluster else 'cluster = false', 1)
        config = reader + '[redis_writer]' + writer
    (attempt / 'shake.toml').write_text(config); (attempt / 'shake.toml').chmod(0o600)
    shake = start(['bash', '-euo', 'pipefail', '/verification/start.sh'], 'shake')
    until(lambda: all(client.command('GET', '{a}:string') == b'binary\x00\xff' for client in targets))
    # Writes after initial import exercise incremental updates, deletes and counters.
    for prefix in ['{a}', '{b}', '{c}']:
        sources[0].command('INCR', prefix + ':counter')
        sources[0].command('HSET', prefix + ':hash', 'field', 'updated')
        sources[0].command('DEL', prefix + ':delete')
    source_tails = [{**info(c, 'replication'), 'run_id': info(c, 'server')['run_id'], 'port': c.port} for c in sources]
    def caught_up():
        observed = status()
        readers = [x for x in objects(observed['reader']) if 'aof_sent_offset' in x]
        writers = [x for x in objects(observed['writer']) if 'unanswered_entries' in x]
        if len(readers) != len(sources) or len(writers) != groups: return False
        # Identify each reader by its exact source address, never by list order.
        for tail in source_tails:
            reader = next((x for x in readers if f'127.0.0.1:{tail["port"]}' in json.dumps(x)), None)
            if not reader or reader.get('status') != 'syncing aof': return False
            if min(reader['aof_received_offset'], reader['aof_sent_offset']) < int(tail['master_repl_offset']): return False
        return observed if all(x['unanswered_entries'] == 0 and x['unanswered_bytes'] == 0 for x in writers) else False
    observed = until(caught_up)
    report['cutoverStatus'] = observed
    report['sourceTails'] = source_tails
    # Same-connection write/delete/WAIT on each actual Owner and its slot.
    for i, client in enumerate(targets):
        marker = next(f'__lavik_migration__:{{probe-{n}}}:barrier' for n in range(1000) if not target_cluster or binascii.crc_hqx(f'probe-{n}'.encode(), 0) % 16384 // 8192 == i)
        assert client.command('SET', marker, 'ready', 'NX') == b'OK'
        assert client.command('DEL', marker) == 1
        assert client.command('WAIT', 1, 5000) >= 1
    for db in ([0, 1] if not source_cluster and not target_cluster else [0]):
        expected = snapshot(sources, db)
        for clients in [targets, replicas]:
            actual = snapshot(clients, db)
            assert actual.keys() == expected.keys(), (sorted(actual), sorted(expected))
            for key in expected:
                assert actual[key][:2] == expected[key][:2], (key, actual[key], expected[key])
                assert abs(actual[key][2] - expected[key][2]) <= 5000, (key, 'expiry drift')
        report['checks'].append({'db': db, 'keys': len(expected), 'completeKeysetsValuesAndReplicas': 'passed', 'absoluteExpiryToleranceMs': 5000})
    for client, tail in zip(sources, source_tails):
        assert info(client, 'server')['run_id'] == tail['run_id']
        assert info(client, 'replication')['master_replid'] == tail['master_replid']
    owners_after = cluster_status()
    assert [g['owner_node_id'] for g in owners_before['groups']] == [g['owner_node_id'] for g in owners_after['groups']]
    report['statusCommand'] = run(['bash', '-euo', 'pipefail', '/verification/status.sh'])
    assert shake.poll() is None
    # Simulate Ctrl+C in the original terminal, including the shell's child.
    os.killpg(shake.pid, signal.SIGINT); shake.wait(timeout=15)
    def importer_stopped():
        try:
            with socket.create_connection(('127.0.0.1', 18080), timeout=1): return False
        except OSError: return True
    until(importer_stopped, seconds=15)
    assert targets[0].command('SET', 'application-cutover', 'lavik') == b'OK'
    assert targets[0].command('GET', 'application-cutover') == b'lavik'
    report['checks'].append({'applicationWriteAfterToolStopped': 'passed', 'sourceAndOwnerIdentityStable': 'passed'})
    report['status'] = 'passed'
except Exception as error:
    report['error'] = repr(error)
    report['logs'] = {str(p.relative_to(root)): p.read_text(errors='replace')[-9000:] for p in root.rglob('*.log')}
    try: report['lastStatus'] = status()
    except Exception: pass
finally:
    for client in connections:
        client.file.close(); client.socket.close()
    for process in reversed(processes):
        if process.poll() is None: process.terminate()
    for process in reversed(processes):
        try: process.wait(timeout=10)
        except subprocess.TimeoutExpired: process.kill(); process.wait()
    print(json.dumps(report))
sys.exit(0 if report['status'] == 'passed' else 1)
