# cluster-create returning 0 means accepted, not ready to serve.
# Retry status reads only; never automatically retry cluster-create.
deadline=$((SECONDS+120))
ready=0
while (( SECONDS < deadline )); do
  if "$LAVIK_BIN_DIR/lavik-ctl" cluster-status \
    --socket "$LAVIK_ROOT/meta-1/meta-admin.sock" \
    --allow-plaintext-admin; then
    ready=1
    break
  else
    code=$?
    if (( code != 2 && code != 3 )); then exit "$code"; fi
  fi
  sleep 1
done
(( ready == 1 )) || { echo "Not ready: inspect status and logs; do not recreate." >&2; exit 1; }
