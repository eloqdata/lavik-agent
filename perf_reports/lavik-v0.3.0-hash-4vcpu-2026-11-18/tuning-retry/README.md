# Defrag B/A retest on retained data · 2026-11-18

**Diagnostic evidence only; not promoted to the main benchmark table.** The user identified elevated NVMe read latency as an Azure issue and requested that the affected trial be discarded and repeated without reloading data.

The three affected investigations (`defrag-ba-tuning`, `defrag-ba-control0`, `defrag-record10`) are preserved in the archive but excluded from tuning conclusions. The last was interrupted on request. The replacement `defrag-ba-retry2` reopened the existing 10M-record checkpoint and ran B/A, each with 60 seconds warmup and three 60-second measurements. There was no load phase or key-count query. 1,003-key field-shape samples passed. Both VMs remain running; the database checkpoint is retained.

Replacement parameters: `--defrag-sleep-ms 100 --defrag-record-sleep-us 0`, default maximum concurrent relocations 8, 4 vCPUs, 128 business connections, unlimited, 8 × 128 B full-field hashes, no index. The INFO observer samples at 1 Hz; server iostat was recorded at 1 Hz. Read-only C is retained from the earlier current-allocation default-parameter measurement and is not rerun.

| Workload | Run1 ops/s | Run2 ops/s | Run3 ops/s | Mean ops/s | READ P99.9 ms | UPDATE P99.9 ms |
|---|---:|---:|---:|---:|---:|---:|
| B | 174,154 | 129,103 | 121,085 | 141,447 | 8.744 | 9.103 |
| A | 230,942 | 230,724 | 231,890 | 231,185 | 5.684 | 5.776 |

P99.9 is the arithmetic mean of three per-run percentiles. All six windows pass the raw-log integrity audit, including zero failed statuses/exceptions and complete run durations. Passing this check does not establish a stable storage environment.

The B retest still fluctuated substantially. Live iostat samples showed local-NVMe read await around 0.61–1.06ms during this retest (earlier affected samples were 1.17–1.53ms). Therefore we do not attribute the observed differences to defrag parameters or fill the pending main B/A entries with these diagnostics. A was repeatable within this retest, but it shares the affected campaign and accumulated write history. INFO observed active defrag in 40/180 measured B samples and 179/179 A samples, with maximum pending count 0.

The payload and existing keys were retained throughout the retest. Prior trials had modified the values and storage layout; this is explicitly an existing-data tuning diagnostic, not a fresh-load controlled comparison. No claim is made that the source of infrastructure latency has been independently proven; Azure attribution is the user's diagnosis, while elevated latency and I/O wait are observed facts.

## Reproduce and inspect

Use the parent report's native setup and pinned binary/YCSB versions. Preserve the source 10M checkpoint before running `retry2.py`; it intentionally performs no bulk load. Adapt server IPs and local SSH key paths. The controller stops the database process cleanly after measurement but does not stop/deallocate either VM.

```bash
sha256sum -c SHA256SUMS
tar -xJf raw.tar.xz
python3 scripts/audit-retry2.py raw --out verified.json
```

`manifest.json` records every raw file's SHA-256 and byte count. Raw logs include the excluded trials, replacement triplicates/HDR/sample receipts, 1 Hz INFO, 1 Hz iostat, native startup logs and saved launch arguments. The latest `launch.json` reflects the last invocation; earlier settings are also recorded in the append-only Lavik startup log and per-window INFO snapshots. No database files or credentials are published.
