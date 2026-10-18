"""Pinned latest-main write helpers and bounded sampled validation."""
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

R = Path('/opt/benchmark/main-large-writes-20261018-1412')
SR = '/mnt/dev/benchmark/' + R.name
HOST = '10.84.1.4'
KEYS = 8192
VARIANTS = ('main',)
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
    if action not in ('start', 'stop', 'snapshot', 'reset-data'):
        raise ValueError('Unsupported server action: ' + action)
    if action == 'start' and (len(args) != 2 or args[0] not in VARIANTS):
        raise ValueError('Start requires main and a session label')
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
        if not any(key.startswith('formal:' + op + ':') for op in
                   ('set', 'setrange', 'hash', 'list', 'zincr', 'zswap', 'stream', 'sswap')):
            raise ValueError('Unexpected sample key prefix')
        allowed = {'STRLEN': (), 'GETRANGE': ('0', '31'), 'HLEN': (),
                   'HGET': ('f2048',), 'LLEN': (), 'LINDEX': ('2048',),
                   'ZCARD': (), 'ZRANGE': ('0', '2', 'WITHSCORES'),
                   'XLEN': (), 'XRANGE': ('-', '+', 'COUNT', '1'),
                   'SCARD': (), 'SMEMBERS': ()}
        if command not in allowed or tuple(map(str, extra)) != allowed[command]:
            raise ValueError('Unexpected sample command')
        args = [str(arg).encode() for arg in (command, key, *extra)]
        data = b'*' + str(len(args)).encode() + b'\r\n' + b''.join(
            b'$' + str(len(arg)).encode() + b'\r\n' + arg + b'\r\n' for arg in args)
        self.socket.sendall(data)
        return self.read()


def validate(op, label):
    """Validate first/middle/last objects only; never enumerate the database."""
    rows = {}
    with Resp() as connection:
        for index in sorted({0, KEYS // 2, KEYS - 1}):
            key = f'formal:{op}:{index}'
            if op in ('set', 'setrange'):
                count = connection.cmd('STRLEN', key)
                value = connection.cmd('GETRANGE', key, 0, 31)
                if count != 1048576 or not isinstance(value, bytes) or len(value) != 32:
                    raise RuntimeError('String sample mismatch: ' + key)
                rows[key] = {'length': count, 'sample_hex': value.hex()}
            elif op in ('hash', 'list'):
                count = connection.cmd('HLEN' if op == 'hash' else 'LLEN', key)
                value = connection.cmd('HGET' if op == 'hash' else 'LINDEX', key,
                                       'f2048' if op == 'hash' else 2048)
                if count != 4096 or not isinstance(value, bytes) or len(value) != 256:
                    raise RuntimeError('Hash/List sample mismatch: ' + key)
                rows[key] = {'fields' if op == 'hash' else 'length': count,
                             'sample_hex': value[:32].hex()}
            elif op in ('zincr', 'zswap'):
                count = connection.cmd('ZCARD', key)
                value = connection.cmd('ZRANGE', key, 0, 2, 'WITHSCORES')
                if count != 32768 or not isinstance(value, list) or len(value) != 6:
                    raise RuntimeError('ZSet sample shape mismatch: ' + key)
                if any(not isinstance(member, bytes) or len(member) != 32 for member in value[::2]):
                    raise RuntimeError('ZSet member shape mismatch: ' + key)
                for score in value[1::2]:
                    float(score)
                rows[key] = {'members': count, 'sample': [part.decode() for part in value]}
            elif op == 'stream':
                count = connection.cmd('XLEN', key)
                value = connection.cmd('XRANGE', key, '-', '+', 'COUNT', 1)
                if count != 4096 or not isinstance(value, list) or len(value) != 1:
                    raise RuntimeError('Stream sample cardinality mismatch: ' + key)
                entry = value[0]
                if (not isinstance(entry, list) or len(entry) != 2 or b'-' not in entry[0]
                        or not isinstance(entry[1], list) or len(entry[1]) != 2
                        or entry[1][0] != b'payload' or len(entry[1][1]) != 256):
                    raise RuntimeError('Stream sample content mismatch: ' + key)
                rows[key] = {'entries': count, 'sample_id': entry[0].decode()}
            elif op == 'sswap':
                count = connection.cmd('SCARD', key)
                value = connection.cmd('SMEMBERS', key)
                if count != 32768 or not isinstance(value, list) or len(value) != 32768:
                    raise RuntimeError('Set sample cardinality mismatch: ' + key)
                if (len(set(value)) != 32768 or any(len(member) != 32 or member[:1] != b'm'
                        or member[-1:] not in (b'a', b'b') for member in value)
                        or {int(member[1:-1]) for member in value} != set(range(32768))):
                    raise RuntimeError('Set sample member mismatch: ' + key)
                rows[key] = {'members': count, 'payload_bytes': sum(map(len, value))}
            else:
                raise ValueError('Unexpected sample operation: ' + op)
    save(R / (label + '-validation.json'), rows)
    return rows
