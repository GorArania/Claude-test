// TED (7360/8360) Video & Sound für die Browser-Emulation
// Implementiert: Textmodus 40x25, Zeichensatz aus RAM/Ersatz-ROM-Font,
// 121-Farben-Palette (16 Farbtoene x 8 Helligkeiten), 2 Tonkanaele.
'use strict';

// C16/Plus4-Palette: pro Farbton (hue) Winkel im UV-Raum, 8 Luma-Stufen.
// Erzeugt programmatisch eine dem Original nahekommende Palette.
function buildPalette() {
  const lumas = [0.10, 0.20, 0.28, 0.35, 0.46, 0.62, 0.78, 0.94];
  // hue: [name, U/V-Winkel in Grad, Saettigung] - hue 0 = schwarz, 1 = grau/weiss
  const hueAngles = [null, null, 103, 283, 53, 241, 347, 167, 129, 148, 195, 83, 265, 323, 23, 213];
  const pal = [];
  for (let lum = 0; lum < 8; lum++) {
    for (let hue = 0; hue < 16; hue++) {
      let r, g, b;
      const Y = (hue === 0) ? 0 : lumas[lum];
      if (hue <= 1) {
        r = g = b = Y;
      } else {
        const ang = hueAngles[hue] * Math.PI / 180;
        const sat = 0.18;
        const U = sat * Math.cos(ang);
        const V = sat * Math.sin(ang);
        r = Y + 1.140 * V;
        g = Y - 0.395 * U - 0.581 * V;
        b = Y + 2.032 * U;
      }
      const c = (x) => Math.max(0, Math.min(255, Math.round(x * 255)));
      pal.push([c(r), c(g), c(b)]);
    }
  }
  return pal; // Index: (luma*16+hue)
}
const PALETTE = buildPalette();

function tedColorToRGB(v) {
  const hue = v & 0x0f;
  const lum = (v >> 4) & 0x07;
  return PALETTE[lum * 16 + hue];
}

class TEDVideo {
  constructor(mem) {
    this.mem = mem;             // Maschinen-Objekt mit ram, ted[], romFont
    this.frame = new Uint8ClampedArray(384 * 288 * 4); // mit Rahmen
    this.W = 384; this.H = 288;
    this.ox = (384 - 320) >> 1; // 32px Rahmen links/rechts
    this.oy = (288 - 200) >> 1; // 44px oben/unten
  }
  render() {
    const m = this.mem;
    const ted = m.ted;
    const f = this.frame;
    const border = tedColorToRGB(ted[0x19]);
    const bg = tedColorToRGB(ted[0x15]);
    const screenOn = (ted[0x06] & 0x10) !== 0;
    // Rahmen fuellen
    for (let i = 0; i < this.W * this.H; i++) {
      f[i*4] = border[0]; f[i*4+1] = border[1]; f[i*4+2] = border[2]; f[i*4+3] = 255;
    }
    if (!screenOn) return f;
    // $FF14 Bits 3-7 = Basis der Attribut-(Farb-)Matrix; Zeichenmatrix folgt +$400
    const matrixBase = (((ted[0x14] >> 3) & 0x1f) << 11) & 0x3fff;
    const colorBase = matrixBase;
    const screenBase = (matrixBase + 0x400) & 0x3fff;
    const charsetRom = (ted[0x12] & 0x04) !== 0;
    const charsetBase = (ted[0x13] & 0xfc) << 8;
    const revOff = (ted[0x07] & 0x80) !== 0;
    for (let row = 0; row < 25; row++) {
      for (let col = 0; col < 40; col++) {
        const cell = row * 40 + col;
        let code = m.ram[(screenBase + cell) & 0x3fff];
        let colv = m.ram[(colorBase + cell) & 0x3fff];
        const blink = (colv & 0x80) !== 0;
        let fg = tedColorToRGB(colv & 0x7f);
        let inv = false;
        if (!revOff && (code & 0x80)) inv = true;
        const glyph = code & 0x7f;
        let chdata;
        if (charsetRom) {
          chdata = m.romFont.subarray(glyph * 8, glyph * 8 + 8);
        } else {
          const adr = (charsetBase + glyph * 8) & 0x3fff;
          chdata = m.ram.subarray(adr, adr + 8);
        }
        if (blink && m.blinkPhase) inv = !inv;
        for (let y = 0; y < 8; y++) {
          let bits = chdata[y];
          if (inv) bits ^= 0xff;
          const py = this.oy + row * 8 + y;
          for (let x = 0; x < 8; x++) {
            const on = (bits >> (7 - x)) & 1;
            const c = on ? fg : bg;
            const px = this.ox + col * 8 + x;
            const o = (py * this.W + px) * 4;
            f[o] = c[0]; f[o+1] = c[1]; f[o+2] = c[2]; f[o+3] = 255;
          }
        }
      }
    }
    return f;
  }
}

// TED-Sound: 2 Kanaele. Kanal 1: Rechteck. Kanal 2: Rechteck oder Rauschen.
// Ereignisbasiert: jeder Registerschreibzugriff wird mit seinem CPU-Zyklus
// protokolliert (machine.soundEvents) und zeitgenau in WebAudio eingeplant,
// damit auch kurze Effekte (Graben, Steine, Diamanten) hoerbar sind.
// Tonhoehe (PAL): f = 111861 / (1024 - N) Hz
class TEDSound {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.regs = new Uint8Array(0x40);
    this.cycleBase = 0;
    this.timeBase = 0;
  }
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.10;
    this.master.connect(this.ctx.destination);
    const mk = () => {
      const o = this.ctx.createOscillator();
      o.type = 'square'; o.frequency.value = 440;
      const g = this.ctx.createGain(); g.gain.value = 0;
      o.connect(g); g.connect(this.master); o.start();
      return [o, g];
    };
    [this.osc1, this.gain1] = mk();
    [this.osc2, this.gain2] = mk();
    // Rauschquelle (LFSR-artiges weisses Rauschen)
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let lfsr = 0xACE1;
    for (let i = 0; i < len; i++) {
      lfsr = (lfsr >> 1) ^ (-(lfsr & 1) & 0xB400);
      d[i] = (lfsr & 1) ? 1 : -1;
    }
    this.noise = this.ctx.createBufferSource();
    this.noise.buffer = buf; this.noise.loop = true;
    this.gainN = this.ctx.createGain(); this.gainN.gain.value = 0;
    this.noise.connect(this.gainN); this.gainN.connect(this.master);
    this.noise.start();
    this.enabled = true;
  }
  // events: [[cpuZyklus, reg, wert], ...]; frameStartCycle fuer die Zeitanker-Pflege
  update(machine) {
    const events = machine.soundEvents;
    if (!this.enabled) { events.length = 0; return; }
    const CPS = 886700; // CPU-Zyklen pro Sekunde (PAL, effektiv)
    const now = this.ctx.currentTime;
    const LEAD = 0.06;  // Planungsvorlauf
    // Zeitanker pruefen/neu setzen (Drift zwischen CPU- und Audio-Uhr)
    const anchorOk = () => {
      const t = this.timeBase + (machine.frameStartClock - this.cycleBase) / CPS;
      return t >= now + 0.01 && t <= now + 0.30;
    };
    if (!anchorOk()) {
      this.cycleBase = machine.frameStartClock;
      this.timeBase = now + LEAD;
    }
    for (const [cyc, reg, val] of events) {
      this.regs[reg] = val;
      let t = this.timeBase + (cyc - this.cycleBase) / CPS;
      if (t < now) t = now;
      this.applyAt(t);
    }
    events.length = 0;
  }
  applyAt(t) {
    const r = this.regs;
    const ctl = r[0x11];
    const vol = Math.min(ctl & 0x0f, 8) / 8;
    const v1on = (ctl & 0x10) !== 0;
    const v2on = (ctl & 0x20) !== 0;
    const v2noise = (ctl & 0x40) !== 0;
    const f1v = r[0x0e] | ((r[0x12] & 3) << 8);
    const f2v = r[0x0f] | ((r[0x10] & 3) << 8);
    const freq = (v) => {
      const div = 1024 - v;
      if (div <= 2) return 0;
      const f = 111861 / div;
      return f > 14000 ? 0 : f;
    };
    const f1 = freq(f1v), f2 = freq(f2v);
    if (f1 > 20) this.osc1.frequency.setValueAtTime(f1, t);
    if (f2 > 20) this.osc2.frequency.setValueAtTime(f2, t);
    this.gain1.gain.setValueAtTime(v1on && f1 > 20 ? vol : 0, t);
    this.gain2.gain.setValueAtTime(v2on && !v2noise && f2 > 20 ? vol : 0, t);
    this.gainN.gain.setValueAtTime(v2noise && (ctl & 0x30) ? vol * 0.6 : 0, t);
    if (f2 > 20) this.noise.playbackRate.setValueAtTime(Math.min(4, Math.max(0.25, f2 / 1000)), t);
  }
}

if (typeof module !== 'undefined') module.exports = { TEDVideo, TEDSound, tedColorToRGB, PALETTE };
