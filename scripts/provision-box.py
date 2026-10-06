#!/usr/bin/env python3
"""Maakt een box-identiteit aan: een `boxes`-record in PocketBase met een
willekeurig geheim, en een `box.json` die de box in /data legt.

Zonder --house is het de fabrieksvariant (box nog niet gekoppeld); met --house
wordt de box meteen aan een bestaand huis gehangen (dev, tests).
Maakt ook een claimcode en een printblad (SVG met QR) in --sheets-dir; alleen de
hash van de code gaat naar PocketBase. Print alleen serienummer, record-id en
bladpad, nooit het geheim of de code.
--reissue <serial> geeft een gekoppelde-loze box een nieuwe code en blad (geheim en
box.json blijven ongemoeid).

Gebruik (stack draait, superuser in .env):
    scripts/provision-box.py --serial SH-DEV-0001 --house <huis-id> --out box.json
    docker cp box.json sandhovius-agent:/data/box.json   # daarna box.json wissen

POCKETBASE_URL (of SANDHOVIUS_PB) is standaard http://localhost:8090.
Een bestaand serienummer is een fout; er wordt niets overschreven.
"""
import argparse
import base64
import json
import os
import secrets
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import claimcode  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def load_env():
    env = {}
    path = os.path.join(ROOT, '.env')
    if os.path.exists(path):
        with open(path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env[key.strip()] = value.strip()
    env.update({k: v for k, v in os.environ.items() if k.startswith(('POCKETBASE_', 'SANDHOVIUS_'))})
    return env


def request(url, method, path, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url + path, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    if token:
        req.add_header('Authorization', token)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        raise RuntimeError(f'{method} {path}: {e.code} {e.read().decode()}') from None


def write_sheet(sheets_dir, app_url, serial, code):
    """Schrijft het printblad (bevat de code, modus 0600) en geeft het pad terug."""
    os.makedirs(sheets_dir, exist_ok=True)
    path = os.path.join(sheets_dir, f'{serial}.svg')
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(claimcode.sheet_svg(app_url, serial, code))
    return path


def reissue(url, email, password, serial, app_url, sheets_dir):
    try:
        token = request(url, 'POST', '/api/collections/_superusers/auth-with-password',
                        {'identity': email, 'password': password})['token']
        found = request(url, 'GET', '/api/collections/boxes/records?perPage=1&filter=' +
                        urllib.request.quote(f'serial = {json.dumps(serial)}'), token=token)
        if not found['items']:
            sys.exit(f'serienummer {serial} bestaat niet')
        box = found['items'][0]
        if box.get('house'):
            sys.exit('Box is gekoppeld; ontkoppel hem eerst')
        code = claimcode.new_code()
        request(url, 'PATCH', f'/api/collections/boxes/records/{box["id"]}',
                {'claim_code_hash': claimcode.code_hash(code)}, token)
    except RuntimeError as e:
        sys.exit(f'mislukt: {e}')
    sheet = write_sheet(sheets_dir, app_url, serial, code)
    print(f'box {serial} nieuwe claimcode (record {box["id"]})')
    print(f'printblad: {sheet}')


def main():
    ap = argparse.ArgumentParser(description='Maak een box-identiteit (boxes-record + box.json).')
    ap.add_argument('--serial', help='serienummer, bijv. SH-DEV-0001')
    ap.add_argument('--house', help='huis-id om de box meteen aan te koppelen')
    ap.add_argument('--out', default='box.json', help='pad van box.json (standaard ./box.json)')
    ap.add_argument('--app-url', help='adres van de PWA voor de QR (of env APP_URL)')
    ap.add_argument('--sheets-dir', default='sheets', help='map voor printbladen (standaard ./sheets)')
    ap.add_argument('--reissue', metavar='SERIAL', help='nieuwe claimcode en blad voor een box zonder huis')
    args = ap.parse_args()
    if not args.reissue and not args.serial:
        ap.error('--serial of --reissue is verplicht')

    env = load_env()
    url = env.get('POCKETBASE_URL') or env.get('SANDHOVIUS_PB') or 'http://localhost:8090'
    email = env.get('POCKETBASE_ADMIN_EMAIL')
    password = env.get('POCKETBASE_ADMIN_PASSWORD')
    if not email or not password:
        sys.exit('POCKETBASE_ADMIN_EMAIL/PASSWORD ontbreken (zie .env)')
    app_url = args.app_url or env.get('APP_URL') or os.environ.get('APP_URL')
    if not app_url:
        sys.exit('--app-url (of env APP_URL) is verplicht')
    if not args.reissue and os.path.exists(args.out):
        sys.exit(f'{args.out} bestaat al; niet overschrijven')

    if args.reissue:
        reissue(url, email, password, args.reissue, app_url, args.sheets_dir)
        return

    try:
        token = request(url, 'POST', '/api/collections/_superusers/auth-with-password',
                        {'identity': email, 'password': password})['token']
        found = request(url, 'GET', '/api/collections/boxes/records?perPage=1&filter=' +
                        urllib.request.quote(f'serial = {json.dumps(args.serial)}'), token=token)
        if found['items']:
            sys.exit(f'serienummer {args.serial} bestaat al (record {found["items"][0]["id"]})')

        secret = base64.b64encode(secrets.token_bytes(32)).decode()
        code = claimcode.new_code()
        body = {'serial': args.serial, 'password': secret, 'passwordConfirm': secret}
        if args.house:
            body['house'] = args.house
        record = request(url, 'POST', '/api/collections/boxes/records', body, token)
        # Hidden velden worden bij aanmaken genegeerd; de hash gaat dus via een PATCH.
        request(url, 'PATCH', f'/api/collections/boxes/records/{record["id"]}',
                {'claim_code_hash': claimcode.code_hash(code)}, token)
    except RuntimeError as e:
        sys.exit(f'mislukt: {e}')

    # box.json met modus 0600, atomisch (tmp + rename) zoals de agent het zelf doet.
    tmp = args.out + '.tmp'
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump({'serial': args.serial, 'secret': secret, 'house': args.house or ''}, f)
    os.replace(tmp, args.out)

    sheet = write_sheet(args.sheets_dir, app_url, args.serial, code)
    print(f'box {args.serial} aangemaakt (record {record["id"]}) -> {args.out}')
    print(f'printblad: {sheet}')


if __name__ == '__main__':
    main()
