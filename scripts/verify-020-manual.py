"""Validate stable commands/clients without changing historical beta receipts.

Reuses the installed, version-pinned client toolchain and mounts the checksum-
verified stable package read-only. Does not read .env or call any model.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parent.parent
mode = sys.argv[1]
assert mode in ("commands", "clients")
lock = json.loads((ROOT / "content/docs/0.2.0/release.json").read_text())
image_name = "lavik-manual-clients:0.1.0" if mode == "clients" else "lavik-doc-verifier:0.1.0"
image = json.loads(subprocess.check_output(["docker", "image", "inspect", image_name], text=True))[0]
arch = {"arm64": "aarch64", "amd64": "x86_64"}[image["Architecture"]]
artifact = lock["artifacts"][arch]
archive = ROOT / ".cache/release-0.2.0/downloads" / artifact["filename"]
assert hashlib.sha256(archive.read_bytes()).hexdigest() == artifact["sha256"]
package = ROOT / f".cache/release-0.2.0/manual-package-{mode}"
package.mkdir(exist_ok=True)
subprocess.run(["tar", "-xzf", str(archive), "--strip-components=1", "-C", str(package)], check=True)
paths = ["verification/manual/run.py", "verification/docs/0.2.0/cases.py", "scripts/verify-020-manual.py"]
if mode == "clients":
    paths += ["verification/manual/client-run.py"]
    paths += [str(p.relative_to(ROOT)) for p in (ROOT / "verification/manual/clients").iterdir() if p.is_file()]
def hashes():
    return {p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest() for p in sorted(paths)}
before = hashes()
name = "lavik-stable-manual-" + uuid.uuid4().hex[:10]
args = ["docker", "run", "--rm", "--name", name, "--network=none", "--read-only", "--cap-drop=ALL",
        "--security-opt=no-new-privileges", "--security-opt=seccomp=unconfined", "--memory=2g", "--cpus=2", "--pids-limit=128",
        "--ulimit", "memlock=268435456:268435456", "--tmpfs", "/tmp:rw,nosuid,size=1073741824",
        "-e", "PYTHONDONTWRITEBYTECODE=1", "-e", "EXPECTED_COMMIT=" + lock["commit"], "-e", "EXPECTED_RELEASE=" + lock["release"],
        "--mount", f"type=bind,src={package},dst=/opt/lavik,readonly",
        "--mount", f"type=bind,src={ROOT / 'verification/manual'},dst=/manual,readonly",
        "--mount", f"type=bind,src={ROOT / 'verification/docs/0.2.0/cases.py'},dst=/manual/cases.py,readonly",
        "--entrypoint", "python3", image["Id"], "/manual/client-run.py" if mode == "clients" else "/manual/run.py"]
try:
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE, timeout=420)
    report = json.loads(result.stdout)
    assert before == hashes(), "Inputs changed while running"
    report.update(imageId=image["Id"], artifactSha256=artifact["sha256"], harnessFiles=before,
                  dockerArgv=[x.replace(str(ROOT), "<repository>") for x in args])
    if mode == "clients":
        for filename, digest in report.get("clientSourceFiles", {}).items():
            assert hashlib.sha256((ROOT / "verification/manual/clients" / filename).read_bytes()).hexdigest() == digest
    destination = ROOT / "evidence/docs/0.2.0" / f"{mode}.json"
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": report["status"], "count": len(report[mode]),
                      "failures": [c for c in report[mode] if c["status"] != "passed"], "error": report.get("error")}))
    sys.exit(result.returncode)
finally:
    subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
