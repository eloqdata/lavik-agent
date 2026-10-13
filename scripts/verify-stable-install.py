"""Check all stable archives, then execute the native Minimal/Standard quick start."""
import hashlib
import json
from pathlib import Path
import subprocess
import uuid

root = Path(__file__).resolve().parent.parent
lock = json.loads((root / "content/docs/0.1.0/release.json").read_text())
metadata = json.loads((root / "content/docs/0.1.0/downloads.json").read_text())
paths = ["scripts/verify-stable-install.py", "verification/docs/0.1.0/install-run.py", "verification/docs/0.1.0/binary-start.sh", "verification/docs/0.1.0/binary-client.sh", "verification/recipes.json", "content/docs/0.1.0/downloads.json"]
def hashes(): return {p: hashlib.sha256((root / p).read_bytes()).hexdigest() for p in paths}
before = hashes()
report = {"sourceCommit": lock["commit"], "release": "0.1.0", "status": "passed", "fileHashes": before, "packages": [],
          "scope": "All four archives: checksum, extraction and binary version. Native ARM64 Minimal and Standard: exact ./lavik startup, client examples, graceful restart. AMD64 version check uses emulation; native AMD64 server and image tests are recorded in release-artifacts CI. No SPDK device or performance test."}
for asset in metadata["assets"]:
    if not asset["name"].endswith(".tar.gz"): continue
    filename = asset["name"]
    archive = root / ".cache/release-0.1.0/downloads" / filename
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    assert digest == asset["digest"].removeprefix("sha256:")
    arch = "aarch64" if "aarch64" in filename else "x86_64"
    image = json.loads(subprocess.check_output(["docker", "image", "inspect", f"lavik-quick-start:{arch}"], text=True))[0]
    native = arch == "aarch64"
    script = f'''set -euo pipefail
test -z "$(command -v lavik || true)"
echo '{digest}  /archive.tar.gz' | sha256sum -c -
mkdir /tmp/package
tar -xzf /archive.tar.gz --strip-components=1 -C /tmp/package
cd /tmp/package
test "$(cat REVISION)" = '{lock["commit"]}'
test "$(cat VERSION)" = v0.1.0
test "$(./lavik --version)" = 'lavik 0.1.0'
{'python3 /verify/run.py basic-commands' if native else 'echo version-verified'}
'''
    name = "lavik-stable-install-" + uuid.uuid4().hex[:10]
    args = ["docker", "run", "--rm", "-i", "--name", name, "--network=none", "--read-only", "--cap-drop=ALL",
            "--security-opt=no-new-privileges", "--security-opt=seccomp=unconfined", "--memory=2g", "--cpus=2", "--pids-limit=128",
            "--ulimit", "memlock=268435456:268435456", "--tmpfs", "/tmp:rw,exec,nosuid,nodev,size=1536m",
            "-e", "EXPECTED_COMMIT=" + lock["commit"], "-e", "EXPECTED_RELEASE=0.1.0",
            "--mount", f"type=bind,src={archive},dst=/archive.tar.gz,readonly"]
    for src,dst in [("verification/docs/0.1.0/install-run.py", "run.py"), ("verification/docs/0.1.0/binary-start.sh", "start.sh"), ("verification/docs/0.1.0/binary-client.sh", "client.sh"), ("verification/recipes.json", "recipes.json")]:
        args += ["--mount", f"type=bind,src={root / src},dst=/verify/{dst},readonly"]
    args += ["--entrypoint", "bash", image["Id"]]
    try:
        execution = subprocess.run(args, input=script, capture_output=True, text=True, timeout=240)
        runtime = json.loads(execution.stdout.strip().splitlines()[-1]) if native else None
        assert execution.returncode == 0 and (not native or runtime["status"] == "passed"), execution.stdout + execution.stderr
        report["packages"].append({"filename": filename, "sha256": digest, "status": "passed", "imageId": image["Id"], "architecture": arch, "runtime": runtime})
        print(filename + ": passed", flush=True)
    finally:
        subprocess.run(["docker", "rm", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
assert hashes() == before
(root / "evidence/docs/0.1.0/install.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
