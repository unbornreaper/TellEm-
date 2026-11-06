// Gearbox's Huffman coding used inside BL2 saves (port of Gibbed.Gearbox.Common.Huffman).
// Bits are stored most-significant-bit first.

export function huffmanDecode(input, outLen) {
  let bit = 0;
  const total = input.length * 8;
  const readBit = () => {
    if (bit >= total) throw new Error('Huffman: ran out of data');
    const v = (input[bit >> 3] >> (7 - (bit & 7))) & 1; bit++; return v;
  };
  const left = new Int32Array(511), right = new Int32Array(511), sym = new Uint8Array(511);
  let count = 0;
  const readNode = () => {
    const cur = count++;
    if (cur >= 511) throw new Error('Huffman: bad tree');
    if (readBit()) {
      let v = 0;
      for (let i = 0; i < 8; i++) v = (v << 1) | readBit();
      left[cur] = -1; right[cur] = -1; sym[cur] = v;
    } else {
      left[cur] = readNode();
      right[cur] = readNode();
    }
    return cur;
  };
  readNode();
  const out = new Uint8Array(outLen);
  for (let o = 0; o < outLen; o++) {
    let n = 0;
    while (left[n] !== -1) n = readBit() ? right[n] : left[n];
    out[o] = sym[n];
  }
  return out;
}

export function huffmanEncode(data) {
  const freq = new Array(256).fill(0);
  for (const b of data) freq[b]++;
  let nodes = [];
  for (let s = 0; s < 256; s++) if (freq[s]) nodes.push({ s, f: freq[s] });
  if (nodes.length === 1) nodes.push({ s: (nodes[0].s + 1) & 255, f: 0 });
  if (nodes.length === 0) nodes.push({ s: 0, f: 0 }, { s: 1, f: 0 });
  while (nodes.length > 1) {
    nodes.sort((a, b) => a.f - b.f);
    const [a, b] = nodes.splice(0, 2);
    nodes.push({ f: a.f + b.f, l: a, r: b });
  }
  const root = nodes[0];
  const codes = new Array(256);
  const walk = (node, path) => {
    if (!node.l) { codes[node.s] = path; return; }
    walk(node.l, path + '0');
    walk(node.r, path + '1');
  };
  walk(root, '');
  const bytes = [];
  let cur = 0, nbits = 0;
  const put = (b) => { cur = (cur << 1) | b; if (++nbits === 8) { bytes.push(cur); cur = 0; nbits = 0; } };
  const writeTree = (node) => {
    if (!node.l) { put(1); for (let i = 7; i >= 0; i--) put((node.s >> i) & 1); }
    else { put(0); writeTree(node.l); writeTree(node.r); }
  };
  writeTree(root);
  for (const b of data) { const c = codes[b]; for (let i = 0; i < c.length; i++) put(c.charCodeAt(i) - 48); }
  if (nbits) bytes.push(cur << (8 - nbits));
  return Uint8Array.from(bytes);
}
