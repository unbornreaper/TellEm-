// Lookups over Gibbed's datamined BL2 tables.
import { AssetLibrary, WEAPON_SLOTS, ITEM_SLOTS } from './items.js';

const W_SLOT_KEYS = ['body', 'grip', 'barrel', 'sight', 'stock', 'elemental', 'accessory1', 'accessory2', 'material'];
const I_SLOT_KEYS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'material'];

export const SLOT_LABELS = {
  body: 'Body', grip: 'Grip', barrel: 'Barrel', sight: 'Sight', stock: 'Stock', elemental: 'Element',
  accessory1: 'Accessory', accessory2: 'Accessory 2', material: 'Material (skin)', prefix: 'Name prefix', title: 'Name title',
  alpha: 'Alpha', beta: 'Beta', gamma: 'Gamma', delta: 'Delta', epsilon: 'Epsilon', zeta: 'Zeta', eta: 'Eta', theta: 'Theta',
};

export const RARITY = [
  { key: 'common', label: 'Common', color: '#e8e8e8' },
  { key: 'uncommon', label: 'Uncommon', color: '#3dd23d' },
  { key: 'rare', label: 'Rare', color: '#3f8cff' },
  { key: 'epic', label: 'Epic', color: '#b04cff' },
  { key: 'legendary', label: 'Legendary', color: '#ff9a1f' },
  { key: 'seraph', label: 'Seraph', color: '#ff5fc8' },
  { key: 'pearl', label: 'Pearlescent', color: '#3ff0ff' },
  { key: 'effervescent', label: 'Effervescent', color: '#ff4d6d' },
];

export function rarityOf(balance = '', material = '') {
  const s = `${balance} ${material}`;
  if (/Pearl|_6_|_7_/i.test(balance)) return RARITY[6];
  if (/Seraph/i.test(s)) return RARITY[5];
  if (/Legendary|_5_|Unique|Etech/i.test(balance)) return /Etech/i.test(balance) ? RARITY[3] : RARITY[4];
  if (/_4_|VeryRare/i.test(balance)) return RARITY[3];
  if (/_3_|Rare/i.test(balance)) return RARITY[2];
  if (/_2_|Uncommon/i.test(balance)) return RARITY[1];
  return RARITY[0];
}

export const shortName = (n) => (n && n !== 'None' ? n.split('.').pop() : 'None');

export class GameData {
  constructor(json) {
    this.raw = json;
    this.lib = new AssetLibrary(json.alm);
    this.weaponPartsByType = {};
    for (const [name, v] of Object.entries(json.weaponParts)) {
      (this.weaponPartsByType[v.type] ||= []).push(name);
    }
    this.itemPartsByType = {};
    for (const [name, v] of Object.entries(json.itemParts)) {
      (this.itemPartsByType[v.type] ||= []).push(name);
    }
    this._wcache = new Map();
    this._icache = new Map();
  }

  // Resolve a weapon balance through its base chain (Gibbed's WeaponBalanceDefinition.Create).
  weaponBalance(name) {
    if (this._wcache.has(name)) return this._wcache.get(name);
    const B = this.raw.weaponBalance, PL = this.raw.weaponBalancePartLists;
    const chain = [];
    for (let cur = name, guard = 0; cur && B[cur] && guard < 32; cur = B[cur].base, guard++) chain.unshift(B[cur]);
    const res = { weaponType: null, manufacturers: [], parts: Object.fromEntries(W_SLOT_KEYS.map((k) => [k, []])) };
    for (const b of chain) {
      if (b.weapon_type) res.weaponType = b.weapon_type;
      if (b.manufacturers) res.manufacturers = [...b.manufacturers];
      const pl = b.parts ? PL[b.parts] : null;
      if (!pl) continue;
      if (pl.weapon_type) res.weaponType = pl.weapon_type;
      for (const k of W_SLOT_KEYS) {
        const src = pl[k];
        if (pl.mode === 'Additive') { if (src) res.parts[k].push(...src.filter(Boolean)); }
        else if (pl.mode === 'Selective') { if (src) res.parts[k] = src.filter(Boolean); }
        else res.parts[k] = (src || []).filter(Boolean);
      }
    }
    this._wcache.set(name, res);
    return res;
  }

  itemBalance(name) {
    if (this._icache.has(name)) return this._icache.get(name);
    const B = this.raw.itemBalance, PL = this.raw.itemBalancePartLists;
    const chain = [];
    for (let cur = name, guard = 0; cur && B[cur] && guard < 32; cur = B[cur].base, guard++) chain.unshift(B[cur]);
    const res = { items: [], manufacturers: [], parts: Object.fromEntries(I_SLOT_KEYS.map((k) => [k, []])) };
    for (const b of chain) {
      if (b.item) res.items = [b.item];
      if (b.items) res.items = [...b.items];
      if (b.manufacturers) res.manufacturers = [...b.manufacturers];
      const pl = b.parts ? PL[b.parts] : null;
      if (!pl) continue;
      if (pl.item) res.items = [pl.item];
      for (const k of I_SLOT_KEYS) {
        const src = pl[k];
        if (pl.mode === 'Additive') { if (src) res.parts[k].push(...src.filter(Boolean)); }
        else if (pl.mode === 'Selective') { if (src) res.parts[k] = src.filter(Boolean); }
        else res.parts[k] = (src || []).filter(Boolean);
      }
    }
    // Fall back to the item definition's own part lists
    const def = this.raw.items[res.items[0]];
    if (def) {
      for (const k of I_SLOT_KEYS) {
        if (!res.parts[k].length && def[`${k}_parts`]) res.parts[k] = [...(this.raw.itemPartLists[def[`${k}_parts`]] || [])];
      }
    }
    this._icache.set(name, res);
    return res;
  }

  weaponTypeInfo(typeName) { return this.raw.weaponTypes[typeName] || null; }

  // Category of a weapon type: Pistol, AssaultRifle, SMG, Shotgun, SniperRifle, RocketLauncher
  weaponCategory(item) {
    const t = this.weaponTypeInfo(item.parts.type);
    if (t) return t.type;
    const s = `${item.parts.type} ${item.parts.balance}`;
    if (/Sniper/i.test(s)) return 'SniperRifle';
    if (/Shotgun|SG_/i.test(s)) return 'Shotgun';
    if (/SMG/i.test(s)) return 'SMG';
    if (/Launcher|RL_/i.test(s)) return 'RocketLauncher';
    if (/Assault|AR_/i.test(s)) return 'AssaultRifle';
    return 'Pistol';
  }

  displayName(item) {
    const np = item.isWeapon ? this.raw.weaponNameParts : this.raw.itemNameParts;
    const title = np[item.parts.title]?.name;
    const prefix = np[item.parts.prefix]?.name;
    if (title) return prefix ? `${prefix} ${title}` : title;
    if (!item.isWeapon) {
      const def = this.raw.items[item.parts.type];
      if (def?.name) return prefix ? `${prefix} ${def.name}` : def.name;
    } else {
      const t = this.weaponTypeInfo(item.parts.type);
      if (t?.name) return t.name;
    }
    return shortName(item.parts.balance).replace(/_/g, ' ');
  }

  itemKind(item) {
    if (item.isWeapon) return this.weaponCategory(item);
    return this.raw.items[item.parts.type]?.type || 'Item';
  }

  // Choices for one slot: parts the balance normally allows, plus every other part of that kind.
  slotChoices(item, slot) {
    if (slot === 'prefix' || slot === 'title') {
      const np = item.isWeapon ? this.raw.weaponNameParts : this.raw.itemNameParts;
      const all = Object.keys(np);
      const pkg = (item.parts.balance || '').split('.')[0];
      const normal = all.filter((n) => n.split('.')[0] === pkg || n.startsWith((item.parts[slot] || '#').split('.').slice(0, 3).join('.')));
      return { normal, all };
    }
    if (item.isWeapon) {
      const bal = this.weaponBalance(item.parts.balance);
      const typeName = { body: 'Body', grip: 'Grip', barrel: 'Barrel', sight: 'Sight', stock: 'Stock', elemental: 'Elemental', accessory1: 'Accessory1', accessory2: 'Accessory2', material: 'Material' }[slot];
      const all = [...(this.weaponPartsByType[typeName] || [])];
      if (slot === 'accessory2' || slot === 'accessory1') all.push(...(this.weaponPartsByType[slot === 'accessory2' ? 'Accessory1' : 'Accessory2'] || []));
      return { normal: bal.parts[slot] || [], all };
    }
    const bal = this.itemBalance(item.parts.balance);
    const typeName = slot[0].toUpperCase() + slot.slice(1);
    return { normal: bal.parts[slot] || [], all: this.itemPartsByType[typeName] || [] };
  }

  balancesForCategory(isWeapon) {
    return Object.keys(isWeapon ? this.raw.weaponBalance : this.raw.itemBalance);
  }
}

export { WEAPON_SLOTS, ITEM_SLOTS };
