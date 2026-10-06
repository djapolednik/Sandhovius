import json
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import claimcode  # noqa: E402

VECTORS = os.path.join(os.path.dirname(HERE), 'backend', 'tests', 'testdata', 'claim_codes.json')


class ClaimCodeTest(unittest.TestCase):
    def test_vectors(self):
        with open(VECTORS, encoding='utf-8') as f:
            vectors = json.load(f)
        self.assertTrue(vectors)
        for v in vectors:
            with self.subTest(input=v['input']):
                self.assertEqual(claimcode.normalize(v['input']), v['normalized'])
                self.assertEqual(claimcode.code_hash(v['input']), v['sha256'])

    def test_new_code_format(self):
        pattern = re.compile(r'^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$')
        for _ in range(100):
            self.assertRegex(claimcode.new_code(), pattern)

    def test_claim_url(self):
        # Fragment (na #): de code gaat nooit naar een server of in een log.
        want = 'https://a.b/koppel#s=SH-1&c=K7QM-2XRP-9DTW'
        self.assertEqual(claimcode.claim_url('https://a.b', 'SH-1', 'K7QM-2XRP-9DTW'), want)
        self.assertEqual(claimcode.claim_url('https://a.b/', 'SH-1', 'K7QM-2XRP-9DTW'), want)

    def test_sheet_contains_code_and_serial(self):
        svg = claimcode.sheet_svg('https://a.b', 'SH-1', 'K7QM-2XRP-9DTW')
        self.assertIn('<svg', svg)
        self.assertIn('SH-1', svg)
        self.assertIn('K7QM-2XRP-9DTW', svg)


if __name__ == '__main__':
    unittest.main()
