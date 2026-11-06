# BL2 Save Editor (with weapon previews)

A Borderlands 2 save editor that runs in the browser (phone or computer). The
app lives in [`docs/bl2/`](../docs/bl2/). Nothing is uploaded: the save is read
and written on your device.

## What it edits

- **Character:** name, level (XP is fixed up automatically), skill points, TVHM/UVHM unlock, Overpower level, save ID
- **Currency:** money, Eridium (including values over 99, which BL2 stores in a hidden entry), Seraph Crystals, Torgue Tokens
- **Space:** backpack, weapon slots, bank slots, all SDU levels
- **Weapons, items and bank:** every part, the level, the base (balance) and the manufacturer. You can also duplicate, delete, move items to and from the bank, set every item to one level, and import or export `BL2(...)` codes.
- **Skills and ammo:** points in each skill, ammo amounts, and a "fill ammo" button
- **Advanced:** a raw view of every field in the save (missions, challenges, and so on)

## Weapon preview

Each weapon is drawn from its parts. Every part (body, barrel, grip, stock,
sight, accessories, element) is drawn in the style of its own manufacturer and
weapon type. So if you put a sniper barrel on a pistol or a Torgue stock on a
Maliwan gun, the picture shows that mix.

- **Material** is the skin. Choose `None`, or tap **Remove skin**, to see the gun bare and unpainted.
- **Show all parts (crazy mode)** lists every part in the game for each slot, not just the parts that normally drop.
- **Save picture** downloads the preview as a PNG.

The pictures are drawings made from part data, not renders of the game's 3D
models, which can't be shipped with a web page.

## PS4 workflow

1. PS4 saves are encrypted. Copy the save to USB and decrypt it with a tool such as Save Wizard.
2. Open the decrypted file in the editor.
3. Edit it, then tap **Download edited save**.
4. Put the file back under the same name, then re-encrypt/resign it with your save tool.
5. **Keep a backup of the original.**

The editor detects the save layout itself: LZO or zlib compression, little- or
big-endian, or uncompressed. It writes the file back in the same layout it read.

## Running it

GitHub Pages: enable Pages for the `docs/` folder and open `/bl2/`.

Locally:

```sh
cd docs && python3 -m http.server 8000
# open http://localhost:8000/bl2/
```

It must be served over http(s). Opening `index.html` straight from disk can't load the game data file.

## Tests

```sh
node bl2-save-editor/tests/run.mjs
```

The tests cover LZO and Huffman round trips, known item codes (a Righteous
Infinity and a Vault Hunter's Relic decode and re-encode exactly), part swaps,
every save format, and model edits.

## Credits

The save format logic is ported from
[Gibbed's Borderlands 2 save editor](https://github.com/gibbed/Gibbed.Borderlands2) (zlib license).
`docs/bl2/data/gamedata.json` is built from
[Borderlands2Dumps](https://github.com/gibbed/Borderlands2Dumps) by
`tools/build_gamedata.py`. Not affiliated with Gearbox or 2K.
