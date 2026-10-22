# Lavik v0.2.0: complete benchmark acquisition captures

[Report review](https://github.com/thweetkomputer/lavik/pull/4)

All five downloaded experiment captures are preserved as individual files under [acquisitions](acquisitions), with the original per-file manifests. Captures overlap because they were collected at different pipeline stages. [source-archives.json](source-archives.json) records the identity of each original transport archive.

| Capture | Contents |
|---|---|
| small | Complete 2-vCPU suite, scripts, host inventories and original outputs. |
| large-initial | Initial 16-vCPU 10M sweeps, including 80 connections, plus the superseded 16-client-thread 1B measurements. |
| storage32 | Fresh 32-client-thread Lavik 1B run and restoration receipts. |
| ycsb | Complete Aerospike/Lavik YCSB capture before device reuse, including initial startup repair records. |
| large-final | Final host capture with the fresh 32-thread 1B results, all five storage peers, YCSB records, pipeline scripts and inventories. |

The published 10M and 1B reports exclude 80-connection points. Published 1B results use 32 client threads; the initial 16-thread run is retained only for audit. This archive also retains smoke tests and setup records; these are not additional formal measurement points. Refer to the three matching report directories for the 236 unique accepted formal windows (eight Lavik 1B points are shared by two reports).

Database data files and access credentials are not part of the collected benchmark evidence. [SHA256SUMS](SHA256SUMS) covers the archive; verify with `shasum -a 256 -c SHA256SUMS`.
