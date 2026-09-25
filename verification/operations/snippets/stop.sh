# Linux lab process management; this does not erase Meta or Data state.
: "${LAVIK_ROOT:?Set the existing state directory}"
: "${LAVIK_BIN_DIR:?Set the absolute package directory}"
owns_pid() {
  local pid="$1" executable
  [[ "$pid" =~ ^[0-9]+$ ]] || return 1
  executable=$(readlink "/proc/$pid/exe") || return 1
  [[ "$executable" == "$LAVIK_BIN_DIR/lavik" || "$executable" == "$LAVIK_BIN_DIR/lavik-meta" ]] || return 1
  tr '\0' '\n' < "/proc/$pid/cmdline" | grep -Fq -- "$LAVIK_ROOT/"
}
# Stop Data first, then Meta. Send SIGTERM and wait instead of using kill -9.
for role in data meta; do
  for pidfile in "$LAVIK_ROOT"/"$role"-*.pid; do
    [ -f "$pidfile" ] || continue
    pid=$(cat "$pidfile")
    if owns_pid "$pid"; then kill -TERM "$pid"; fi
  done
  deadline=$((SECONDS+60))
  while :; do
    running=0
    for pidfile in "$LAVIK_ROOT"/"$role"-*.pid; do
      [ -f "$pidfile" ] || continue
      if owns_pid "$(cat "$pidfile")"; then running=1; fi
    done
    (( running == 0 )) && break
    (( SECONDS < deadline )) || { echo "Shutdown timed out; inspect logs." >&2; exit 1; }
    sleep 1
  done
  for pidfile in "$LAVIK_ROOT"/"$role"-*.pid; do
    [ ! -f "$pidfile" ] || rm "$pidfile"
  done
done
