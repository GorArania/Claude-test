# Return of Rockman – C16 im Browser 🕹️

Browser-Version von **„Return of Rockman"** (Mastertronic, 1986) für den
Commodore 16 / Plus 4 – rekonstruiert aus dem originalen Kassetten-Abbild
(`.tap`) in diesem Repository.

## Spielen

Einfach `index.html` im Browser öffnen (oder über GitHub Pages aufrufen).

| Taste | Funktion |
|---|---|
| **Shift** / **Leertaste** / **Enter** | Spiel starten, Aktion |
| **Pfeiltasten** oder **W A S D** | Boris steuern |

Führe Boris durch die Höhlen-Labyrinthe, sammle die funkelnden Diamanten
und finde den blinkenden Ausgang – aber Vorsicht vor den Löchern!

## Wie das funktioniert

Das ist **keine Nachprogrammierung**, sondern das Originalspiel:

1. Das TAP-Abbild wurde Puls für Puls decodiert (Kernal-Format + Mastertronic
   **NOVALOAD**-Turbolader). Dazu wurde der originale 6502-Ladercode in einem
   Python-Harness emuliert und hat das Spiel selbst „von Kassette" in ein
   16-KB-Speicherabbild geladen – inklusive Kassettenmotor-Steuerung und
   TED-Timer-basierter Bit-Erkennung.
2. Ein in JavaScript geschriebener Mini-C16-Emulator führt dieses
   Speicherabbild im Browser aus:
   - `js/cpu6502.js` – 6502/7501-CPU-Kern
   - `js/ted.js` – TED-Videochip (Textmodus, eigene Zeichensätze,
     121-Farben-Palette) und TED-Sound (2 Kanäle, WebAudio)
   - `js/machine.js` – Speicherkarte (16 KB gespiegelt, ROM-Banking),
     Kernal-Ersatzroutinen (CHROUT/GETIN), Eingabe
   - `js/game-data.js` – das extrahierte Speicherabbild (Base64)
3. Der Commodore-ROM-Zeichensatz wird **nicht** verwendet – Textbildschirme
   nutzen einen selbst gezeichneten PETSCII-artigen Ersatz-Font. Die
   Spielgrafik stammt aus dem spieleigenen Zeichensatz bei `$3800`.

## Hinweis

Das Spiel ist © 1986 Mastertronic (geschrieben von Reg, David & Allan).
Dieses Repository dient der privaten Nutzung einer eigenen Originalkassette.
