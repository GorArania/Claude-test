# Return of Rockman – C16 im Browser 🕹️

Browser-Version von **„Return of Rockman"** (Mastertronic, 1986) für den
Commodore 16 / Plus 4 – rekonstruiert aus dem originalen Kassetten-Abbild
(`.tap`) in diesem Repository.

## Live-Demo

👉 **[Jetzt spielen auf goraran.de](https://goraran.de/Rockman/)**

Alternativ: `index.html` aus dem Repository lokal im Browser öffnen – keine
Installation, kein Server nötig.

## Steuerung

| Taste | Funktion |
|---|---|
| **Shift** / **Leertaste** / **Enter** | Spiel starten, Aktion |
| **Pfeiltasten** oder **W A S D** | Boris steuern |

Auf Geräten mit Touchscreen (Handy/Tablet) erscheint automatisch eine
Touch-Steuerung unter dem Bildschirm: Steuerkreuz links, START/FIRE rechts.

Führe Boris durch die Höhlen-Labyrinthe, sammle die funkelnden Diamanten
und finde den blinkenden Ausgang – aber Vorsicht vor den Löchern!

## Spielinhalt

- 10 Level (A–J), je 40 × 25 Zellen
- Zelltypen: Leer, Fels (fällt herunter), Diamant, Wand, Ausgang, Monster, Radioaktivität, Erde
- Ziel pro Level: eine bestimmte Anzahl Diamanten sammeln, dann den Ausgang (X) aktivieren

## Wie das funktioniert

Das ist **keine Nachprogrammierung**, sondern das Originalspiel:

1. Das TAP-Abbild (`Return of Rockman (1986)(Mastertronic).tap`) wurde Puls
   für Puls decodiert – Kernal-Format + Mastertronic **NOVALOAD**-Turbolader.
   Dazu wurde der originale 6502-Ladercode in einem Python-Harness emuliert,
   das das Spiel selbst „von Kassette" in ein 16-KB-Speicherabbild geladen hat
   – inklusive Kassettenmotor-Steuerung und TED-Timer-basierter Bit-Erkennung.

2. Ein in JavaScript geschriebener Mini-C16-Emulator führt dieses
   Speicherabbild im Browser aus:

   | Datei | Inhalt |
   |---|---|
   | `js/cpu6502.js` | 6502/7501-CPU-Kern |
   | `js/ted.js` | TED-Videochip (Textmodus, eigene Zeichensätze, 121-Farben-Palette) + TED-Sound (2 Kanäle, WebAudio) |
   | `js/machine.js` | Speicherkarte (16 KB gespiegelt, ROM-Banking), Kernal-Ersatzroutinen (CHROUT/GETIN), Eingabe |
   | `js/game-data.js` | Das extrahierte Speicherabbild (Base64-kodiert) |
   | `js/romfont.bin` | Ersatz-Zeichensatz (PETSCII-artig, selbst gezeichnet) |

3. Der Commodore-ROM-Zeichensatz wird **nicht** verwendet – Textbildschirme
   nutzen einen selbst gezeichneten PETSCII-artigen Ersatz-Font. Die
   Spielgrafik stammt aus dem spieleigenen Zeichensatz bei `$3800`.

## Speicher-Layout (Kurzreferenz)

| Adresse | Inhalt |
|---|---|
| `$2400` | Level-Daten (10 Level × 512 Bytes) |
| `$1BAA` | Diamanten-Soll-Tabelle (16 Bytes) |
| `$3800` | Spieleigener Zeichensatz (Kacheln) |

Jeder Level belegt 512 Bytes = 1024 Nibbles = 40 × 25 Zellen.
Ein Byte kodiert zwei Zellen (High-Nibble zuerst).
Boris startet immer bei Zelle (Zeile 1, Spalte 1).

## Tools

### `tools/level_tool.py` – Level exportieren und importieren

Exportiert Level als lesbare Textdatei und importiert sie zurück in `js/game-data.js`.

```bash
# Einzelnen Level exportieren
python3 tools/level_tool.py export A        # → levels/level_A.txt

# Alle Level exportieren
python3 tools/level_tool.py export-alle     # → levels/level_A.txt .. level_J.txt

# Level aus Textdatei importieren (optional: Diamantenzahl überschreiben)
python3 tools/level_tool.py import A
python3 tools/level_tool.py import A levels/level_A.txt --diamanten 12
```

**Karten-Symbole in den Textdateien:**

| Symbol | Bedeutung |
|---|---|
| ` ` (Leerzeichen) | Leer / schwarz |
| `O` | Fels (fällt herunter) |
| `*` | Diamant |
| `#` | Wand |
| `X` | Ausgang (blinkt wenn genug Diamanten) |
| `M` | Monster / grünes Quadrat |
| `B` | Bow (auf hohen Leveln nützlich) |
| `%` | Radioaktive Masse (wächst!) |
| `:` | Erde (fest) |
| `.` | Erde (normal) |

### `tools/make_font.py` – TrueType-Font für den Level-Editor

Erzeugt `tools/rockman-kacheln.ttf`: einen Font, der die Level-Symbole als
originale Spielkacheln (16 × 16 Pixel, aus dem Spielzeichensatz bei `$3800`)
darstellt. Damit zeigt ein Texteditor die `.txt`-Leveldateien so an, wie das
Spiel aussieht.

```bash
# Voraussetzung: pip install fonttools
python3 tools/make_font.py    # → tools/rockman-kacheln.ttf
```

Den erzeugten Font im Betriebssystem installieren und im Texteditor für die
`levels/*.txt`-Dateien auswählen.

## Projektstruktur

```
├── index.html                              # Einstiegspunkt – direkt im Browser öffnen
├── js/
│   ├── cpu6502.js                          # 6502/7501-CPU-Emulator
│   ├── ted.js                              # TED-Chip (Video + Sound)
│   ├── machine.js                          # C16-Speicher, Kernal, Eingabe
│   ├── game-data.js                        # Spielabbild (Base64)
│   └── romfont.bin                         # PETSCII-Ersatz-Zeichensatz
├── levels/
│   └── level_A.txt .. level_J.txt         # Alle 10 Level als Textdateien
├── tools/
│   ├── level_tool.py                       # Level-Ex-/Importer
│   ├── make_font.py                        # TrueType-Font-Generator
│   └── rockman-kacheln.ttf                 # Fertiger Kachel-Font
└── Return of Rockman (1986)(Mastertronic).tap   # Original-Kassettenbild
```

## Copyright-Hinweis

Das Spiel ist © 1986 Mastertronic (geschrieben von Reg, David & Allan).
Dieses Repository dient der privaten Nutzung einer eigenen Originalkassette.
