#!/usr/bin/env python3
"""Copie les illustrations extraites du jeu (portraits d'unités, seigneurs, héros, drapeaux de factions)
vers img/ et génère data/icons.js. À lancer APRÈS convert_rpfm.py.

Extraction (RPFM, sur ton PC) : extrais de data.pack et des packs DLC les dossiers  ui/units/icons ,
ui/flags  (et, pour les seigneurs, tout dossier ui/* dont les images portent la clé d'unité).
  python tools/copy_icons.py DOSSIER_EXTRAIT          # cherche partout dedans
Unités/seigneurs/héros : fichiers <clé_unité>.png (ex. wh_main_emp_inf_halberdiers.png), trouvés récursivement.
Factions : dossier ui/flags/<nom_du_flag>/ (nom lu dans la table factions) ; on prend mon_64.png, sinon le plus grand png.
Ces visuels sont sous copyright : img/units et img/factions sont ignorés par git (usage local).
"""
import json, os, shutil, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
src = sys.argv[1]
data = json.load(open(os.path.join(root, "data", "units.json"), encoding="utf-8"))
ids = {u["id"] for u in data["units"]}
for d in ("units", "factions"): os.makedirs(os.path.join(root, "img", d), exist_ok=True)
units, flags, pngs, dirs = [], [], {}, {}
for dp, dn, fs in os.walk(src):
    for d in dn: dirs.setdefault(d.lower(), []).append(os.path.join(dp, d))
    for fn in fs:
        k, ext = os.path.splitext(fn)
        if ext.lower() == ".png": pngs.setdefault(k, []).append(os.path.join(dp, fn))
for k in ids:
    if k in pngs:
        shutil.copy(pngs[k][0], os.path.join(root, "img", "units", k + ".png")); units.append(k)
for fk, path in data.get("flags", {}).items():
    cands = dirs.get(os.path.basename(path).lower(), []) if path else []
    for d in cands:
        files = [os.path.join(d, f) for f in os.listdir(d) if f.lower().endswith(".png")]
        if not files: continue
        pick = next((f for f in files if os.path.basename(f).lower() == "mon_64.png"), max(files, key=os.path.getsize))
        shutil.copy(pick, os.path.join(root, "img", "factions", fk + ".png")); flags.append(fk); break
open(os.path.join(root, "data", "icons.js"), "w").write("window.TWW3_ICONS=" + json.dumps(sorted(units)) + ";\nwindow.TWW3_FLAGS=" + json.dumps(sorted(flags)) + ";\n")
print(f"{len(units)} portraits d'unités sur {len(ids)} ; {len(flags)} drapeaux sur {len(data.get('flags', {}))} factions.")
