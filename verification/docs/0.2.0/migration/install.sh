# Run in Bash on a Linux migration host with curl, tar and sha256sum.
set -euo pipefail
case "$(uname -m)" in
  x86_64)
    arch=amd64
    checksum=c255565a60c15f9d1b4d38ef46d30056161266ffa75e11065c7b1901e236bff7
    ;;
  aarch64|arm64)
    arch=arm64
    checksum=5fc2b7a393f159f8981c1e8d712b63c0866628b99ad030ed3e46c9869c22ff04
    ;;
  *) echo "Use a Linux x86_64 or ARM64 host" >&2; exit 1 ;;
esac
export SHAKE_BIN="$HOME/.local/share/redis-shake-4.6.2/redis-shake"
archive=$(mktemp)
curl --fail --location --retry 3 \
  "https://github.com/tair-opensource/RedisShake/releases/download/v4.6.2/redis-shake-v4.6.2-linux-${arch}.tar.gz" \
  --output "$archive"
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check
mkdir -p "$(dirname "$SHAKE_BIN")"
tar -xzf "$archive" -C "$(dirname "$SHAKE_BIN")" ./redis-shake
rm "$archive"
test -x "$SHAKE_BIN"
