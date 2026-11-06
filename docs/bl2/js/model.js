// Friendly view over the WillowTwoPlayerSaveGame protobuf.
import { Message, readPackedInts, writePackedInts } from './protobuf.js';
import { decodeSerial, encodeSerial, randomUniqueId } from './items.js';

export const ROOT_FIELDS = {
  1: 'PlayerClass', 2: 'ExpLevel', 3: 'ExpPoints', 4: 'GeneralSkillPoints', 5: 'SpecialistSkillPoints',
  6: 'CurrencyOnHand', 7: 'PlaythroughsCompleted', 8: 'SkillData', 9: 'Unknown9', 10: 'Unknown10',
  11: 'ResourceData (ammo)', 12: 'ItemData', 13: 'InventorySlotData', 14: 'WeaponData', 15: 'StatsData',
  16: 'VisitedTeleporters', 17: 'LastVisitedTeleporter', 18: 'MissionPlaythroughs', 19: 'UIPreferences',
  20: 'SaveGameId', 21: 'PlotMissionNumber', 22: 'Unknown22', 23: 'UsedMarketingCodes',
  24: 'MarketingCodesNeedingNotification', 25: 'TotalPlayTime', 26: 'LastSavedDate', 27: 'DLCExpansionData',
  28: 'Unknown28', 29: 'RegionGameStages', 30: 'WorldDiscoveryList', 31: 'IsBadassModeSaveGame',
  32: 'WeaponMementos', 33: 'ItemMementos', 34: 'SaveGuid', 35: 'AppliedCustomizations',
  36: 'BlackMarketUpgrades', 37: 'ActiveMissionNumber', 38: 'ChallengeList', 39: 'LevelChallengeUnlocks',
  40: 'OneOffLevelChallengeCompletion', 41: 'BankSlots', 42: 'NumChallengePrestiges', 43: 'LockoutList',
  44: 'IsDLCPlayerClass', 45: 'DLCPlayerClassPackageId', 46: 'FullyExploredAreas', 47: 'GoldenKeys',
  48: 'NumGoldenKeysNotified', 49: 'LastPlaythroughNumber', 50: 'ShowNewPlaythroughNotification',
  51: 'ReceivedDefaultWeapon', 52: 'QueuedTrainingMessages', 53: 'PackedItemData', 54: 'PackedWeaponData',
  55: 'AwesomeSkillDisabled', 56: 'MaxBankSlots', 57: 'ChosenVehicleCustomizations', 58: 'VehicleSteeringMode',
};

export const CURRENCIES = ['Money', 'Eridium', 'Seraph Crystals', 'Reserved', 'Torgue Tokens'];
export const SDU_NAMES = ['Assault Rifle Ammo', 'Pistol Ammo', 'Launcher Ammo', 'Shotgun Ammo', 'SMG Ammo', 'Sniper Ammo', 'Grenades', 'Backpack', 'Bank'];
export const MAX_LEVEL = 80;

export function xpForLevel(level) {
  if (level <= 1) return 0;
  const f = (l) => Math.floor((Math.pow(l, 2.8) + 7.33) * 60);
  return f(level) - f(1);
}

const HACK_SERIAL = Uint8Array.from([0x07, 0, 0, 0, 0, 0x39, 0x2a, 0xff, ...new Array(32).fill(0)]);

export class SaveModel {
  constructor(save, gd) {
    this.save = save;
    this.root = save.root;
    this.gd = gd;
    this._readExpansion();
    this.inventory = this._readInventory();
  }

  // ---------- Gearbox's "expansion" data hidden in fake items ----------
  _hacks() {
    return this.root.all(53).map((f) => ({ f, m: Message.parse(f.v) })).filter((x) => x.m.getInt(2) < 0);
  }
  _readExpansion() {
    const exp = { eridiumExtra: 0, ptExtra: 0, lastPtExtra: 0, op: null };
    for (const { m } of this._hacks()) {
      const d = -m.getInt(2);
      const id = d & 0xff, v1 = (d >> 8) & 0x7fffff, v2 = m.getInt(4);
      if (id === 1) exp.eridiumExtra += v1;
      else if (id === 2) { exp.lastPtExtra += v1; exp.ptExtra += v2 & 0xff; }
      else if (id === 4) exp.op = v1;
    }
    const cur = readPackedInts(this.root, 6);
    this.virt = {
      eridium: (cur[1] || 0) + exp.eridiumExtra,
      playthroughs: this.root.getInt(7) + exp.ptExtra,
      lastPlaythrough: this.root.getInt(49) + exp.lastPtExtra,
      op: exp.op,
    };
    this._virtOrig = { ...this.virt };
  }
  _writeExpansion() {
    const v = this.virt, o = this._virtOrig;
    if (v.eridium === o.eridium && v.playthroughs === o.playthroughs && v.lastPlaythrough === o.lastPlaythrough && v.op === o.op) return;
    // drop old hacks with ids 1, 2 and 4, keep anything else untouched
    const drop = new Set(this._hacks().filter(({ m }) => [1, 2, 4].includes((-m.getInt(2)) & 0xff)).map((x) => x.f));
    this.root.fields = this.root.fields.filter((f) => !drop.has(f));
    const add = (id, v1, v2 = 0) => {
      const m = new Message();
      m.setBytes(1, HACK_SERIAL.slice());
      m.setInt(2, -(id | (Math.max(0, Math.min(v1, 0x7fffff)) << 8)));
      m.setInt(3, 0);
      m.setInt(4, v2);
      this._insertList(53, m);
    };
    const cur = readPackedInts(this.root, 6);
    while (cur.length < 2) cur.push(0);
    if (v.eridium > 99) { add(1, v.eridium - 99); cur[1] = 99; } else cur[1] = Math.max(0, v.eridium);
    writePackedInts(this.root, 6, cur);
    let pt = v.playthroughs, last = v.lastPlaythrough;
    if (pt > 1 && last >= 1 && last <= 0x800000) { add(2, last - 1, (pt - 1) & 0xff); pt = 1; last = 1; }
    this.root.setInt(7, pt);
    this.root.setInt(49, last);
    if (v.op !== null && v.op !== undefined) add(4, v.op);
    this._virtOrig = { ...v };
  }

  _insertList(no, msg) {
    const entry = { no, wt: 2, v: msg.serialize() };
    let idx = -1;
    this.root.fields.forEach((f, i) => { if (f.no === no) idx = i; });
    if (idx < 0) { idx = this.root.fields.findIndex((f) => f.no > no); if (idx < 0) idx = this.root.fields.length; this.root.fields.splice(idx, 0, entry); }
    else this.root.fields.splice(idx + 1, 0, entry);
    return entry;
  }

  // ---------- character ----------
  get playerClass() { return this.root.getString(1); }
  get className() { return this.gd.raw.playerClasses[this.playerClass]?.name || this.playerClass.split('.').pop(); }
  get level() { return this.root.getInt(2); }
  set level(l) {
    l = Math.max(1, Math.min(MAX_LEVEL, l | 0));
    this.root.setInt(2, l);
    const xp = this.xp, lo = xpForLevel(l), hi = xpForLevel(l + 1);
    if (xp < lo || (l < MAX_LEVEL && xp >= hi)) this.xp = lo;
  }
  get xp() { return this.root.getInt(3); }
  set xp(v) { this.root.setInt(3, Math.max(0, v | 0)); }
  get skillPoints() { return this.root.getInt(4); }
  set skillPoints(v) { this.root.setInt(4, Math.max(0, v | 0)); }
  get saveGameId() { return this.root.getInt(20); }
  set saveGameId(v) { this.root.setInt(20, v | 0); }

  get name() { return this.root.getMessage(19)?.getString(1) || ''; }
  set name(s) {
    const m = this.root.getMessage(19) || new Message();
    m.setString(1, s);
    this.root.setMessage(19, m);
  }

  currency(i) { if (i === 1) return this.virt.eridium; return readPackedInts(this.root, 6)[i] || 0; }
  setCurrency(i, v) {
    v = Math.max(0, Math.min(0x7fffffff, Math.trunc(v)));
    if (i === 1) { this.virt.eridium = v; return; }
    const cur = readPackedInts(this.root, 6);
    while (cur.length <= i) cur.push(0);
    cur[i] = v;
    writePackedInts(this.root, 6, cur);
  }

  get playthroughs() { return this.virt.playthroughs; }
  set playthroughs(v) {
    v = Math.max(0, Math.min(2, v | 0));
    this.virt.playthroughs = v;
    if (this.virt.lastPlaythrough > v) this.virt.lastPlaythrough = v;
  }
  get opLevel() { return this.virt.op ?? 0; }
  set opLevel(v) { v = Math.max(0, Math.min(10, v | 0)); this.virt.op = v; if (v > 0 && this.virt.playthroughs < 2) this.playthroughs = 2; }

  _slots() { return this.root.getMessage(13) || new Message(); }
  get backpack() { return this._slots().getInt(1); }
  set backpack(v) { const m = this._slots(); m.setInt(1, v | 0); this.root.setMessage(13, m); }
  get weaponSlots() { return this._slots().getInt(2); }
  set weaponSlots(v) { const m = this._slots(); m.setInt(2, Math.max(2, Math.min(4, v | 0))); this.root.setMessage(13, m); }
  get bankSlots() { return this.root.getInt(56); }
  set bankSlots(v) { this.root.setInt(56, v | 0); }

  get sdus() { return readPackedInts(this.root, 36); }
  setSdu(i, v) { const a = this.sdus; while (a.length <= i) a.push(0); a[i] = Math.max(0, v | 0); writePackedInts(this.root, 36, a); }

  // ---------- skills & ammo ----------
  get skills() {
    return this.root.all(8).map((f) => { const m = Message.parse(f.v); return { f, m, name: m.getString(1), grade: m.getInt(2) }; });
  }
  setSkillGrade(skill, g) { skill.m.setInt(2, Math.max(0, g | 0)); skill.f.v = skill.m.serialize(); skill.grade = g; }

  get ammo() {
    return this.root.all(11).map((f) => { const m = Message.parse(f.v); return { f, m, resource: m.getString(1), pool: m.getString(2), amount: m.getFloat(3), level: m.getInt(4) }; });
  }
  setAmmo(a, amount) { a.m.setFloat(3, amount); a.f.v = a.m.serialize(); a.amount = amount; }

  // ---------- inventory ----------
  _readInventory() {
    const out = [];
    const take = (no, where) => {
      for (const f of this.root.all(no)) {
        const m = Message.parse(f.v);
        if (no === 53 && m.getInt(2) < 0) continue; // expansion data, not a real item
        const serial = m.getBytes(1);
        let item = null, error = null;
        try { item = decodeSerial(this.gd.lib, serial); if (item.error) error = item.error; } catch (e) { error = e.message; }
        out.push({ f, m, where, serial, item, error, id: out.length });
      }
    };
    take(54, 'weapon');
    take(53, 'item');
    take(41, 'bank');
    return out;
  }

  get weapons() { return this.inventory.filter((e) => e.where === 'weapon'); }
  get items() { return this.inventory.filter((e) => e.where === 'item'); }
  get bank() { return this.inventory.filter((e) => e.where === 'bank'); }

  updateEntry(entry, item) {
    const serial = encodeSerial(this.gd.lib, item);
    entry.item = decodeSerial(this.gd.lib, serial);
    entry.serial = serial;
    entry.error = null;
    entry.m.setBytes(1, serial);
    entry.f.v = entry.m.serialize();
  }

  removeEntry(entry) {
    this.root.fields = this.root.fields.filter((f) => f !== entry.f);
    this.inventory = this.inventory.filter((e) => e !== entry);
  }

  // where: 'weapon' | 'item' | 'bank'. serial: Uint8Array
  addSerial(serial, where) {
    const item = decodeSerial(this.gd.lib, serial);
    if (where !== 'bank') where = item.isWeapon ? 'weapon' : 'item';
    item.uniqueId = randomUniqueId();
    item.seedBytes = null;
    const fresh = encodeSerial(this.gd.lib, item);
    const m = new Message();
    m.setBytes(1, fresh);
    let no;
    if (where === 'bank') no = 41;
    else if (where === 'weapon') { no = 54; m.setInt(2, 0); m.setInt(3, 1); }
    else { no = 53; m.setInt(2, 1); m.setInt(3, 0); m.setInt(4, 1); }
    const f = this._insertList(no, m);
    const entry = { f, m, where, serial: fresh, item: decodeSerial(this.gd.lib, fresh), error: null, id: Date.now() + Math.random() };
    this.inventory.push(entry);
    return entry;
  }

  async finalize() { this._writeExpansion(); }
}
