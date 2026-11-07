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
Lavik 0.2.0 measurements and capacity model are under
`evidence/technical/featured-marketing/`, with dated Microsoft retail receipts
in the immutable `featured-020-sales/sources/` archive. The headline labels a
model for roughly 2.4 TB of retained data, read-heavy demand below about 1M ops/s,
and two full dataset copies per side. Larger Redis VM examples explain that
node count changes while the price per TB of RAM stays the same. The two larger
examples round capacity up by 6.7%; the notes explain the corresponding bill.

The cost model uses Singapore Linux pay-as-you-go rates for 300 E2s_v4 Redis VMs
versus two L16as_v4 Lavik data VMs and one E2s_v4 Meta-only voter. The topology
figure contains no performance benchmark callout. Benchmark hardware and
replication configuration are recorded in the closing notes: measured
L16aos_v4 hardware in Japan East differs from the modeled L16as_v4 deployment.
No failover or rebuild times are claimed.

`scripts/build-featured-marketing-figures.py` reproduces the four current SVGs
and numeric models offline from the checksum-verified 0.2.0 results and Azure
API receipts, using `matplotlib` and `hdrhistogram`. The capacity chart shows
16, 128 and 256 GiB Redis alternatives on one logarithmic VM-count axis and
counts all three VMs in each independent Lavik capacity unit.

Earlier assets, source snapshots, generators and review records remain immutable.
Content and figure changes require a fresh independent review, followed by CI
and live deployment verification.
