#!/bin/bash
# Test inside a disposable Ubuntu 24.04 container. No host service or data mounts.
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends ca-certificates curl gnupg redis-tools systemd procps >/dev/null
install -d -m 0755 /etc/apt/keyrings
if [[ ${LAVIK_APT_URL:-} ]]; then
  curl --fail --silent --show-error --location "$LAVIK_APT_URL/lavik-archive-keyring.asc" -o /etc/apt/keyrings/lavik.asc
else
  cp /repository/lavik-archive-keyring.asc /etc/apt/keyrings/lavik.asc
fi
chmod 0644 /etc/apt/keyrings/lavik.asc
cat > /etc/apt/sources.list.d/lavik.sources <<SOURCE
Types: deb
URIs: ${LAVIK_APT_URL:-file:/repository}
Suites: noble
Components: main
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/lavik.asc
SOURCE
# No trusted=yes or unsigned fallback: APT must validate the real repository.
apt-get update -qq
for package in lavik lavik-standard; do
  apt-get install -y "$package=0.1.0~beta.1-1" >/dev/null
  test "$(dpkg-query -W -f='${Version}' "$package")" = '0.1.0~beta.1-1'
  test "$(lavik --version)" = 'lavik 0.1.0-beta.1'
  test "$(cat /usr/lib/lavik/REVISION)" = '3955b98d43b312324aa8d52775df52cfb111c0d0'
  command -v lavik-meta
  command -v lavik-ctl
  cmp /templates/start /usr/lib/lavik/start
  cmp /templates/lavik.service /usr/lib/systemd/system/lavik.service
  cmp /templates/default /etc/default/lavik
  for script in postinst prerm postrm; do
    cmp "/templates/$script" "/var/lib/dpkg/info/$package.$script"
  done
  systemd-analyze verify /usr/lib/systemd/system/lavik.service
  test "$(systemctl is-enabled lavik.service 2>/dev/null || true)" = disabled
  systemctl enable lavik.service >/dev/null
  test -L /etc/systemd/system/multi-user.target.wants/lavik.service
  # Docker is not booted with systemd; execute the unit's exact start program
  # as its service user, with the documented environment and persistent paths.
  set -a
  source /etc/default/lavik
  set +a
  runuser -u lavik -- /usr/lib/lavik/start > /tmp/lavik.log 2>&1 &
  runner=$!
  trap 'kill -TERM "$runner" 2>/dev/null || true; wait "$runner" || true' EXIT
  for ((i=0; i<90; i++)); do
    [[ $(redis-cli --raw PING 2>/dev/null) == PONG ]] && break
    sleep 1
  done
  test "$(redis-cli --raw PING)" = PONG
  test "$(redis-cli --raw SET apt-install persistent)" = OK
  size=$(stat -c %s /var/lib/lavik/data)
  # Signal the actual Lavik process so the supervisor isn't killed first.
  pid=$(pgrep -u lavik -x lavik)
  kill -TERM "$pid"
  wait "$runner"
  trap - EXIT
  LAVIK_DATA_SIZE=2G runuser -u lavik -- /usr/lib/lavik/start > /tmp/lavik.log 2>&1 &
  runner=$!
  trap 'kill -TERM "$runner" 2>/dev/null || true; wait "$runner" || true' EXIT
  for ((i=0; i<90; i++)); do
    [[ $(redis-cli --raw PING 2>/dev/null) == PONG ]] && break
    sleep 1
  done
  test "$(redis-cli --raw GET apt-install)" = persistent
  test "$(stat -c %s /var/lib/lavik/data)" = "$size"
  kill -TERM "$(pgrep -u lavik -x lavik)"
  wait "$runner"
  trap - EXIT
  # Debian conffile edits survive a reinstall.
  printf '\n# local customization\n' >> /etc/default/lavik
  apt-get install --reinstall -y "$package=0.1.0~beta.1-1" >/dev/null
  grep -q 'local customization' /etc/default/lavik
  apt-get purge -y "$package" >/dev/null
  test -s /var/lib/lavik/data
  test ! -e /usr/bin/lavik
  test ! -L /etc/systemd/system/multi-user.target.wants/lavik.service
  # Reinstallation still recovers the old database.
  apt-get install -y "$package=0.1.0~beta.1-1" >/dev/null
  runuser -u lavik -- /usr/lib/lavik/start > /tmp/lavik.log 2>&1 &
  runner=$!
  trap 'kill -TERM "$runner" 2>/dev/null || true; wait "$runner" || true' EXIT
  for ((i=0; i<90; i++)); do
    [[ $(redis-cli --raw PING 2>/dev/null) == PONG ]] && break
    sleep 1
  done
  test "$(redis-cli --raw GET apt-install)" = persistent
  kill -TERM "$(pgrep -u lavik -x lavik)"
  wait "$runner"
  trap - EXIT
  apt-get purge -y "$package" >/dev/null
  # Only this disposable container's test database is removed between variants.
  rm /var/lib/lavik/data
  rm -rf /var/log/lavik/*
  echo "PASS: $package signed-install version service-unit write restart allocation conffile purge-reinstall"
done
# A wrong key must be rejected (authenticity gate).
cp /etc/apt/keyrings/lavik.asc /tmp/lavik-real-key.asc
printf 'not a key\n' > /etc/apt/keyrings/lavik.asc
rm -rf /var/lib/apt/lists/*
if apt-get update -o APT::Update::Error-Mode=any >/tmp/wrong-key.log 2>&1; then
  echo 'Unexpected acceptance of invalid signing key' >&2; exit 1
fi
grep -Eq 'NO_PUBKEY|signature|signatures|keyring' /tmp/wrong-key.log
cp /tmp/lavik-real-key.asc /etc/apt/keyrings/lavik.asc
echo 'PASS: invalid signing key rejected'
