"""Pinned comparison helpers and exact sampled content validation."""
from pathlib import Path
import hashlib
import json
import os
import resource
import shlex
import socket
import subprocess as sp
import time
import struct

R = Path('/opt/benchmark/peer-large-reads-fill-20261018')
SR = '/mnt/dev/benchmark/' + R.name
HOST = '10.84.1.4'
PREFIX = 'formal:smembers'
KEYS = 8192
HASH_PREFIX = 'formal:packed-hash'
HASH_OPS = ('hgetall', 'hkeys', 'hvals')
VARIANTS = ('redis', 'valkey', 'kvrocks')
SSH = ['ssh', '-i', '/opt/benchmark/keys/server-control', '-o',
       'BatchMode=yes', '-o', 'ServerAliveInterval=30', 'azureuser@10.84.0.4']


def save(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(value, indent=2) + '\n')
    temp.replace(path)


def event(message):
    utc = time.strftime('%FT%TZ', time.gmtime())
    print(utc, message, flush=True)
    save(R / 'status.json', {'utc': utc, 'message': message, 'pid': os.getpid()})


def shell(args, timeout=600):
    return sp.check_output(SSH + [shlex.join(list(map(str, args)))],
                           text=True, timeout=timeout)


def remote(action, *args):
    if action not in ('start', 'stop', 'snapshot'):
        raise ValueError('Unsupported server action: ' + action)
    if action == 'start' and (len(args) != 2 or args[0] not in VARIANTS):
        raise ValueError('Start requires a pinned peer and a session label')
    return shell(['sudo', 'python3', SR + '/server.py', action, *args])


def client_preflight():
    if os.geteuid() != 0 or Path(__file__).resolve().parent != R:
        raise RuntimeError('Run as root from the exact experiment directory')
    if os.uname().release != '6.17.0-1022-azure':
        raise RuntimeError('Unexpected client kernel: ' + os.uname().release)
    soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
    if hard != resource.RLIM_INFINITY and hard < 65535:
        raise RuntimeError(f'Client NOFILE hard limit {hard} < 65535')
    resource.setrlimit(resource.RLIMIT_NOFILE, (65535, hard))
    sockets = []
    try:
        for _ in range(112):
            sockets.append(socket.socket())
    finally:
        for sock in sockets:
            sock.close()
    event(f'Client preflight: NOFILE {soft} -> 65535; 112 sockets verified')


class Resp:
    """RESP2 reads restricted to the two commands used for sample checks."""

    def __enter__(self):
        self.socket = socket.create_connection((HOST, 6379), timeout=180)
        self.file = self.socket.makefile('rb')
        return self

    def __exit__(self, *_):
        self.file.close()
        self.socket.close()

    def read(self):
        line = self.file.readline()
        if not line.endswith(b'\r\n'):
            raise RuntimeError('Incomplete RESP line')
        kind, value = line[:1], line[1:-2]
        if kind == b'-':
            raise RuntimeError(value.decode(errors='replace'))
        if kind == b'+':
            return value
        if kind == b':':
            return int(value)
        if kind == b'$':
            size = int(value)
            if size < 0:
                return None
            data = self.file.read(size)
            if len(data) != size or self.file.read(2) != b'\r\n':
                raise RuntimeError('Incomplete RESP bulk')
            return data
        if kind == b'*':
            size = int(value)
            if size < 0:
                return None
            return [self.read() for _ in range(size)]
        raise RuntimeError('Unexpected RESP type: ' + repr(kind))

    def cmd(self, command, key, *extra):
        permitted = {
            'SCARD': (PREFIX, ()), 'SMEMBERS': (PREFIX, ()),
            'LLEN': ('formal:packed-lrange', ()),
            'LRANGE': ('formal:packed-lrange', ('0', '-1')),
            'ZCARD': ('formal:packed-zrange', ()),
            'ZRANGE': ('formal:packed-zrange', ('0', '-1', 'WITHSCORES')),
        }
        prefix, suffix = permitted.get(command, ('', None))
        if not prefix or not key.startswith(prefix + ':') or tuple(map(str, extra)) != suffix:
            raise ValueError('Only exact sample read commands are permitted')
        args = [str(arg).encode() for arg in (command, key, *extra)]
        data = b'*' + str(len(args)).encode() + b'\r\n' + b''.join(
            b'$' + str(len(arg)).encode() + b'\r\n' + arg + b'\r\n' for arg in args)
        self.socket.sendall(data)
        return self.read()


def validate(label):
    """Read three complete sets and compare every byte to their expected members."""
    expected = {f'm{slot:030d}a'.encode() for slot in range(32768)}
    rows = {}
    with Resp() as connection:
        for index in (0, KEYS // 2, KEYS - 1):
            key = f'{PREFIX}:{index}'
            cardinality = connection.cmd('SCARD', key)
            members = connection.cmd('SMEMBERS', key)
            if cardinality != 32768 or not isinstance(members, list):
                raise RuntimeError(f'Unexpected sample cardinality/type: {key}')
            if len(members) != 32768 or set(members) != expected:
                raise RuntimeError(f'Complete member validation failed: {key}')
            rows[key] = {
                'members': cardinality, 'payload_bytes': sum(map(len, members)),
                'full_expected_members_match': True,
                'sorted_members_sha256': hashlib.sha256(b''.join(sorted(members))).hexdigest(),
            }
    save(R / (label + '-validation.json'), rows)
    return rows


def hash_command(op, phase, output):
    if op not in HASH_OPS or phase not in ('load', 'warm', 'run', 'validate'):
        raise ValueError('Unsupported Hash operation or phase')
    if phase == 'load' and op != 'hgetall':
        raise ValueError('Only hgetall loader populates the Hash dataset')
    return [str(R / 'bench_hash'), '--host', HOST, '--port', '6379',
            '--op', op, '--phase', phase, '--prefix', HASH_PREFIX,
            '--keys', str(KEYS), '--connections', '1' if phase == 'validate' else '80',
            '--threads', '1' if phase == 'validate' else '16', '--seconds', '1' if phase == 'validate' else '60',
            '--seed', '101' if phase in ('load', 'validate') else '10180' if phase == 'warm' else '20180',
            '--load-seed', '101', '--out', str(output)]


def validate_hash(label):
    """The client reads only first, middle and last keys and checks complete contents."""
    directory = R / 'validations' / label
    directory.mkdir(parents=True, exist_ok=False)
    rows = {}
    for op in HASH_OPS:
        command = hash_command(op, 'validate', directory / (op + '.json'))
        save(directory / (op + '-command.json'), command)
        with (directory / (op + '.log')).open('w') as log:
            sp.run(command, stdout=log, stderr=sp.STDOUT, check=True, timeout=300)
        value = json.loads((directory / (op + '.json')).read_text())
        if (value['op'] != op or value['phase'] != 'validate' or value['errors'] != 0
                or value['keys'] != KEYS or value['prefix'] != HASH_PREFIX
                or value.get('validation_keys') != [0, KEYS // 2, KEYS - 1]
                or value['metrics']['OPERATIONS']['count'] != 3
                or value['connections'] != 1 or value['threads'] != 1):
            raise RuntimeError('Invalid Hash validation output: ' + op)
        rows[op] = value
    save(directory / 'summary.json', rows)
    return rows


def collection_command(op, phase, output):
    if op not in ('lrange', 'zrange') or phase not in ('load', 'warm', 'run'):
        raise ValueError('Unsupported collection command')
    binary = 'bench_lrange' if op == 'lrange' else 'bench_workdist'
    return [str(R / binary), '--host', HOST, '--op', op, '--phase', phase,
            '--prefix', 'formal:packed-' + op, '--keys', str(KEYS),
            '--connections', '80', '--threads', '16', '--seconds', '60',
            '--seed', '101' if phase == 'load' else '10180' if phase == 'warm' else '20180',
            '--load-seed', '101', '--out', str(output)]


def expected_list_element(key, slot):
    mask = (1 << 64) - 1
    value = (101 ^ (key * 0x9e3779b97f4a7c15) ^ (slot * 0xd6e8feb86659fd93)) & mask
    data = bytearray()
    for _ in range(32):
        value = (value + 0x9e3779b97f4a7c15) & mask
        mixed = value
        mixed = ((mixed ^ (mixed >> 30)) * 0xbf58476d1ce4e5b9) & mask
        mixed = ((mixed ^ (mixed >> 27)) * 0x94d049bb133111eb) & mask
        mixed ^= mixed >> 31
        data += struct.pack('<Q', mixed)
    return bytes(data)


def validate_collection(op, label):
    if op not in ('lrange', 'zrange'):
        raise ValueError('Unsupported sample type')
    rows = {}
    with Resp() as connection:
        for index in (0, KEYS // 2, KEYS - 1):
            key = f'formal:packed-{op}:{index}'
            count = connection.cmd('LLEN' if op == 'lrange' else 'ZCARD', key)
            if op == 'lrange':
                actual = connection.cmd('LRANGE', key, 0, -1)
                expected = [expected_list_element(index, slot) for slot in range(4096)]
                expected_count = 4096
            else:
                actual = connection.cmd('ZRANGE', key, 0, -1, 'WITHSCORES')
                expected = [part for slot in range(32768)
                            for part in (f'm{slot:030d}a'.encode(), str(slot).encode())]
                expected_count = 32768
            if count != expected_count or actual != expected:
                raise RuntimeError('Complete ordered sample validation failed: ' + key)
            rows[key] = {'elements': count, 'reply_components': len(actual),
                         'full_expected_content_match': True,
                         'ordered_components_sha256': hashlib.sha256(b''.join(actual)).hexdigest()}
    save(R / (label + '-validation.json'), rows)
    return rows
