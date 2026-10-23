#!/bin/bash
set -euo pipefail
ROOT=/opt/bench020
# Wait only for this task's measured matrix. Fail rather than using partial data.
while ! test -f "$ROOT/results/large/COMPLETE"; do
 test "$(systemctl show bench-memory -p ActiveState --value)" = active || { echo 'Memory/SPDK stage stopped without COMPLETE'; exit 1; }
 sleep 30
done
export DEBIAN_FRONTEND=noninteractive
apt-get install -y python3-venv gdisk
python3 -m venv "$ROOT/venv"
"$ROOT/venv/bin/pip" install --only-binary=:all: aerospike==19.3.0
export PATH="$ROOT/ycsb:$PATH"
chmod +x "$ROOT/ycsb/asinfo"
python3 "$ROOT/ycsb/provision.py"
(cd "$ROOT/ycsb"; python3 -c 'import host_policy; host_policy.initialize()')
"$ROOT/venv/bin/python" "$ROOT/ycsb/runner.py"
python3 "$ROOT/peers/provision.py"
python3 "$ROOT/peers/runner.py" all
printf '%s\n' "$(date -u +%FT%TZ)" > "$ROOT/ALL_COMPLETE"
