// BL2 save container: [SHA1][BE size][LZO or zlib]{ BE innerSize, "WSG", ver, crc, size, huffman(protobuf) }
// Endianness and compression are detected from the file and reused when saving.

import { crc32, sha1 } from './hash.js';
import { lzoCompress, lzoDecompress } from './lzo.js';
import { huffmanDecode, huffmanEncode } from './huffman.js';
import { Message } from './protobuf.js';

const BLOCK = 0x40000;

async function zlibInflate(bytes) {
  const ds = new DecompressionStream('deflate');
  const stream = new Blob([bytes]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function zlibDeflate(bytes) {
  const cs = new CompressionStream('deflate');
  const stream = new Blob([bytes]).stream().pipeThrough(cs);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const le32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const put32 = (arr, v, little) => {
  const b = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  arr.push(...(little ? b.reverse() : b));
};
const isZlib = (b, o) => (b[o] & 0x0f) === 8 && ((b[o] << 8) | b[o + 1]) % 31 === 0;

async function decompressPayload(data, size, info) {
  // data = everything after the 4-byte uncompressed size
  if (size <= BLOCK) {
    info.compression = isZlib(data, 0) ? 'zlib' : 'lzo';
    const out = info.compression === 'zlib' ? await zlibInflate(data) : lzoDecompress(data, size);
    if (out.length !== size) throw new Error('decompressed size mismatch');
    return out;
  }
  const count = be32(data, 0);
  let p = 4 + count * 8;
  const out = new Uint8Array(size);
  let o = 0;
  for (let i = 0; i < count; i++) {
    const csize = be32(data, 4 + i * 8);
    const usize = Math.min(be32(data, 8 + i * 8), size - o);
    const chunk = data.subarray(p, p + csize);
    if (i === 0) info.compression = isZlib(chunk, 0) ? 'zlib' : 'lzo';
    const dec = info.compression === 'zlib' ? await zlibInflate(chunk) : lzoDecompress(chunk, usize);
    out.set(dec.subarray(0, usize), o);
    o += usize; p += csize;
  }
  info.blocks = true;
  return out;
}

async function compressPayload(bytes, compression) {
  const comp = compression === 'zlib' ? zlibDeflate : (b) => lzoCompress(b);
  if (bytes.length <= BLOCK) return [await comp(bytes)];
  const count = Math.ceil(bytes.length / BLOCK);
  const header = [];
  put32(header, count, false);
  const blocks = [];
  for (let i = 0; i < count; i++) {
    const c = await comp(bytes.subarray(i * BLOCK, (i + 1) * BLOCK));
    blocks.push(c);
    put32(header, c.length, false);
    put32(header, BLOCK, false);
  }
  return [Uint8Array.from(header), ...blocks];
}

function concat(parts) {
  const total = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function parseWsg(buf, offset, info) {
  if (buf[offset] !== 0x57 || buf[offset + 1] !== 0x53 || buf[offset + 2] !== 0x47) throw new Error('missing WSG magic');
  const vLE = le32(buf, offset + 3), vBE = be32(buf, offset + 3);
  if (vLE === 2) info.littleEndian = true;
  else if (vBE === 2) info.littleEndian = false;
  else throw new Error(`unsupported save version ${vLE}`);
  const rd = info.littleEndian ? le32 : be32;
  const crc = rd(buf, offset + 7);
  const size = rd(buf, offset + 11);
  const body = huffmanDecode(buf.subarray(offset + 15), size);
  if (crc32(body) !== crc) throw new Error('save CRC32 check failed (file is corrupt or still encrypted)');
  return body;
}

export async function loadSave(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const info = { warnings: [] };
  if (bytes.length < 40) throw new Error('file too small to be a BL2 save');
  if (bytes[0] === 0x43 && bytes[1] === 0x4f && bytes[2] === 0x4e && bytes[3] === 0x20) {
    throw new Error('This is a packed Xbox 360 CON file. Extract SaveGame.sav first.');
  }
  let protoBytes;
  if (bytes[0] === 0x57 && bytes[1] === 0x53 && bytes[2] === 0x47) {
    info.compression = 'none';
    protoBytes = parseWsg(bytes, 0, info);
  } else {
    const hash = sha1(bytes.subarray(20));
    if (!hash.every((b, i) => b === bytes[i])) {
      info.warnings.push('SHA-1 header did not match. The file may still be encrypted; decrypt it with Save Wizard first.');
    }
    const size = be32(bytes, 20);
    if (size > 64 * 1024 * 1024) throw new Error('This does not look like a decrypted BL2 save. Decrypt it with Save Wizard (or similar) first.');
    let inner;
    try {
      inner = await decompressPayload(bytes.subarray(24), size, info);
    } catch (e) {
      throw new Error(`Could not decompress the save (${e.message}). Is it decrypted?`);
    }
    protoBytes = parseWsg(inner, 4, info);
  }
  const root = Message.parse(protoBytes);
  const reencoded = root.serialize();
  if (reencoded.length !== protoBytes.length || !reencoded.every((b, i) => b === protoBytes[i])) {
    info.warnings.push('Save data did not re-encode identically; edits may still work but keep a backup.');
  }
  return { info, root, original: bytes };
}

export async function writeSave(save) {
  const { info, root } = save;
  const body = root.serialize();
  const header = [0x57, 0x53, 0x47];
  put32(header, 2, info.littleEndian);
  put32(header, crc32(body), info.littleEndian);
  put32(header, body.length, info.littleEndian);
  const wsg = concat([Uint8Array.from(header), huffmanEncode(body), new Uint8Array(4)]);
  if (info.compression === 'none') return wsg;
  const inner = new Uint8Array(wsg.length + 4);
  const sz = []; put32(sz, wsg.length, false);
  inner.set(sz, 0); inner.set(wsg, 4);
  const sizeHdr = []; put32(sizeHdr, inner.length, false);
  const payload = concat([Uint8Array.from(sizeHdr), ...(await compressPayload(inner, info.compression))]);
  return concat([sha1(payload), payload]);
}
