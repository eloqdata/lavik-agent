"""Read-only host inventory for a manually chosen storage phase."""
from pathlib import Path
import argparse
import json
import os
import subprocess as sp
import time

from experiment import SERVER_ROOT, CLIENT_ROOT
R = Path(__file__).resolve().parent


def main(phase):
    if R not in (Path(SERVER_ROOT), Path(CLIENT_ROOT)) or os.geteuid() != 0:
        raise RuntimeError('Run on the exact experiment host/root')
    server = R == Path(SERVER_ROOT)
    if os.uname().release != '6.17.0-1022-azure' or os.cpu_count() != (16 if server else 32):
        raise RuntimeError('Unexpected host kernel or CPU count')
    if server:
        import preflight_server as common
        # The server controller repeats its strict device/RAID/owned-process checks
        # at every start. This inventory must never provision or change storage.
        if (R / 'active.json').exists() or sp.check_output(['ss', '-H', '-ltn', 'sport = :6379'], text=True).strip():
            raise RuntimeError('A database is active')
        if phase == 'peers' and not (R / 'raid-ready.json').is_file():
            raise RuntimeError('Manual RAID transition has not been recorded')
    else:
        import runner
        runner.other_benchmark_preflight()
    values = {'time': time.time(), 'role': 'server' if server else 'client', 'phase': phase,
              'kernel': os.uname().release, 'cpu_count': os.cpu_count(),
              'cpu': json.loads(sp.check_output(['lscpu', '-J'], text=True)),
              'boot_id': Path('/proc/sys/kernel/random/boot_id').read_text().strip(),
              'meminfo': Path('/proc/meminfo').read_text(), 'netdev': Path('/proc/net/dev').read_text(),
              'ip': json.loads(sp.check_output(['ip', '-j', 'address'], text=True))}
    if server:
        devices = json.loads((R / 'spdk-devices.json').read_text())
        values['storage_drivers'] = {device['bdf']: (Path('/sys/bus/pci/devices') / device['bdf'] / 'driver').resolve().name
                                     for device in devices}
        expected = 'vfio-pci' if phase == 'lavik' else 'nvme'
        if set(values['storage_drivers'].values()) != {expected}:
            raise RuntimeError('Storage drivers do not match manual phase')
    path = R / ('host-preflight-' + phase + '.json')
    if path.exists():
        old = json.loads(path.read_text())
        if old['boot_id'] != values['boot_id']:
            raise RuntimeError('Host rebooted within experiment')
    path.write_text(json.dumps(values, indent=2) + '\n')
    print(json.dumps({'role': values['role'], 'phase': phase, 'kernel': values['kernel'], 'idle': True}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=('lavik', 'peers'))
    main(parser.parse_args().phase)
