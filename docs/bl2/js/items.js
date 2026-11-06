// Weapon/item serial numbers (port of Gibbed's PackedDataHelper).
import { crc32 } from './hash.js';

export const WEAPON_SLOTS = ['body', 'grip', 'barrel', 'sight', 'stock', 'elemental', 'accessory1', 'accessory2', 'material', 'prefix', 'title'];
export const ITEM_SLOTS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'material', 'prefix', 'title'];

class BitReader {
  constructor(b) { this.b = b; this.p = 0; }
  read(n) {
    let v = 0;
    for (let i = 0; i < n; i++, this.p++) {
      const bit = (this.b[this.p >> 3] >> (this.p & 7)) & 1;
      v += bit * 2 ** i;
    }
    return v;
  }
}
class BitWriter {
  constructor() { this.b = []; this.p = 0; }
  write(v, n) {
    for (let i = 0; i < n; i++, this.p++) {
      if ((this.p >> 3) >= this.b.length) this.b.push(0);
      if (Math.floor(v / 2 ** i) & 1) this.b[this.p >> 3] |= 1 << (this.p & 7);
    }
  }
  bytes() { return Uint8Array.from(this.b); }
}

function xorStream(seed, buf, off, len) {
  let x = BigInt.asUintN(32, BigInt((seed | 0) >> 5));
  for (let i = 0; i < len; i++) {
    x = (x * 0x10a860c1n) % 0xfffffffbn;
    buf[off + i] ^= Number(x & 0xffn);
  }
}

function bogoDecrypt(seed, buf, off, len) {
  if (seed === 0) return;
  const temp = buf.slice(off, off + len);
  xorStream(seed, temp, 0, len);
  const right = (seed % 32) % len, left = len - right;
  buf.set(temp.subarray(left, left + right), off);
  buf.set(temp.subarray(0, left), off + right);
}

function bogoEncrypt(seed, buf, off, len) {
  if (seed === 0) return;
  const temp = new Uint8Array(len);
  const right = (seed % 32) % len, left = len - right;
  temp.set(buf.subarray(off, off + right), left);
  temp.set(buf.subarray(off + right, off + len), 0);
  xorStream(seed, temp, 0, len);
  buf.set(temp, off);
}

function checksum(bytes40) {
  const h = crc32(bytes40);
  return ((h >>> 16) ^ (h & 0xffff)) & 0xffff;
}

export class AssetLibrary {
  constructor(alm) {
    this.version = alm.version;
    this.configs = {};
    for (const [g, c] of Object.entries(alm.configs)) {
      const sb = c.sublibrary_bits, ab = c.asset_bits;
      this.configs[g] = { sb, ab, none: 2 ** (sb + ab) - 1, subMask: 2 ** (sb - 1) - 1, useSetBit: 2 ** (sb - 1), assetMask: 2 ** ab - 1 };
    }
    this.sets = new Map(alm.sets.map((s) => [s.id, s]));
    // name -> list of {setId, sub, asset} per group
    this.index = {};
    for (const g of Object.keys(alm.configs)) this.index[g] = new Map();
    for (const s of alm.sets) {
      for (const [g, lib] of Object.entries(s.libraries)) {
        lib.sublibraries.forEach((sl, si) => {
          (sl.assets || []).forEach((a, ai) => {
            const name = `${sl.package}.${a}`;
            const m = this.index[g];
            if (!m.has(name)) m.set(name, []);
            m.get(name).push({ setId: s.id, sub: si, asset: ai });
          });
        });
      }
    }
  }
  decodeRef(r, group) {
    const c = this.configs[group];
    const v = r.read(c.sb + c.ab);
    if (v === c.none) return null;
    return { asset: v & c.assetMask, sub: Math.floor(v / 2 ** c.ab) & c.subMask, useSet: (Math.floor(v / 2 ** c.ab) & c.useSetBit) !== 0 };
  }
  encodeRef(w, group, ref) {
    const c = this.configs[group];
    if (!ref) { w.write(c.none, c.sb + c.ab); return; }
    let v = (ref.asset & c.assetMask) + (ref.sub & c.subMask) * 2 ** c.ab;
    if (ref.useSet) v += 2 ** (c.ab + c.sb - 1);
    w.write(v, c.sb + c.ab);
  }
  nameOf(ref, group, setId) {
    if (!ref) return 'None';
    const set = this.sets.get(ref.useSet ? setId : 0);
    if (!set) throw new Error(`unknown asset set ${setId}`);
    const sl = set.libraries[group].sublibraries[ref.sub];
    if (!sl || !sl.assets || ref.asset >= sl.assets.length) throw new Error(`bad asset reference ${group} ${ref.sub}/${ref.asset}`);
    return `${sl.package}.${sl.assets[ref.asset]}`;
  }
  // Sets that can hold this name: 0 = base game (works with any set).
  setsFor(name, group) {
    return (this.index[group].get(name) || []).map((e) => e.setId);
  }
  refOf(name, group, setId) {
    if (!name || name === 'None') return null;
    const opts = this.index[group].get(name) || [];
    const own = opts.find((o) => o.setId === setId && setId !== 0);
    if (own) return { asset: own.asset, sub: own.sub, useSet: true };
    const base = opts.find((o) => o.setId === 0);
    if (base) return { asset: base.asset, sub: base.sub, useSet: false };
    throw new Error(`"${name}" cannot be used with asset set ${setId}`);
  }
}

const HEADER_GROUPS = { weapon: ['WeaponTypes', 'BalanceDefs', 'Manufacturers'], item: ['ItemTypes', 'BalanceDefs', 'Manufacturers'] };

// Decode a serial into a plain object with readable part names.
export function decodeSerial(lib, data) {
  if (data.length < 5 || data.length > 40) throw new Error('bad serial length');
  const seed = ((data[1] << 24) | (data[2] << 16) | (data[3] << 8) | data[4]) >>> 0;
  const raw = data.slice();
  bogoDecrypt(seed, raw, 5, raw.length - 5);
  const fileCheck = (raw[5] << 8) | raw[6];
  raw[5] = 0xff; raw[6] = 0xff;
  const full = new Uint8Array(40).fill(0xff);
  full.set(raw);
  const checkOk = checksum(full) === fileCheck;
  const r = new BitReader(full);
  const version = r.read(7);
  const isWeapon = r.read(1) === 1;
  const uniqueId = r.read(32);
  r.read(16);
  const setId = r.read(8);
  const groups = isWeapon ? HEADER_GROUPS.weapon : HEADER_GROUPS.item;
  const partGroup = isWeapon ? 'WeaponParts' : 'ItemParts';
  const slots = isWeapon ? WEAPON_SLOTS : ITEM_SLOTS;
  const item = { isWeapon, version, uniqueId, seedBytes: Array.from(data.slice(1, 5)), setId, checkOk };
  const refs = {};
  refs.type = lib.decodeRef(r, groups[0]);
  refs.balance = lib.decodeRef(r, groups[1]);
  refs.manufacturer = lib.decodeRef(r, groups[2]);
  item.gradeIndex = r.read(7);
  item.gameStage = r.read(7);
  for (const s of slots) refs[s] = lib.decodeRef(r, partGroup);
  const names = {};
  const realBits = data.length * 8;
  const ends = {};
  {
    // bit position where each field ends, to spot fields cut off by a short serial
    let p = 64;
    const sz = (g) => lib.configs[g].sb + lib.configs[g].ab;
    for (const [k, g] of [['type', groups[0]], ['balance', groups[1]], ['manufacturer', groups[2]]]) { p += sz(g); ends[k] = p; }
    p += 14;
    for (const s of slots) { p += sz(partGroup); ends[s] = p; }
  }
  const tryName = (ref, g, k) => {
    try { return lib.nameOf(ref, g, setId); } catch (e) {
      if (ends[k] > realBits) return 'None';
      item.error = e.message; return '?';
    }
  };
  names.type = tryName(refs.type, groups[0], 'type');
  names.balance = tryName(refs.balance, groups[1], 'balance');
  names.manufacturer = tryName(refs.manufacturer, groups[2], 'manufacturer');
  for (const s of slots) names[s] = tryName(refs[s], partGroup, s);
  item.parts = names;
  return item;
}

// Pick an asset set that can hold every referenced name.
export function chooseSetId(lib, item) {
  const groups = item.isWeapon ? HEADER_GROUPS.weapon : HEADER_GROUPS.item;
  const partGroup = item.isWeapon ? 'WeaponParts' : 'ItemParts';
  const entries = [['type', groups[0]], ['balance', groups[1]], ['manufacturer', groups[2]],
    ...(item.isWeapon ? WEAPON_SLOTS : ITEM_SLOTS).map((s) => [s, partGroup])];
  let candidates = null;
  for (const [k, g] of entries) {
    const n = item.parts[k];
    if (!n || n === 'None') continue;
    const sets = lib.setsFor(n, g);
    if (!sets.length) throw new Error(`unknown asset "${n}"`);
    if (sets.includes(0)) continue;
    const s = new Set(sets);
    candidates = candidates ? new Set([...candidates].filter((x) => s.has(x))) : s;
    if (!candidates.size) throw new Error('These parts come from different DLCs and cannot be combined on one item.');
  }
  if (!candidates) return item.setId; // everything is base game; keep original
  if (candidates.has(item.setId)) return item.setId;
  return [...candidates][0];
}

export function encodeSerial(lib, item) {
  const setId = chooseSetId(lib, item);
  const groups = item.isWeapon ? HEADER_GROUPS.weapon : HEADER_GROUPS.item;
  const partGroup = item.isWeapon ? 'WeaponParts' : 'ItemParts';
  const slots = item.isWeapon ? WEAPON_SLOTS : ITEM_SLOTS;
  const w = new BitWriter();
  w.write(item.version ?? lib.version, 7);
  w.write(item.isWeapon ? 1 : 0, 1);
  w.write(item.uniqueId >>> 0, 32);
  w.write(0xffff, 16);
  w.write(setId, 8);
  lib.encodeRef(w, groups[0], lib.refOf(item.parts.type, groups[0], setId));
  lib.encodeRef(w, groups[1], lib.refOf(item.parts.balance, groups[1], setId));
  lib.encodeRef(w, groups[2], lib.refOf(item.parts.manufacturer, groups[2], setId));
  w.write(item.gradeIndex & 127, 7);
  w.write(item.gameStage & 127, 7);
  for (const s of slots) lib.encodeRef(w, partGroup, lib.refOf(item.parts[s], partGroup, setId));
  let bytes = w.bytes();
  if (bytes.length > 40) throw new Error('serial too long');
  const full = new Uint8Array(40).fill(0xff);
  full.set(bytes);
  const c = checksum(full);
  full[5] = c >> 8; full[6] = c & 0xff;
  let end = 40;
  while (end > 6 && full[end - 1] === 0xff) end--;
  const out = full.slice(0, end);
  const seed = ((out[1] << 24) | (out[2] << 16) | (out[3] << 8) | out[4]) >>> 0;
  bogoEncrypt(seed, out, 5, out.length - 5);
  item.setId = setId;
  return out;
}

export function randomUniqueId() {
  return (Math.random() * 0x100000000) >>> 0;
}

// Gibbed-style share code: BL2(base64 serial)
export function toCode(serial) {
  let s = '';
  for (const b of serial) s += String.fromCharCode(b);
  return `BL2(${btoa(s)})`;
}
export function fromCode(code) {
  const m = /BL2\(([A-Za-z0-9+/=]+)\)/.exec(code.trim());
  if (!m) throw new Error('code must look like BL2(...)');
  const s = atob(m[1]);
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0));
}
