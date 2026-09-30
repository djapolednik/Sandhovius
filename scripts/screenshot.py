#!/usr/bin/env python3
"""Ingelogde screenshots van de PWA, zonder extra tools: Firefox headless met
Marionette (ingebouwd), een token van PocketBase in localStorage, dan per
formaat een screenshot van de hele pagina. Zegt ook of de pagina scrolt.

Gebruik (stack draait, testaccount in de lokale PocketBase):
    SANDHOVIUS_EMAIL=... SANDHOVIUS_PASSWORD=... \\
        scripts/screenshot.py /tmp/home 1440x900 1366x768:dark 390x844

Optioneel: HASH='#kamers' (tabblad), HOMEVIEW=on|favorites (Home-keuze).
Firefox heeft een minimale vensterbreedte van ~500px; smaller wordt 500.
"""
import base64
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

APP = os.environ.get('SANDHOVIUS_APP', 'http://localhost:3000/')
PB = os.environ.get('SANDHOVIUS_PB', 'http://localhost:8090')


class Marionette:
    def __init__(self, port=2828):
        for _ in range(100):
            try:
                self.sock = socket.create_connection(('127.0.0.1', port))
                break
            except OSError:
                time.sleep(0.2)
        else:
            raise RuntimeError('Firefox/Marionette start niet')
        self.id = 0
        self._read()

    def _read(self):
        buf = b''
        while b':' not in buf:
            buf += self.sock.recv(1)
        size, rest = buf.split(b':', 1)
        while len(rest) < int(size):
            rest += self.sock.recv(int(size) - len(rest))
        return json.loads(rest)

    def cmd(self, name, params=None):
        self.id += 1
        data = json.dumps([0, self.id, name, params or {}]).encode()
        self.sock.sendall(str(len(data)).encode() + b':' + data)
        msg = self._read()
        if msg[2]:
            raise RuntimeError(msg[2])
        return msg[3]

    def js(self, script, args=None):
        return self.cmd('WebDriver:ExecuteScript', {'script': script, 'args': args or []}).get('value')

    def open(self, url):
        # Via about:blank, zodat ook een andere hash de pagina echt laadt.
        self.cmd('WebDriver:Navigate', {'url': 'about:blank'})
        self.cmd('WebDriver:Navigate', {'url': url})


def login():
    body = {'identity': os.environ['SANDHOVIUS_EMAIL'], 'password': os.environ['SANDHOVIUS_PASSWORD']}
    req = urllib.request.Request(
        PB + '/api/collections/users/auth-with-password',
        data=json.dumps(body).encode(),
        headers={'Content-Type': 'application/json'},
    )
    auth = json.load(urllib.request.urlopen(req))
    return json.dumps({'token': auth['token'], 'record': auth['record']})


def main(prefix, specs):
    auth = login()
    profile = tempfile.mkdtemp()
    with open(os.path.join(profile, 'user.js'), 'w') as f:
        f.write('user_pref("marionette.port", 2828);\n')
    firefox = subprocess.Popen(
        ['firefox', '--headless', '--marionette', '--no-remote', '--profile', profile],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        m = Marionette()
        m.cmd('WebDriver:NewSession', {'capabilities': {}})
        m.cmd('WebDriver:Navigate', {'url': APP})
        m.js("localStorage.setItem('pocketbase_auth', arguments[0])", [auth])
        for spec in specs:
            size, _, theme = spec.partition(':')
            w, h = map(int, size.split('x'))
            # Het venster zo zetten dat de viewport w×h is.
            m.cmd('WebDriver:SetWindowRect', {'width': w, 'height': h})
            iw, ih = m.js('return [innerWidth, innerHeight]')
            m.cmd('WebDriver:SetWindowRect', {'width': w + (w - iw), 'height': h + (h - ih)})
            m.js(
                "localStorage.setItem('sandhovius-theme', arguments[0] || 'auto');"
                "localStorage.setItem('sandhovius-home-view', arguments[1]);",
                [theme, os.environ.get('HOMEVIEW', 'favorites')],
            )
            m.open(APP + os.environ.get('HASH', ''))
            time.sleep(3)
            info = m.js('return {vw: innerWidth, vh: innerHeight, sh: document.documentElement.scrollHeight}')
            png = base64.b64decode(m.cmd('WebDriver:TakeScreenshot', {'full': True})['value'])
            out = f'{prefix}-{w}x{h}{"-" + theme if theme else ""}.png'
            with open(out, 'wb') as f:
                f.write(png)
            print(out, info, 'scrolt' if info['sh'] > info['vh'] + 1 else 'past')
        m.cmd('WebDriver:DeleteSession')
    finally:
        firefox.terminate()


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2:])
