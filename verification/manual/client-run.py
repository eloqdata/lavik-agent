"""Run actual installed client libraries against local Lavik, with no network."""
import hashlib
import json
import os
import platform
import signal
import subprocess
import time
from pathlib import Path
from run import Resp, start


def main():
    report = {"schemaVersion": 1, "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
              "platform": platform.platform(), "architecture": platform.machine(), "status": "failed", "clients": []}
    server = None
    try:
        report["sourceCommit"] = Path("/opt/lavik/REVISION").read_text().strip()
        report["binaryVersion"] = subprocess.check_output(["lavik", "--version"], text=True).strip()
        binary = Path(subprocess.check_output(["which", "lavik"], text=True).strip()).resolve()
        report["binarySha256"] = hashlib.sha256(binary.read_bytes()).hexdigest()
        assert report["sourceCommit"] == os.environ["EXPECTED_COMMIT"]
        assert report["binaryVersion"] == "lavik " + os.environ["EXPECTED_RELEASE"]
        definitions = json.loads(Path("/manual/clients/catalog.json").read_text())
        # Bind executable examples to bytes copied into the tested image.
        report["clientSourceFiles"] = {c["file"]: hashlib.sha256((Path("/clients") / c["file"]).read_bytes()).hexdigest() for c in definitions}
        report["runtimes"] = {}
        for name, argv in {"python": ["/opt/python/bin/python", "--version"], "node": ["node", "--version"],
                           "go": ["go", "version"], "java": ["java", "-version"], "php": ["php", "--version"], "ruby": ["ruby", "--version"]}.items():
            p = subprocess.run(argv, capture_output=True, text=True, timeout=10)
            assert p.returncode == 0
            report["runtimes"][name] = (p.stdout + p.stderr).splitlines()[0]
        with open("/tmp/manual-server.log", "w") as log:
            server, report["serverArgv"] = start(log)
            for definition in definitions:
                client = Resp(); assert client.command(["FLUSHALL"]) == b"OK"; client.close()
                result = {"id": definition["id"], "status": "failed", "argv": definition["argv"]}
                try:
                    proc = subprocess.run(definition["argv"], capture_output=True, text=True, timeout=40)
                    result["exitCode"] = proc.returncode
                    result["stderr"] = proc.stderr[-4000:]
                    if proc.returncode != 0: raise RuntimeError(proc.stderr[-2000:] or proc.stdout[-2000:])
                    lines = [s for s in proc.stdout.splitlines() if s.startswith('{"')]
                    evidence = json.loads(lines[-1])
                    assert evidence["status"] == "passed" and len(evidence["checks"]) >= 5
                    assert evidence["version"] == definition["version"], (evidence["version"], definition["version"])
                    result.update(evidence)
                    result["status"] = "passed"
                except subprocess.TimeoutExpired as error:
                    result["error"] = str(error)
                    result["stderr"] = (error.stderr or b"").decode(errors="replace")[-4000:]
                    result["stdout"] = (error.stdout or b"").decode(errors="replace")[-4000:]
                except Exception as error:
                    result["error"] = str(error)
                report["clients"].append(result)
                print(definition["id"] + ": " + result["status"], file=__import__("sys").stderr, flush=True)
            report["status"] = "passed" if all(c["status"] == "passed" for c in report["clients"]) else "failed"
            # A separate diagnostic keeps a failing alternative shutdown path
            # visible without relabeling it as a passing connection profile.
            report["shutdownProbes"] = []
            for library in ("ioredis", "iovalkey"):
                client = Resp(); assert client.command(["FLUSHALL"]) == b"OK"; client.close()
                argv = ["node", "/clients/node-client.mjs", library, "2", "--quit-probe"]
                probe = {"id": library, "argv": argv, "timeoutSeconds": 12}
                try:
                    proc = subprocess.run(argv, capture_output=True, text=True, timeout=12)
                    probe.update(outcome="completed" if proc.returncode == 0 else "failed", exitCode=proc.returncode, stdout=proc.stdout[-4000:], stderr=proc.stderr[-4000:])
                except subprocess.TimeoutExpired as error:
                    probe.update(outcome="timeout", stdout=(error.stdout or b"").decode(errors="replace")[-4000:], stderr=(error.stderr or b"").decode(errors="replace")[-4000:])
                report["shutdownProbes"].append(probe)
    except Exception as error:
        report["error"] = str(error)
    finally:
        if server and server.poll() is None:
            server.send_signal(signal.SIGTERM)
            try: server.wait(timeout=30)
            except subprocess.TimeoutExpired: server.kill(); server.wait()
        report["finishedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        print(json.dumps(report, ensure_ascii=False))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__": raise SystemExit(main())
