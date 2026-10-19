"""Launch one manual phase; exit 0 on clean pause, with an explicit pause receipt."""
from pathlib import Path
import argparse
import json
import os
import signal
import subprocess as sp
import time
import traceback

from experiment import CLIENT_ROOT
R = Path(CLIENT_ROOT)


class InterruptedSuite(BaseException):
    pass


def interrupted(signum, _frame):
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    raise InterruptedSuite('Suite interrupted by signal ' + str(signum))


def main(phase, resume):
    if os.geteuid() != 0 or Path(__file__).resolve().parent != R:
        raise RuntimeError('Unexpected suite host/root')
    args = ['/usr/bin/python3', '-u', str(R / 'run.py'), phase] + (['--resume'] if resume else [])
    child = sp.Popen(args, cwd=R)
    try:
        code = child.wait()
    finally:
        if child.poll() is None:
            child.terminate()
            child.wait(timeout=720)
    if code == 75:
        row = json.loads((R / (phase + '-paused.json')).read_text())
        if row['state'] != 'paused' or row['clean_stop_confirmed'] is not True:
            raise RuntimeError('Invalid clean-pause receipt')
        print('PAUSED: ' + phase + '; explicit --resume required', flush=True)
        return
    if code != 0 or not (R / (phase.upper() + '_COMPLETE')).is_file():
        raise RuntimeError(phase + ' failed with exit status ' + str(code))
    print('COMPLETE: ' + phase, flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('phase', choices=('lavik', 'peers'))
    parser.add_argument('--resume', action='store_true')
    args = parser.parse_args()
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        main(args.phase, args.resume)
    except BaseException:
        (R / (args.phase + '-suite-failure.json')).write_text(json.dumps(
            {'time': time.time(), 'traceback': traceback.format_exc()}, indent=2) + '\n')
        raise
