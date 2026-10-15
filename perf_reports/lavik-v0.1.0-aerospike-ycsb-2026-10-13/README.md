# Aerospike YCSB comparison: raw benchmark results

Lavik and Aerospike: 100 million records with 10 × 128 B fields; workloads A/B/C/D at a 100K target and unlimited rate.

[Published report](https://github.com/eloqdata/lavik/tree/471f4864357f4a5034c64e7d4972ec0e55b82d94/perf_reports/lavik-v0.1.0-aerospike-ycsb-2026-10-13)

- [Raw YCSB phases, client output and server records](raw).
- [Summary CSV](metadata/summary.csv) and [parsed results](metadata/results.json).

Phase filenames distinguish `warmup` from `measured`, and `target100000` from unlimited runs. `.command.json` records commands; `.host-before.json` / `.host-after.json` preserve host snapshots. Client-source files record the benchmark bindings used.

[Metadata](metadata) records versions, experiment context and summary data. Original result files retain the complete acquired sweep, including configurations not plotted in the published report.

[SHA256SUMS](SHA256SUMS) covers all archived data and metadata files. Verify from this directory with `shasum -a 256 -c SHA256SUMS`.
