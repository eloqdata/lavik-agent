"""Run smoke and formal exactly once; forward interruption for clean shutdown."""
from pathlib import Path
import json
import os
import signal
import subprocess as sp
import time
import traceback

R = Path('/opt/benchmark/main-large-objects-20261018-0938')


def interrupted(signum, _frame):
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    raise InterruptedError('Suite interrupted by signal ' + str(signum))


def main():
    assert os.geteuid() == 0 and Path(__file__).resolve().parent == R
    with (R / 'SUITE_STARTED').open('x') as marker:
        marker.write(time.strftime('%FT%TZ', time.gmtime()))
    for phase in ('smoke', 'formal'):
        print('Starting ' + phase, flush=True)
        child = sp.Popen(['/usr/bin/python3', '-u', str(R / 'run.py'), phase], cwd=R)
        try:
            code = child.wait()
            if code:
                raise RuntimeError(phase + ' failed with exit status ' + str(code))
        finally:
            if child.poll() is None:
                child.terminate()
                child.wait(timeout=600)
        assert (R / (phase.upper() + '_COMPLETE')).is_file()
    (R / 'suite-completion.json').write_text(json.dumps({'utc': time.strftime('%FT%TZ', time.gmtime()),
        'formal_results': 14, 'status': 'complete'}, indent=2) + '\n')
    print('SUITE COMPLETE', flush=True)


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, interrupted)
    signal.signal(signal.SIGINT, interrupted)
    try:
        main()
    except BaseException:
        (R / 'suite-failure.json').write_text(json.dumps({'time': time.time(),
            'traceback': traceback.format_exc()}, indent=2) + '\n')
        raise
