"""Read-only role-specific CPU/kernel/network/storage inventory."""
from pathlib import Path
import json
import os
import subprocess as sp
import time

NAME = 'zset-opt-crossover-20261019'
R = Path(__file__).resolve().parent


def main():
    if R not in (Path('/mnt/dev/benchmark') / NAME, Path('/opt/benchmark') / NAME) or os.geteuid() != 0:
        raise RuntimeError('Unexpected role/root or non-root invocation')
    role = 'server' if str(R).startswith('/mnt/') else 'client'
    expected_cpus = 16 if role == 'server' else 32
    if os.uname().release != '6.17.0-1022-azure' or os.cpu_count() != expected_cpus:
        raise RuntimeError('Kernel/CPU count differs from comparison baseline')
    boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    old = R.parent / 'main-large-objects-20261018-0938/host-preflight.json'
    if json.loads(old.read_text())['boot_id'] != boot:
        raise RuntimeError('Host rebooted since verified benchmark environment')
    if list(R.parent.glob('*/active.json')):
        raise RuntimeError('A benchmark service remains active')
    for proc in Path('/proc').iterdir():
        if not proc.name.isdecimal():
            continue
        try:
            raw = (proc / 'stat').read_text()
            if raw[raw.rfind(')') + 1:].split()[0] in ('Z', 'X', 'x'):
                continue
            name = Path(os.readlink(proc / 'exe')).name
            if name in ('lavik', 'redis-server', 'valkey-server', 'kvrocks', 'memtier_benchmark') or name.startswith(('bench', 'lavik-')):
                raise RuntimeError('Another benchmark executable remains alive: ' + proc.name + ' ' + name)
        except (FileNotFoundError, ProcessLookupError):
            continue
    value = {'time': time.time(), 'role': role, 'boot_id': boot, 'kernel': os.uname().release,
             'cpu': json.loads(sp.check_output(['lscpu', '-J'], text=True)),
             'meminfo': Path('/proc/meminfo').read_text(), 'netdev': Path('/proc/net/dev').read_text(),
             'ip': json.loads(sp.check_output(['ip', '-j', 'address'], text=True)),
             'previous_preflight_root': str(old.parent)}
    if role == 'server':
        import preflight_server as common
        common.verify_idle()
        value['spdk'] = common.verify_spdk()
        value['storage_drivers'] = {bdf: (Path('/sys/bus/pci/devices') / bdf / 'driver').resolve().name for bdf in common.ALLOW}
        value['free_hugepages'] = int(Path('/sys/kernel/mm/hugepages/hugepages-2048kB/free_hugepages').read_text())
        if value['free_hugepages'] < 4096:
            raise RuntimeError('8192 MiB hugepages are not available')
    (R / 'host-preflight.json').write_text(json.dumps(value, indent=2) + '\n')
    print(json.dumps({'role': role, 'verified': True, 'kernel': value['kernel'], 'cpus': expected_cpus}))


if __name__ == '__main__':
    main()
