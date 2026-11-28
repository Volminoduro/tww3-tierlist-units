#!/usr/bin/env python3
"""Génère data/skills.js (arbres de compétences des seigneurs) SANS relancer tout convert_rpfm.py : lit data/units.json (unités, factions) et le dump.
Usage : python tools/skills_only.py DOSSIER_DU_DUMP [--effects] [--loc-fr DOSSIER_FR]   (--loc-fr : localisation française, .loc binaire ou TSV de RPFM : noms de compétences en français)   (ex. wh3-dump)   -- vérifie aussi que data/effects.js n'a pas dérivé (mêmes seigneurs et effets)."""
import json, os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from collections import defaultdict
import convert_rpfm as C
from effects_extract import build_effects
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
src = sys.argv[1]
T = C.load_tables(src, only_needed=True)
loc = {}
for t, rows in T.items():
    if t.startswith("text") or "loc" in t:
        for r in rows:
            if r.get("key"): loc[r["key"]] = r.get("text", "")
D = json.load(open(os.path.join(root, "data", "units.json"), encoding="utf-8"))
loc_fr = None
if "--loc-fr" in sys.argv:
    loc_fr = {}
    for dp, _, fs in os.walk(sys.argv[sys.argv.index("--loc-fr") + 1]):
        for fn in fs:
            path = os.path.join(dp, fn)
            if fn.endswith(".tsv"):
                for r_ in C.read_tsv(path):
                    if r_.get("key"): loc_fr[r_["key"]] = r_.get("text", "")
            elif fn.endswith(".loc"):
                for k_, t_ in C.read_loc_binary(path): loc_fr[k_] = t_
    print("localisation française :", len(loc_fr), "entrées")
eff = build_effects(T, D["units"], loc, D["facInfo"], loc_fr)
skills = {"sets": eff.pop("skillSets"), "lords": eff.pop("skills")}
if "--effects" in sys.argv: open(os.path.join(root, "data", "effects.js"), "w", encoding="utf-8").write("window.TWW3_EFFECTS=" + json.dumps(eff, ensure_ascii=False) + ";")   # régénère aussi effects.js (leaders, lords)
old = json.loads(open(os.path.join(root, "data", "effects.js"), encoding="utf-8").read().split("=", 1)[1].rstrip(";\n"))
print("seigneurs : nouveau", len(eff["lords"]), "ancien", len(old["lords"]), "| identiques :", sorted(eff["lords"]) == sorted(old["lords"]))
open(os.path.join(root, "data", "skills.js"), "w", encoding="utf-8").write("window.TWW3_SKILLS=" + json.dumps(skills, ensure_ascii=False, separators=(",", ":")) + ";")
print("skills.js :", len(skills["lords"]), "seigneurs avec arbre,", sum(len(v) for v in skills["lords"].values()), "compétences,", len(skills["sets"]), "listes d'unités")
