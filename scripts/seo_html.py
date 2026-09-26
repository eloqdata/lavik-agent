import hashlib
import json
from html.parser import HTMLParser

class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.meta={}; self.links=[]; self.data=[]; self.jsonld=False; self.buffer=""; self.h1=0; self.hrefs=[]; self.main=False; self.visible=[]; self.skip=False
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if tag=="main": self.main=True
        if tag in ("script","style"): self.skip=True
        if tag=="meta": self.meta[a.get("name",a.get("property",""))]=a.get("content","")
        if tag=="link": self.links.append(a)
        if tag=="a" and a.get("href"): self.hrefs.append(a["href"])
        if tag=="h1": self.h1+=1
        if tag=="script" and a.get("type")=="application/ld+json": self.jsonld=True; self.buffer=""
    def handle_data(self, data):
        if self.jsonld: self.buffer+=data
        if self.main and not self.skip: self.visible.append(data)
    def handle_endtag(self, tag):
        if tag=="main": self.main=False
        if tag in ("script","style"): self.skip=False
        if tag=="script" and self.jsonld:
            self.data.append(json.loads(self.buffer)); self.jsonld=False


def semantic_digest(page):
    semantic=json.dumps({"main":" ".join(page.visible),"meta":page.meta,"links":page.links,"structured":page.data},sort_keys=True,ensure_ascii=False)
    return hashlib.sha256(semantic.encode()).hexdigest()
