#!/usr/bin/env python3
"""Copie les portraits d'unités extraits du jeu vers img/units/ et génère data/icons.js.

1. Dans RPFM, extrais le dossier  ui/units/icons  des packs du jeu (data.pack + DLC).
2. python tools/copy_icons.py DOSSIER_EXTRAIT/ui/units/icons
Les images portent le nom de la clé d'unité (ex. wh_main_emp_inf_halberdiers.png).
Ces visuels sont sous copyright : ils sont ignorés par git (.gitignore) pour un usage local.
"""
import json, os, shutil, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
src = sys.argv[1]
ids = {u["id"] for u in json.load(open(os.path.join(root, "data", "units.json"), encoding="utf-8"))["units"]}
dst = os.path.join(root, "img", "units"); os.makedirs(dst, exist_ok=True)
found = []
for dp, _, fs in os.walk(src):
    for fn in fs:
        k, ext = os.path.splitext(fn)
        if ext.lower() == ".png" and k in ids:
            shutil.copy(os.path.join(dp, fn), os.path.join(dst, k + ".png")); found.append(k)
open(os.path.join(root, "data", "icons.js"), "w").write("window.TWW3_ICONS=" + json.dumps(sorted(set(found))) + ";")
print(f"{len(set(found))} portraits copiés sur {len(ids)} unités.")
