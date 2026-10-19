"""Read-only, identity-checked observation; profiling is explicitly opt-in."""
import argparse
import json
import os
from pathlib import Path
import subprocess as sp
import time

R = Path(__file__).resolve().parent
ROOTS = (Path('/mnt/dev/benchmark/compact-pr357-stack-20261019'),
         Path('/opt/benchmark/compact-pr357-stack-20261019'))


def identity(pid, expected_exe, expected_start):
    raw = Path(f'/proc/{pid}/stat').read_text()
    fields = raw[raw.rfind(')') + 1:].split()
    if fields[19] != expected_start or fields[0] in ('Z', 'X', 'x'):
        raise RuntimeError('Observed PID identity changed')
    if not os.path.samefile(f'/proc/{pid}/exe', expected_exe):
        raise RuntimeError('Observed executable mismatch')
    return {'pid': pid, 'start_ticks': fields[19],
            'exe': os.readlink(f'/proc/{pid}/exe')}


def main(args):
    directory = Path(args.directory)
    if R not in ROOTS or directory.parent.resolve() != R / 'observations':
        raise RuntimeError('Unexpected observer root/output directory')
    if args.profile:
        raise ValueError('Profiling is outside this experiment')
    if args.seconds != 45:
        raise ValueError('Unexpected observation duration')
    directory.mkdir(parents=True, exist_ok=False)
    observed = identity(args.pid, args.expected_exe, args.expected_start)
    (directory / 'identity.json').write_text(json.dumps({**observed,
        'seconds': args.seconds, 'profile': args.profile}, indent=2) + '\n')
    env = dict(os.environ, LC_ALL='C', DEBUGINFOD_URLS='')
    jobs, files = [], []
    try:
        log = (directory / 'monitor.log').open('w')
        files.append(log)
        jobs.append(sp.Popen(['python3', str(R / 'monitor.py'), str(args.pid),
                              str(args.seconds), str(directory / 'monitor.jsonl')],
                             stdout=log, stderr=sp.STDOUT, env=env))
        if args.profile:
            command = ['perf', 'record', '--no-buildid', '--no-buildid-cache',
                       '-e', 'cpu-clock', '-F', '49', '--call-graph', 'dwarf,8192',
                       '-p', str(args.pid), '-o', str(directory / 'perf.data'),
                       '--', 'sleep', str(args.seconds)]
            (directory / 'perf-command.json').write_text(json.dumps(command, indent=2) + '\n')
            log = (directory / 'record.log').open('w')
            files.append(log)
            jobs.append(sp.Popen(command, stdout=log, stderr=sp.STDOUT, env=env))
            log = (directory / 'perf-stat.csv').open('w')
            files.append(log)
            jobs.append(sp.Popen(['perf', 'stat', '-x', ',', '-e',
                                  'task-clock,context-switches,cpu-migrations,page-faults',
                                  '-p', str(args.pid), '--', 'sleep', str(args.seconds)],
                                 stderr=log, stdout=sp.DEVNULL, env=env))
        codes = [job.wait(timeout=args.seconds + 60) for job in jobs]
        (directory / 'exit-status.json').write_text(json.dumps(codes) + '\n')
        if any(codes):
            raise RuntimeError('Observer subprocess failed: ' + repr(codes))
        identity(args.pid, args.expected_exe, args.expected_start)
        rows = [json.loads(line) for line in (directory / 'monitor.jsonl').read_text().splitlines()]
        if not next(row for row in reversed(rows) if row['event'] == 'summary')['completed']:
            raise RuntimeError('Incomplete process observation')
        (directory / 'COMPLETE').write_text(time.strftime('%FT%TZ', time.gmtime()))
    finally:
        for job in jobs:
            if job.poll() is None:
                job.terminate()
                job.wait(timeout=30)
        for handle in files:
            handle.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('pid', type=int)
    parser.add_argument('seconds', type=int)
    parser.add_argument('directory')
    parser.add_argument('--expected-exe', required=True)
    parser.add_argument('--expected-start', required=True)
    parser.add_argument('--profile', action='store_true')
    main(parser.parse_args())
