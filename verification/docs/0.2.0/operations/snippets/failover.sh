"$LAVIK_BIN_DIR/lavik-ctl" failover group-1 \
  --socket "$LAVIK_ROOT/meta-1/meta-admin.sock" \
  --allow-plaintext-admin --failover-timeout-ms 120000
