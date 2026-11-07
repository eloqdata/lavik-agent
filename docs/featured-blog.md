# Featured blogs

Set `"featured": true` on the English and Chinese article objects under
`content/en/` and `content/zh-CN/` to pin a post. There is no expiry date.
Set it to `false` or remove the property to return the post to the regular feed.
Content changes still follow the publication-review workflow before a push.

The blog index and matching topic pages show featured posts first, without
repeating them in the regular feed. Both sections retain the existing
`updatedAt` descending order internally; the Recent sidebar stays chronological.
Scheduled writers cannot assign `featured` or the technical-article format.

Technical articles can use article-scoped, SHA-256-bound sources, structured
HTML tables and SVG figures. Figures carry captions, alternative text and
source references. The server renders all content without requiring JavaScript.
`packages/blog/technical-publication.ts` binds the article, sources, figures and
meaning-bearing renderer to the independent ChatGPT-subscription review record.
Do not edit review records to bypass content approval.

The first featured article is `300-redis-nodes-to-3-lavik-nodes`. Its current
Lavik 0.2.0 measurements, dated Azure retail receipts and scenario models are under
`evidence/technical/featured-020-sales/`. The headline explicitly labels a model:
roughly 2.4 TB retained data, a read-heavy planning envelope below about 1M ops/s,
and two full dataset copies per side. Neither the replicated three-VM workload
nor a 2.4 TB dataset has been benchmarked. Larger Redis VM examples and Singapore
one- and three-year reservation scenarios qualify the 300-small-VM example.

The East US 2 model compares 300 E2s_v4 Redis VMs with two L16as_v4 Lavik data VMs
and one E2s_v4 Meta-only voter. One Meta member runs on each VM; only the primary
and follower hold dataset copies. Raw primary capacity denominators are before
database overhead and free-space reserves. Benchmark hardware is a separate
L16aos_v4 deployment in Japan East. No failover or rebuild times are claimed.

`scripts/build-featured-020-figures.py` reproduces the current four SVGs and numeric
models offline from the archived, checksum-verified 0.2.0 results and Azure API
receipts, using `matplotlib` and `hdrhistogram`. Reservation API prices are full-term
amounts, divided by 12 or 36 for monthly equivalents; they are not hourly rates.
The capacity chart shows 16, 128 and 256 GiB Redis alternatives on one logarithmic
VM-count axis and counts all three VMs in each independent Lavik capacity unit.

Earlier assets, source snapshots, generators and review records remain immutable.
`scripts/build-agent-era-figures.py` reproduces the historical article charts;
use the new generator for the current edition. Content and figure changes require
a fresh independent review, followed by CI and live deployment verification.
