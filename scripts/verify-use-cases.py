"""Offline local Docker checks; no .env or model API credentials."""
import hashlib
import json
from pathlib import Path
import subprocess
import uuid

root = Path(__file__).resolve().parent.parent
release = json.loads((root / "content/releases/0.1.0.json").read_text())
image = json.loads(subprocess.check_output(["docker", "image", "inspect", "lavik-doc-verifier:0.1.0"], text=True))[0]
files = ["scripts/verify-use-cases.py", "verification/use-cases/run.py", "verification/use-cases/scenarios.json", "verification/manual/run.py", "verification/manual/cases.py"]
def hashes(): return {f: hashlib.sha256((root / f).read_bytes()).hexdigest() for f in files}
before = hashes()
name = "lavik-use-cases-" + uuid.uuid4().hex[:12]
args = ["docker", "run", "--rm", "--name", name, "--network=none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--security-opt=seccomp=unconfined", "--memory=2g", "--cpus=2", "--pids-limit=128", "--ulimit", "memlock=268435456:268435456", "--tmpfs", "/tmp:rw,nosuid,size=1073741824", "-e", "PYTHONDONTWRITEBYTECODE=1", "-e", "EXPECTED_COMMIT="+release["commit"], "-e", "EXPECTED_RELEASE="+release["release"], "--mount", "type=bind,src="+str(root / "verification/manual")+",dst=/manual,readonly", "--mount", "type=bind,src="+str(root / "verification/use-cases")+",dst=/scenarios,readonly", "--entrypoint", "python3", image["Id"], "/scenarios/run.py"]
try:
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, timeout=180)
    report = json.loads(result.stdout)
    assert before == hashes(), "Verification inputs changed during execution"
    report["imageId"] = image["Id"]
    report["harnessFiles"] = before
    report["dockerArgv"] = [arg.replace(str(root), "<repository>") for arg in args]
    destination = root / "evidence/use-cases/0.1.0/scenarios.json"
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps({"status": report["status"], "scenarios": len(report["scenarios"]), "error": report.get("error"), "receipt": str(destination)}, indent=2))
    raise SystemExit(result.returncode)
finally:
    subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
