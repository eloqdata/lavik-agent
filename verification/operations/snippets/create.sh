# Destructive, one-time initialization of the fresh Data files above.
# --yes accepts the displayed plan; omit it to confirm interactively.
"$LAVIK_BIN_DIR/lavik-ctl" cluster-create \
  --manifest "$LAVIK_ROOT/cluster.toml" \
  --socket "$LAVIK_ROOT/meta-1/meta-admin.sock" \
  --allow-plaintext-admin --yes
