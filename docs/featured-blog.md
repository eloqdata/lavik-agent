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

The first featured article is `300-redis-nodes-to-3-lavik-nodes`. Its sizing
assumptions, factual pricing observation and derived measurements are under
`evidence/technical/agent-era/`. `scripts/build-agent-era-figures.py` recreates
the benchmark and capacity charts from the archived raw results using
`matplotlib` and `hdrhistogram`. It extracts existing measurements; it does not
run a benchmark. The two explanatory SVG diagrams are authored illustrations.
