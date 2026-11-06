// LZO1X decompressor and a simple LZO1X-compatible compressor.
// The compressor emits only standard LZO1X tokens, so any LZO1X decompressor
// (including the game's) can read its output.

export function lzoDecompress(src, outLen) {
  const out = new Uint8Array(outLen);
  let ip = 0, op = 0, t = 0, state = 0;
  const need = (n) => { if (ip + n > src.length) throw new Error('LZO: input overrun'); };
  const lit = (n) => {
    need(n);
    if (op + n > outLen) throw new Error('LZO: output overrun');
    out.set(src.subarray(ip, ip + n), op); ip += n; op += n;
  };
  const copy = (dist, n) => {
    let m = op - dist;
    if (m < 0) throw new Error('LZO: lookbehind overrun');
    if (op + n > outLen) throw new Error('LZO: output overrun');
    for (let i = 0; i < n; i++) out[op++] = out[m++];
  };
  const ext = (base) => { let v = 0; need(1); while (src[ip] === 0) { v += 255; ip++; need(1); } return v + base + src[ip++]; };

  // state: 0 = expect literal run or match; 4 = just copied a literal run (>=4)
  need(1);
  if (src[ip] > 17) {
    t = src[ip++] - 17;
    lit(t);
    state = t < 4 ? t : 4;
  }
  for (;;) {
    need(1);
    t = src[ip++];
    if (t < 16) {
      if (state === 0) {
        const n = t === 0 ? ext(15) : t;
        lit(n + 3);
        state = 4;
        continue;
      }
      if (state === 4) {
        // 3-byte match, far distance (only right after a long literal run)
        need(1);
        const dist = 1 + 0x0800 + (t >> 2) + (src[ip++] << 2);
        copy(dist, 3);
      } else {
        need(1);
        const dist = 1 + (t >> 2) + (src[ip++] << 2);
        copy(dist, 2);
      }
      state = t & 3;
      lit(state);
      continue;
    }
    let len, dist, last;
    if (t >= 64) {
      need(1);
      dist = 1 + ((t >> 2) & 7) + (src[ip++] << 3);
      len = (t >> 5) + 1;
      last = t;
    } else if (t >= 32) {
      len = (t & 31) === 0 ? ext(31) : (t & 31);
      len += 2;
      need(2);
      last = src[ip];
      dist = 1 + ((src[ip] | (src[ip + 1] << 8)) >> 2);
      ip += 2;
    } else {
      len = (t & 7) === 0 ? ext(7) : (t & 7);
      len += 2;
      need(2);
      last = src[ip];
      let d = ((t & 8) << 11) + ((src[ip] | (src[ip + 1] << 8)) >> 2);
      ip += 2;
      if (d === 0) {
        if (op !== outLen) throw new Error(`LZO: size mismatch (${op} != ${outLen})`);
        return out;
      }
      dist = d + 0x4000;
    }
    copy(dist, len);
    state = last & 3;
    lit(state);
  }
}

const M2_MAX_LEN = 8, M2_MAX_OFFSET = 0x0800, M3_MAX_OFFSET = 0x4000, M4_MAX_OFFSET = 0xbfff;

function writeExt(out, value) {
  // value >= 1
  while (value > 255) { out.push(0); value -= 255; }
  out.push(value);
}

export function lzoCompress(src) {
  const n = src.length;
  // 1. Find tokens greedily: list of [literalStart, literalLen, matchLen, matchDist]
  const HBITS = 15, HSIZE = 1 << HBITS;
  const head = new Int32Array(HSIZE).fill(-1);
  const prev = new Int32Array(n).fill(-1);
  const hash = (i) => ((((src[i] << 16) | (src[i + 1] << 8) | src[i + 2]) * 0x9e3779b1) >>> (32 - HBITS));
  const insert = (i) => { if (i + 2 < n) { const h = hash(i); prev[i] = head[h]; head[h] = i; } };
  const tokens = [];
  let litStart = 0, i = 0;
  while (i < n) {
    let bestLen = 0, bestDist = 0;
    if (i + 3 <= n && i > 0) {
      let cand = head[hash(i)], chain = 32;
      while (cand >= 0 && chain-- > 0) {
        const dist = i - cand;
        if (dist > M4_MAX_OFFSET) break;
        if (src[cand] === src[i] && src[cand + 1] === src[i + 1] && src[cand + 2] === src[i + 2]) {
          let l = 3;
          while (i + l < n && src[cand + l] === src[i + l]) l++;
          const ok = dist <= M3_MAX_OFFSET || l >= 4;
          if (ok && l > bestLen) { bestLen = l; bestDist = dist; }
        }
        cand = prev[cand];
      }
    }
    if (bestLen >= 3 && i > litStart - 0) {
      // Never start the stream with a match: at least 1 literal before.
      tokens.push([litStart, i - litStart, bestLen, bestDist]);
      for (let k = 0; k < bestLen; k++) insert(i + k);
      i += bestLen;
      litStart = i;
    } else {
      insert(i);
      i++;
    }
  }
  const tailLits = n - litStart;

  // 2. Emit
  const out = [];
  const pushLits = (start, len) => { for (let k = 0; k < len; k++) out.push(src[start + k]); };
  let prevMatchStateIdx = -1; // index in out of byte holding previous match's state bits
  const emitLiterals = (start, len, first) => {
    if (len === 0) return;
    if (first) {
      if (len <= 238) { out.push(17 + len); pushLits(start, len); return; }
    } else if (len <= 3) {
      out[prevMatchStateIdx] |= len;
      pushLits(start, len);
      return;
    }
    if (len - 3 <= 15) out.push(len - 3);
    else { out.push(0); writeExt(out, len - 3 - 15); }
    pushLits(start, len);
  };
  let first = true;
  for (const [ls, ll, mlen, dist] of tokens) {
    emitLiterals(ls, ll, first);
    first = false;
    if (mlen <= M2_MAX_LEN && dist <= M2_MAX_OFFSET) {
      const d = dist - 1;
      prevMatchStateIdx = out.length;
      out.push(((mlen - 1) << 5) | ((d & 7) << 2));
      out.push(d >> 3);
    } else if (dist <= M3_MAX_OFFSET) {
      const d = dist - 1;
      if (mlen - 2 <= 31) out.push(32 | (mlen - 2));
      else { out.push(32); writeExt(out, mlen - 2 - 31); }
      prevMatchStateIdx = out.length;
      out.push((d & 63) << 2);
      out.push((d >> 6) & 0xff);
    } else {
      const d = dist - 0x4000;
      const hi = (d & 0x4000) >> 11;
      if (mlen - 2 <= 7) out.push(16 | hi | (mlen - 2));
      else { out.push(16 | hi); writeExt(out, mlen - 2 - 7); }
      prevMatchStateIdx = out.length;
      out.push((d & 63) << 2);
      out.push((d >> 6) & 0xff);
    }
  }
  emitLiterals(litStart, tailLits, first);
  out.push(0x11, 0, 0);
  return Uint8Array.from(out);
}
