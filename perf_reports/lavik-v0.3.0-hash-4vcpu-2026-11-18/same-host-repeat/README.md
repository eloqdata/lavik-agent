# Same-allocation 10M peer rerun · 2026-11-18

Redis, Kvrocks and Dragonfly were rerun after restarting the same Azure VM resources. All three ran sequentially on the same current server allocation. **9 points / 27 measured windows passed independent raw-log audit**, with no failed points or unexplained errors. Each point has a 60-second warmup and three independent 60-second measured runs. Results are arithmetic means, unlimited throughput, 128 business connections, 8 × 128 B full-field hashes, no scan index, no DBSIZE or scans, and native processes.

The VM names, SKUs and software versions match the parent experiment. Deallocation/restart can change the underlying host, so this rerun is kept separate from the original campaign. The user requested both VMs remain running for subsequent Lavik debugging; no shutdown or deallocation is part of this followup.

| Product | Workload | Mean ops/s | READ P99.9 ms | UPDATE P99.9 ms |
|---|---|---:|---:|---:|
| redis | C | 258,913 | 0.922 | — |
| redis | B | 259,192 | 0.925 | 0.950 |
| redis | A | 233,519 | 1.100 | 1.099 |
| kvrocks | C | 85,015 | 2.799 | — |
| kvrocks | B | 77,598 | 6.835 | 7.142 |
| kvrocks | A | 34,664 | 21.743 | 21.828 |
| dragonfly | C | 340,929 | 0.776 | — |
| dragonfly | B | 330,934 | 0.842 | 0.895 |
| dragonfly | A | 277,608 | 1.439 | 1.453 |

C = pure read; B = 95% read / 5% update; A = 50% read / 50% update. P99.9 entries are means of three per-run percentiles, not pooled percentiles or equal-QPS latency comparisons. Redis `io-threads=4` was reconfirmed live, CPUs 0–3. Kvrocks load completion was followed by three consecutive 10-second zero-compaction/debt samples; no key-count query was used. Dragonfly uses its default RAM configuration, without tiering.

## Preserved Lavik investigation

Before the user prioritized peers, a fresh Lavik 10M default-defrag C/B/A group completed on this same allocation. A reproduced ~7.3–7.9 ms READ/UPDATE P99.9, and 1 Hz INFO sampling observed active defrag during A. A second group changed only `--defrag-sleep-ms` from 0 to 100 ms (cooldown after each relocated block). It was interrupted at the user's request to prioritize the peer measurements. Its partial records are preserved under `raw/defrag-followup/`; do not treat an interrupted A as a valid triplicate or infer a tuning result. The legacy field `tiered` in this investigation's schedule stores defrag sleep milliseconds 0/100; no Lavik storage-tiering feature was toggled.

## Evidence and reproduction

Use the parent report's native setup and pinned source versions. `scripts/peers-campaign.py` runs these three 10M peers; `scripts/campaign.py` and `server-control.py` reproduce the separate defrag investigation. The investigation INFO sampler adds one connection at 1 Hz. Peer measurements use the original controller. `raw.tar.xz` includes raw YCSB/HDR/status receipts, per-point samples and server snapshots, launch arguments/human logs, plus the interrupted investigation. `manifest.json` records every raw file's SHA-256 and byte count. Database files and SSH keys are excluded.

```bash
sha256sum -c SHA256SUMS
tar -xJf raw.tar.xz
python3 scripts/verify-evidence.py raw/same-host-peers-10m --out reproduced-results.json
```

The parent comparison remains unchanged; this directory documents the current allocation for subsequent Lavik work.
