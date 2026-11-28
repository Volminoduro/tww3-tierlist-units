#!/usr/bin/env python3
"""Met à jour le champ `at` (attributs d'unité) de data/units.json et data/units.js SANS relancer tout convert_rpfm.py :
ajoute causes_fear, causes_terror, immune_to_psychology, unbreakable à ceux déjà présents.
Usage : python tools/attrs_only.py DOSSIER_DU_DUMP"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from collections import defaultdict
import convert_rpfm as C
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
T = C.load_tables(sys.argv[1], only_needed=True)
NEW = {"causes_fear", "causes_terror", "immune_to_psychology", "unbreakable"}
grp = defaultdict(set)
for r in T.get("unit_attributes_to_groups_junctions", []):
    if r.get("attribute") in NEW: grp[r.get("attribute_group")].add(r["attribute"])
land = {r.get("key"): r for r in T.get("land_units", [])}
unit_land = {r.get("unit"): r.get("land_unit") for r in T.get("main_units", [])}
def newattrs(uid):
    lu = land.get(unit_land.get(uid)); return grp.get(lu.get("attribute_group"), set()) if lu else set()
def patch(units):
    n = 0
    for u in units:
        add = newattrs(u["id"])
        if add:
            u["at"] = sorted(set(u.get("at", [])) | add); n += 1
    return n
jp = os.path.join(root, "data", "units.json"); J = json.load(open(jp, encoding="utf-8")); n = patch(J["units"])
open(jp, "w", encoding="utf-8").write(json.dumps(J, ensure_ascii=False, indent=1))
sp = os.path.join(root, "data", "units.js"); t = open(sp, encoding="utf-8").read(); pre = "window.TWW3_DATA="; tail = ";" if t.rstrip().endswith(";") else ""
D = json.loads(t[len(pre):].rstrip().rstrip(";")); patch(D["units"])
open(sp, "w", encoding="utf-8").write(pre + json.dumps(D, ensure_ascii=False) + tail + ("\n" if t.endswith("\n") else ""))
cnt = defaultdict(int)
for u in J["units"]:
    for a in u.get("at", []):
        if a in NEW: cnt[a] += 1
print("unités modifiées :", n, dict(cnt))
