// Draws a stylized side view of a weapon from its parts.
// Every part is drawn in the style of its own manufacturer and weapon type, so
// mixed ("crazy") part combinations show up as a mixed-looking gun. The
// material part decides the paint; with no material the gun is drawn bare.
// This is an illustration built from part data, not the game's 3D model.

import { rarityOf, shortName } from './gamedata.js';

const MFRS = ['Bandit', 'Dahl', 'Hyperion', 'Jakobs', 'Maliwan', 'Tediore', 'Torgue', 'Vladof', 'Gearbox', 'Eridian'];

export function manufacturerOf(name = '') {
  const s = name.split('.').slice(1).join('.');
  if (/Scav|BanditMade/i.test(s)) return 'Bandit';
  for (const m of MFRS) if (new RegExp(m, 'i').test(s)) return m;
  if (/Malwan/i.test(s)) return 'Maliwan';
  if (/Alien|Etech/i.test(s)) return 'Eridian';
  return null;
}

export function categoryOfPart(name = '', fallback = 'Pistol') {
  const pkg = name.split('.')[0] + ' ' + name.split('.').pop();
  if (/Sniper|SR_/i.test(pkg)) return 'SniperRifle';
  if (/Shotgun|SG_/i.test(pkg)) return 'Shotgun';
  if (/SMG/i.test(pkg)) return 'SMG';
  if (/Launcher|RL_|Rocket/i.test(pkg)) return 'RocketLauncher';
  if (/AssaultRifle|AR_/i.test(pkg)) return 'AssaultRifle';
  if (/Pistol/i.test(pkg)) return 'Pistol';
  return fallback;
}

export function elementOf(name = '') {
  const s = name.split('.').pop();
  if (/Fire|Incendiary|Flame/i.test(s)) return 'fire';
  if (/Shock/i.test(s)) return 'shock';
  if (/Corrosive|Acid/i.test(s)) return 'corrosive';
  if (/Slag|Amp/i.test(s)) return 'slag';
  if (/Explosive|Explo/i.test(s)) return 'explosive';
  if (/Ice|Cryo/i.test(s)) return 'cryo';
  return null;
}

export const ELEMENT_COLORS = { fire: '#ff6a00', shock: '#3fb4ff', corrosive: '#86e01f', slag: '#b45cf0', explosive: '#ffd23f', cryo: '#9be8ff' };

// Paint per manufacturer: [main, secondary, accent, pattern]
const PAINT = {
  Bandit: ['#a4552c', '#d8c48a', '#3c2a1c', 'scrap'],
  Dahl: ['#6d7748', '#c8b98a', '#2e3324', 'camo'],
  Hyperion: ['#eef0f2', '#d4a22a', '#5a5f66', 'hex'],
  Jakobs: ['#7b4a22', '#caa04a', '#3d2412', 'wood'],
  Maliwan: ['#2bb3a6', '#e8f3f1', '#18403c', 'gradient'],
  Tediore: ['#5f90b8', '#e2e4e6', '#2f4a60', 'flat'],
  Torgue: ['#3a3a3e', '#f2a516', '#1b1b1d', 'stripes'],
  Vladof: ['#b3261e', '#2c2c2c', '#e7c35a', 'stripes'],
  Gearbox: ['#4d6178', '#e0e0e0', '#22303f', 'flat'],
  Eridian: ['#4c2a7a', '#53f0d2', '#1d0f33', 'gradient'],
};
const GEMS = { Quartz: '#f2d0dc', Emerald: '#2fc46a', Diamond: '#d9f2ff', Citrine: '#f5c434', Aquamarine: '#53d6e0', Ruby: '#d6203a', Sapphire: '#2856d6', Amethyst: '#9a55e0', Garnet: '#8f1d2a' };
const BARE = ['#8d9196', '#b7bbbf', '#4e5257', 'bare'];
const METAL = '#3b3f45', METAL_LIGHT = '#6a7078', METAL_DARK = '#202326';

function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function shiftHue(hex, deg) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min; s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
  }
  h = (h + deg + 360) % 360;
  const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const to = (x) => Math.round(x * 255).toString(16).padStart(2, '0');
  return s === 0 ? hex : `#${to(f(p, q, h / 360 + 1 / 3))}${to(f(p, q, h / 360))}${to(f(p, q, h / 360 - 1 / 3))}`;
}

export function paintFor(material, balance) {
  if (!material || material === 'None') return { colors: BARE, tier: 0, bare: true, label: 'No material: bare, unpainted' };
  const leaf = shortName(material);
  const mfr = manufacturerOf(material) || 'Gearbox';
  let [main, second, accent, pattern] = PAINT[mfr] || PAINT.Gearbox;
  const tierMatch = /_(\d)_?/.exec(leaf);
  const tier = tierMatch ? +tierMatch[1] : 1;
  const gem = Object.keys(GEMS).find((g) => leaf.includes(g));
  if (gem) { main = GEMS[gem]; second = '#ffffff'; pattern = 'gem'; }
  else if (tier >= 5 || /Legendary|Unique|Seraph|Pearl/i.test(leaf)) {
    // Unique skins get a distinct but stable color twist
    const h = hash(leaf);
    if (!/_Legendary$/.test(leaf)) { main = shiftHue(main, (h % 120) - 60); second = shiftHue(second, ((h >> 8) % 90) - 45); }
    pattern = pattern === 'flat' ? 'stripes' : pattern;
  } else if (tier <= 1) {
    pattern = 'flat';
  }
  const rarity = rarityOf(balance, material);
  return { colors: [main, second, accent, pattern], tier, rarity, label: leaf };
}

// Size/shape per weapon category
const CAT = {
  Pistol: { bw: 120, bh: 46, barrel: 90, bt: 16, stock: 0, mag: 'short' },
  SMG: { bw: 150, bh: 50, barrel: 95, bt: 16, stock: 70, mag: 'mid' },
  AssaultRifle: { bw: 190, bh: 54, barrel: 150, bt: 17, stock: 110, mag: 'long' },
  Shotgun: { bw: 170, bh: 56, barrel: 150, bt: 24, stock: 105, mag: 'tube' },
  SniperRifle: { bw: 180, bh: 50, barrel: 230, bt: 15, stock: 120, mag: 'mid' },
  RocketLauncher: { bw: 240, bh: 64, barrel: 70, bt: 54, stock: 60, mag: 'none' },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function patternDefs(id, colors) {
  const [main, second, accent, pattern] = colors;
  const p = (body) => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="40" height="40">${body}</pattern>`;
  switch (pattern) {
    case 'camo': return p(`<rect width="40" height="40" fill="${main}"/><path d="M2 8c6-6 14 2 10 8s-12 4-10-8zM22 24c8-4 16 4 10 10s-14 0-10-10zM26 2c4 0 8 4 4 8s-8-4-4-8z" fill="${second}" opacity=".55"/><path d="M8 28c4-2 8 2 6 6s-8 0-6-6zM30 14c3-1 6 2 4 4s-6 0-4-4z" fill="${accent}" opacity=".6"/>`);
    case 'hex': return p(`<rect width="40" height="40" fill="${main}"/><path d="M10 2l8 0 4 7-4 7-8 0-4-7zM30 22l8 0 4 7-4 7-8 0-4-7z" fill="none" stroke="${second}" stroke-width="1.5" opacity=".7"/>`);
    case 'wood': return p(`<rect width="40" height="40" fill="${main}"/><path d="M0 6c10 3 20-3 40 1M0 17c12 4 22-4 40 0M0 28c8-3 24 4 40-1M0 36c14 2 20-3 40 1" stroke="${accent}" stroke-width="1.6" fill="none" opacity=".55"/>`);
    case 'gradient': return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${second}"/><stop offset=".45" stop-color="${main}"/><stop offset="1" stop-color="${accent}"/></linearGradient>`;
    case 'stripes': return p(`<rect width="40" height="40" fill="${main}"/><path d="M-10 50L50-10M10 50L50 10M-10 30L30-10" stroke="${second}" stroke-width="5" opacity=".55"/>`);
    case 'scrap': return p(`<rect width="40" height="40" fill="${main}"/><rect x="4" y="5" width="14" height="10" fill="${second}" opacity=".5"/><rect x="22" y="22" width="12" height="12" fill="${accent}" opacity=".45"/><circle cx="30" cy="8" r="1.6" fill="${accent}"/><circle cx="8" cy="30" r="1.6" fill="${accent}"/>`);
    case 'gem': return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0.6"><stop offset="0" stop-color="#ffffff"/><stop offset=".3" stop-color="${main}"/><stop offset=".55" stop-color="${shiftHue(main, 25)}"/><stop offset=".8" stop-color="${main}"/><stop offset="1" stop-color="#ffffff"/></linearGradient>`;
    case 'bare': return p(`<rect width="40" height="40" fill="${main}"/><path d="M0 0h20v20H0zM20 20h20v20H20z" fill="${second}" opacity=".18"/>`);
    default: return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shiftHue(main, 0)}"/><stop offset="1" stop-color="${main}"/></linearGradient>`;
  }
}

// ---- part drawers. Each returns SVG markup. ctx: {fill, second, accent, stroke}
function body(m, x, y, w, h, c, cat) {
  const s = `stroke="${c.stroke}" stroke-width="2" stroke-linejoin="round"`;
  if (cat === 'RocketLauncher') {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${c.fill}" ${s}/>` +
      `<rect x="${x + w * 0.15}" y="${y + 6}" width="${w * 0.5}" height="${h * 0.22}" rx="4" fill="${c.second}" opacity=".85"/>` +
      (m === 'Torgue' ? rivets(x + 20, y + h - 12, w - 40, 6) : '') + bands(x, y, w, h, c, 3);
  }
  switch (m) {
    case 'Jakobs':
      return `<path d="M${x} ${y + h}L${x} ${y + 12}Q${x} ${y} ${x + 14} ${y}L${x + w - 10} ${y}Q${x + w} ${y} ${x + w} ${y + 10}L${x + w} ${y + h * 0.7}Q${x + w * 0.6} ${y + h} ${x + w * 0.35} ${y + h}Z" fill="${c.fill}" ${s}/>` +
        `<rect x="${x + 8}" y="${y + 8}" width="${w * 0.45}" height="${h * 0.35}" rx="6" fill="${c.second}" opacity=".9"/>` +
        `<circle cx="${x + w * 0.72}" cy="${y + h * 0.42}" r="${h * 0.22}" fill="${METAL}" stroke="${c.second}" stroke-width="2"/>`;
    case 'Maliwan':
      return `<path d="M${x + 6} ${y + h}C${x - 8} ${y + h * 0.5} ${x + 6} ${y} ${x + w * 0.4} ${y}L${x + w - 18} ${y + 4}C${x + w + 6} ${y + 10} ${x + w + 4} ${y + h * 0.8} ${x + w - 20} ${y + h}Z" fill="${c.fill}" ${s}/>` +
        `<path d="M${x + 18} ${y + h * 0.55}C${x + w * 0.3} ${y + h * 0.3} ${x + w * 0.6} ${y + h * 0.3} ${x + w - 20} ${y + h * 0.5}" stroke="${c.second}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
    case 'Hyperion':
      return `<path d="M${x} ${y + 8}L${x + 16} ${y}L${x + w} ${y}L${x + w} ${y + h * 0.65}L${x + w - 24} ${y + h}L${x + 10} ${y + h}L${x} ${y + h - 10}Z" fill="${c.fill}" ${s}/>` +
        `<path d="M${x + w * 0.3} ${y + 6}L${x + w - 6} ${y + 6}L${x + w - 6} ${y + h * 0.35}L${x + w * 0.38} ${y + h * 0.35}Z" fill="${c.second}"/>` +
        `<rect x="${x + 14}" y="${y + h * 0.5}" width="${w * 0.2}" height="5" fill="${c.accent}"/>`;
    case 'Dahl':
      return `<path d="M${x} ${y + 6}L${x + 6} ${y}L${x + w - 6} ${y}L${x + w} ${y + 6}L${x + w} ${y + h}L${x} ${y + h}Z" fill="${c.fill}" ${s}/>` +
        `<rect x="${x + 10}" y="${y - 6}" width="${w - 20}" height="6" fill="${METAL}"/>` +
        Array.from({ length: Math.floor((w - 20) / 10) }, (_, i) => `<rect x="${x + 12 + i * 10}" y="${y - 6}" width="5" height="3" fill="${METAL_LIGHT}"/>`).join('') +
        `<rect x="${x + 10}" y="${y + h * 0.4}" width="${w * 0.4}" height="${h * 0.3}" fill="${c.second}" opacity=".85"/>`;
    case 'Vladof':
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="${c.fill}" ${s}/>` +
        `<rect x="${x}" y="${y}" width="${w}" height="${h * 0.3}" fill="${c.second}"/>` +
        Array.from({ length: 4 }, (_, i) => `<rect x="${x + w * 0.45 + i * 12}" y="${y + h * 0.45}" width="6" height="${h * 0.35}" rx="2" fill="${METAL_DARK}"/>`).join('') +
        `<path d="M${x + 12} ${y + h * 0.55}l8 -8 8 8 -8 8z" fill="${c.accent}"/>`;
    case 'Tediore':
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${c.fill}" ${s}/>` +
        `<rect x="${x + w * 0.55}" y="${y + 8}" width="${w * 0.32}" height="${h - 16}" rx="5" fill="${c.second}"/>` +
        `<rect x="${x + w * 0.6}" y="${y + h / 2 - 3}" width="${w * 0.22}" height="6" rx="3" fill="#7fe07f"/>`;
    case 'Torgue':
      return `<rect x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${h + 12}" rx="6" fill="${c.fill}" ${s}/>` +
        `<rect x="${x + 8}" y="${y + h * 0.3}" width="${w * 0.5}" height="${h * 0.32}" fill="${c.second}"/>` +
        `<text x="${x + 8 + w * 0.25}" y="${y + h * 0.56}" font-size="${h * 0.3}" font-weight="900" text-anchor="middle" fill="${c.accent}" font-family="Arial Black,Arial">T</text>` +
        rivets(x, y - 2, w, 8) + rivets(x, y + h + 2, w, 8);
    case 'Bandit':
      return `<path d="M${x} ${y + 10}L${x + 20} ${y - 4}L${x + w * 0.6} ${y + 4}L${x + w} ${y}L${x + w + 4} ${y + h * 0.7}L${x + w * 0.7} ${y + h}L${x + 6} ${y + h + 4}Z" fill="${c.fill}" ${s}/>` +
        `<rect x="${x + 14}" y="${y + 10}" width="${w * 0.3}" height="${h * 0.4}" fill="${c.second}" transform="rotate(-6 ${x + 14} ${y + 10})" opacity=".85"/>` +
        rivets(x + 10, y + h - 6, w * 0.8, 6) + `<path d="M${x + w * 0.5} ${y + 8}l14 26M${x + w * 0.58} ${y + 6}l14 26" stroke="${c.accent}" stroke-width="2"/>`;
    default:
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${c.fill}" ${s}/>` +
        `<rect x="${x + 10}" y="${y + 10}" width="${w * 0.5}" height="${h * 0.3}" fill="${c.second}"/>`;
  }
}

function rivets(x, y, w, n) {
  return Array.from({ length: n }, (_, i) => `<circle cx="${x + (w / (n - 1 || 1)) * i}" cy="${y}" r="2.4" fill="#c9c9c9" stroke="#333" stroke-width=".8"/>`).join('');
}
function bands(x, y, w, h, c, n) {
  return Array.from({ length: n }, (_, i) => `<rect x="${x + w * (0.25 + i * 0.22)}" y="${y}" width="6" height="${h}" fill="${c.accent}" opacity=".7"/>`).join('');
}

function barrel(m, x, y, len, t, c, el) {
  const s = `stroke="${c.stroke}" stroke-width="2"`;
  const glow = el ? ELEMENT_COLORS[el] : null;
  let out = '';
  switch (m) {
    case 'Jakobs':
      out = `<rect x="${x}" y="${y}" width="${len}" height="${t * 0.75}" rx="${t * 0.35}" fill="${METAL}" ${s}/>` +
        `<rect x="${x}" y="${y + t * 0.75}" width="${len * 0.7}" height="${t * 0.4}" rx="3" fill="${c.fill}" ${s}/>` +
        `<rect x="${x + len * 0.3}" y="${y - 2}" width="10" height="${t * 0.75 + 4}" fill="${c.second}"/>` +
        `<rect x="${x + len - 8}" y="${y - 5}" width="4" height="6" fill="${c.second}"/>`;
      break;
    case 'Maliwan':
      out = `<path d="M${x} ${y}L${x + len - t} ${y}Q${x + len + t * 0.4} ${y + t / 2} ${x + len - t} ${y + t}L${x} ${y + t}Z" fill="${c.fill}" ${s}/>` +
        Array.from({ length: 3 }, (_, i) => `<rect x="${x + len * (0.25 + i * 0.18)}" y="${y - 8}" width="7" height="${t + 16}" rx="3.5" fill="${glow || c.second}" ${s} stroke-width="1.2"/>`).join('');
      break;
    case 'Hyperion':
      out = `<rect x="${x}" y="${y - 2}" width="${len}" height="${t + 4}" fill="${c.fill}" ${s}/>` +
        `<rect x="${x + len * 0.15}" y="${y + t * 0.35}" width="${len * 0.6}" height="${t * 0.3}" fill="${METAL_DARK}"/>` +
        `<path d="M${x + len} ${y - 2}l10 ${(t + 4) / 2} -10 ${(t + 4) / 2}z" fill="${c.second}"/>`;
      break;
    case 'Dahl':
      out = `<rect x="${x}" y="${y}" width="${len}" height="${t}" fill="${METAL}" ${s}/>` +
        `<rect x="${x}" y="${y - 3}" width="${len * 0.65}" height="${t + 6}" rx="3" fill="${c.fill}" ${s}/>` +
        Array.from({ length: Math.max(2, Math.floor(len * 0.6 / 14)) }, (_, i) => `<circle cx="${x + 10 + i * 14}" cy="${y + t / 2}" r="${t * 0.18}" fill="${METAL_DARK}"/>`).join('') +
        `<rect x="${x + len - 4}" y="${y - 5}" width="18" height="${t + 10}" fill="${METAL_LIGHT}" ${s}/>` +
        `<rect x="${x + len + 2}" y="${y - 1}" width="3" height="${t + 2}" fill="${METAL_DARK}"/><rect x="${x + len + 8}" y="${y - 1}" width="3" height="${t + 2}" fill="${METAL_DARK}"/>`;
      break;
    case 'Vladof': {
      const n = t > 18 ? 4 : 3, bt = Math.max(5, (t * 1.3) / n);
      for (let i = 0; i < n; i++) out += `<rect x="${x}" y="${y - t * 0.15 + i * bt}" width="${len}" height="${bt - 1}" rx="${bt / 2}" fill="${METAL}" ${s} stroke-width="1.2"/>`;
      out += `<rect x="${x + len * 0.2}" y="${y - t * 0.3}" width="12" height="${t * 1.6}" rx="3" fill="${c.fill}" ${s}/>` +
        `<rect x="${x + len - 16}" y="${y - t * 0.3}" width="10" height="${t * 1.6}" rx="3" fill="${c.second}" ${s}/>`;
      break;
    }
    case 'Tediore':
      out = `<rect x="${x}" y="${y}" width="${len}" height="${t}" rx="${t / 2}" fill="${c.fill}" ${s}/>` +
        `<rect x="${x + len * 0.1}" y="${y + t * 0.3}" width="${len * 0.75}" height="${t * 0.4}" rx="${t * 0.2}" fill="${c.second}"/>`;
      break;
    case 'Torgue':
      out = `<rect x="${x}" y="${y - t * 0.3}" width="${len}" height="${t * 1.6}" rx="4" fill="${c.fill}" ${s}/>` +
        `<rect x="${x + len - 6}" y="${y - t * 0.5}" width="18" height="${t * 2}" rx="4" fill="${METAL_DARK}" ${s}/>` +
        `<rect x="${x + 10}" y="${y + t * 0.2}" width="${len * 0.6}" height="${t * 0.4}" fill="${c.second}"/>` + rivets(x + 8, y - t * 0.1, len - 20, 5);
      break;
    case 'Bandit':
      out = `<rect x="${x}" y="${y}" width="${len}" height="${t}" fill="${METAL}" ${s}/>` +
        Array.from({ length: 3 }, (_, i) => `<rect x="${x + len * (0.15 + i * 0.25)}" y="${y - 3}" width="14" height="${t + 6}" fill="${c.second}" transform="rotate(${i % 2 ? 8 : -8} ${x + len * (0.15 + i * 0.25)} ${y})" ${s} stroke-width="1"/>`).join('') +
        `<path d="M${x + len} ${y}l14 ${t / 2} -14 ${t / 2}z" fill="${c.accent}" ${s}/>`;
      break;
    default:
      out = `<rect x="${x}" y="${y}" width="${len}" height="${t}" rx="4" fill="${METAL}" ${s}/>`;
  }
  if (glow) {
    out += `<g filter="url(#glow)">` + Array.from({ length: 3 }, (_, i) => `<rect x="${x + len * 0.55 + i * 9}" y="${y - 3}" width="4" height="${t + 6}" rx="2" fill="${glow}"/>`).join('') +
      `<circle cx="${x + len + 6}" cy="${y + t / 2}" r="${Math.max(5, t * 0.45)}" fill="${glow}" opacity=".75"/></g>`;
  }
  return out;
}

function grip(m, x, y, h, c) {
  const s = `stroke="${c.stroke}" stroke-width="2" stroke-linejoin="round"`;
  const w = 34;
  switch (m) {
    case 'Jakobs': return `<path d="M${x} ${y}L${x + w} ${y}Q${x + w + 2} ${y + h * 0.6} ${x + w - 8} ${y + h}Q${x - 6} ${y + h + 4} ${x - 14} ${y + h * 0.8}Q${x - 6} ${y + h * 0.4} ${x} ${y}Z" fill="${c.fill}" ${s}/><path d="M${x + 4} ${y + 10}Q${x + 10} ${y + h * 0.5} ${x - 2} ${y + h * 0.8}" stroke="${c.accent}" stroke-width="2" fill="none" opacity=".6"/>`;
    case 'Maliwan': return `<path d="M${x} ${y}L${x + w} ${y}C${x + w + 6} ${y + h * 0.5} ${x + w - 4} ${y + h} ${x + 2} ${y + h}C${x - 14} ${y + h} ${x - 10} ${y + h * 0.4} ${x} ${y}Z" fill="${c.fill}" ${s}/><path d="M${x + w - 4} ${y + 6}C${x + w} ${y + h * 0.4} ${x + w - 8} ${y + h * 0.8} ${x + 6} ${y + h - 6}" stroke="${c.second}" stroke-width="4" fill="none"/>`;
    case 'Hyperion': return `<path d="M${x} ${y}L${x + w} ${y}L${x + w - 6} ${y + h}L${x - 10} ${y + h}L${x - 4} ${y + h * 0.5}Z" fill="${c.fill}" ${s}/><path d="M${x + 4} ${y + h * 0.25}L${x + w * 0.5} ${y + h * 0.25}L${x + w * 0.42} ${y + h * 0.7}L${x - 4} ${y + h * 0.7}Z" fill="${c.second}"/>`;
    case 'Dahl': return `<path d="M${x} ${y}L${x + w} ${y}L${x + w - 8} ${y + h}L${x - 10} ${y + h}Z" fill="${c.fill}" ${s}/>` + [0.3, 0.5, 0.7].map((k) => `<circle cx="${x + w - 4 - k * 8}" cy="${y + h * k}" r="3" fill="${c.accent}"/>`).join('');
    case 'Vladof': return `<path d="M${x - 4} ${y}L${x + w + 6} ${y}L${x + w - 2} ${y + h + 4}L${x - 14} ${y + h + 4}Z" fill="${c.fill}" ${s}/><path d="M${x - 4} ${y + h * 0.5}L${x + w} ${y + h * 0.5}L${x + w - 2} ${y + h * 0.5 + 8}L${x - 6} ${y + h * 0.5 + 8}Z" fill="${c.second}"/>`;
    case 'Tediore': return `<path d="M${x} ${y}L${x + w} ${y}L${x + w - 10} ${y + h - 8}Q${x + w - 12} ${y + h} ${x + w - 20} ${y + h}L${x - 6} ${y + h}Q${x - 14} ${y + h} ${x - 12} ${y + h - 8}Z" fill="${c.fill}" ${s}/>`;
    case 'Torgue': return `<path d="M${x - 8} ${y}L${x + w + 8} ${y}L${x + w} ${y + h + 6}L${x - 18} ${y + h + 6}Z" fill="${c.fill}" ${s}/>` + rivets(x - 4, y + h * 0.5, w, 3);
    case 'Bandit': return `<path d="M${x} ${y}L${x + w} ${y + 2}L${x + w - 10} ${y + h}L${x - 8} ${y + h - 4}Z" fill="${c.fill}" ${s}/>` + [0.25, 0.5, 0.75].map((k) => `<path d="M${x - 6 + k * 4} ${y + h * k}l${w} -6" stroke="${c.second}" stroke-width="5"/>`).join('');
    default: return `<path d="M${x} ${y}L${x + w} ${y}L${x + w - 10} ${y + h}L${x - 10} ${y + h}Z" fill="${c.fill}" ${s}/>`;
  }
}

function stock(m, x, y, len, h, c) {
  const s = `stroke="${c.stroke}" stroke-width="2" stroke-linejoin="round"`;
  const x0 = x - len;
  switch (m) {
    case 'Jakobs': return `<path d="M${x} ${y}L${x0 + 10} ${y + h * 0.1}Q${x0} ${y + h * 0.2} ${x0} ${y + h * 0.5}L${x0 + 4} ${y + h * 1.25}Q${x0 + len * 0.5} ${y + h * 0.8} ${x} ${y + h * 0.75}Z" fill="${c.fill}" ${s}/>`;
    case 'Maliwan': return `<path d="M${x} ${y}C${x0 + len * 0.3} ${y - 6} ${x0} ${y} ${x0} ${y + h * 0.5}C${x0} ${y + h * 1.1} ${x0 + len * 0.4} ${y + h} ${x} ${y + h * 0.7}Z" fill="${c.fill}" ${s}/><path d="M${x0 + len * 0.3} ${y + h * 0.35}C${x0 + len * 0.6} ${y + h * 0.25} ${x - 10} ${y + h * 0.3} ${x} ${y + h * 0.35}" stroke="${c.second}" stroke-width="4" fill="none"/>`;
    case 'Hyperion': return `<path d="M${x} ${y}L${x0} ${y + 4}L${x0} ${y + h}L${x0 + len * 0.5} ${y + h}L${x} ${y + h * 0.6}Z" fill="${c.fill}" ${s}/><rect x="${x0 + len * 0.2}" y="${y + h * 0.3}" width="${len * 0.4}" height="${h * 0.3}" fill="${c.second}"/>`;
    case 'Dahl': return `<path d="M${x} ${y + 4}L${x0} ${y + 4}L${x0} ${y + h * 1.1}L${x0 + 10} ${y + h * 1.1}L${x - len * 0.4} ${y + h * 0.5}L${x} ${y + h * 0.5}Z" fill="${c.fill}" ${s}/><rect x="${x0 + 14}" y="${y + 12}" width="${len * 0.45}" height="8" fill="${METAL_DARK}"/>`;
    case 'Vladof': return `<path d="M${x} ${y}L${x0} ${y}L${x0} ${y + h * 1.15}L${x0 + 16} ${y + h * 1.15}L${x} ${y + h * 0.7}Z" fill="${c.fill}" ${s}/><rect x="${x0}" y="${y + h * 0.3}" width="${len}" height="7" fill="${c.second}"/>`;
    case 'Tediore': return `<rect x="${x0}" y="${y + 2}" width="${len}" height="${h * 0.8}" rx="10" fill="${c.fill}" ${s}/>`;
    case 'Torgue': return `<rect x="${x0 - 6}" y="${y - 4}" width="${len + 6}" height="${h * 1.15}" rx="4" fill="${c.fill}" ${s}/>` + rivets(x0, y + 2, len - 8, 5);
    case 'Bandit': return `<path d="M${x} ${y}L${x0} ${y + 8}L${x0 + 6} ${y + h}L${x} ${y + h * 0.7}Z" fill="${c.fill}" ${s}/><path d="M${x0 + 10} ${y + 10}l${len * 0.6} 6M${x0 + 12} ${y + h * 0.6}l${len * 0.6} -4" stroke="${c.second}" stroke-width="5"/>`;
    default: return `<path d="M${x} ${y}L${x0} ${y + 4}L${x0} ${y + h}L${x} ${y + h * 0.7}Z" fill="${c.fill}" ${s}/>`;
  }
}

function sight(name, m, x, y, cat, c) {
  const leaf = shortName(name);
  const s = `stroke="${c.stroke}" stroke-width="2"`;
  if (!name || name === 'None' || /_None$/i.test(leaf)) {
    return `<rect x="${x}" y="${y - 8}" width="6" height="8" fill="${METAL}"/><rect x="${x + 60}" y="${y - 7}" width="4" height="7" fill="${METAL}"/>`;
  }
  const L = cat === 'SniperRifle' ? 120 : cat === 'Pistol' ? 46 : 70;
  const R = cat === 'SniperRifle' ? 12 : 9;
  const lens = { Maliwan: '#7ff5e6', Hyperion: '#ffd76a', Jakobs: '#ffe6a8', Dahl: '#9fd39b', Vladof: '#ff6b5e', Torgue: '#ffb341', Tediore: '#8fd0ff', Bandit: '#ffd0a0' }[m] || '#9fd8ff';
  let out = `<rect x="${x + 6}" y="${y - 6}" width="12" height="6" fill="${METAL}"/><rect x="${x + L - 18}" y="${y - 6}" width="12" height="6" fill="${METAL}"/>`;
  switch (m) {
    case 'Hyperion':
      out += `<rect x="${x}" y="${y - 6 - R * 2}" width="${L}" height="${R * 2}" fill="${c.fill}" ${s}/><rect x="${x + L - 4}" y="${y - 8 - R * 2}" width="8" height="${R * 2 + 4}" fill="${lens}" opacity=".85"/>`; break;
    case 'Maliwan':
      out += `<rect x="${x}" y="${y - 6 - R * 2}" width="${L}" height="${R * 2}" rx="${R}" fill="${c.fill}" ${s}/><ellipse cx="${x + L}" cy="${y - 6 - R}" rx="5" ry="${R}" fill="${lens}"/>`; break;
    case 'Torgue':
      out += `<rect x="${x - 4}" y="${y - 8 - R * 2.4}" width="${L + 8}" height="${R * 2.4}" rx="4" fill="${c.fill}" ${s}/><circle cx="${x + L + 4}" cy="${y - 8 - R * 1.2}" r="${R * 1.2}" fill="${lens}" ${s}/>`; break;
    case 'Bandit':
      out += `<rect x="${x}" y="${y - 6 - R * 2}" width="${L}" height="${R * 2}" fill="${METAL}" ${s}/><rect x="${x + L * 0.3}" y="${y - 8 - R * 2}" width="10" height="${R * 2 + 4}" fill="${c.second}"/><circle cx="${x + L}" cy="${y - 6 - R}" r="${R}" fill="${lens}" ${s}/>`; break;
    default:
      out += `<rect x="${x}" y="${y - 6 - R * 2}" width="${L}" height="${R * 2}" rx="${R * 0.6}" fill="${c.fill}" ${s}/>` +
        `<rect x="${x + L * 0.4}" y="${y - 8 - R * 2}" width="${L * 0.2}" height="${R * 2 + 4}" rx="3" fill="${c.second}" ${s} stroke-width="1"/>` +
        `<circle cx="${x + L}" cy="${y - 6 - R}" r="${R * 0.9}" fill="${lens}" ${s}/>`;
  }
  return out;
}

function magazine(m, x, y, kind, c) {
  const s = `stroke="${c.stroke}" stroke-width="2"`;
  if (kind === 'none') return '';
  if (m === 'Jakobs' && kind === 'short') return ''; // revolver cylinder drawn in body
  if (m === 'Vladof' && kind !== 'tube') return `<circle cx="${x + 14}" cy="${y + 22}" r="22" fill="${c.second}" ${s}/><circle cx="${x + 14}" cy="${y + 22}" r="9" fill="${c.fill}"/>`;
  if (kind === 'tube') return `<rect x="${x - 10}" y="${y - 4}" width="90" height="12" rx="6" fill="${METAL}" ${s}/><rect x="${x + 20}" y="${y - 6}" width="40" height="16" rx="4" fill="${c.second}" ${s}/>`;
  const len = { short: 34, mid: 50, long: 62 }[kind] * (m === 'Bandit' ? 1.8 : m === 'Tediore' ? 0.7 : 1);
  const curve = m === 'Dahl' || kind === 'long' ? 14 : 4;
  return `<path d="M${x} ${y}L${x + 24} ${y}L${x + 24 + curve} ${y + len}L${x + curve} ${y + len}Z" fill="${m === 'Tediore' ? c.second : METAL}" ${s}/>` +
    `<rect x="${x + curve * 0.6}" y="${y + len - 8}" width="26" height="8" fill="${c.fill}"/>`;
}

function accessory(name, x, y, len, t, c) {
  if (!name || name === 'None') return '';
  const leaf = shortName(name);
  const s = `stroke="${c.stroke}" stroke-width="1.6"`;
  if (/_None$/i.test(leaf)) return '';
  if (/Bayonet|Blade|Sword|Rapier/i.test(leaf)) return `<path d="M${x + len * 0.5} ${y + t + 2}L${x + len + 50} ${y + t + 8}L${x + len * 0.5} ${y + t + 16}Z" fill="#dfe6ea" ${s}/><rect x="${x + len * 0.45}" y="${y + t}" width="14" height="18" fill="${c.accent}"/>`;
  if (/Laser/i.test(leaf)) return `<rect x="${x + len * 0.35}" y="${y + t + 2}" width="38" height="12" rx="2" fill="${METAL_DARK}" ${s}/><circle cx="${x + len * 0.35 + 38}" cy="${y + t + 8}" r="3" fill="#ff2a2a"/><line x1="${x + len * 0.35 + 40}" y1="${y + t + 8}" x2="${x + len + 80}" y2="${y + t + 8}" stroke="#ff2a2a" stroke-width="1" opacity=".5"/>`;
  if (/Bipod/i.test(leaf)) return `<path d="M${x + len * 0.6} ${y + t}l-18 46M${x + len * 0.6} ${y + t}l14 46" stroke="${METAL}" stroke-width="5" stroke-linecap="round"/>`;
  if (/Grip|Foregrip|Stability|Handle/i.test(leaf)) return `<rect x="${x + len * 0.3}" y="${y + t}" width="16" height="38" rx="5" fill="${c.fill}" ${s}/>`;
  if (/Mount|Mag|Clip|Ammo/i.test(leaf)) return `<rect x="${x + len * 0.25}" y="${y + t + 2}" width="22" height="30" rx="3" fill="${METAL}" ${s}/><rect x="${x + len * 0.25 + 26}" y="${y + t + 2}" width="22" height="30" rx="3" fill="${METAL}" ${s}/>`;
  if (/Stock/i.test(leaf)) return '';
  // generic tactical module
  return `<rect x="${x + len * 0.3}" y="${y + t + 2}" width="30" height="14" rx="3" fill="${c.second}" ${s}/><rect x="${x + len * 0.3 + 4}" y="${y + t + 6}" width="8" height="6" fill="${c.accent}"/>`;
}

export function renderWeaponSVG(gd, item, opts = {}) {
  const P = item.parts;
  const cat = gd.weaponCategory(item);
  const spec = CAT[cat] || CAT.Pistol;
  const uid = `w${(hash(JSON.stringify(P)) % 1e8).toString(36)}`;
  const paint = paintFor(P.material, P.balance);
  const [main, second, accent] = paint.colors;
  const fillRef = `url(#${uid}m)`;
  const c = { fill: fillRef, second, accent, stroke: paint.bare ? '#2e3135' : '#141414' };
  const cPlain = { fill: main, second, accent, stroke: c.stroke };
  const el = elementOf(P.elemental);
  const mBody = manufacturerOf(P.body) || manufacturerOf(P.manufacturer) || manufacturerOf(P.balance);
  const fall = mBody;

  const bx = 200, by = 110, bw = spec.bw, bh = spec.bh;
  const barrelCat = categoryOfPart(P.barrel, cat);
  const bspec = CAT[barrelCat] || spec;
  const barrelLen = cat === 'RocketLauncher' && barrelCat === 'RocketLauncher' ? spec.barrel : bspec.barrel;
  const bt = cat === 'RocketLauncher' && barrelCat === 'RocketLauncher' ? spec.bt * 0.8 : bspec.bt;
  const barrelY = by + bh * 0.22;
  const stockCat = categoryOfPart(P.stock, cat);
  const stockLen = P.stock && P.stock !== 'None' ? (CAT[stockCat] || spec).stock || 80 : 0;
  const parts = [];

  // stock (behind)
  if (stockLen) parts.push(stock(manufacturerOf(P.stock) || fall, bx + 4, by + 6, stockLen, bh * 0.9, c));
  // barrel
  if (P.barrel && P.barrel !== 'None') {
    const bm = manufacturerOf(P.barrel) || fall;
    if (cat === 'RocketLauncher' && barrelCat === 'RocketLauncher') {
      parts.push(`<path d="M${bx + bw - 6} ${by + 4}L${bx + bw + barrelLen} ${by - 6}L${bx + bw + barrelLen} ${by + bh + 6}L${bx + bw - 6} ${by + bh - 4}Z" fill="${c.fill}" stroke="${c.stroke}" stroke-width="2"/>` +
        `<ellipse cx="${bx + bw + barrelLen}" cy="${by + bh / 2}" rx="8" ry="${bh / 2 + 6}" fill="${METAL_DARK}" stroke="${c.stroke}" stroke-width="2"/>` +
        (el ? `<ellipse cx="${bx + bw + barrelLen}" cy="${by + bh / 2}" rx="5" ry="${bh / 2}" fill="${ELEMENT_COLORS[el]}" filter="url(#glow)" opacity=".8"/>` : ''));
    } else {
      parts.push(barrel(bm, bx + bw - 4, barrelY, barrelLen, bt, c, el));
    }
  } else if (el) {
    parts.push(`<circle cx="${bx + bw + 6}" cy="${barrelY + 8}" r="8" fill="${ELEMENT_COLORS[el]}" filter="url(#glow)"/>`);
  }
  // magazine
  parts.push(magazine(mBody, bx + bw * 0.58, by + bh - 2, spec.mag, c));
  // grip
  if (P.grip && P.grip !== 'None') parts.push(grip(manufacturerOf(P.grip) || fall, bx + (cat === 'RocketLauncher' ? bw * 0.45 : bw * 0.12), by + bh - 4, cat === 'Pistol' ? 64 : 56, c));
  // body
  if (P.body && P.body !== 'None') parts.push(body(mBody, bx, by, bw, bh, c, cat));
  else parts.push(`<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="4" fill="none" stroke="#888" stroke-dasharray="6 4" stroke-width="2"/>`);
  // sight
  parts.push(sight(P.sight, manufacturerOf(P.sight) || fall, bx + bw * 0.22, by - (mBody === 'Torgue' ? 6 : 0), categoryOfPart(P.sight, cat), cPlain));
  // accessories
  parts.push(accessory(P.accessory1, bx + bw - 4, barrelY, barrelLen, bt, c));
  parts.push(accessory(P.accessory2, bx + bw - 4, barrelY + 10, barrelLen * 0.8, bt, c));
  // elemental tint stripe on body
  if (el) parts.push(`<rect x="${bx + 8}" y="${by + bh - 10}" width="${bw * 0.5}" height="4" rx="2" fill="${ELEMENT_COLORS[el]}" filter="url(#glow)"/>`);

  const minX = bx - (stockLen || 0) - 30;
  const maxX = bx + bw + barrelLen + 70 + (/Bayonet|Laser/i.test(`${P.accessory1}${P.accessory2}`) ? 40 : 0);
  const rarity = paint.rarity || rarityOf(P.balance, P.material);
  const W = maxX - minX, H = 300;
  const vb = `${minX} 0 ${W} ${H}`;
  const label = opts.label !== false;
  const title = esc(gd.displayName(item));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${opts.width || W}" role="img" aria-label="${title}">
<defs>${patternDefs(`${uid}m`, paint.colors)}
<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<radialGradient id="${uid}r"><stop offset="0" stop-color="${rarity.color}" stop-opacity=".55"/><stop offset="1" stop-color="${rarity.color}" stop-opacity="0"/></radialGradient></defs>
<rect x="${minX}" y="0" width="${W}" height="${H}" fill="#14161a"/>
<ellipse cx="${(minX + maxX) / 2}" cy="${by + bh / 2 + 20}" rx="${W * 0.48}" ry="105" fill="url(#${uid}r)"/>
${parts.join('\n')}
${label ? `<text x="${minX + 14}" y="28" font-family="Arial,Helvetica,sans-serif" font-size="20" font-weight="700" fill="${rarity.color}">${title}</text>
<text x="${minX + 14}" y="50" font-family="Arial,Helvetica,sans-serif" font-size="13" fill="#aab">Lv ${item.gameStage} · ${esc(rarity.label)} · ${esc(mBody || '?')} ${esc(cat)}${el ? ` · ${el}` : ''}</text>
<text x="${minX + 14}" y="${H - 14}" font-family="Arial,Helvetica,sans-serif" font-size="12" fill="${paint.bare ? '#f5c46b' : '#778'}">${paint.bare ? 'No material: bare, unpainted' : `Skin: ${esc(paint.label)}`}</text>` : ''}
</svg>`;
}

const ITEM_ICONS = {
  Shield: (c) => `<path d="M150 40L230 70L222 160Q200 220 150 250Q100 220 78 160L70 70Z" fill="${c.main}" stroke="#111" stroke-width="4"/><path d="M150 70L200 90L195 155Q182 190 150 212Q118 190 105 155L100 90Z" fill="${c.second}" opacity=".7"/>`,
  GrenadeMod: (c) => `<ellipse cx="150" cy="160" rx="62" ry="78" fill="${c.main}" stroke="#111" stroke-width="4"/><rect x="128" y="60" width="44" height="30" rx="6" fill="${c.second}" stroke="#111" stroke-width="3"/><path d="M172 70q40-10 40 30" stroke="#ccc" stroke-width="6" fill="none"/><path d="M95 140h110M92 180h116" stroke="${c.accent}" stroke-width="6"/>`,
  Artifact: (c) => `<path d="M150 40L215 145L150 250L85 145Z" fill="${c.main}" stroke="#111" stroke-width="4"/><path d="M150 75L190 145L150 215L110 145Z" fill="${c.second}" opacity=".75"/><circle cx="150" cy="145" r="14" fill="${c.accent}"/>`,
  ClassMod: (c) => `<rect x="80" y="70" width="140" height="160" rx="14" fill="${c.main}" stroke="#111" stroke-width="4"/><rect x="100" y="95" width="100" height="60" rx="6" fill="${c.second}"/><path d="M100 180h100M100 200h70" stroke="${c.accent}" stroke-width="8" stroke-linecap="round"/>`,
};

export function renderItemSVG(gd, item) {
  const kind = gd.itemKind(item);
  const rarity = rarityOf(item.parts.balance, item.parts.material);
  const paint = paintFor(item.parts.material, item.parts.balance);
  const icon = ITEM_ICONS[kind === 'CrossDLCClassMod' ? 'ClassMod' : kind] || ITEM_ICONS.ClassMod;
  const el = Object.values(item.parts).map(elementOf).find(Boolean);
  const colors = { main: el ? ELEMENT_COLORS[el] : paint.colors[0], second: paint.colors[1], accent: rarity.color };
  const title = esc(gd.displayName(item));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" role="img" aria-label="${title}">
<defs><radialGradient id="ir"><stop offset="0" stop-color="${rarity.color}" stop-opacity=".5"/><stop offset="1" stop-color="${rarity.color}" stop-opacity="0"/></radialGradient></defs>
<rect width="300" height="300" fill="#14161a"/><circle cx="150" cy="150" r="140" fill="url(#ir)"/>${icon(colors)}
<text x="150" y="285" text-anchor="middle" font-family="Arial" font-size="14" fill="${rarity.color}">${esc(kind)} · Lv ${item.gameStage}</text></svg>`;
}
