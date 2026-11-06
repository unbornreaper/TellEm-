// Run with: node bl2-save-editor/tests/run.mjs   (from the repo root)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '../../docs/bl2');
const imp = (p) => import(path.join(app, p));

const { lzoCompress, lzoDecompress } = await imp('js/lzo.js');
const { huffmanEncode, huffmanDecode } = await imp('js/huffman.js');
const { Message, writePackedInts } = await imp('js/protobuf.js');
const { loadSave, writeSave } = await imp('js/savefile.js');
const { GameData } = await imp('js/gamedata.js');
const { SaveModel, xpForLevel } = await imp('js/model.js');
const { decodeSerial, encodeSerial, fromCode, toCode } = await imp('js/items.js');
const { renderWeaponSVG } = await imp('js/preview.js');

let fails = 0, passes = 0;
const check = (cond, name) => { if (cond) passes++; else { fails++; console.log('FAIL:', name); } };
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
const gd = new GameData(JSON.parse(fs.readFileSync(path.join(app, 'data/gamedata.json'))));

// LZO + Huffman round trips
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296;
for (const n of [1, 3, 4, 17, 238, 239, 5000, 70000]) {
  const a = new Uint8Array(n).map((_, i) => (rnd() < 0.7 && i > 30 ? 65 + (i % 5) : rnd() * 256));
  check(eq(lzoDecompress(lzoCompress(a), n), a), `lzo ${n}`);
  check(eq(huffmanDecode(huffmanEncode(a), n), a), `huffman ${n}`);
}

// Known item codes (from the apocalyptech/borderlands2 README)
const INFINITY = 'BL2(h0Hd1Z+jY/s2Qy++Zu8Ba9qXoOmjwJ6NhrlsOmhNMX+oJo5CfQns)';
const RELIC = 'BL2(B2vuv4tz1zSQCf2pqLJCS5XD/tKN4FXpjRJLnn1v85U=)';
const inf = decodeSerial(gd.lib, fromCode(INFINITY));
check(inf.checkOk && inf.isWeapon && gd.displayName(inf) === 'Righteous Infinity', 'decode Infinity');
check(toCode(encodeSerial(gd.lib, { ...inf, parts: { ...inf.parts } })) === INFINITY, 're-encode Infinity exactly');
const relic = decodeSerial(gd.lib, fromCode(RELIC));
check(relic.checkOk && !relic.isWeapon && gd.displayName(relic) === "Vault Hunter's Relic", 'decode relic');
const relic2 = decodeSerial(gd.lib, encodeSerial(gd.lib, { ...relic, parts: { ...relic.parts } }));
check(JSON.stringify(relic2.parts) === JSON.stringify(relic.parts), 'relic round trip');

// Crazy part swap survives encode/decode
const crazy = { ...inf, parts: { ...inf.parts, barrel: 'GD_Weap_SniperRifles.Barrel.SR_Barrel_Jakobs', material: 'None' } };
const crazy2 = decodeSerial(gd.lib, encodeSerial(gd.lib, crazy));
check(crazy2.parts.barrel === crazy.parts.barrel && crazy2.parts.material === 'None', 'crazy part swap');
check(renderWeaponSVG(gd, crazy2).includes('No material'), 'preview shows bare gun');

// Save container, every format
const root = new Message();
root.setString(1, 'GD_Mercenary.Character.CharClass_Mercenary');
root.setInt(2, 20); root.setInt(3, xpForLevel(20));
writePackedInts(root, 6, [1000, 20, 0, 0, 0]);
root.setInt(7, 0);
const ui = new Message(); ui.setString(1, 'Salvador'); root.setMessage(19, ui);
const w = new Message(); w.setBytes(1, fromCode(INFINITY)); w.setInt(2, 1); w.setInt(3, 1);
root.fields.push({ no: 54, wt: 2, v: w.serialize() });
for (let i = 0; i < 500; i++) root.fields.push({ no: 16, wt: 2, v: new TextEncoder().encode(`Station_${i}`) });
const proto = root.serialize();
for (const [compression, littleEndian] of [['lzo', true], ['lzo', false], ['zlib', true], ['zlib', false], ['none', true]]) {
  const bytes = await writeSave({ info: { compression, littleEndian }, root });
  const s = await loadSave(bytes);
  check(s.info.compression === compression && s.info.littleEndian === littleEndian, `detect ${compression}/${littleEndian}`);
  check(eq(s.root.serialize(), proto) && !s.info.warnings.length, `save round trip ${compression}/${littleEndian}`);
}

// Model edits incl. hidden expansion values
const s = await loadSave(await writeSave({ info: { compression: 'lzo', littleEndian: true }, root }));
const m = new SaveModel(s, gd);
check(m.className === 'Salvador' && m.name === 'Salvador' && m.weapons.length === 1, 'model read');
m.level = 72; m.setCurrency(1, 450); m.playthroughs = 2; m.opLevel = 10;
m.updateEntry(m.weapons[0], crazy);
await m.finalize();
const m2 = new SaveModel(await loadSave(await writeSave(s)), gd);
check(m2.level === 72 && m2.xp === xpForLevel(72), 'level + xp');
check(m2.currency(1) === 450, 'eridium > 99');
const { readPackedInts } = await imp('js/protobuf.js');
check(readPackedInts(m2.root, 6)[1] === 99, 'eridium over 99 stored in the hidden expansion entry');
check(m2.playthroughs === 2 && m2.opLevel === 10, 'UVHM + OP level');
check(m2.items.length === 0 && m2.weapons[0].item.parts.barrel.includes('SR_Barrel_Jakobs'), 'inventory');

console.log(`${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
