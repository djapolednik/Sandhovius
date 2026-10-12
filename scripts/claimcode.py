"""Pure functies voor de claimcode van een box (geen netwerk).

De normalisatie moet exact gelijk zijn aan die van de PocketBase-hook en de PWA;
de gedeelde testvectoren staan in backend/tests/testdata/claim_codes.json.
"""
import hashlib
import hmac
import secrets
from urllib.parse import quote
from xml.sax.saxutils import escape

import segno

ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'  # Crockford-base32


def check_char(body):
    """Controleteken (Luhn mod 32) voor een genormaliseerde code zonder dat
    teken. Vangt elke enkele tikfout en bijna elke verwisseling van twee
    buren. Moet gelijk zijn aan checkChar in frontend/lib/claim.js; de
    gedeelde vectoren staan in backend/tests/testdata/claim_check.json."""
    n = len(ALPHABET)
    factor, total = 2, 0
    for c in reversed(body):
        addend = factor * ALPHABET.index(c)
        total += addend // n + addend % n
        factor = 3 - factor
    return ALPHABET[(n - total % n) % n]


def is_valid(code):
    """12 tekens uit het alfabet (na normaliseren) met een kloppend controleteken."""
    code = normalize(code)
    return (len(code) == 12 and all(c in ALPHABET for c in code)
            and check_char(code[:-1]) == code[-1])


def new_code():
    """11 willekeurige tekens plus een controleteken, getoond als XXXX-XXXX-XXXX."""
    body = ''.join(secrets.choice(ALPHABET) for _ in range(11))
    chars = body + check_char(body)
    return '-'.join(chars[i:i + 4] for i in range(0, 12, 4))


def normalize(code):
    """Hoofdletters, alleen spaties en '-' weg, O->0, I->1, L->1."""
    code = code.upper().replace(' ', '').replace('-', '')
    return code.replace('O', '0').replace('I', '1').replace('L', '1')


def code_hash(code, key):
    """HMAC-SHA256 van de genormaliseerde code met CLAIM_CODE_KEY: gelijk aan
    $security.hs256 in de hook. De sleutel staat niet in de database."""
    if not key:
        raise ValueError('CLAIM_CODE_KEY ontbreekt')
    return hmac.new(key.encode('utf-8'), normalize(code).encode('utf-8'), hashlib.sha256).hexdigest()


def claim_url(app_url, serial, code):
    """<app>/koppel#s=...&c=...: de code staat in het fragment, dat de browser
    nooit naar een server stuurt (dus in geen enkel log)."""
    return f'{app_url.rstrip("/")}/koppel#s={quote(serial, safe="")}&c={quote(code, safe="-")}'


def sheet_svg(app_url, serial, code):
    """Printblad (SVG): QR, serienummer, code en app-adres."""
    qr = segno.make(claim_url(app_url, serial, code), error='m')
    matrix = [list(row) for row in qr.matrix]
    border = 4
    n = len(matrix) + 2 * border
    path = ''.join(f'M{x + border} {y + border}h1v1h-1z'
                   for y, row in enumerate(matrix) for x, bit in enumerate(row) if bit)
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="105mm" height="148mm" viewBox="0 0 105 148" font-family="Arial, Helvetica, sans-serif">
  <rect width="105" height="148" fill="#fff"/>
  <text x="52.5" y="18" text-anchor="middle" font-size="8" font-weight="bold">Sandhovius</text>
  <svg x="12.5" y="26" width="80" height="80" viewBox="0 0 {n} {n}" shape-rendering="crispEdges">
    <rect width="{n}" height="{n}" fill="#fff"/>
    <path d="{path}" fill="#000"/>
  </svg>
  <text x="52.5" y="116" text-anchor="middle" font-size="4" fill="#555">Serienummer</text>
  <text x="52.5" y="122" text-anchor="middle" font-size="6">{escape(serial)}</text>
  <text x="52.5" y="130" text-anchor="middle" font-size="4" fill="#555">Claimcode</text>
  <text x="52.5" y="137" text-anchor="middle" font-size="7" font-family="Courier New, monospace" font-weight="bold">{escape(code)}</text>
  <text x="52.5" y="144" text-anchor="middle" font-size="3.5" fill="#555">Scan de code of ga naar {escape(app_url.rstrip("/"))}</text>
</svg>
'''
