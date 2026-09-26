# Ubuntu 24.04 (noble), AMD64 or ARM64
(
set -eu
. /etc/os-release
[ "$ID" = ubuntu ] && [ "$VERSION_ID" = 24.04 ] || { echo "Ubuntu 24.04 required"; exit 1; }
case "$(dpkg --print-architecture)" in amd64|arm64) ;; *) echo "Unsupported architecture"; exit 1 ;; esac
sudo apt-get update
sudo apt-get install -y ca-certificates curl
sudo install -d -m 0755 /etc/apt/keyrings
key_file=$(mktemp)
trap 'rm -f "$key_file"' EXIT
curl --fail --location https://lavik.dev/apt/lavik-archive-keyring.asc \
  -o "$key_file"
sudo install -m 0644 "$key_file" /etc/apt/keyrings/lavik.asc
cat <<EOF_SOURCE | sudo tee /etc/apt/sources.list.d/lavik.sources
Types: deb
URIs: https://lavik.dev/apt
Suites: noble
Components: main
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/lavik.asc
EOF_SOURCE
sudo apt-get update
sudo apt-get install -y 'lavik=0.1.0~beta.1-1'
lavik --version
)
