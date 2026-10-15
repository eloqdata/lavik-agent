# 16 vCPU Redis/Valkey comparison: raw benchmark results

10 million keys for the memory comparison and 1 billion keys for Lavik storage measurements, with 1 KiB values.

[Published report](https://github.com/eloqdata/lavik/tree/471f4864357f4a5034c64e7d4972ec0e55b82d94/perf_reports/lavik-v0.1.0-spdk-vs-latest-2026-10-13)

- [Memory results](raw/memory): Lavik, Redis and Valkey, including the complete I/O-thread sweep.
- [Storage results](raw/storage): Lavik 1-billion-key measurements.

`get-c80.json` / `set-c80.json` are the original memtier JSON outputs for 80 total connections. `.txt` files contain console output; `.command.json` files record commands; `.before.json` and `.after.json` contain host/process snapshots. `.result.json` files are parsed summaries where present. Fill and warmup files are separate from measured GET/SET points.

[Metadata](metadata) records versions, experiment context and summary data. Original result files retain the complete acquired sweep, including configurations not plotted in the published report.

[SHA256SUMS](SHA256SUMS) covers all archived data and metadata files. Verify from this directory with `shasum -a 256 -c SHA256SUMS`.
