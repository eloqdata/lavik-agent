"""Owned server calls, process checks, and bounded sample validation."""
from pathlib import Path
import hashlib
import json
import math
import os
import resource
import shlex
import socket
import struct
import subprocess as sp
import time

from experiment import CLIENT_ROOT, SERVER_ROOT, HOST, KEYS, VARIANTS, MEMBERS

R, SR = Path(CLIENT_ROOT), SERVER_ROOT
SSH = ['ssh', '-i', '/opt/benchmark/keys/server-control', '-o', 'BatchMode=yes',
       '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=30', 'azureuser@10.84.0.4']


def save(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp')
    temp.write_text(json.dumps(value, indent=2) + '\n')
    temp.replace(path)


def sha(path):
    with Path(path).open('rb') as handle:
        return hashlib.file_digest(handle, 'sha256').hexdigest()


def event(message):
    utc = time.strftime('%FT%TZ', time.gmtime())
    print(utc, message, flush=True)
    save(R / 'status.json', {'utc': utc, 'message': message, 'pid': os.getpid()})


def shell(args, timeout=600):
    return sp.check_output(SSH + [shlex.join(list(map(str, args)))], text=True, timeout=timeout)


def remote(action, *args):
    if action not in ('start', 'stop-owned', 'snapshot'):
        raise ValueError('Unsupported server action')
    if action != 'snapshot' and (len(args) != 3 or args[0] not in VARIANTS):
        raise ValueError('Owned action requires product, session, token')
    return json.loads(shell(['sudo', 'python3', SR + '/server.py', action, *args],
                            timeout=900 if action == 'start' else 600))


def get_active(product, label, token):
    value = json.loads(shell(['sudo', 'cat', SR + '/active.json']))
    if (value['root'], value['product'], value['label'], value['owner_token']) != (SR, product, label, token):
        raise RuntimeError('Active server ownership mismatch')
    return value


def identity(pid, binary):
    raw = Path(f'/proc/{pid}/stat').read_text()
    fields = raw[raw.rfind(')') + 1:].split()
    if fields[0] in ('Z', 'X', 'x') or not os.path.samefile(f'/proc/{pid}/exe', binary):
        raise RuntimeError('Client process identity changed')
    return {'pid': pid, 'start_ticks': fields[19], 'binary': str(binary), 'binary_sha256': sha(binary)}


def client_preflight():
    if os.geteuid() != 0 or Path(__file__).resolve().parent != R:
        raise RuntimeError('Run as root from the exact experiment client directory')
    if os.uname().release != '6.17.0-1022-azure' or os.cpu_count() != 32:
        raise RuntimeError('Unexpected client kernel/CPU count')
    soft, hard = resource.getrlimit(resource.RLIMIT_NOFILE)
    if hard != resource.RLIM_INFINITY and hard < 65535:
        raise RuntimeError('Client NOFILE hard limit below 65535')
    resource.setrlimit(resource.RLIMIT_NOFILE, (65535, hard))
    save(R / 'client-preflight.json', {'time': time.time(), 'kernel': os.uname().release,
                                      'cpu_count': os.cpu_count(), 'nofile_before': soft, 'nofile': 65535})


def other_benchmark_preflight():
    excluded = {os.getpid()}
    parent = os.getppid()
    while parent > 1:
        excluded.add(parent)
        try:
            raw = Path(f'/proc/{parent}/stat').read_text()
            parent = int(raw[raw.rfind(')') + 1:].split()[1])
        except (OSError, ValueError, IndexError):
            break
    names = {'bench', 'bench_sswap', 'bench_hash', 'bench_lrange', 'bench_workdist', 'memtier_benchmark'}
    controllers = {'run.py', 'run_c1.py', 'runner.py', 'suite.py', 'batch.py'}
    for entry in Path('/proc').iterdir():
        if not entry.name.isdecimal() or int(entry.name) in excluded:
            continue
        try:
            argv = [a.decode(errors='replace') for a in (entry / 'cmdline').read_bytes().split(b'\0') if a]
            exe = Path(os.readlink(entry / 'exe')).name
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            continue
        if exe in names or any(a.startswith('/opt/benchmark/') and Path(a).name in controllers for a in argv):
            raise RuntimeError('Another benchmark is alive: ' + entry.name)


def state_bytes(path):
    data = Path(path).read_bytes()
    if len(data) != 8 + 1280 * KEYS or struct.unpack('<ii', data[:8]) != (1280, KEYS):
        raise RuntimeError('Invalid state shape')
    if any(v not in (0, 1) for v in data[8:]) or any(data[8 + 80 * KEYS:]):
        raise RuntimeError('Invalid state flags or inactive-slot changes')
    return data


class Resp:
    """Bounded read-only RESP2 sampling; never enumerates database keys."""
    def __enter__(self):
        self.socket = socket.create_connection((HOST, 6379), timeout=60)
        self.file = self.socket.makefile('rb')
        return self

    def __exit__(self, *_):
        self.file.close()
        self.socket.close()

    def read(self, depth=0):
        if depth > 8:
            raise RuntimeError('Unbounded sample nesting')
        line = self.file.readline(4096)
        if not line.endswith(b'\r\n'):
            raise RuntimeError('Incomplete sample RESP line')
        kind, value = line[:1], line[1:-2]
        if kind == b'-':
            raise RuntimeError(value.decode(errors='replace'))
        if kind == b'+':
            return value
        if kind == b':':
            return int(value)
        if kind == b'$':
            size = int(value)
            if size == -1:
                return None
            if size < 0 or size > 131072:
                raise RuntimeError('Unexpected sample bulk size')
            data = self.file.read(size)
            if len(data) != size or self.file.read(2) != b'\r\n':
                raise RuntimeError('Incomplete sample bulk')
            return data
        if kind == b'*':
            size = int(value)
            if size == -1:
                return None
            if size < 0 or size > 65536:
                raise RuntimeError('Unexpected sample array size')
            return [self.read(depth + 1) for _ in range(size)]
        raise RuntimeError('Unexpected sample RESP type')

    def cmd(self, command, key, *extra):
        if command not in {'STRLEN', 'GETRANGE', 'HLEN', 'HGETALL', 'LLEN', 'LRANGE',
                           'ZCARD', 'ZRANGE', 'SCARD', 'SMEMBERS', 'XLEN', 'XRANGE'}:
            raise ValueError('Only bounded sample reads allowed')
        args = [str(x).encode() for x in (command, key, *extra)]
        self.socket.sendall(b'*' + str(len(args)).encode() + b'\r\n' + b''.join(
            b'$' + str(len(x)).encode() + b'\r\n' + x + b'\r\n' for x in args))
        return self.read()


def member(slot, alternate=False):
    return (f'm{slot:030d}' + ('b' if alternate else 'a')).encode()


def validate_sample(size, prefix, label, state):
    """Only three known keys; whole-object membership and finite-score checks."""
    flags = state_bytes(state)
    members = MEMBERS[size]
    rows = {}
    with Resp() as connection:
        for index in (0, KEYS // 2, KEYS - 1):
            key = prefix + ':' + str(index)
            count = connection.cmd('ZCARD', key)
            contents = connection.cmd('ZRANGE', key, 0, members - 1, 'WITHSCORES')
            expected = {member(slot, bool(flags[8 + slot * KEYS + index]) if slot < 80 else False)
                        for slot in range(members)}
            if (count != members or not isinstance(contents, list) or len(contents) != 2 * members
                    or set(contents[::2]) != expected
                    or not all(isinstance(score, bytes) and math.isfinite(float(score))
                               for score in contents[1::2])):
                raise RuntimeError('Sample membership/shape mismatch: ' + key)
            rows[key] = {'members': count, 'member_bytes': 32, 'shape_verified': True,
                         'payload_sha256': hashlib.sha256(b''.join(contents)).hexdigest(),
                         'state_sha256': sha(state)}
    save(R / 'validations' / (label + '.json'), rows)
    return rows

