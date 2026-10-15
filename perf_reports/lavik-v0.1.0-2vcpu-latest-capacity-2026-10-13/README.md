# Lavik 2-vCPU benchmark — raw results

Raw results from the October 13, 2026 Azure benchmark comparing Lavik 0.1.0 (1 million and 100 million keys), Redis 8.10.2 (1 million keys), and Valkey 9.1.2 (1 million keys).

Server: Azure Standard_L2aos_v5, 2 vCPUs, 16 GiB RAM, local NVMe. Values: 1 KiB. The dataset contains 84 measured GET/SET points across connection counts and worker/I/O-thread settings.

[English report](https://github.com/eloqdata/lavik/blob/main/perf_reports/lavik-v0.1.0-2vcpu-latest-capacity-2026-10-13/README.md) · [中文报告](https://github.com/eloqdata/lavik/blob/main/perf_reports/lavik-v0.1.0-2vcpu-latest-capacity-2026-10-13/README.zh-CN.md)

- `results.csv`: all 84 measured points.
- `evidence/results/`: original memtier JSON/text output, commands, CPU measurements, and server snapshots.
- `evidence/`: acquisition scripts, configuration, and run logs.
- `versions.json`, `binaries.json`, and `*-inventory.json`: software and machine details.
- `verify_results.py` and `validation.json`: offline validation and its result.
- `SHA256SUMS`: file checksums.

To validate locally with Python 3.11 or newer, run from this directory:

```sh
python3 verify_results.py
shasum -a 256 -c SHA256SUMS
```
