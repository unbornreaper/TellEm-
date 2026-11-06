// Minimal schema-less protobuf reader/writer that keeps field order and raw
// values, so untouched data is written back byte-for-byte.

export class Message {
  constructor(fields = []) { this.fields = fields; } // [{no, wt, v}] v: BigInt (wt0) | Uint8Array

  static parse(bytes) {
    const fields = [];
    let p = 0;
    const varint = () => {
      let r = 0n, s = 0n;
      for (;;) {
        if (p >= bytes.length) throw new Error('protobuf: truncated varint');
        const b = bytes[p++];
        r |= BigInt(b & 0x7f) << s;
        if (!(b & 0x80)) return r;
        s += 7n;
        if (s > 70n) throw new Error('protobuf: varint too long');
      }
    };
    while (p < bytes.length) {
      const key = Number(varint());
      const no = key >>> 3, wt = key & 7;
      let v;
      if (wt === 0) v = varint();
      else if (wt === 2) {
        const len = Number(varint());
        if (p + len > bytes.length) throw new Error('protobuf: truncated field');
        v = bytes.slice(p, p + len); p += len;
      } else if (wt === 1) { v = bytes.slice(p, p + 8); p += 8; }
      else if (wt === 5) { v = bytes.slice(p, p + 4); p += 4; }
      else throw new Error(`protobuf: unsupported wire type ${wt}`);
      if (p > bytes.length) throw new Error('protobuf: truncated');
      fields.push({ no, wt, v });
    }
    return new Message(fields);
  }

  serialize() {
    const chunks = [];
    let total = 0;
    const push = (u8) => { chunks.push(u8); total += u8.length; };
    for (const f of this.fields) {
      push(encodeVarint(BigInt((f.no << 3) | f.wt)));
      if (f.wt === 0) push(encodeVarint(f.v));
      else if (f.wt === 2) {
        const v = f.v instanceof Message ? f.v.serialize() : f.v;
        push(encodeVarint(BigInt(v.length))); push(v);
      } else push(f.v);
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }

  all(no) { return this.fields.filter((f) => f.no === no); }
  first(no) { return this.fields.find((f) => f.no === no); }
  has(no) { return !!this.first(no); }

  getInt(no, def = 0) { const f = this.first(no); return f && f.wt === 0 ? Number(BigInt.asIntN(32, f.v)) : def; }
  getBool(no) { return this.getInt(no) !== 0; }
  getBytes(no) { const f = this.first(no); return f ? f.v : null; }
  getString(no, def = '') { const b = this.getBytes(no); return b ? new TextDecoder().decode(b) : def; }
  getFloat(no, def = 0) {
    const f = this.first(no); if (!f || f.wt !== 5) return def;
    return new DataView(f.v.buffer, f.v.byteOffset, 4).getFloat32(0, true);
  }
  getMessage(no) { const b = this.getBytes(no); return b ? Message.parse(b) : null; }

  // Setters replace the first occurrence, or append if missing.
  _set(no, wt, v) {
    const f = this.first(no);
    if (f) { f.wt = wt; f.v = v; } else this.fields.push({ no, wt, v });
  }
  setInt(no, n) { this._set(no, 0, BigInt.asUintN(64, BigInt(Math.trunc(n)))); }
  setBool(no, b) { this.setInt(no, b ? 1 : 0); }
  setBytes(no, b) { this._set(no, 2, b); }
  setString(no, s) { this.setBytes(no, new TextEncoder().encode(s)); }
  setFloat(no, x) { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, x, true); this._set(no, 5, b); }
  setMessage(no, m) { this.setBytes(no, m.serialize()); }
  remove(no) { this.fields = this.fields.filter((f) => f.no !== no); }
}

export function encodeVarint(v) {
  v = BigInt.asUintN(64, v);
  const out = [];
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v) b |= 0x80;
    out.push(b);
  } while (v);
  return Uint8Array.from(out);
}

// Packed repeated int32 helpers (e.g. currency, black market upgrades).
export function readPackedInts(msg, no) {
  const out = [];
  for (const f of msg.all(no)) {
    if (f.wt === 0) { out.push(Number(BigInt.asIntN(32, f.v))); continue; }
    const m = f.v; let p = 0;
    while (p < m.length) {
      let r = 0n, s = 0n, b;
      do { b = m[p++]; r |= BigInt(b & 0x7f) << s; s += 7n; } while (b & 0x80);
      out.push(Number(BigInt.asIntN(32, r)));
    }
  }
  return out;
}

export function writePackedInts(msg, no, values) {
  const parts = values.map((x) => encodeVarint(BigInt.asUintN(64, BigInt(Math.trunc(x)))));
  const total = parts.reduce((a, b) => a + b.length, 0);
  const buf = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  const idx = msg.fields.findIndex((f) => f.no === no);
  const entry = { no, wt: 2, v: buf };
  msg.fields = msg.fields.filter((f) => f.no !== no);
  if (idx >= 0) msg.fields.splice(Math.min(idx, msg.fields.length), 0, entry);
  else msg.fields.push(entry);
}
