"""Run the stable binary operator examples in isolated Docker; never reads .env."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import uuid

root = Path(__file__).resolve().parent.parent
layout = sys.argv[1]
assert layout in ("single", "ha")
source = root / "verification/docs/0.1.0/operations"
paths = [p for p in source.rglob("*") if p.is_file()] + [Path(__file__)]
def hashes():
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(paths)}
before = hashes()
lock = json.loads((root / "content/docs/0.1.0/release.json").read_text())
image = json.loads(subprocess.check_output(["docker", "image", "inspect", "lavik-operations:minimal"], text=True))[0]
archive = root / ".cache/release-0.1.0/downloads" / lock["artifacts"]["aarch64"]["filename"]
assert image["Architecture"] == "arm64"
assert hashlib.sha256(archive.read_bytes()).hexdigest() == lock["artifacts"]["aarch64"]["sha256"]
package = root / f".cache/release-0.1.0/ops-package-{layout}"
package.mkdir(exist_ok=True)
subprocess.run(["tar", "-xzf", str(archive), "--strip-components=1", "-C", str(package)], check=True)
name = "lavik-stable-ops-" + uuid.uuid4().hex[:10]
args = ["docker", "run", "--rm", "--name", name, "--network=none", "--read-only", "--cap-drop=ALL",
        "--security-opt=no-new-privileges", "--security-opt=seccomp=unconfined", "--memory=4g", "--cpus=4", "--pids-limit=256",
        "--ulimit", "memlock=536870912:536870912", "--tmpfs", "/tmp:rw,exec,nosuid,nodev,size=2g",
        "-e", "EXPECTED_COMMIT=" + lock["commit"], "-e", "PYTHONDONTWRITEBYTECODE=1",
        "--mount", f"type=bind,src={package},dst=/opt/lavik,readonly",
        "--mount", f"type=bind,src={source},dst=/verification,readonly",
        "--entrypoint", "python3", image["Id"], "/verification/run.py", layout]
try:
    execution = subprocess.run(args, capture_output=True, text=True, timeout=600)
    report = json.loads(execution.stdout)
    assert before == hashes(), "Examples changed during execution"
    report.update(fileHashes=before, imageId=image["Id"], artifactSha256=hashlib.sha256(archive.read_bytes()).hexdigest(),
                  dockerArgv=[x.replace(str(root), "<repository>") for x in args])
    (root / f"evidence/docs/0.1.0/operations-{layout}.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"layout": layout, "status": report["status"], "error": report.get("error")}))
    sys.exit(execution.returncode)
finally:
    subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
