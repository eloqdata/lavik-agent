import pathlib
import sys
import unittest
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
from seo_html import Page, semantic_digest
from verify_site import verify_identity, verify_page


class DeploymentChecks(unittest.TestCase):
    def test_manifest_requires_revision_and_page_identities(self):
        expected = {"revision": "current", "pages": {"https://lavik.dev/en/": "digest"}}
        verify_identity(expected, expected)
        for actual in [{**expected, "revision": "old"}, {**expected, "pages": {}}, {**expected, "pages": {"https://lavik.dev/en/": "old"}}]:
            with self.assertRaises(ValueError):
                verify_identity(expected, actual)

    def test_live_html_must_match_semantic_identity(self):
        html = '<main><h1>Reviewed</h1><p>Original statement.</p></main>'
        page = Page()
        page.feed(html)
        digest = semantic_digest(page)
        verify_page("https://lavik.dev/en/", html, digest)
        with self.assertRaises(ValueError):
            verify_page("https://lavik.dev/en/", html.replace("Original", "Changed"), digest)
        with self.assertRaises(ValueError):
            verify_page("https://lavik.dev/en/", "<h1>Challenge page</h1>", digest)

if __name__ == "__main__":
    unittest.main()
