# Run from the extracted v0.1.0-beta.1 package directory.
export LAVIK_BIN_DIR="$(pwd -P)"
export LAVIK_ROOT="$LAVIK_BIN_DIR/ha-beta1"
# Initialization is for a new, empty directory only.
test ! -e "$LAVIK_ROOT" || { echo "Already exists: $LAVIK_ROOT" >&2; exit 1; }
umask 077
mkdir -p "$LAVIK_ROOT"
for i in 1 2 3; do mkdir "$LAVIK_ROOT/meta-$i"; done
for i in 1 2; do
  mkdir "$LAVIK_ROOT/data-$i"
  fallocate -l 512M "$LAVIK_ROOT/data-$i/lavik.data"
done
cat > "$LAVIK_ROOT/cluster.toml" <<'TOML'
schema_version = 1
slot_strategy = "contiguous-even"

[[meta_members]]
id = 1
raft_endpoint = "tcp://127.0.0.1:7101"
data_control_endpoint = "tcp://127.0.0.1:7301"
ctl_endpoint = "tcp://127.0.0.1:7201"

[[meta_members]]
id = 2
raft_endpoint = "tcp://127.0.0.1:7102"
data_control_endpoint = "tcp://127.0.0.1:7302"
ctl_endpoint = "tcp://127.0.0.1:7202"

[[meta_members]]
id = 3
raft_endpoint = "tcp://127.0.0.1:7103"
data_control_endpoint = "tcp://127.0.0.1:7303"
ctl_endpoint = "tcp://127.0.0.1:7203"

[[data_nodes]]
id = "1111111111111111111111111111111111111111"
client_endpoint = "tcp://127.0.0.1:6371"

[[data_nodes]]
id = "2222222222222222222222222222222222222222"
client_endpoint = "tcp://127.0.0.1:6372"

[[groups]]
id = "group-1"
primary = "1111111111111111111111111111111111111111"
replicas = ["2222222222222222222222222222222222222222"]
TOML
