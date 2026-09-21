"""Run repository-owned manual cases in isolated Docker; never loads .env."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parent.parent
MODE = sys.argv[1] if len(sys.argv) > 1 else "commands"
if MODE not in ("commands", "clients"): raise ValueError("Expected commands or clients")
IMAGE = "lavik-manual-clients:0.1.0" if MODE == "clients" else "lavik-doc-verifier:0.1.0"
lock = json.loads((ROOT / "content/releases/0.1.0.json").read_text())
image = json.loads(subprocess.check_output(["docker", "image", "inspect", IMAGE], text=True))[0]
paths = [ROOT / "verification/manual" / f for f in ("cases.py", "run.py")]
if MODE == "clients":
    paths += [ROOT / "verification/manual/client-run.py"]
    paths += [p for p in (ROOT / "verification/manual/clients").iterdir() if p.is_file()]
def hashes():
    return {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}
before = hashes()
name = "lavik-manual-" + uuid.uuid4().hex[:12]
args = ["docker", "run", "--rm", "--name", name, "--network=none", "--read-only", "--cap-drop=ALL",
        "--security-opt=no-new-privileges", "--security-opt=seccomp=unconfined", "--memory=2g", "--cpus=2", "--pids-limit=128",
        "--ulimit", "memlock=268435456:268435456", "--tmpfs", "/tmp:rw,nosuid,size=1073741824",
        "-e", "PYTHONDONTWRITEBYTECODE=1", "-e", "EXPECTED_COMMIT=" + lock["commit"], "-e", "EXPECTED_RELEASE=" + lock["release"],
        "--mount", "type=bind,src=" + str(ROOT / "verification/manual") + ",dst=/manual,readonly",
        "--entrypoint", "python3", image["Id"], "/manual/client-run.py" if MODE == "clients" else "/manual/run.py"]
try:
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, timeout=420)
    report = json.loads(result.stdout)
    report["imageId"] = image["Id"]
    assert before == hashes(), "Test sources changed during execution; rerun verification"
    report["harnessFiles"] = before
    if MODE == "clients":
        for filename, digest in report.get("clientSourceFiles", {}).items():
            assert hashlib.sha256((ROOT / "verification/manual/clients" / filename).read_bytes()).hexdigest() == digest, "Rebuild client image: source changed"
    report["dockerArgv"] = [x.replace(str(ROOT), "<repository>") for x in args]
    destination = ROOT / ".runs/local/manual" / (MODE + ".json")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    failures = [c for c in report[MODE] if c["status"] != "passed"]
    print(json.dumps({"status": report["status"], MODE: len(report[MODE]), "failures": failures, "error": report.get("error"), "report": str(destination)}, indent=2))
    sys.exit(result.returncode)
finally:
    subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
