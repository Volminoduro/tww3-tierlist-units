#!/usr/bin/env python3
"""Intègre les capacités passives (tools/passives.py) aux unités de data/units.json et data/units.js SANS relancer tout convert_rpfm.py ; idempotent.
Usage : python tools/passives_only.py DOSSIER_DU_DUMP"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import convert_rpfm as C, passives
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
T = C.load_tables(sys.argv[1], only_needed=True)
pas = passives.build(T)
jp = os.path.join(root, "data", "units.json"); J = json.load(open(jp, encoding="utf-8")); n = passives.apply(J["units"], pas)
open(jp, "w", encoding="utf-8").write(json.dumps(J, ensure_ascii=False, indent=1))
sp = os.path.join(root, "data", "units.js"); t = open(sp, encoding="utf-8").read(); pre = "window.TWW3_DATA="; tail = ";" if t.rstrip().endswith(";") else ""
D = json.loads(t[len(pre):].rstrip().rstrip(";")); passives.apply(D["units"], pas)
open(sp, "w", encoding="utf-8").write(pre + json.dumps(D, ensure_ascii=False) + tail + ("\n" if t.endswith("\n") else ""))
print("unités avec passifs :", sum(1 for u in J["units"] if u.get("pas")), "| stats modifiées :", n)
