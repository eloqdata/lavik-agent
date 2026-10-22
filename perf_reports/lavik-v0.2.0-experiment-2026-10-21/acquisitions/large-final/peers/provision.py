#!/usr/bin/env python3
"""Wait for the user-requested 32-thread Lavik rerun and fresh XFS layout."""
import pathlib,json,time
r=pathlib.Path('/opt/bench020')
assert json.loads((r/'ycsb/complete.json').read_text())['complete']==16
print('Waiting for 32-thread Lavik 1B rerun and fresh peer filesystem',flush=True)
while not (r/'storage32-ready.json').exists():time.sleep(5)
a=json.loads((r/'storage32-ready.json').read_text())
assert a['client_threads']==32 and a['lavik_complete']
assert (r/'peers/filesystem-prepared.json').exists()
print('32-thread storage benchmark environment ready',flush=True)
