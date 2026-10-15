# 1TB storage-system comparison: raw benchmark results

Dragonfly, Garnet, Apache Kvrocks, Pika and Tendis: 1 billion keys with 1 KiB values. The Lavik measurements are shared with the 16 vCPU report.

[Published report](https://github.com/eloqdata/lavik/tree/471f4864357f4a5034c64e7d4972ec0e55b82d94/perf_reports/lavik-v0.1.0-storage-peers-1tb-2026-10-14)

- [dragonfly](raw/dragonfly)
- [garnet](raw/garnet)
- [kvrocks](raw/kvrocks)
- [pika](raw/pika)
- [tendis](raw/tendis)

Lavik uses the [shared 1-billion-key raw results](../lavik-v0.1.0-spdk-vs-latest-2026-10-13/raw/storage/lavik-spdk).

`get-c80.json` / `set-c80.json` are the original memtier JSON outputs for 80 total connections. `.txt` files contain console output; `.command.json` files record commands; `.before.json` and `.after.json` contain host/process snapshots. `.result.json` files are parsed summaries where present. Fill and warmup files are separate from measured GET/SET points.

[Metadata](metadata) records versions, experiment context and summary data. Original result files retain the complete acquired sweep, including configurations not plotted in the published report.

[SHA256SUMS](SHA256SUMS) covers all archived data and metadata files. Verify from this directory with `shasum -a 256 -c SHA256SUMS`.
