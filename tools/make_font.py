#!/usr/bin/env python3
"""Erzeugt einen TrueType-Font, der die Level-Editor-Symbole als
Original-Spielkacheln (16x16 Pixel, aus dem Spielzeichensatz bei $3800)
darstellt. Damit zeigt ein Texteditor die Leveldateien wie im Spiel.

Verwendung:  python3 tools/make_font.py
Ergebnis:    tools/rockman-kacheln.ttf
"""
import base64, re, os
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAMEDATA = os.path.join(REPO, 'js', 'game-data.js')
CHARSET = 0x3800
EM = 1024
PX = EM // 16   # 64 Einheiten pro Spielpixel

# Editor-Symbol -> Kachelnummer (Glyphenbasis = Kachel * 4)
SYMBOLE = {' ': 0, 'O': 1, '*': 2, '#': 3, 'X': 4, 'M': 5, 'B': 6,
           '%': 7, ':': 8, '.': 9,
           'a': 10, 'b': 11, 'c': 12, 'd': 13, 'e': 14, 'f': 15}

def lese_ram():
    src = open(GAMEDATA).read()
    m = re.search(r"GAME_RAM_B64 = '([^']+)'", src)
    return base64.b64decode(m.group(1))

def kachel_pixel(ram, kachel):
    """16x16-Pixelmatrix einer Kachel (4 Zeichen in 2x2-Anordnung)."""
    pix = [[0]*16 for _ in range(16)]
    for halb_y in range(2):
        for halb_x in range(2):
            glyph = kachel*4 + halb_y*2 + halb_x
            for y in range(8):
                b = ram[CHARSET + glyph*8 + y]
                for x in range(8):
                    pix[halb_y*8 + y][halb_x*8 + x] = (b >> (7-x)) & 1
    return pix

def zeichne(pen, pix):
    """Gesetzte Pixel als Rechtecke (Zeilen-Laeufe zusammengefasst)."""
    for y in range(16):
        x = 0
        while x < 16:
            if pix[y][x]:
                x0 = x
                while x < 16 and pix[y][x]: x += 1
                # y=0 oben -> Font-Koordinaten: Grundlinie unten
                top = EM - y*PX
                bot = EM - (y+1)*PX
                l, r = x0*PX, x*PX
                pen.moveTo((l, bot)); pen.lineTo((l, top))
                pen.lineTo((r, top)); pen.lineTo((r, bot))
                pen.closePath()
            else:
                x += 1

ram = lese_ram()
fb = FontBuilder(EM, isTTF=True)
glyph_order = ['.notdef'] + [f'kachel{v}' for v in sorted(set(SYMBOLE.values()))]
fb.setupGlyphOrder(glyph_order)
cmap = {ord(s): f'kachel{v}' for s, v in SYMBOLE.items()}
fb.setupCharacterMap(cmap)
glyphs = {}
pen = TTGlyphPen(None)
glyphs['.notdef'] = pen.glyph()
for v in sorted(set(SYMBOLE.values())):
    pen = TTGlyphPen(None)
    zeichne(pen, kachel_pixel(ram, v))
    glyphs[f'kachel{v}'] = pen.glyph()
fb.setupGlyf(glyphs)
metrics = {name: (EM, 0) for name in glyph_order}
fb.setupHorizontalMetrics(metrics)
fb.setupHorizontalHeader(ascent=EM, descent=0)
fb.setupNameTable({'familyName': 'Rockman Kacheln', 'styleName': 'Regular',
                   'fullName': 'Rockman Kacheln', 'psName': 'RockmanKacheln'})
fb.setupOS2(sTypoAscender=EM, sTypoDescender=0, usWinAscent=EM, usWinDescent=0)
fb.setupPost(isFixedPitch=1)
out = os.path.join(REPO, 'tools', 'rockman-kacheln.ttf')
fb.save(out)
print("Font erzeugt:", out, os.path.getsize(out), "Bytes")
