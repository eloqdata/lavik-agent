"""Execute the website's exact small scenarios against the pinned local binary."""
import hashlib
import json
import os
from pathlib import Path
import platform
import signal
import subprocess
import sys
import time

sys.path.insert(0, "/manual")
from run import start, run_case

report = {"status": "failed", "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
          "platform": platform.platform(), "architecture": platform.machine(), "scenarios": []}
server = None
try:
    report["sourceCommit"] = Path("/opt/lavik/REVISION").read_text().strip()
    report["binaryVersion"] = subprocess.check_output(["lavik", "--version"], text=True).strip()
    report["binarySha256"] = hashlib.sha256(Path("/opt/lavik/lavik").read_bytes()).hexdigest()
    assert report["sourceCommit"] == os.environ["EXPECTED_COMMIT"]
    assert report["binaryVersion"] == "lavik " + os.environ["EXPECTED_RELEASE"]
    with open("/tmp/use-cases-server.log", "w") as log:
        server, report["serverArgv"] = start(log)
        for scenario in json.loads(Path("/scenarios/scenarios.json").read_text()):
            result = run_case(scenario)
            report["scenarios"].append(result)
            print(scenario["name"] + ": " + result["status"], file=sys.stderr, flush=True)
        report["status"] = "passed" if all(s["status"] == "passed" for s in report["scenarios"]) else "failed"
except Exception as error:
    report["error"] = str(error)
finally:
    if server and server.poll() is None:
        server.send_signal(signal.SIGTERM)
        try: server.wait(timeout=30)
        except subprocess.TimeoutExpired: server.kill(); server.wait()
    report["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print(json.dumps(report, ensure_ascii=False))
raise SystemExit(0 if report["status"] == "passed" else 1)
