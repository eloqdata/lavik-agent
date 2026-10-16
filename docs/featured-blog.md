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
Azure VM sizing and retail-price receipts are under
`evidence/technical/agent-era-voter/`; derived benchmark measurements remain
under `evidence/technical/agent-era/`. The East US 2 model prices 300 E2s_v4
Redis VMs against two L16as_v4 Lavik data VMs and one E2s_v4 Meta-only voter.
One Meta member runs on each VM; only the primary and follower hold dataset
copies. The single-copy NVMe denominator is 3.84 TB. Both systems' capacity
denominators are before database overhead and free-space reserves.

`scripts/build-agent-era-figures.py` recreates the benchmark and capacity charts
from the archived inputs using `matplotlib` and `hdrhistogram`. The capacity
chart uses one logarithmic VM-count axis and includes the voter VM in each
independent Lavik deployment unit. The script extracts existing measurements;
it does not run a benchmark. The two explanatory SVG diagrams are authored
illustrations. Earlier source snapshots and review records remain immutable.
