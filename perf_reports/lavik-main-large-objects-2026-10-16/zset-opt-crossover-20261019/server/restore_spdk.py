"""One explicit, journaled transition of the owned six-device RAID to fresh SPDK.

Default is hardware read-only preflight. --apply permits one attempt. An
interrupted/failed attempt is never silently replayed; inspect its stage receipts.
"""
from pathlib import Path
import argparse
import fcntl
import json
import os
import signal
import subprocess as sp
import time
import traceback
import preflight_server as common

R = common.R


class Cancelled(BaseException):
    pass


def cancelled(signum, frame):
    raise Cancelled('Storage preparation interrupted by signal ' + str(signum))


def run_step(directory, label, args, environment=None):
    receipt = {'started_at': time.time(), 'command': args}
    common.save(directory / (label + '.json'), receipt)
    with (directory / (label + '.log')).open('x') as log:
        process = sp.Popen(args, stdout=log, stderr=sp.STDOUT, env=environment)
        try:
            code = process.wait(timeout=1200)
        except BaseException:
            if process.poll() is None:
                process.terminate()
                process.wait(timeout=60)
            raise
    receipt.update(completed_at=time.time(), returncode=code)
    common.save(directory / (label + '.json'), receipt)
    if code:
        raise RuntimeError('Storage step failed: ' + label)


def main(apply=False):
    common.verify_host()
    with (R.parent / '.benchmark-control.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if (R / 'spdk-ready.json').exists():
            common.verify_idle()
            receipt = common.verify_spdk()
            print(json.dumps({'already_complete': True, 'sanitized': receipt['sanitized']}))
            return
        if (R / 'restore-spdk').exists():
            raise RuntimeError('An earlier preparation attempt exists; inspect instead of replaying erasure')
        preflight = common.preflight('raid')
        common.save(R / 'preflight-raid.json', preflight)
        if not apply:
            print(json.dumps({'verified': True, 'applied': False, 'devices': preflight['raid']['devices']}))
            return
        directory = R / 'restore-spdk'
        directory.mkdir(exist_ok=False)
        common.save(directory / 'intent.json', {'time': time.time(), 'root': str(R),
             'preflight_sha256': common.sha(R / 'preflight-raid.json'), 'devices': preflight['raid']['devices'],
             'protected_mounts': preflight['protected_mounts'], 'previous_hugepages':
             Path('/sys/kernel/mm/hugepages/hugepages-2048kB/nr_hugepages').read_text().strip()})
        try:
            run_step(directory, '01-unmount', ['umount', str(common.MOUNT)])
            run_step(directory, '02-stop-array', ['mdadm', '--stop', common.MD])
            deadline = time.monotonic() + 60
            while Path('/sys/class/block/md127').exists():
                if time.monotonic() >= deadline:
                    raise RuntimeError('Stopped array was not released')
                time.sleep(.25)
            current = common.inventory()
            if current != preflight['raid']['devices'] or common.protected_mounts() != preflight['protected_mounts']:
                raise RuntimeError('Device or protected mount identity changed after RAID stop')
            common.save(directory / 'verified-bare-devices.json', current)
            for index, device in enumerate(current):
                # Every target was proven to be namespace 1 of the exact
                # allowlisted controller, with no mounts/holders/open users.
                prefix = f'03-device-{index + 1}'
                run_step(directory, prefix + '-md-clear', ['mdadm', '--zero-superblock', device['device']])
                run_step(directory, prefix + '-discard', ['blkdiscard', device['device']])
                # Deallocate read semantics differ by NVMe implementation.
                # Explicitly zero and read back Lavik's 4 KiB label page.
                run_step(directory, prefix + '-zero-label', ['dd', 'if=/dev/zero', 'of=' + device['device'],
                         'bs=4096', 'count=1', 'oflag=direct', 'conv=fdatasync,notrunc', 'status=none'])
                run_step(directory, prefix + '-flush', ['blockdev', '--flushbufs', device['device']])
                with open(device['device'], 'rb', buffering=0) as handle:
                    if handle.read(4096) != bytes(4096):
                        raise RuntimeError('Zero label verification failed: ' + device['device'])
                common.save(directory / (prefix + '-verified.json'), {'time': time.time(), 'device': device,
                            'discard_completed': True, 'zero_label_verified': True})
            if common.inventory() != current or common.protected_mounts() != preflight['protected_mounts']:
                raise RuntimeError('Device identity changed before VFIO binding')
            if common.sha(common.SETUP) != preflight['setup_sha256']:
                raise RuntimeError('SPDK setup helper changed during preparation')
            environment = dict(os.environ, PCI_ALLOWED=' '.join(common.ALLOW), DRIVER_OVERRIDE='vfio-pci',
                               HUGEMEM='8192', TARGET_USER='azureuser')
            run_step(directory, '04-bind-vfio', [str(common.SETUP), 'config'], environment)
            drivers = {bdf: (Path('/sys/bus/pci/devices') / bdf / 'driver').resolve().name for bdf in common.ALLOW}
            huge_root = Path('/sys/kernel/mm/hugepages/hugepages-2048kB')
            huge = {name: int((huge_root / name).read_text()) for name in ('nr_hugepages', 'free_hugepages')}
            if set(drivers.values()) != {'vfio-pci'} or huge['nr_hugepages'] < 4096 or huge['free_hugepages'] < 4096:
                raise RuntimeError('VFIO/8192 MiB hugepage restoration incomplete')
            if common.protected_mounts() != preflight['protected_mounts']:
                raise RuntimeError('Protected mounts changed during VFIO setup')
            ready = {'time': time.time(), 'root': str(R), 'boot_id': common.boot_id(), 'sanitized': True,
                     'devices': current, 'drivers': drivers, 'hugepages': huge,
                     'protected_mounts': preflight['protected_mounts'],
                     'previous_raid_receipt_sha256': common.sha(R / 'previous-raid-ready.json'),
                     'preflight_sha256': common.sha(R / 'preflight-raid.json'), 'setup_sha256': preflight['setup_sha256']}
            common.save(R / 'spdk-ready.json', ready)
            common.verify_spdk()
            print(json.dumps({'complete': True, 'sanitized': True, 'drivers': drivers, 'hugepages': huge}))
        except BaseException:
            common.save(directory / 'failure.json', {'time': time.time(), 'traceback': traceback.format_exc()})
            raise


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    signal.signal(signal.SIGTERM, cancelled)
    signal.signal(signal.SIGINT, cancelled)
    main(parser.parse_args().apply)
