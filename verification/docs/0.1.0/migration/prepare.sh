# Use a new directory for EVERY attempt. Choose a disk with space for the spool.
set -euo pipefail
export MIGRATION_DIR=/var/tmp/lavik-import-01
umask 077
# Deliberately fail if this attempt directory already exists.
mkdir "$MIGRATION_DIR"
mkdir "$MIGRATION_DIR/spool"
touch "$MIGRATION_DIR/shake.toml"
chmod 600 "$MIGRATION_DIR/shake.toml"
# Paste ONE of the configurations below into this file and edit its endpoints.
${EDITOR:-vi} "$MIGRATION_DIR/shake.toml"
