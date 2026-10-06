#!/usr/bin/env python3
"""Maakt een box-identiteit aan: een `boxes`-record in PocketBase met een
willekeurig geheim, en een `box.json` die de box in /data legt.

Zonder --house is het de fabrieksvariant (box nog niet gekoppeld); met --house
wordt de box meteen aan een bestaand huis gehangen (dev, tests).
Print alleen het serienummer en het record-id, nooit het geheim.

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


def main():
    ap = argparse.ArgumentParser(description='Maak een box-identiteit (boxes-record + box.json).')
    ap.add_argument('--serial', required=True, help='serienummer, bijv. SH-DEV-0001')
    ap.add_argument('--house', help='huis-id om de box meteen aan te koppelen')
    ap.add_argument('--out', default='box.json', help='pad van box.json (standaard ./box.json)')
    args = ap.parse_args()

    env = load_env()
    url = env.get('POCKETBASE_URL') or env.get('SANDHOVIUS_PB') or 'http://localhost:8090'
    email = env.get('POCKETBASE_ADMIN_EMAIL')
    password = env.get('POCKETBASE_ADMIN_PASSWORD')
    if not email or not password:
        sys.exit('POCKETBASE_ADMIN_EMAIL/PASSWORD ontbreken (zie .env)')
    if os.path.exists(args.out):
        sys.exit(f'{args.out} bestaat al; niet overschrijven')

    try:
        token = request(url, 'POST', '/api/collections/_superusers/auth-with-password',
                        {'identity': email, 'password': password})['token']
        found = request(url, 'GET', '/api/collections/boxes/records?perPage=1&filter=' +
                        urllib.request.quote(f'serial = {json.dumps(args.serial)}'), token=token)
        if found['items']:
            sys.exit(f'serienummer {args.serial} bestaat al (record {found["items"][0]["id"]})')

        secret = base64.b64encode(secrets.token_bytes(32)).decode()
        body = {'serial': args.serial, 'password': secret, 'passwordConfirm': secret}
        if args.house:
            body['house'] = args.house
        record = request(url, 'POST', '/api/collections/boxes/records', body, token)
    except RuntimeError as e:
        sys.exit(f'mislukt: {e}')

    # box.json met modus 0600, atomisch (tmp + rename) zoals de agent het zelf doet.
    tmp = args.out + '.tmp'
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        json.dump({'serial': args.serial, 'secret': secret, 'house': args.house or ''}, f)
    os.replace(tmp, args.out)

    print(f'box {args.serial} aangemaakt (record {record["id"]}) -> {args.out}')


if __name__ == '__main__':
    main()
