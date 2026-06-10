// C16-Maschinenmodell: 16K RAM (gespiegelt), TED-Register, ROM-Banking,
// Kernal-Ersatzroutinen (CHROUT/GETIN/STOP) ohne Original-ROM.
'use strict';
// Node-Kompatibilitaet ohne Browser-Namenskollision: kein top-level var,
// sonst kollidiert es mit der Klassendeklaration aus cpu6502.js.
if (typeof require !== 'undefined' && typeof globalThis.CPU6502 === 'undefined') {
  globalThis.CPU6502 = require('./cpu6502.js').CPU6502;
}

// PETSCII -> Screencode
function petsciiToScreen(p) {
  if (p >= 0x20 && p <= 0x3f) return p;
  if (p >= 0x40 && p <= 0x5f) return p - 0x40;
  if (p >= 0x60 && p <= 0x7f) return p - 0x20;
  if (p >= 0xa0 && p <= 0xbf) return p - 0x40;
  if (p >= 0xc0 && p <= 0xdf) return p - 0x80;
  if (p >= 0xe0 && p <= 0xfe) return p - 0x40;
  if (p === 0xff) return 0x5e;
  return 0x20;
}

// Plus/4-Farbcodes (PETSCII-Steuerzeichen) -> TED-Farbwert (Luma<<4 | Hue)
const COLOR_CODES = {
  0x90: 0x00,        // schwarz
  0x05: 0x71,        // weiss
  0x1c: 0x32,        // rot
  0x9f: 0x63,        // cyan
  0x9c: 0x44,        // purpur
  0x1e: 0x45,        // gruen
  0x1f: 0x36,        // blau
  0x9e: 0x67,        // gelb
  0x81: 0x48,        // orange
  0x95: 0x29,        // braun
  0x96: 0x5a,        // gelbgruen
  0x97: 0x4b,        // rosa
  0x98: 0x4c,        // blaugruen
  0x99: 0x6d,        // hellblau
  0x9a: 0x2e,        // dunkelblau
  0x9b: 0x5f,        // hellgruen
};

class C16 {
  constructor(ramImage, romFont) {
    this.ram = new Uint8Array(0x4000);
    this.ram.set(ramImage.subarray(0, 0x4000));
    this.ted = new Uint8Array(0x40);
    this.romFont = romFont;
    this.romIn = true;
    this.blinkPhase = false;
    // Kernal-Bildschirmzustand
    this.curRow = 0; this.curCol = 0;
    this.curColor = 0x71; // weiss
    this.reverse = false;
    this.screenBase = 0x0c00;
    this.colorBase = 0x0800;
    // Eingabepuffer (PETSCII)
    this.keyQueue = [];
    // Eingabe-Hook: liefert den Matrix-Code, wenn das Spiel $C6 liest
    this.keyReadHook = null;
    // Sound-Registerschreibzugriffe mit Zyklus-Zeitstempel (fuer WebAudio)
    this.soundEvents = [];
    // Hardware-Tastaturmatrix (8 Zeilen) - aktiv low
    this.kbMatrix = new Uint8Array(8).fill(0xff);
    this.kbLatch = 0xff;
    this.fd30 = 0xff;
    this.joyMask = 0xff;  // Joystick 1: Bits up/down/left/right/fire aktiv low
    // TED-Defaultwerte wie nach Kernal-Boot
    this.ted[0x06] = 0x1b;  // Screen an, 25 Zeilen
    this.ted[0x07] = 0x08;  // 40 Spalten
    this.ted[0x12] = 0xc4;  // Zeichensatz aus ROM
    this.ted[0x13] = 0xd0;  // Charset-Basis $D000
    this.ted[0x14] = 0xc8;  // Videomatrix $0C00
    this.ted[0x15] = 0x71;
    this.ted[0x19] = 0x71;
    const read = (a) => this.read(a);
    const write = (a, v) => this.write(a, v);
    this.cpu = new CPU6502(read, write);
    this.cpu.pc = 0x1010;  // SYS 4112
    this.cpu.sp = 0xf0;
  }

  read(a) {
    a &= 0xffff;
    if (a >= 0xff00 && a <= 0xff3f) {
      const r = a & 0x3f;
      if (r === 0x02) return (this.timerVal(0)) & 0xff;
      if (r === 0x03) return (this.timerVal(0) >> 8) & 0xff;
      if (r === 0x08) return this.kbLatch;
      if (r === 0x09) return 0xff;
      if (r === 0x1c) return ((this.raster() >> 8) & 1) | 0xfe & 0xff;
      if (r === 0x1d) return this.raster() & 0xff;
      return this.ted[r];
    }
    if (a >= 0xfd00 && a <= 0xfdff) {
      if ((a & 0xfff0) === 0xfd30) return this.fd30;
      return 0xff;
    }
    if (a === 0x00c6 && this.keyReadHook) return this.keyReadHook();
    if (a >= 0x8000 && this.romIn) return 0;
    return this.ram[a & 0x3fff];
  }

  write(a, v) {
    a &= 0xffff; v &= 0xff;
    if (a >= 0xff00 && a <= 0xff3f) {
      const r = a & 0x3f;
      if (r === 0x3e) { this.romIn = true; return; }
      if (r === 0x3f) { this.romIn = false; return; }
      if (r === 0x08) {
        // Latch: Tastaturzeilen anhand $FD30-Maske + Joystickauswahl im Datenbyte
        this.kbLatch = this.scanKeyboard(v);
        return;
      }
      if (r >= 0x0e && r <= 0x12 && this.ted[r] !== v) {
        if (this.soundEvents.length < 4096) this.soundEvents.push([this.cpu.clock, r, v]);
      }
      this.ted[r] = v;
      return;
    }
    if (a >= 0xfd00 && a <= 0xfdff) {
      if ((a & 0xfff0) === 0xfd30) this.fd30 = v;
      return;
    }
    this.ram[a & 0x3fff] = v;
  }

  scanKeyboard(sel) {
    let result = 0xff;
    for (let row = 0; row < 8; row++) {
      if ((this.fd30 & (1 << row)) === 0) result &= this.kbMatrix[row];
    }
    // Joystick 1 wird ueber Bit 2 im geschriebenen Wert selektiert (aktiv low),
    // Joystick 2 ueber Bit 1. Richtungen in Bits 0-3, Feuer Bit 6/7.
    if ((sel & 0x04) === 0) result &= this.joyMask;
    if ((sel & 0x02) === 0) result &= 0xff; // Joystick 2 nicht belegt
    return result;
  }

  raster() {
    return Math.floor(this.cpu.clock / 114) % 312;
  }
  timerVal() {
    return 0xffff - (this.cpu.clock & 0xffff);
  }

  // ---- Kernal-Ersatz ----
  chrout(c) {
    const ram = this.ram;
    const put = (sc) => {
      const o = this.curRow * 40 + this.curCol;
      ram[(this.screenBase + o) & 0x3fff] = sc | (this.reverse ? 0x80 : 0);
      ram[(this.colorBase + o) & 0x3fff] = this.curColor;
      this.curCol++;
      if (this.curCol >= 40) { this.curCol = 0; this.curRow++; }
      this.maybeScroll();
    };
    if (c === 0x0d || c === 0x8d) { this.curCol = 0; this.curRow++; this.reverse = false; this.maybeScroll(); return; }
    if (c === 0x93) { this.clearScreen(); return; }
    if (c === 0x13) { this.curRow = 0; this.curCol = 0; return; }
    if (c === 0x11) { this.curRow++; this.maybeScroll(); return; }
    if (c === 0x91) { if (this.curRow > 0) this.curRow--; return; }
    if (c === 0x1d) { this.curCol++; if (this.curCol >= 40) { this.curCol = 0; this.curRow++; this.maybeScroll(); } return; }
    if (c === 0x9d) { if (this.curCol > 0) this.curCol--; return; }
    if (c === 0x12) { this.reverse = true; return; }
    if (c === 0x92) { this.reverse = false; return; }
    if (c === 0x0e || c === 0x8e || c === 0x08 || c === 0x09) { return; } // Zeichensatz/Shift-Lock: ignorieren
    if (c === 0x14) { // DEL
      if (this.curCol > 0) { this.curCol--; const o = this.curRow * 40 + this.curCol; ram[(this.screenBase+o)&0x3fff] = 0x20; }
      return;
    }
    if (COLOR_CODES[c] !== undefined) { this.curColor = COLOR_CODES[c]; return; }
    if (c < 0x20 || (c >= 0x80 && c < 0xa0)) return; // sonstige Steuerzeichen
    put(petsciiToScreen(c));
  }
  clearScreen() {
    for (let i = 0; i < 1000; i++) {
      this.ram[(this.screenBase + i) & 0x3fff] = 0x20;
      this.ram[(this.colorBase + i) & 0x3fff] = this.curColor;
    }
    this.curRow = 0; this.curCol = 0;
  }
  maybeScroll() {
    while (this.curRow > 24) {
      for (let i = 0; i < 960; i++) {
        this.ram[(this.screenBase + i) & 0x3fff] = this.ram[(this.screenBase + i + 40) & 0x3fff];
        this.ram[(this.colorBase + i) & 0x3fff] = this.ram[(this.colorBase + i + 40) & 0x3fff];
      }
      for (let i = 960; i < 1000; i++) {
        this.ram[(this.screenBase + i) & 0x3fff] = 0x20;
        this.ram[(this.colorBase + i) & 0x3fff] = this.curColor;
      }
      this.curRow--;
    }
  }

  // ROM-Aufruf abfangen; true = behandelt
  handleRomCall(pc) {
    const cpu = this.cpu;
    switch (pc) {
      case 0xffd2: this.chrout(cpu.a); break;          // CHROUT
      case 0xffe4: {                                    // GETIN
        const k = this.keyQueue.length ? this.keyQueue.shift() : 0;
        cpu.a = k; cpu.z = (k === 0); break;
      }
      case 0xffe1: cpu.z = false; cpu.a = 1; break;     // STOP-Taste: nicht gedrueckt
      case 0xffde: { const t = Math.floor(cpu.clock / 17734); cpu.a = (t>>16)&0xff; cpu.x = (t>>8)&0xff; cpu.y = t&0xff; break; } // RDTIM
      default: break;                                   // alles andere: RTS
    }
    // RTS simulieren
    const lo = cpu.pop(), hi = cpu.pop();
    cpu.pc = ((lo | (hi << 8)) + 1) & 0xffff;
    return true;
  }

  // einen Block CPU-Zyklen ausfuehren
  run(cycles) {
    const cpu = this.cpu;
    const target = cpu.clock + cycles;
    let guard = 0;
    while (cpu.clock < target && guard++ < 10_000_000) {
      if (cpu.pc >= 0x8000 && this.romIn) {
        this.handleRomCall(cpu.pc);
        continue;
      }
      if (cpu.jammed) break;
      cpu.step();
    }
  }
}

if (typeof module !== 'undefined') module.exports = { C16, petsciiToScreen };
