import json
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import claimcode  # noqa: E402

VECTORS = os.path.join(os.path.dirname(HERE), 'backend', 'tests', 'testdata', 'claim_codes.json')
CHECK_VECTORS = os.path.join(os.path.dirname(HERE), 'backend', 'tests', 'testdata', 'claim_check.json')


class ClaimCodeTest(unittest.TestCase):
    def test_vectors(self):
        with open(VECTORS, encoding='utf-8') as f:
            vectors = json.load(f)
        self.assertTrue(vectors)
        for v in vectors:
            with self.subTest(input=v['input']):
                self.assertEqual(claimcode.normalize(v['input']), v['normalized'])
                self.assertEqual(claimcode.code_hash(v['input'], 'sandhovius-test-key'), v['hmac'])

    def test_code_hash_needs_key(self):
        with self.assertRaises(ValueError):
            claimcode.code_hash('K7QM-2XRP-9DTW', '')

    def test_new_code_format(self):
        pattern = re.compile(r'^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){2}$')
        for _ in range(100):
            self.assertRegex(claimcode.new_code(), pattern)

    def test_new_code_has_valid_check_char(self):
        for _ in range(200):
            self.assertTrue(claimcode.is_valid(claimcode.new_code()))

    def test_check_vectors(self):
        with open(CHECK_VECTORS, encoding='utf-8') as f:
            vectors = json.load(f)
        for v in vectors:
            with self.subTest(code=v['code'], note=v['note']):
                self.assertEqual(claimcode.is_valid(v['code']), v['valid'])

    def test_catches_every_single_typo(self):
        # Eigenschap van Luhn mod N: elk ander teken op elke plek valt op.
        a = claimcode.ALPHABET
        for _ in range(20):
            code = claimcode.normalize(claimcode.new_code())
            for i in range(12):
                for c in a:
                    if c != code[i]:
                        self.assertFalse(claimcode.is_valid(code[:i] + c + code[i + 1:]))

    def test_catches_nearly_every_neighbour_swap(self):
        # Luhn mod 32 mist alleen het paar met waarden 0 en 31 ("0" en "Z").
        a = claimcode.ALPHABET
        missed = 0
        for x in a:
            for y in a:
                if x == y:
                    continue
                body = x + y + '000000000'
                code = body + claimcode.check_char(body)
                if claimcode.is_valid(code[1] + code[0] + code[2:]):
                    missed += 1
        self.assertEqual(missed, 2)  # 0Z en Z0

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
