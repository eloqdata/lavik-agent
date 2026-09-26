"""Mandatory live verification; independent of external indexing notifications."""
import concurrent.futures
import hashlib
import json
import pathlib
import subprocess
import sys
import time
import urllib.request
from seo_html import Page, semantic_digest


def verify_identity(expected, actual):
    if actual != expected:
        raise ValueError("Live discovery manifest does not match the expected revision and page identities")


def verify_page(url, html, expected_digest):
    page = Page()
    page.feed(html)
    if semantic_digest(page) != expected_digest:
        raise ValueError(f"Live page differs from the reviewed build: {url}")


def fetch(url):
    last = None
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "LavikDeploymentVerifier/0.1", "Cache-Control": "no-cache"})
            with urllib.request.urlopen(request, timeout=25) as response:
                if response.status != 200:
                    raise ValueError(f"Unexpected HTTP {response.status}: {url}")
                return response.read()
        except Exception as error:
            last = error
            if attempt < 2:
                time.sleep(2 * (attempt + 1))
    raise last


def main():
    root = pathlib.Path("apps/web/out")
    expected = json.loads((root / "discovery-manifest.json").read_text())
    revision = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    if expected["revision"] != revision:
        raise ValueError("Export does not represent this commit")
    suffix = f"?deployment_check={revision}"
    verify_identity(expected, json.loads(fetch("https://lavik.dev/discovery-manifest.json" + suffix)))
    def check(item):
        url, digest = item
        verify_page(url, fetch(url + suffix).decode(), digest)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(check, expected["pages"].items()))
    for asset in ["llms.txt", "robots.txt", "sitemap.xml", "en/feed.xml", "zh-CN/feed.xml", "campaign-links.json"]:
        live = fetch("https://lavik.dev/" + asset + suffix)
        if hashlib.sha256(live).digest() != hashlib.sha256((root / asset).read_bytes()).digest():
            raise ValueError(f"Live discovery asset differs from build: {asset}")
    receipt = {"revision": revision, "status": "passed", "checkedPages": len(expected["pages"]), "discoveryAssets": 6}
    pathlib.Path(".cache").mkdir(exist_ok=True)
    pathlib.Path(".cache/live-deployment.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(f"Live deployment verified: {len(expected['pages'])} page identities and 6 discovery assets.")


if __name__ == "__main__":
    main()
