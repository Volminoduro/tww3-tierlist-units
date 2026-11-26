#!/usr/bin/env python3
"""Copie les illustrations extraites du jeu (portraits d'unités, seigneurs, héros, drapeaux de factions)
vers img/ et génère data/icons.js. À lancer APRÈS convert_rpfm.py.

Extraction (RPFM, sur ton PC) : extrais de data.pack et des packs DLC les dossiers  ui/units/icons ,
ui/flags  (et, pour les seigneurs, tout dossier ui/* dont les images portent la clé d'unité).
  python tools/copy_icons.py DOSSIER_EXTRAIT [DOSSIER_TABLES]   # cherche partout dedans
Unités/seigneurs/héros : fichiers <clé_unité>.png (ex. wh_main_emp_inf_halberdiers.png), trouvés récursivement ;
sinon, si DOSSIER_TABLES (ex. wh3-dump) est donné, le nom de carte du jeu lu dans db/unit_variants_tables (colonne unit_card),
ex. wh_main_dwf_inf_slayers -> wh_main_dwf_slayers.png (variante sans faction préférée).
Factions : dossier ui/flags/<nom_du_flag>/ (nom lu dans la table factions) ; on prend mon_64.png, sinon le plus grand png.
Ces visuels appartiennent à Creative Assembly / SEGA : ils sont versionnés avec le dépôt (projet de fan non commercial, choix du propriétaire du dépôt) ; `git add img data/icons.js` après l'extraction.
"""
import csv, json, os, re, shutil, sys
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
src = sys.argv[1]
dump = sys.argv[2] if len(sys.argv) > 2 else None
data = json.load(open(os.path.join(root, "data", "units.json"), encoding="utf-8"))
ids = {u["id"] for u in data["units"]}
for d in ("units", "factions"): os.makedirs(os.path.join(root, "img", d), exist_ok=True)
units, flags, pngs, dirs = [], [], {}, {}
for dp, dn, fs in os.walk(src):
    for d in dn: dirs.setdefault(d.lower(), []).append(os.path.join(dp, d))
    for fn in fs:
        k, ext = os.path.splitext(fn)
        # « placeholder » : image vide du jeu, donnée comme unit_card à beaucoup de seigneurs/héros -> on cherche leur vrai portrait
        if ext.lower() == ".png" and not re.search(r"_mask\d*$|^placeholder", k.lower()): pngs.setdefault(k.lower(), []).append(os.path.join(dp, fn))
cards = {}                                          # clé d'unité -> noms de carte (unit_card), variantes sans faction d'abord
if dump:
    for dp, _, fs in os.walk(os.path.join(dump, "db", "unit_variants_tables")):
        for fn in fs:
            if not fn.endswith(".tsv"): continue
            with open(os.path.join(dp, fn), encoding="utf-8") as f:
                rows = list(csv.reader(f, delimiter="\t"))
            if not rows: continue
            for r in rows[1:]:
                d = dict(zip(rows[0], r))
                if d.get("unit") and d.get("unit_card") and not d["unit"].startswith("#"):
                    cards.setdefault(d["unit"], []).append((bool(d.get("faction")), d["unit_card"].lower()))
    print(f"unit_variants : {len(cards)} unités avec un nom de carte")

def read_table(name):
    out, d = [], os.path.join(dump, "db", name)
    if not os.path.isdir(d): return out
    for fn in sorted(os.listdir(d)):
        if not fn.endswith(".tsv"): continue
        with open(os.path.join(d, fn), encoding="utf-8") as f:
            rows = list(csv.reader(f, delimiter="\t"))
        out += [dict(zip(rows[0], r)) for r in rows[1:] if r and not r[0].startswith("#")]
    return out

# Seigneurs et héros : leur carte est dans ui/portraits/units/<dossier>/<variante>_0.png. Chaîne :
# unité -> agent_subtypes.associated_unit_override -> campaign_character_art_sets -> campaign_character_arts.uniform
# -> agent_uniforms (campaign_porthole_filename…) = variante, ex. wh2_dlc09_tmb_ch_arkhan -> tmb_ch_arkhan_0.png
base = lambda k: re.sub(r"_\d+$", "", k)
strip = lambda v: re.sub(r"^wh\d?_(main|dlc\d+|pro\d+|twa\d+)_", "", v.lower())
subs, arts, unis, uniforms = {}, {}, {}, {}
if dump:
    for r in read_table("agent_subtypes_tables"):
        if r.get("associated_unit_override"): subs.setdefault(base(r["associated_unit_override"]), set()).add(r["key"])
    for r in read_table("campaign_character_art_sets_tables"): arts.setdefault(r.get("agent_subtype"), []).append(r["art_set_id"])
    for r in read_table("campaign_character_arts_tables"):
        if r.get("uniform"): unis.setdefault(r["art_set_id"], []).append(r["uniform"])
    uniforms = {r["uniform_name"]: r for r in read_table("agent_uniforms_tables")}
setpiece = {}                                       # batailles scénarisées : chemin de portrait donné directement pour l'unité
if dump:
    for r in read_table("battle_set_piece_armies_characters_tables"):
        pics = [v for v in r.values() if v.startswith("ui/portraits/")]
        if pics:
            for v in r.values():
                if v in ids: setpiece.setdefault(v, os.path.splitext(os.path.basename(pics[0]))[0].lower())
def portrait_names(k):
    for s in sorted(subs.get(base(k), [])) or [base(k).replace("_cha_", "_")]:
        for a in sorted(arts.get(s, [])):
            for u in unis.get(a, []):
                r = uniforms.get(u, {})
                for v in (r.get("campaign_porthole_filename"), r.get("filename"), r.get("battle_filename")):
                    if v: yield strip(v) + "_0"; yield strip(v)
    if k in setpiece: yield setpiece[k]

via_card = via_portrait = via_sibling = 0
found_by_base = {}
for k in ids:
    hit = next((n for n in [k.lower()] + [c for _, c in sorted(cards.get(k, []))] if n in pngs), None)
    if hit: via_card += hit != k.lower()
    elif dump:
        hit = next((n for n in portrait_names(k) if n in pngs), None)
        via_portrait += bool(hit)
    if hit:
        shutil.copy(pngs[hit][0], os.path.join(root, "img", "units", k + ".png")); units.append(k)
        found_by_base.setdefault(base(k), hit)
for k in ids:                                       # variantes (monture…) sans image propre : celle d'une variante sœur
    if k not in units and base(k) in found_by_base:
        shutil.copy(pngs[found_by_base[base(k)]][0], os.path.join(root, "img", "units", k + ".png")); units.append(k); via_sibling += 1
if dump: print(f"  dont {via_card} via unit_card, {via_portrait} via portraits de personnages, {via_sibling} via une variante sœur")
for fk, path in data.get("flags", {}).items():
    cands = dirs.get(os.path.basename(path).lower(), []) if path else []
    for d in cands:
        files = [os.path.join(d, f) for f in os.listdir(d) if f.lower().endswith(".png")]
        if not files: continue
        pick = next((f for f in files if os.path.basename(f).lower() == "mon_64.png"), max(files, key=os.path.getsize))
        shutil.copy(pick, os.path.join(root, "img", "factions", fk + ".png")); flags.append(fk); break
open(os.path.join(root, "data", "icons.js"), "w").write("window.TWW3_ICONS=" + json.dumps(sorted(units)) + ";\nwindow.TWW3_FLAGS=" + json.dumps(sorted(flags)) + ";\n")
print(f"{len(units)} portraits d'unités sur {len(ids)} ; {len(flags)} drapeaux sur {len(data.get('flags', {}))} factions.")
