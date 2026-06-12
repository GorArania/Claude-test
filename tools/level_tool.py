#!/usr/bin/env python3
"""Level-Werkzeug fuer Return of Rockman (Browser-Version).

Exportiert Level als bearbeitbare Textdatei und importiert sie zurueck
in js/game-data.js (dort steckt das Speicherabbild des Spiels als Base64).

Verwendung:
  python3 tools/level_tool.py export A           -> levels/level_A.txt
  python3 tools/level_tool.py export-alle        -> levels/level_A..J.txt
  python3 tools/level_tool.py import A [datei]   [--diamanten N]

Levelformat im Speicher:
  - 10 echte Level (A-J) ab Adresse $2400, je 512 Bytes pro Level
  - 1 Byte = 2 Zellen (High-Nibble zuerst), Karte = 40 x 25 Zellen
  - Boris startet immer bei Zelle (Zeile 1, Spalte 1)
  - Diamanten-Soll pro Level: Tabelle bei $1BAA (16 Bytes)
"""
import base64, re, sys, os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAMEDATA = os.path.join(REPO, 'js', 'game-data.js')
LEVELDIR = os.path.join(REPO, 'levels')

LEVEL_BASE = 0x2400
LEVEL_SIZE = 0x200        # 512 Bytes -> 1024 Zellen
MAP_W, MAP_H = 40, 25     # nur die ersten 1000 Zellen sind die Karte
DIAMANT_TABELLE = 0x1baa

# Zellwert <-> Symbol (fuer die Textdatei)
SYM = {
    0x0: ' ',   # Leer (schwarz)
    0x1: 'O',   # Felsen (faellt herunter)
    0x2: '*',   # Diamant
    0x3: '#',   # Wand
    0x4: 'X',   # Ausgang (blinkt, wenn genug Diamanten gesammelt)
    0x5: 'M',   # Loch / gruenes Quadrat-Monster
    0x6: 'B',   # Bow (gefaehrlich, auf hohen Leveln nuetzlich)
    0x7: '%',   # radioaktive Masse (waechst!)
    0x8: ':',   # Erde, feste Variante
    0x9: '.',   # Erde (normal)
}
SYM.update({v: format(v, 'x') for v in range(10, 16)})  # a-f roh
INV = {s: v for v, s in SYM.items()}

def lese_ram():
    src = open(GAMEDATA).read()
    m = re.search(r"GAME_RAM_B64 = '([^']+)'", src)
    return bytearray(base64.b64decode(m.group(1))), src

def schreibe_ram(ram, src):
    neu = base64.b64encode(bytes(ram)).decode()
    src = re.sub(r"(GAME_RAM_B64 = ')[^']+(')", lambda m: m.group(1) + neu + m.group(2), src)
    open(GAMEDATA, 'w').write(src)

def level_index(buchstabe):
    i = ord(buchstabe.upper()) - 65
    if not 0 <= i <= 9:
        sys.exit("Nur Level A bis J sind echte Leveldaten.")
    return i

def entpacke(ram, idx):
    cells = []
    for b in ram[LEVEL_BASE + idx*LEVEL_SIZE : LEVEL_BASE + (idx+1)*LEVEL_SIZE]:
        cells.extend((b >> 4, b & 15))
    return cells

def packe(cells):
    out = bytearray()
    for i in range(0, len(cells), 2):
        out.append((cells[i] << 4) | cells[i+1])
    return out

def export(buchstabe):
    idx = level_index(buchstabe)
    ram, _ = lese_ram()
    cells = entpacke(ram, idx)
    os.makedirs(LEVELDIR, exist_ok=True)
    pfad = os.path.join(LEVELDIR, f'level_{buchstabe.upper()}.txt')
    with open(pfad, 'w') as f:
        f.write(f"; Return of Rockman - Level {buchstabe.upper()}\n")
        f.write(f"; Diamanten-Soll: {ram[DIAMANT_TABELLE + idx]}\n")
        f.write("; Symbole: ' '=Leer O=Fels *=Diamant #=Wand X=Ausgang\n")
        f.write(";          M=Loch/Monster B=Bow %=Masse :=Erde-fest .=Erde\n")
        f.write("; Boris startet immer bei Zeile 1, Spalte 1 (direkt unter der Ecke).\n")
        f.write("; Karte: 40 Spalten x 25 Zeilen. Aussenrand sollte Wand (#) sein.\n")
        for r in range(MAP_H):
            f.write(''.join(SYM[c] for c in cells[r*MAP_W:(r+1)*MAP_W]) + "\n")
    print("exportiert:", pfad)

def importiere(buchstabe, pfad, diamanten=None):
    idx = level_index(buchstabe)
    ram, src = lese_ram()
    zeilen = [z.rstrip('\n') for z in open(pfad) if not z.startswith(';')]
    zeilen = [z for z in zeilen if z.strip() != '']
    if len(zeilen) != MAP_H:
        sys.exit(f"Erwarte {MAP_H} Kartenzeilen, gefunden: {len(zeilen)}")
    cells = []
    for nr, z in enumerate(zeilen):
        z = z.ljust(MAP_W)[:MAP_W]
        for s in z:
            if s not in INV:
                sys.exit(f"Unbekanntes Symbol '{s}' in Zeile {nr}")
            cells.append(INV[s])
    # Die letzten 24 Zellen (jenseits der 40x25-Karte) unveraendert lassen -
    # das Spiel liest diesen Bereich beim Levelende-Scan mit.
    alt = entpacke(ram, idx)
    cells += alt[len(cells):]
    anz_ausgang = cells.count(4)
    anz_diamant = cells.count(2)
    if anz_ausgang != 1:
        print(f"WARNUNG: {anz_ausgang} Ausgaenge (X) - es sollte genau 1 sein!")
    ram[LEVEL_BASE + idx*LEVEL_SIZE : LEVEL_BASE + (idx+1)*LEVEL_SIZE] = packe(cells)
    if diamanten is not None:
        ram[DIAMANT_TABELLE + idx] = int(diamanten)
    soll = ram[DIAMANT_TABELLE + idx]
    if anz_diamant < soll:
        print(f"WARNUNG: nur {anz_diamant} Diamanten in der Karte, Soll ist {soll}",
              "- Level waere unschaffbar (ausser ueber die Masse)!")
    schreibe_ram(ram, src)
    print(f"Level {buchstabe.upper()} importiert ({anz_diamant} Diamanten, Soll {soll}).")

if __name__ == '__main__':
    args = sys.argv[1:]
    if not args:
        print(__doc__); sys.exit(0)
    if args[0] == 'export':
        export(args[1])
    elif args[0] == 'export-alle':
        for b in 'ABCDEFGHIJ':
            export(b)
    elif args[0] == 'import':
        dia = None
        if '--diamanten' in args:
            k = args.index('--diamanten'); dia = args[k+1]; args = args[:k]
        pfad = args[2] if len(args) > 2 else os.path.join(LEVELDIR, f'level_{args[1].upper()}.txt')
        importiere(args[1], pfad, dia)
    else:
        print(__doc__)
