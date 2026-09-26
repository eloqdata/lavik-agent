"""Check the actual exported HTML, canonical/language links, and discovery assets."""
import hashlib
import subprocess
import json
import pathlib
import sys
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from urllib.parse import urlparse

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "apps/web/out")
from seo_html import Page, semantic_digest

def target(url):
    path=urlparse(url).path
    return root / path.lstrip("/") / "index.html" if path.endswith("/") else root / path.lstrip("/")

errors=[]; checked=0; manifest={}
tree=ET.fromstring((root/"sitemap.xml").read_text()); ns={"s":"http://www.sitemaps.org/schemas/sitemap/0.9"}
urls=[n.text for n in tree.findall("s:url/s:loc",ns)]
if len(urls)!=len(set(urls)): errors.append("Duplicate sitemap URLs")
for url in urls:
    file=target(url)
    if not file.is_file(): errors.append(f"Missing sitemap destination: {url}"); continue
    p=Page(); p.feed(file.read_text()); checked+=1
    manifest[url]=semantic_digest(p)
    if not p.meta.get("description"): errors.append(f"Missing description: {url}")
    if "noindex" in p.meta.get("robots",""): errors.append(f"Noindex URL in sitemap: {url}")
    if p.h1 != 1: errors.append(f"Expected one h1: {url} ({p.h1})")
    canonical=[a.get("href") for a in p.links if a.get("rel")=="canonical"]
    if canonical != [url]: errors.append(f"Canonical mismatch: {url}: {canonical}")
    alternate=[a for a in p.links if a.get("hreflang") in ("en","zh-CN")]
    if len(alternate)!=2: errors.append(f"Missing language pair: {url}")
    for a in alternate:
        if not target(a["href"]).is_file(): errors.append(f"Broken language destination: {url} -> {a['href']}")
    if not p.data: errors.append(f"Missing JSON-LD: {url}")
    image=p.meta.get("og:image", "")
    if not image or not target(image).is_file(): errors.append(f"Missing social image: {url}")
    if p.meta.get("twitter:card")!="summary_large_image": errors.append(f"Missing X card: {url}")
    for link in p.hrefs:
        parsed=urlparse(link)
        if (not parsed.netloc or parsed.netloc=="lavik.dev") and parsed.path.startswith(("/en/","/zh-CN/")) and not target(link).exists(): errors.append(f"Broken internal link: {url} -> {link}")

for file in ("llms.txt","en/feed.xml","zh-CN/feed.xml","campaign-links.json"):
    if not (root/file).is_file(): errors.append(f"Missing discovery asset: {file}")
for locale in ("en","zh-CN"):
    ET.fromstring((root/locale/"feed.xml").read_text())
if errors:
    unique=sorted(set(errors)); print("\n".join(unique[:40])); print(f"SEO audit failed: {len(unique)} issues across {checked} pages"); raise SystemExit(1)
print(f"SEO audit passed: {checked} sitemap pages, metadata, canonical/language links, JSON-LD, social previews, internal links, and discovery assets.")

revision=subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip()
(root/"discovery-manifest.json").write_text(json.dumps({"revision":revision,"pages":manifest},indent=2)+"\n")
