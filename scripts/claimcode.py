"""Pure functies voor de claimcode van een box (geen netwerk).

De normalisatie moet exact gelijk zijn aan die van de PocketBase-hook en de PWA;
de gedeelde testvectoren staan in backend/tests/testdata/claim_codes.json.
"""
import hashlib
import secrets
from urllib.parse import quote
from xml.sax.saxutils import escape

import segno

ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'  # Crockford-base32


def new_code():
    """12 willekeurige tekens, getoond als XXXX-XXXX-XXXX."""
    chars = ''.join(secrets.choice(ALPHABET) for _ in range(12))
    return '-'.join(chars[i:i + 4] for i in range(0, 12, 4))


def normalize(code):
    """Hoofdletters, alleen spaties en '-' weg, O->0, I->1, L->1."""
    code = code.upper().replace(' ', '').replace('-', '')
    return code.replace('O', '0').replace('I', '1').replace('L', '1')


def code_hash(code):
    return hashlib.sha256(normalize(code).encode('utf-8')).hexdigest()


def claim_url(app_url, serial, code):
    return f'{app_url.rstrip("/")}/koppel?s={quote(serial, safe="")}&c={quote(code, safe="-")}'


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
