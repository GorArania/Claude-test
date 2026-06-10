// MOS 6502/7501 CPU-Kern (dokumentierte Opcodes)
// read(addr) -> byte, write(addr, byte)
'use strict';

const CYC = [
  7,6,2,8,3,3,5,5,3,2,2,2,4,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
  6,6,2,8,3,3,5,5,4,2,2,2,4,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
  6,6,2,8,3,3,5,5,3,2,2,2,3,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
  6,6,2,8,3,3,5,5,4,2,2,2,5,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
  2,6,2,6,3,3,3,3,2,2,2,2,4,4,4,4, 2,6,2,6,4,4,4,4,2,5,2,5,5,5,5,5,
  2,6,2,6,3,3,3,3,2,2,2,2,4,4,4,4, 2,5,2,5,4,4,4,4,2,4,2,4,4,4,4,4,
  2,6,2,8,3,3,5,5,2,2,2,2,4,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
  2,6,2,8,3,3,5,5,2,2,2,2,4,4,6,6, 2,5,2,8,4,4,6,6,2,4,2,7,4,4,7,7,
];

class CPU6502 {
  constructor(read, write) {
    this.read = read; this.write = write;
    this.a = 0; this.x = 0; this.y = 0;
    this.sp = 0xfd; this.pc = 0;
    this.n = false; this.v = false; this.z = false; this.c = false;
    this.i = true; this.d = false;
    this.clock = 0;
    this.jammed = false;
  }
  push(v) { this.write(0x100 + this.sp, v & 0xff); this.sp = (this.sp - 1) & 0xff; }
  pop() { this.sp = (this.sp + 1) & 0xff; return this.read(0x100 + this.sp); }
  setnz(v) { v &= 0xff; this.n = v >= 0x80; this.z = v === 0; return v; }
  flags() {
    return (this.n?0x80:0)|(this.v?0x40:0)|0x20|(this.d?8:0)|(this.i?4:0)|(this.z?2:0)|(this.c?1:0);
  }
  setflags(p) {
    this.n=!!(p&0x80); this.v=!!(p&0x40); this.d=!!(p&8); this.i=!!(p&4); this.z=!!(p&2); this.c=!!(p&1);
  }
  irq() {
    if (this.i) return;
    const r = this.pc;
    this.push(r >> 8); this.push(r & 0xff);
    this.push(this.flags() & ~0x10);
    this.i = true;
    this.pc = this.read(0xfffe) | (this.read(0xffff) << 8);
    this.clock += 7;
  }
  adc(m) {
    if (this.d) {
      let lo = (this.a & 0xf) + (m & 0xf) + (this.c?1:0);
      let hi = (this.a >> 4) + (m >> 4);
      if (lo > 9) { lo += 6; hi++; }
      if (hi > 9) hi += 6;
      this.c = hi > 15;
      this.a = ((hi & 0xf) << 4) | (lo & 0xf);
      this.setnz(this.a);
      return;
    }
    const r = this.a + m + (this.c?1:0);
    this.v = !!((~(this.a ^ m)) & (this.a ^ r) & 0x80);
    this.c = r > 0xff;
    this.a = this.setnz(r);
  }
  sbcDec(m) {
    let lo = (this.a & 0xf) - (m & 0xf) - (this.c?0:1);
    let hi = (this.a >> 4) - (m >> 4);
    if (lo < 0) { lo -= 6; hi--; }
    if (hi < 0) hi -= 6;
    this.c = (this.a - m - (this.c?0:1)) >= 0;
    this.a = ((hi & 0xf) << 4) | (lo & 0xf) & 0xff;
    this.a &= 0xff;
    this.setnz(this.a);
  }
  sbc(m) { if (this.d) this.sbcDec(m); else this.adc(m ^ 0xff); }
  cmp(r, m) { this.c = r >= m; this.setnz((r - m) & 0xff); }

  step() {
    const R = this.read, W = this.write;
    const op = R(this.pc);
    this.pc = (this.pc + 1) & 0xffff;
    this.clock += CYC[op];
    const imm = () => { const v = R(this.pc); this.pc = (this.pc+1)&0xffff; return v; };
    const zp  = imm;
    const zpx = () => (imm() + this.x) & 0xff;
    const zpy = () => (imm() + this.y) & 0xff;
    const ab  = () => { const lo = imm(); return lo | (imm() << 8); };
    const abx = () => (ab() + this.x) & 0xffff;
    const aby = () => (ab() + this.y) & 0xffff;
    const izx = () => { const z = (imm() + this.x) & 0xff; return R(z) | (R((z+1)&0xff) << 8); };
    const izy = () => { const z = imm(); return ((R(z) | (R((z+1)&0xff) << 8)) + this.y) & 0xffff; };
    const br  = (cond) => { const o = imm(); if (cond) { this.pc = (this.pc + ((o ^ 0x80) - 0x80)) & 0xffff; this.clock++; } };

    switch (op) {
      case 0xa9: this.a = this.setnz(imm()); break;
      case 0xa5: this.a = this.setnz(R(zp())); break;
      case 0xb5: this.a = this.setnz(R(zpx())); break;
      case 0xad: this.a = this.setnz(R(ab())); break;
      case 0xbd: this.a = this.setnz(R(abx())); break;
      case 0xb9: this.a = this.setnz(R(aby())); break;
      case 0xa1: this.a = this.setnz(R(izx())); break;
      case 0xb1: this.a = this.setnz(R(izy())); break;
      case 0xa2: this.x = this.setnz(imm()); break;
      case 0xa6: this.x = this.setnz(R(zp())); break;
      case 0xb6: this.x = this.setnz(R(zpy())); break;
      case 0xae: this.x = this.setnz(R(ab())); break;
      case 0xbe: this.x = this.setnz(R(aby())); break;
      case 0xa0: this.y = this.setnz(imm()); break;
      case 0xa4: this.y = this.setnz(R(zp())); break;
      case 0xb4: this.y = this.setnz(R(zpx())); break;
      case 0xac: this.y = this.setnz(R(ab())); break;
      case 0xbc: this.y = this.setnz(R(abx())); break;
      case 0x85: W(zp(), this.a); break;
      case 0x95: W(zpx(), this.a); break;
      case 0x8d: W(ab(), this.a); break;
      case 0x9d: W(abx(), this.a); break;
      case 0x99: W(aby(), this.a); break;
      case 0x81: W(izx(), this.a); break;
      case 0x91: W(izy(), this.a); break;
      case 0x86: W(zp(), this.x); break;
      case 0x96: W(zpy(), this.x); break;
      case 0x8e: W(ab(), this.x); break;
      case 0x84: W(zp(), this.y); break;
      case 0x94: W(zpx(), this.y); break;
      case 0x8c: W(ab(), this.y); break;
      case 0xaa: this.x = this.setnz(this.a); break;
      case 0xa8: this.y = this.setnz(this.a); break;
      case 0x8a: this.a = this.setnz(this.x); break;
      case 0x98: this.a = this.setnz(this.y); break;
      case 0xba: this.x = this.setnz(this.sp); break;
      case 0x9a: this.sp = this.x; break;
      case 0x48: this.push(this.a); break;
      case 0x68: this.a = this.setnz(this.pop()); break;
      case 0x08: this.push(this.flags()); break;
      case 0x28: this.setflags(this.pop()); break;
      case 0x69: this.adc(imm()); break;
      case 0x65: this.adc(R(zp())); break;
      case 0x75: this.adc(R(zpx())); break;
      case 0x6d: this.adc(R(ab())); break;
      case 0x7d: this.adc(R(abx())); break;
      case 0x79: this.adc(R(aby())); break;
      case 0x61: this.adc(R(izx())); break;
      case 0x71: this.adc(R(izy())); break;
      case 0xe9: this.sbc(imm()); break;
      case 0xe5: this.sbc(R(zp())); break;
      case 0xf5: this.sbc(R(zpx())); break;
      case 0xed: this.sbc(R(ab())); break;
      case 0xfd: this.sbc(R(abx())); break;
      case 0xf9: this.sbc(R(aby())); break;
      case 0xe1: this.sbc(R(izx())); break;
      case 0xf1: this.sbc(R(izy())); break;
      case 0xc9: this.cmp(this.a, imm()); break;
      case 0xc5: this.cmp(this.a, R(zp())); break;
      case 0xd5: this.cmp(this.a, R(zpx())); break;
      case 0xcd: this.cmp(this.a, R(ab())); break;
      case 0xdd: this.cmp(this.a, R(abx())); break;
      case 0xd9: this.cmp(this.a, R(aby())); break;
      case 0xc1: this.cmp(this.a, R(izx())); break;
      case 0xd1: this.cmp(this.a, R(izy())); break;
      case 0xe0: this.cmp(this.x, imm()); break;
      case 0xe4: this.cmp(this.x, R(zp())); break;
      case 0xec: this.cmp(this.x, R(ab())); break;
      case 0xc0: this.cmp(this.y, imm()); break;
      case 0xc4: this.cmp(this.y, R(zp())); break;
      case 0xcc: this.cmp(this.y, R(ab())); break;
      case 0x29: this.a = this.setnz(this.a & imm()); break;
      case 0x25: this.a = this.setnz(this.a & R(zp())); break;
      case 0x35: this.a = this.setnz(this.a & R(zpx())); break;
      case 0x2d: this.a = this.setnz(this.a & R(ab())); break;
      case 0x3d: this.a = this.setnz(this.a & R(abx())); break;
      case 0x39: this.a = this.setnz(this.a & R(aby())); break;
      case 0x21: this.a = this.setnz(this.a & R(izx())); break;
      case 0x31: this.a = this.setnz(this.a & R(izy())); break;
      case 0x09: this.a = this.setnz(this.a | imm()); break;
      case 0x05: this.a = this.setnz(this.a | R(zp())); break;
      case 0x15: this.a = this.setnz(this.a | R(zpx())); break;
      case 0x0d: this.a = this.setnz(this.a | R(ab())); break;
      case 0x1d: this.a = this.setnz(this.a | R(abx())); break;
      case 0x19: this.a = this.setnz(this.a | R(aby())); break;
      case 0x01: this.a = this.setnz(this.a | R(izx())); break;
      case 0x11: this.a = this.setnz(this.a | R(izy())); break;
      case 0x49: this.a = this.setnz(this.a ^ imm()); break;
      case 0x45: this.a = this.setnz(this.a ^ R(zp())); break;
      case 0x55: this.a = this.setnz(this.a ^ R(zpx())); break;
      case 0x4d: this.a = this.setnz(this.a ^ R(ab())); break;
      case 0x5d: this.a = this.setnz(this.a ^ R(abx())); break;
      case 0x59: this.a = this.setnz(this.a ^ R(aby())); break;
      case 0x41: this.a = this.setnz(this.a ^ R(izx())); break;
      case 0x51: this.a = this.setnz(this.a ^ R(izy())); break;
      case 0x24: { const m = R(zp()); this.z = (this.a & m) === 0; this.n = m >= 0x80; this.v = !!(m & 0x40); break; }
      case 0x2c: { const m = R(ab()); this.z = (this.a & m) === 0; this.n = m >= 0x80; this.v = !!(m & 0x40); break; }
      case 0x0a: this.c = this.a >= 0x80; this.a = this.setnz((this.a << 1) & 0xff); break;
      case 0x06: case 0x16: case 0x0e: case 0x1e: {
        const ad = op===0x06?zp():op===0x16?zpx():op===0x0e?ab():abx();
        let m = R(ad); this.c = m >= 0x80; m = this.setnz((m << 1) & 0xff); W(ad, m); break;
      }
      case 0x4a: this.c = !!(this.a & 1); this.a = this.setnz(this.a >> 1); break;
      case 0x46: case 0x56: case 0x4e: case 0x5e: {
        const ad = op===0x46?zp():op===0x56?zpx():op===0x4e?ab():abx();
        let m = R(ad); this.c = !!(m & 1); m = this.setnz(m >> 1); W(ad, m); break;
      }
      case 0x2a: { const o = this.c; this.c = this.a >= 0x80; this.a = this.setnz(((this.a << 1) | (o?1:0)) & 0xff); break; }
      case 0x26: case 0x36: case 0x2e: case 0x3e: {
        const ad = op===0x26?zp():op===0x36?zpx():op===0x2e?ab():abx();
        let m = R(ad); const o = this.c; this.c = m >= 0x80; m = this.setnz(((m << 1) | (o?1:0)) & 0xff); W(ad, m); break;
      }
      case 0x6a: { const o = this.c; this.c = !!(this.a & 1); this.a = this.setnz((this.a >> 1) | (o?0x80:0)); break; }
      case 0x66: case 0x76: case 0x6e: case 0x7e: {
        const ad = op===0x66?zp():op===0x76?zpx():op===0x6e?ab():abx();
        let m = R(ad); const o = this.c; this.c = !!(m & 1); m = this.setnz((m >> 1) | (o?0x80:0)); W(ad, m); break;
      }
      case 0xe6: case 0xf6: case 0xee: case 0xfe: {
        const ad = op===0xe6?zp():op===0xf6?zpx():op===0xee?ab():abx();
        W(ad, this.setnz(R(ad) + 1)); break;
      }
      case 0xc6: case 0xd6: case 0xce: case 0xde: {
        const ad = op===0xc6?zp():op===0xd6?zpx():op===0xce?ab():abx();
        W(ad, this.setnz(R(ad) - 1)); break;
      }
      case 0xe8: this.x = this.setnz(this.x + 1); break;
      case 0xc8: this.y = this.setnz(this.y + 1); break;
      case 0xca: this.x = this.setnz(this.x - 1); break;
      case 0x88: this.y = this.setnz(this.y - 1); break;
      case 0x4c: this.pc = ab(); break;
      case 0x6c: { const ad = ab(); const lo = R(ad); const hi = R((ad & 0xff00) | ((ad + 1) & 0xff)); this.pc = lo | (hi << 8); break; }
      case 0x20: { const ad = ab(); const r = (this.pc - 1) & 0xffff; this.push(r >> 8); this.push(r & 0xff); this.pc = ad; break; }
      case 0x60: { const lo = this.pop(); const hi = this.pop(); this.pc = ((lo | (hi << 8)) + 1) & 0xffff; break; }
      case 0x40: { this.setflags(this.pop()); const lo = this.pop(); const hi = this.pop(); this.pc = lo | (hi << 8); break; }
      case 0x10: br(!this.n); break;
      case 0x30: br(this.n); break;
      case 0x50: br(!this.v); break;
      case 0x70: br(this.v); break;
      case 0x90: br(!this.c); break;
      case 0xb0: br(this.c); break;
      case 0xd0: br(!this.z); break;
      case 0xf0: br(this.z); break;
      case 0x18: this.c = false; break;
      case 0x38: this.c = true; break;
      case 0x58: this.i = false; break;
      case 0x78: this.i = true; break;
      case 0xb8: this.v = false; break;
      case 0xd8: this.d = false; break;
      case 0xf8: this.d = true; break;
      case 0xea: break;
      case 0x00: { // BRK
        const r = (this.pc + 1) & 0xffff;
        this.push(r >> 8); this.push(r & 0xff);
        this.push(this.flags());
        this.i = true;
        this.pc = this.read(0xfffe) | (this.read(0xffff) << 8);
        break;
      }
      default:
        this.jammed = true;
        this.pc = (this.pc - 1) & 0xffff;
        break;
    }
  }
}

if (typeof module !== 'undefined') module.exports = { CPU6502 };
