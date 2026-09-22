# Blog covers and topics

Every blog post has a generated SVG cover on the index, topic pages and article
page. Original vector illustrations use the article ID for a stable palette and
the primary topic for a motif. They are decorative editorial art, not measured
charts or technical diagrams. Rendering needs no image service or model call.
English and Chinese editions share the same artwork at `/blog-covers/{id}.svg`.

New blog articles must include `topics`, an ordered array containing one or more
of `architecture`, `benchmark`, `use-case`, `best-practise`, `news`. The first is
the primary topic. Use the same ordered array in both language editions. The
writer and reviewer policies require meaningful classification; publication
rejects missing, duplicate or mismatched topics. These fields are included in
the article's reviewed content hash. Existing approved posts use the separate
`content/blog-presentation.json` mapping, preserving their prose and approvals.

No extra image file or route edit is needed for a new post. Next's static export
creates its cover endpoint from the published article inventory. The sidebar
lists the five most recently dated posts (title breaks same-date ties). All five
topic routes exist in both languages, including honest empty states when a topic
has no posts. Every topic page has a canonical URL and sitemap entry.

Run `npm run check` and `npm run test:browser` before pushing through the existing
GitHub → Cloudflare workflow. Changes to the shared renderer, schema or gate also
require the independent local review described in `manual-workflow.md`.
