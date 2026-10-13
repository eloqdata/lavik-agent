"""Regression coverage for the public APT byte-verification boundary."""
import hashlib
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('verify_apt', Path(__file__).resolve().parents[1] / 'scripts/verify-apt.py')
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)


class LiveAptVerification(unittest.TestCase):
    def setUp(self):
        self.contents = {
            'lavik-archive-keyring.asc': b'reviewed public key',
            'dists/noble/InRelease': b'reviewed signed index',
            'pool/main/l/lavik/lavik_0.1.0-1_arm64.deb': b'reviewed package',
        }
        self.manifest = {'files': [{'path': name, 'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in self.contents.items()]}

    def response(self, request, timeout):
        self.assertTrue(request.full_url.startswith('https://lavik.dev/apt/'))
        self.assertEqual(request.get_header('User-agent'), 'LavikAPTReleaseVerifier/0.1.0')
        return io.BytesIO(self.contents[request.full_url.removeprefix('https://lavik.dev/apt/')])

    def test_exact_published_bytes_pass(self):
        with patch.object(verifier.urllib.request, 'urlopen', self.response):
            self.assertEqual(verifier.verify_live_files(self.manifest), sorted(self.contents))

    def test_changed_key_index_or_package_is_rejected(self):
        for name in self.contents:
            with self.subTest(name=name):
                original = self.contents[name]
                self.contents[name] = b'x' * len(original)
                with patch.object(verifier.urllib.request, 'urlopen', self.response), self.assertRaises(AssertionError):
                    verifier.verify_live_files(self.manifest)
                self.contents[name] = original

    def test_extra_bytes_are_rejected(self):
        self.contents['lavik-archive-keyring.asc'] += b'extra'
        with patch.object(verifier.urllib.request, 'urlopen', self.response), self.assertRaises(AssertionError):
            verifier.verify_live_files(self.manifest)

    def test_metadata_is_rechecked_after_installation(self):
        del self.contents['pool/main/l/lavik/lavik_0.1.0-1_arm64.deb']
        with patch.object(verifier.urllib.request, 'urlopen', self.response):
            self.assertEqual(verifier.verify_live_files(self.manifest, metadata_only=True), sorted(self.contents))

    def test_transient_transport_failure_retries_without_relaxing_hash_checks(self):
        one = {'files': [self.manifest['files'][0]]}
        with patch.object(verifier.urllib.request, 'urlopen', side_effect=[ConnectionResetError(), io.BytesIO(b'reviewed public key')]) as fetch, patch.object(verifier.time, 'sleep'):
            self.assertEqual(verifier.verify_live_files(one), ['lavik-archive-keyring.asc'])
            self.assertEqual(fetch.call_count, 2)

    def test_authorization_failure_is_not_retried(self):
        one = {'files': [self.manifest['files'][0]]}
        error = verifier.urllib.error.HTTPError('https://lavik.dev/apt/test', 403, 'Forbidden', {}, None)
        with patch.object(verifier.urllib.request, 'urlopen', side_effect=error) as fetch, self.assertRaises(verifier.urllib.error.HTTPError):
            verifier.verify_live_files(one)
        self.assertEqual(fetch.call_count, 1)


if __name__ == '__main__':
    unittest.main()
