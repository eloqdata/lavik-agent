: "${SHAKE_BIN:?Set the absolute path to the pinned redis-shake binary}"
: "${MIGRATION_DIR:?Set the absolute directory for this attempt}"
cd "$MIGRATION_DIR"
# Leave this terminal running through baseline import and incremental catch-up.
"$SHAKE_BIN" "$MIGRATION_DIR/shake.toml"
