import { loadSave, writeSave } from './savefile.js';
import { GameData, SLOT_LABELS, shortName, rarityOf } from './gamedata.js';
import { SaveModel, CURRENCIES, SDU_NAMES, MAX_LEVEL, xpForLevel, ROOT_FIELDS } from './model.js';
import { WEAPON_SLOTS, ITEM_SLOTS, encodeSerial, decodeSerial, toCode, fromCode, randomUniqueId } from './items.js';
import { renderWeaponSVG, renderItemSVG, manufacturerOf, categoryOfPart } from './preview.js';
import { Message } from './protobuf.js';

const $ = (s, el = document) => el.querySelector(s);
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let gd = null;
let model = null;
let fileName = 'SaveGame.sav';
let dirty = false;

function status(msg, kind = '') {
  const el = $('#status');
  el.hidden = !msg;
  el.className = `status ${kind}`;
  el.textContent = msg || '';
}

function markDirty() { dirty = true; $('#download').disabled = !model; }

async function init() {
  status('Loading game data…');
  try {
    const res = await fetch('data/gamedata.json');
    gd = new GameData(await res.json());
    status('');
  } catch (e) {
    status('Could not load game data (data/gamedata.json). Open this page from a web server such as GitHub Pages, not as a local file.', 'err');
    return;
  }
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('active', x === b));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${b.dataset.tab}`));
    if (b.dataset.tab === 'raw') renderRaw();
  });
  $('#file').addEventListener('change', onOpen);
  $('#download').addEventListener('click', onDownload);
  window.addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  setupEditor();
  renderAll();
}

async function onOpen(e) {
  const f = e.target.files[0];
  if (!f) return;
  fileName = f.name;
  status(`Reading ${f.name}…`);
  try {
    const save = await loadSave(new Uint8Array(await f.arrayBuffer()));
    model = new SaveModel(save, gd);
    dirty = false;
    $('#download').disabled = false;
    const i = save.info;
    const fmt = `${i.compression === 'none' ? 'uncompressed' : i.compression.toUpperCase()}, ${i.littleEndian ? 'little' : 'big'}-endian`;
    status(`Loaded ${model.name || 'character'} (${model.className}, level ${model.level}). Format: ${fmt}.${i.warnings.length ? ' Warning: ' + i.warnings.join(' ') : ''}`, i.warnings.length ? 'err' : 'ok');
    $('#help').open = false;
    renderAll();
  } catch (err) {
    console.error(err);
    status(`Could not open this file: ${err.message}`, 'err');
  }
  e.target.value = '';
}

async function onDownload() {
  if (!model) return;
  try {
    await model.finalize();
    const bytes = await writeSave(model.save);
    // sanity check: the file we produce must load again
    await loadSave(bytes);
    downloadBlob(new Blob([bytes], { type: 'application/octet-stream' }), fileName);
    dirty = false;
    status(`Saved as ${fileName}. Copy it back to where the original came from, then re-encrypt it with your save tool. Keep your backup!`, 'ok');
  } catch (err) {
    console.error(err);
    status(`Could not build the save: ${err.message}`, 'err');
  }
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function renderAll() {
  renderCharacter();
  renderInventory('weapons');
  renderInventory('items');
  renderInventory('bank');
  renderSkills();
  if ($('#tab-raw').classList.contains('active')) renderRaw();
}

const needSave = (what) => `<div class="empty">Open a save to edit ${what}.</div>`;

// ---------------- Character ----------------
function numField(label, value, onChange, attrs = '') {
  const el = h(`<div class="field"><label>${esc(label)}</label><input type="number" inputmode="numeric" value="${value}" ${attrs}></div>`);
  $('input', el).addEventListener('change', (e) => { onChange(Number(e.target.value)); markDirty(); renderCharacter(); });
  return el;
}

function renderCharacter() {
  const root = $('#tab-character');
  root.innerHTML = '';
  if (!model) { root.innerHTML = needSave('your character'); return; }
  const m = model;
  const c1 = h(`<div class="card"><h3>${esc(m.name || 'Character')} <span class="badge">${esc(m.className)}</span></h3><div class="grid"></div>
    <div class="row wrap"><button class="btn small" id="max-all">Max money / Eridium / slots</button><button class="btn small" id="lvl72">Level 72 + OP 10 + UVHM</button></div></div>`);
  const g = $('.grid', c1);
  const name = h(`<div class="field"><label>Name</label><input type="text" maxlength="40" value="${esc(m.name)}"></div>`);
  $('input', name).addEventListener('change', (e) => { m.name = e.target.value; markDirty(); });
  g.append(name);
  g.append(numField(`Level (1-${MAX_LEVEL})`, m.level, (v) => { m.level = v; }, `min="1" max="${MAX_LEVEL}"`));
  g.append(numField('Experience', m.xp, (v) => { m.xp = v; }));
  g.append(numField('Unspent skill points', m.skillPoints, (v) => { m.skillPoints = v; }));
  const pt = h(`<div class="field"><label>Modes unlocked</label><select>
    <option value="0">Normal only</option><option value="1">True Vault Hunter Mode</option><option value="2">Ultimate Vault Hunter Mode</option></select></div>`);
  $('select', pt).value = String(Math.min(2, m.playthroughs));
  $('select', pt).addEventListener('change', (e) => { m.playthroughs = +e.target.value; m.virt.lastPlaythrough = Math.max(m.virt.lastPlaythrough, 0); markDirty(); renderCharacter(); });
  g.append(pt);
  g.append(numField('Overpower level (0-10)', m.opLevel, (v) => { m.opLevel = v; }, 'min="0" max="10"'));
  g.append(numField('Save game ID', m.saveGameId, (v) => { m.saveGameId = v; }));
  root.append(c1);

  const c2 = h('<div class="card"><h3>Currency</h3><div class="grid"></div><p class="muted">Money caps at 99,999,999 in game. Eridium above 500 may be cut back by the game.</p></div>');
  CURRENCIES.forEach((label, i) => { if (label !== 'Reserved') $('.grid', c2).append(numField(label, m.currency(i), (v) => m.setCurrency(i, v), 'min="0"')); });
  root.append(c2);

  const c3 = h('<div class="card"><h3>Inventory space &amp; SDUs</h3><div class="grid"></div></div>');
  const g3 = $('.grid', c3);
  g3.append(numField('Backpack slots', m.backpack, (v) => { m.backpack = v; }, 'min="12" max="39"'));
  g3.append(numField('Weapon slots (2-4)', m.weaponSlots, (v) => { m.weaponSlots = v; }, 'min="2" max="4"'));
  g3.append(numField('Bank slots', m.bankSlots, (v) => { m.bankSlots = v; }));
  const sdus = m.sdus;
  SDU_NAMES.forEach((label, i) => g3.append(numField(`SDU: ${label}`, sdus[i] || 0, (v) => m.setSdu(i, v), 'min="0" max="13"')));
  root.append(c3);

  $('#max-all', c1).addEventListener('click', () => {
    m.setCurrency(0, 99999999); m.setCurrency(1, 500); m.setCurrency(2, 999); m.setCurrency(4, 999);
    m.backpack = 39; m.weaponSlots = 4; m.bankSlots = Math.max(m.bankSlots, 24);
    markDirty(); renderCharacter(); status('Maxed currency and inventory space.', 'ok');
  });
  $('#lvl72', c1).addEventListener('click', () => {
    m.level = 72; m.playthroughs = 2; m.opLevel = 10; markDirty(); renderCharacter();
    status('Set level 72, UVHM unlocked and OP 10 (needs the matching DLC on your console).', 'ok');
  });
}

// ---------------- Inventory lists ----------------
function itemSVG(item) {
  try { return item.isWeapon ? renderWeaponSVG(gd, item, { width: 600 }) : renderItemSVG(gd, item); }
  catch (e) { console.error(e); return '<svg viewBox="0 0 10 4"></svg>'; }
}

function renderInventory(kind) {
  const root = $(`#tab-${kind}`);
  root.innerHTML = '';
  const tools = h(`<div class="card"><div class="row wrap">
    ${kind !== 'bank' ? `<button class="btn" data-act="build">Build a ${kind === 'weapons' ? 'weapon' : 'item'}</button>` : ''}
    <button class="btn" data-act="code">Add from BL2 code</button>
    ${model ? `<button class="btn small" data-act="level">Set all to level…</button>` : ''}
  </div></div>`);
  tools.addEventListener('click', (e) => {
    const act = e.target.closest('button')?.dataset.act;
    if (act === 'build') openBuilder(kind === 'weapons');
    if (act === 'code') addFromCode(kind);
    if (act === 'level') setAllLevels(kind);
  });
  root.append(tools);
  if (!model) { root.append(h(needSave(kind === 'bank' ? 'your bank' : `your ${kind}`))); return; }
  const list = model[kind];
  if (!list.length) { root.append(h(`<div class="empty">Nothing here.</div>`)); return; }
  const grid = h('<div class="inv"></div>');
  for (const entry of list) {
    const it = entry.item;
    const btn = h(`<button class="inv-item"></button>`);
    if (!it || entry.error) {
      btn.innerHTML = `<div class="meta"><div class="name">Unreadable item</div><div class="sub">${esc(entry.error || '')} · kept as-is</div></div>`;
    } else {
      const r = rarityOf(it.parts.balance, it.parts.material);
      const eq = entry.where === 'weapon' && entry.m.getInt(2) ? '<span class="badge">equipped</span>' : (entry.where === 'item' && entry.m.getInt(3) ? '<span class="badge">equipped</span>' : '');
      btn.innerHTML = `<div class="thumb">${itemSVG(it)}</div><div class="meta"><div class="name" style="color:${r.color}">${esc(gd.displayName(it))}${eq}</div>
        <div class="sub">Lv ${it.gameStage} · ${esc(gd.itemKind(it))} · ${esc(shortName(it.parts.manufacturer))}</div></div>`;
      btn.addEventListener('click', () => openEditor(entry));
    }
    grid.append(btn);
  }
  root.append(grid);
}

function setAllLevels(kind) {
  const v = Number(prompt('Level for every item in this list (1-80):', String(model.level)));
  if (!v || v < 1 || v > 80) return;
  let n = 0;
  for (const e of model[kind]) {
    if (!e.item || e.error) continue;
    try { model.updateEntry(e, { ...e.item, gameStage: v, gradeIndex: v }); n++; } catch (err) { console.warn(err); }
  }
  markDirty(); renderInventory(kind); status(`Set ${n} items to level ${v}.`, 'ok');
}

function addFromCode(kind) {
  const code = prompt('Paste a BL2(...) code:');
  if (!code) return;
  try {
    const serial = fromCode(code);
    const item = decodeSerial(gd.lib, serial);
    if (item.error) throw new Error(item.error);
    if (!model) { openEditor({ item, where: item.isWeapon ? 'weapon' : 'item', standalone: true }); return; }
    const entry = model.addSerial(serial, kind === 'bank' ? 'bank' : 'auto');
    markDirty(); renderAll(); openEditor(entry);
  } catch (e) { status(`That code didn't work: ${e.message}`, 'err'); }
}

// Fresh weapon/item from a balance with its default parts
function itemFromBalance(isWeapon, balance) {
  const parts = { balance, prefix: 'None', title: 'None' };
  if (isWeapon) {
    const b = gd.weaponBalance(balance);
    parts.type = b.weaponType || 'None';
    parts.manufacturer = b.manufacturers[0] || 'None';
    for (const s of WEAPON_SLOTS) if (!(s in parts)) parts[s] = b.parts[s]?.[0] || 'None';
  } else {
    const b = gd.itemBalance(balance);
    parts.type = b.items[0] || 'None';
    parts.manufacturer = b.manufacturers[0] || 'None';
    for (const s of ITEM_SLOTS) if (!(s in parts)) parts[s] = b.parts[s]?.[0] || 'None';
  }
  autoName(isWeapon, parts);
  const level = model ? model.level : 50;
  return { isWeapon, version: gd.lib.version, uniqueId: randomUniqueId(), setId: 0, gradeIndex: level, gameStage: level, parts };
}

// Pick prefix/title name parts the way the game does: from the parts' own name lists.
function autoName(isWeapon, parts) {
  const table = isWeapon ? gd.raw.weaponParts : gd.raw.itemParts;
  const slots = isWeapon ? WEAPON_SLOTS : ITEM_SLOTS;
  let title = null, prefix = null;
  for (const s of slots) {
    const p = table[parts[s]];
    if (!p) continue;
    if (!title && p.titles?.length) title = p.titles[0];
    if (!prefix && p.prefixes?.length) prefix = p.prefixes[0];
  }
  if (isWeapon) {
    const t = gd.weaponTypeInfo(parts.type);
    if (!title && t?.titles?.length) title = t.titles[0];
    if (!prefix && t?.prefixes?.length) prefix = t.prefixes[0];
  } else {
    const d = gd.raw.items[parts.type];
    if (!title && d?.titles?.length) title = d.titles[0];
    if (!prefix && d?.prefixes?.length) prefix = d.prefixes[0];
  }
  parts.title = title || 'None';
  parts.prefix = prefix || 'None';
}

function openBuilder(isWeapon) {
  const list = gd.balancesForCategory(isWeapon).filter((b) => (isWeapon ? gd.weaponBalance(b).weaponType : gd.itemBalance(b).items.length));
  const first = list.find((b) => /Vladof_5_Infinity$|Pistol_Jakobs_3_Rare$/.test(b)) || list[0];
  openEditor({ item: itemFromBalance(isWeapon, first), where: isWeapon ? 'weapon' : 'item', standalone: true, isNew: true });
}

// ---------------- Editor ----------------
let ed = null; // { entry, item, crazy }

function setupEditor() {
  $('#ed-close').addEventListener('click', closeEditor);
  $('#ed-crazy').addEventListener('change', (e) => { ed.crazy = e.target.checked; renderEditorFields(); });
  $('#ed-noskin').addEventListener('click', () => { ed.item.parts.material = 'None'; refreshEditor(); });
  $('#ed-png').addEventListener('click', savePicture);
  $('#ed-code').addEventListener('click', async () => {
    try {
      const code = toCode(encodeSerial(gd.lib, clone(ed.item)));
      try { await navigator.clipboard.writeText(code); status('Code copied.', 'ok'); } catch { prompt('Copy this code:', code); }
    } catch (e) { showEdError(e.message); }
  });
  $('#ed-apply').addEventListener('click', applyEditor);
  $('#ed-dup').addEventListener('click', () => {
    try {
      const serial = encodeSerial(gd.lib, clone(ed.item));
      const where = ed.entry?.where === 'bank' ? 'bank' : 'auto';
      const entry = model.addSerial(serial, where);
      markDirty(); renderAll(); openEditor(entry);
      status('Duplicated.', 'ok');
    } catch (e) { showEdError(e.message); }
  });
  $('#ed-move').addEventListener('click', () => {
    const e = ed.entry;
    try {
      const serial = encodeSerial(gd.lib, clone(ed.item));
      model.removeEntry(e);
      model.addSerial(serial, e.where === 'bank' ? 'auto' : 'bank');
      markDirty(); closeEditor(); renderAll();
      status(e.where === 'bank' ? 'Moved to backpack.' : 'Moved to bank.', 'ok');
    } catch (err) { showEdError(err.message); }
  });
  $('#ed-delete').addEventListener('click', () => {
    if (!confirm('Delete this from the save?')) return;
    model.removeEntry(ed.entry); markDirty(); closeEditor(); renderAll();
  });
}

const clone = (it) => ({ ...it, parts: { ...it.parts } });

function openEditor(entry) {
  ed = { entry, item: clone(entry.item), crazy: false };
  $('#ed-crazy').checked = false;
  $('#editor').hidden = false;
  document.body.style.overflow = 'hidden';
  const standalone = entry.standalone;
  $('#ed-apply').textContent = standalone ? (model ? 'Add to save' : 'Add to save (open a save first)') : 'Apply to save';
  $('#ed-apply').disabled = standalone && !model;
  $('#ed-dup').hidden = standalone || !model;
  $('#ed-move').hidden = standalone || !model;
  $('#ed-move').textContent = entry.where === 'bank' ? 'Move to backpack' : 'Move to bank';
  $('#ed-delete').hidden = standalone || !model;
  $('#ed-noskin').hidden = false;
  refreshEditor();
  $('#editor').scrollTop = 0;
}

function closeEditor() { $('#editor').hidden = true; document.body.style.overflow = ''; ed = null; }

function showEdError(msg) { const el = $('#ed-error'); el.hidden = !msg; el.textContent = msg || ''; }

function refreshEditor() {
  const it = ed.item;
  $('#ed-title').textContent = `${gd.displayName(it)} · ${gd.itemKind(it)}`;
  $('#ed-preview').innerHTML = itemSVG(it);
  try { encodeSerial(gd.lib, clone(it)); showEdError(''); } catch (e) { showEdError(e.message); }
  renderEditorFields();
}

function partLabel(name, item) {
  if (!name || name === 'None') return 'None';
  const leaf = shortName(name);
  const np = (item.isWeapon ? gd.raw.weaponNameParts : gd.raw.itemNameParts)[name];
  const pkg = name.split('.')[0].replace(/^GD_/, '');
  return np?.name ? `${np.name}  —  ${leaf}` : `${leaf}  (${pkg})`;
}

function selectField(label, value, groups, onChange, hint = '') {
  const el = h(`<div class="field"><label>${esc(label)}</label><select></select>${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</div>`);
  const sel = $('select', el);
  const seen = new Set();
  for (const [gname, opts] of groups) {
    const og = document.createElement('optgroup'); og.label = gname;
    for (const [val, text] of opts) {
      if (seen.has(val)) continue; seen.add(val);
      const o = document.createElement('option'); o.value = val; o.textContent = text; og.append(o);
    }
    if (og.children.length) sel.append(og);
  }
  if (!seen.has(value)) { const o = document.createElement('option'); o.value = value; o.textContent = value; sel.prepend(o); }
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value));
  return el;
}

function renderEditorFields() {
  const it = ed.item;
  const box = $('#ed-fields');
  box.innerHTML = '';
  const lvl = h(`<div class="field"><label>Level</label><input type="number" min="1" max="80" value="${it.gameStage}"></div>`);
  $('input', lvl).addEventListener('change', (e) => { const v = Math.max(1, Math.min(127, +e.target.value | 0)); it.gameStage = v; it.gradeIndex = v; refreshEditor(); });
  box.append(lvl);

  // Balance
  const balances = gd.balancesForCategory(it.isWeapon);
  const cat = it.isWeapon ? gd.weaponCategory(it) : gd.itemKind(it);
  const sameCat = balances.filter((b) => (it.isWeapon ? (gd.weaponTypeInfo(gd.weaponBalance(b).weaponType)?.type === cat) : gd.raw.items[gd.itemBalance(b).items[0]]?.type === cat));
  box.append(selectField('Weapon / item base (balance)', it.parts.balance,
    [[`Same kind (${cat})`, sameCat.map((b) => [b, shortName(b)])], ...(ed.crazy ? [['Everything', balances.map((b) => [b, shortName(b)])]] : [])],
    (v) => {
      const fresh = itemFromBalance(it.isWeapon, v);
      if (confirm('Load the default parts for this base? (Cancel keeps your current parts.)')) { it.parts = fresh.parts; }
      else { it.parts.balance = v; it.parts.type = fresh.parts.type; if (!gd[it.isWeapon ? 'weaponBalance' : 'itemBalance'](v).manufacturers.includes(it.parts.manufacturer)) it.parts.manufacturer = fresh.parts.manufacturer; }
      refreshEditor();
    }, 'Decides rarity and which parts normally drop.'));

  const bal = it.isWeapon ? gd.weaponBalance(it.parts.balance) : gd.itemBalance(it.parts.balance);
  const allMfr = [...gd.lib.index.Manufacturers.keys()];
  box.append(selectField('Manufacturer', it.parts.manufacturer, [['For this base', bal.manufacturers.map((x) => [x, shortName(x)])], ...(ed.crazy ? [['Any', allMfr.map((x) => [x, shortName(x)])]] : [])],
    (v) => { it.parts.manufacturer = v; refreshEditor(); }));

  if (ed.crazy) {
    const types = [...gd.lib.index[it.isWeapon ? 'WeaponTypes' : 'ItemTypes'].keys()];
    box.append(selectField(it.isWeapon ? 'Weapon type' : 'Item type', it.parts.type, [['All', types.map((x) => [x, shortName(x)])]], (v) => { it.parts.type = v; refreshEditor(); }, 'Changing this can make the game reject the item.'));
  }

  const slots = it.isWeapon ? WEAPON_SLOTS : ITEM_SLOTS;
  for (const s of slots) {
    const { normal, all } = gd.slotChoices(it, s);
    const normalOpts = [['None', 'None'], ...normal.map((n) => [n, partLabel(n, it)])];
    const groups = [['Normal for this weapon', normalOpts]];
    if (ed.crazy) {
      const sorted = [...all].sort((a, b) => partLabel(a, it).localeCompare(partLabel(b, it)));
      groups.push(['Crazy: every other part', sorted.map((n) => [n, it.isWeapon && s !== 'prefix' && s !== 'title' ? `${partLabel(n, it)} · ${manufacturerOf(n) || '?'} ${categoryOfPart(n, '')}` : partLabel(n, it)])]);
    }
    const el = selectField(SLOT_LABELS[s] || s, it.parts[s] || 'None', groups, (v) => { it.parts[s] = v; refreshEditor(); },
      s === 'material' ? 'The skin/paint. Pick None to see it bare.' : '');
    if (!normal.includes(it.parts[s]) && it.parts[s] !== 'None') el.classList.add('changed');
    box.append(el);
  }
  const renameBtn = h('<div class="field"><label>Name</label><button class="btn">Auto-name from parts</button><div class="hint">Picks the prefix/title the game would use for these parts.</div></div>');
  $('button', renameBtn).addEventListener('click', () => { autoName(it.isWeapon, it.parts); refreshEditor(); });
  box.append(renameBtn);
}

function applyEditor() {
  try {
    if (ed.entry.standalone) {
      const serial = encodeSerial(gd.lib, clone(ed.item));
      model.addSerial(serial, 'auto');
      status('Added to your backpack.', 'ok');
    } else {
      model.updateEntry(ed.entry, clone(ed.item));
      status('Saved changes. Remember to download the edited save.', 'ok');
    }
    markDirty(); closeEditor(); renderAll();
  } catch (e) { showEdError(e.message); }
}

function savePicture() {
  const svg = itemSVG(ed.item);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  img.onload = () => {
    const vb = /viewBox="([\d.\- ]+)"/.exec(svg)[1].split(' ').map(Number);
    const scale = 1600 / vb[2];
    const canvas = document.createElement('canvas');
    canvas.width = 1600; canvas.height = Math.round(vb[3] * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    canvas.toBlob((b) => downloadBlob(b, `${gd.displayName(ed.item).replace(/[^\w\- ]+/g, '')}.png`), 'image/png');
  };
  img.src = url;
}

// ---------------- Skills & ammo ----------------
const AMMO_MAX = {
  Assault_Rifle: [280, 420, 560, 700, 840, 980, 1120, 1260, 0],
  Repeater_Pistol: [200, 300, 400, 500, 600, 700, 800, 900, 1],
  Rocket_Launcher: [12, 15, 18, 21, 24, 27, 30, 33, 2],
  Shotgun: [80, 100, 120, 140, 160, 180, 200, 220, 3],
  Patrol_SMG: [360, 540, 720, 900, 1080, 1260, 1440, 1620, 4],
  Sniper_Rifle: [48, 60, 72, 84, 96, 108, 120, 132, 5],
  Grenade_Protean: [3, 4, 5, 6, 7, 8, 9, 10, 6],
};

function renderSkills() {
  const root = $('#tab-skills');
  root.innerHTML = '';
  if (!model) { root.innerHTML = needSave('skills and ammo'); return; }
  const ammo = model.ammo;
  const ca = h('<div class="card"><h3>Ammo</h3><table class="simple"></table><div class="row"><button class="btn small">Fill all ammo</button></div></div>');
  for (const a of ammo) {
    const tr = h(`<table><tr><td>${esc(shortName(a.resource).replace(/^Ammo_/, '').replace(/_/g, ' '))}</td><td><input type="number" value="${Math.round(a.amount)}"></td></tr></table>`).querySelector('tr');
    $('input', tr).addEventListener('change', (e) => { model.setAmmo(a, +e.target.value); markDirty(); });
    $('table', ca).append(tr);
  }
  $('button', ca).addEventListener('click', () => {
    const sdus = model.sdus;
    for (const a of ammo) {
      const key = Object.keys(AMMO_MAX).find((k) => a.resource.includes(k));
      if (!key) continue;
      const t = AMMO_MAX[key];
      model.setAmmo(a, t[Math.min(7, sdus[t[8]] || 0)]);
    }
    markDirty(); renderSkills(); status('Ammo filled to your SDU limits.', 'ok');
  });
  root.append(ca);

  const cs = h('<div class="card"><h3>Skills</h3><p class="muted">Points in each skill. Most skills max at 5.</p><table class="simple"></table></div>');
  for (const sk of model.skills) {
    const tr = h(`<table><tr><td>${esc(shortName(sk.name).replace(/_/g, ' '))}</td><td><input type="number" min="0" max="10" value="${sk.grade}"></td></tr></table>`).querySelector('tr');
    $('input', tr).addEventListener('change', (e) => { model.setSkillGrade(sk, +e.target.value); markDirty(); });
    $('table', cs).append(tr);
  }
  if (!model.skills.length) $('table', cs).replaceWith(h('<div class="empty">No skills in this save.</div>'));
  root.append(cs);
}

// ---------------- Advanced (raw) ----------------
function looksText(b) {
  if (!b.length || b.length > 400) return false;
  for (const x of b) if (x < 0x20 || x > 0x7e) return false;
  return true;
}
function tryMessage(b) {
  if (!b.length) return null;
  try { const m = Message.parse(b); if (!m.fields.length || m.fields.some((f) => f.no === 0 || f.no > 1000)) return null; return m; } catch { return null; }
}

function renderRaw() {
  const root = $('#tab-raw');
  root.innerHTML = '';
  if (!model) { root.innerHTML = needSave('raw save data'); return; }
  const card = h(`<div class="card"><h3>Every field in the save</h3><p class="muted">For anything the other tabs don't cover (missions, challenges, travel stations…). Changes here are written as-is; only edit what you understand. Weapons, items and bank entries are hidden here — use their tabs.</p><div class="raw"></div></div>`);
  const box = $('.raw', card);
  const hideNo = new Set([41, 53, 54]);
  renderMessage(box, model.root, (n) => ROOT_FIELDS[n] || '', () => markDirty(), hideNo);
  root.append(card);
}

function renderMessage(box, msg, nameOf, commit, hide = new Set()) {
  msg.fields.forEach((f) => {
    if (hide.has(f.no)) return;
    const name = nameOf(f.no);
    if (f.wt === 0) {
      const line = h(`<div class="line"><span class="no">#${f.no}</span><span class="nm">${esc(name)}</span><input type="text" inputmode="numeric" value="${BigInt.asIntN(64, f.v)}"></div>`);
      $('input', line).addEventListener('change', (e) => {
        try { f.v = BigInt.asUintN(64, BigInt(e.target.value.trim())); commit(); } catch { e.target.value = String(BigInt.asIntN(64, f.v)); }
      });
      box.append(line);
    } else if (f.wt === 5) {
      const dv = new DataView(f.v.buffer, f.v.byteOffset, 4);
      const line = h(`<div class="line"><span class="no">#${f.no}</span><span class="nm">${esc(name)} (float)</span><input type="text" value="${dv.getFloat32(0, true)}"></div>`);
      $('input', line).addEventListener('change', (e) => { const x = parseFloat(e.target.value); if (!isNaN(x)) { const nb = new Uint8Array(4); new DataView(nb.buffer).setFloat32(0, x, true); f.v = nb; commit(); } });
      box.append(line);
    } else if (f.wt === 2 && looksText(f.v)) {
      const line = h(`<div class="line"><span class="no">#${f.no}</span><span class="nm">${esc(name)}</span><input type="text" value="${esc(new TextDecoder().decode(f.v))}"></div>`);
      $('input', line).addEventListener('change', (e) => { f.v = new TextEncoder().encode(e.target.value); commit(); });
      box.append(line);
    } else if (f.wt === 2) {
      const sub = tryMessage(f.v);
      if (sub) {
        const d = h(`<details><summary class="line"><span class="no">#${f.no}</span><span class="nm">${esc(name)} ▸ ${sub.fields.length} fields</span></summary><div class="node"></div></details>`);
        let rendered = false;
        d.addEventListener('toggle', () => {
          if (!d.open || rendered) return;
          rendered = true;
          renderMessage($('.node', d), sub, () => '', () => { f.v = sub.serialize(); commit(); });
        });
        box.append(d);
      } else {
        box.append(h(`<div class="line"><span class="no">#${f.no}</span><span class="nm">${esc(name)} · ${f.v.length} bytes of data</span></div>`));
      }
    } else {
      box.append(h(`<div class="line"><span class="no">#${f.no}</span><span class="nm">${esc(name)} · ${f.v.length} bytes</span></div>`));
    }
  });
}

init();
