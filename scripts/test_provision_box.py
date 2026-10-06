"""Test het aanmaken en opnieuw uitgeven in provision-box.py zonder netwerk.

De nep-server bootst PocketBase na: een superuser mag het hidden veld
claim_code_hash bij aanmaken (POST) en bij wijzigen (PATCH) zetten. Aanmaken
gebeurt in één POST, zodat er nooit een box zonder hash bestaat.
"""
import contextlib
import importlib.util
import io
import os
import re
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import claimcode  # noqa: E402

spec = importlib.util.spec_from_file_location('provision_box', os.path.join(HERE, 'provision-box.py'))
pb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pb)


class FakeServer:
    def __init__(self, existing=None):
        self.boxes = existing or {}
        self.calls = []

    def request(self, url, method, path, body=None, token=None):
        self.calls.append((method, path, body))
        if path.endswith('/auth-with-password'):
            return {'token': 't'}
        if method == 'GET':
            return {'items': [b for b in self.boxes.values() if 'serial' in path]
                    and [b for b in self.boxes.values() if b['serial'] in path]}
        if method == 'POST':
            rec = {'id': 'rec1', 'serial': body['serial'], 'house': body.get('house', ''),
                   'hash': body.get('claim_code_hash', '')}
            self.boxes['rec1'] = rec
            return rec
        if method == 'PATCH':
            rec = self.boxes[path.rsplit('/', 1)[1]]
            rec['hash'] = body.get('claim_code_hash', rec['hash'])
            return rec


def run(server, *argv):
    old = (pb.request, pb.load_env, sys.argv)
    pb.request = server.request
    pb.load_env = lambda: {'POCKETBASE_ADMIN_EMAIL': 'a@b', 'POCKETBASE_ADMIN_PASSWORD': 'x'}
    sys.argv = ['provision-box.py', *argv]
    out = io.StringIO()
    try:
        with contextlib.redirect_stdout(out):
            pb.main()
    finally:
        pb.request, pb.load_env, sys.argv = old
    return out.getvalue()


def sheet_code(path):
    svg = open(path, encoding='utf-8').read()
    return re.search(r'[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}', svg.split('Claimcode')[1]).group(0)


class ProvisionBoxTest(unittest.TestCase):
    def test_create_stores_hash_of_sheet_code(self):
        with tempfile.TemporaryDirectory() as d:
            server = FakeServer()
            out = run(server, '--serial', 'SH-T-1', '--app-url', 'http://x', '--out',
                      os.path.join(d, 'box.json'), '--sheets-dir', d)
            code = sheet_code(os.path.join(d, 'SH-T-1.svg'))
            self.assertEqual(server.boxes['rec1']['hash'], claimcode.code_hash(code))
            self.assertNotIn(code, out)
            # Eén atomische POST: geen box zonder hash, geen losse PATCH.
            self.assertEqual([c[0] for c in server.calls if 'boxes/records' in c[1] and c[0] != 'GET'], ['POST'])

    def test_lowercase_serial_is_stored_uppercase(self):
        with tempfile.TemporaryDirectory() as d:
            server = FakeServer()
            run(server, '--serial', ' sh-t-3 ', '--app-url', 'http://x', '--out',
                os.path.join(d, 'box.json'), '--sheets-dir', d)
            self.assertEqual(server.boxes['rec1']['serial'], 'SH-T-3')
            self.assertTrue(os.path.exists(os.path.join(d, 'SH-T-3.svg')))
            with open(os.path.join(d, 'box.json'), encoding='utf-8') as f:
                self.assertIn('"SH-T-3"', f.read())

    def test_reissue_accepts_lowercase_serial(self):
        with tempfile.TemporaryDirectory() as d:
            server = FakeServer({'rec1': {'id': 'rec1', 'serial': 'SH-T-4', 'house': '', 'hash': 'old'}})
            run(server, '--reissue', 'sh-t-4', '--app-url', 'http://x', '--sheets-dir', d)
            code = sheet_code(os.path.join(d, 'SH-T-4.svg'))
            self.assertEqual(server.boxes['rec1']['hash'], claimcode.code_hash(code))

    def test_reissue_stores_hash_of_new_sheet_code(self):
        with tempfile.TemporaryDirectory() as d:
            server = FakeServer({'rec1': {'id': 'rec1', 'serial': 'SH-T-2', 'house': '', 'hash': 'old'}})
            run(server, '--reissue', 'SH-T-2', '--app-url', 'http://x', '--sheets-dir', d)
            code = sheet_code(os.path.join(d, 'SH-T-2.svg'))
            self.assertEqual(server.boxes['rec1']['hash'], claimcode.code_hash(code))


if __name__ == '__main__':
    unittest.main()
