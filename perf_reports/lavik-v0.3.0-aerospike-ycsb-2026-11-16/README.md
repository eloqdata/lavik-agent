# Lavik v0.3.0 io_uring versus Aerospike: benchmark evidence

Evidence for the [Aerospike report](https://github.com/eloqdata/lavik/blob/codex/aerospike-report/perf_reports/lavik-aerospike-ycsb/README.md). Contains the complete A/B/C/D × 100K/unlimited comparison: 16 formal 300-second windows and 28 operation rows. Measured source: `dcb2dda96452610b9aa2625ff2a26abb3303f9b5` (v0.3.0).

`metadata/` contains normalized measurements, telemetry and provenance. `raw.tar.gz` preserves the original Aerospike and io_uring acquisition files byte for byte, including loads, warmups, measured logs, command receipts, host/counter snapshots and recovery checks. Other backends and tuning supplements are excluded. Original paths and SHA-256 hashes are recorded in `metadata/raw-manifest.json`.

Run `python3 verify.py` to reconcile all 16 formal windows and 28 operation rows with the archived receipts and logs. Run `python3 plot.py` with Matplotlib to regenerate the two report figures. Use `shasum -a 256 -c SHA256SUMS` to verify all checked-in files. The full reproduction commands are inline in the report; no database files or credentials are included here.
