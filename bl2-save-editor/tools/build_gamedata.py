#!/usr/bin/env python3
"""Build docs/bl2/data/gamedata.json from Gibbed's Borderlands2Dumps.

Usage:
    git clone https://github.com/gibbed/Borderlands2Dumps.git
    python3 build_gamedata.py path/to/Borderlands2Dumps path/to/gamedata.json

The dumps come from Gibbed's datamining tools (https://github.com/gibbed).
"""
import json
import os
import sys

FILES = {
    'alm': 'Asset Library Manager.json',
    'weaponTypes': 'Weapon Types.json',
    'weaponBalance': 'Weapon Balance.json',
    'weaponBalancePartLists': 'Weapon Balance Part Lists.json',
    'weaponPartLists': 'Weapon Part Lists.json',
    'weaponParts': 'Weapon Parts.json',
    'weaponNameParts': 'Weapon Name Parts.json',
    'items': 'Items.json',
    'itemBalance': 'Item Balance.json',
    'itemBalancePartLists': 'Item Balance Part Lists.json',
    'itemPartLists': 'Item Part Lists.json',
    'itemParts': 'Item Parts.json',
    'itemNameParts': 'Item Name Parts.json',
    'playerClasses': 'Player Classes.json',
}


def main(src, dst):
    out = {}
    for key, name in FILES.items():
        with open(os.path.join(src, name), encoding='utf-8-sig') as f:
            out[key] = json.load(f)
    # Drop info the editor never uses to keep the download small.
    for s in out['alm']['sets']:
        for lib in s['libraries'].values():
            for sub in lib['sublibraries']:
                sub.pop('description', None)
    with open(dst, 'w', encoding='utf-8') as f:
        json.dump(out, f, separators=(',', ':'), ensure_ascii=False)
    print('wrote', dst, os.path.getsize(dst), 'bytes')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
