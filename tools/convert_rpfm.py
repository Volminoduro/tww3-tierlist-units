#!/usr/bin/env python3
"""Convertit des tables exportées avec RPFM (TSV) en data/units.js pour le site.

Usage :
  python tools/convert_rpfm.py --inspect DOSSIER_TSV      # liste tables/colonnes trouvées
  python tools/convert_rpfm.py DOSSIER_TSV                # génère data/units.js + units.json

Le script a été écrit SANS accès aux fichiers du jeu : les noms de colonnes
candidats sont listés dans CANDIDATES. Si une stat sort vide/0, lance --inspect,
repère le vrai nom de colonne et ajoute-le à la liste correspondante.
"""
import argparse, csv, json, os, re, sys
csv.field_size_limit(10**9)
from collections import defaultdict

CANDIDATES = {
    # main_units
    "land_unit":     ["land_unit"],
    "cost":          ["recruitment_cost"],
    "upkeep":        ["upkeep_cost"],
    "mp_cost":       ["multiplayer_cost", "mp_cost"],
    "recruit_turns": ["create_time", "recruitment_turns", "turns_to_recruit", "num_turns", "unit_recruitment_time", "recruit_time"],
    "caste":         ["caste"],
    "group":         ["ui_unit_group_land", "unit_group", "category"],
    "tier":          ["tier"],
    "men":           ["num_men", "unit_size", "men", "num_models"],
    # land_units
    "hp_bonus":      ["bonus_hit_points"],
    "armour":        ["armour", "armour_value"],
    "ma":            ["melee_attack"],
    "md":            ["melee_defence"],
    "charge":        ["charge_bonus"],
    "morale":        ["morale", "leadership"],
    "melee_weapon":  ["primary_melee_weapon"],
    "missile_weapon":["primary_missile_weapon"],
    "man_entity":    ["man_entity"],
    "ammo":          ["primary_ammo", "ammo", "ammunition"],
    "land_men":      ["num_men", "unit_size", "num_models"],
    "mounts":        ["num_mounts"],
    "engines":       ["num_engines"],
    "mount":         ["mount"],
    # entity
    "entity_hp":     ["hit_points"],
    "speed":         ["run_speed", "movement_speed", "speed"],
    # weapons / projectiles
    "w_dmg":         ["damage", "base_damage"],
    "w_ap":          ["ap_damage", "armour_piercing_damage"],
    "w_interval":    ["melee_attack_interval", "attack_interval"],
    "w_bvi":         ["bonus_v_infantry"],
    "w_bvl":         ["bonus_v_large"],
    "m_projectile":  ["projectile", "default_projectile"],
    "m_reload":      ["base_reload_time", "reload_time"],
    "m_shots":       ["projectile_number", "shots_per_volley"],
    "acc":           ["accuracy"],
    "mount_entity":  ["entity"],
    "p_range":       ["effective_range", "range"],
    # permissions
    "perm_unit":     ["unit"],
    "perm_faction":  ["faction"],
}

SPEED_UI = 12  # run_speed brut (ex. 3.0 pour l'infanterie) -> échelle d'affichage du site (~36)

def norm_table(path):
    parts = path.replace("\\", "/").lower().split("/")
    for p in reversed(parts):
        p = re.sub(r"\.tsv$", "", p)
        m = re.match(r"([a-z0-9_]+?)(?:_tables)?$", p)
        if p.endswith("_tables"):
            return p[:-7]
    stem = re.sub(r"\.tsv$", "", parts[-1])
    return re.sub(r"_tables$", "", stem)

def read_tsv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        lines = [l for l in f.read().splitlines() if l and not l.startswith("#")]
    if not lines: return []
    return list(csv.DictReader(lines, delimiter="\t", quoting=csv.QUOTE_NONE))

NEEDED = {"main_units", "land_units", "battle_entities", "melee_weapons", "missile_weapons", "projectiles",
          "unit_armour_types", "armour_types", "units_custom_battle_permissions", "mounts", "factions"}

def load_tables(root, only_needed=False):
    tables = defaultdict(list)
    for dp, _, fs in os.walk(root):
        for fn in fs:
            if fn.lower().endswith(".tsv"):
                p = os.path.join(dp, fn)
                if only_needed:
                    name = norm_table(p) if "_tables" in p.lower() else fn.lower()
                    if not (name in NEEDED or name.startswith("land_units__") or name.startswith("factions__")): continue
                tables[norm_table(p) if "_tables" in p.lower() else re.sub(r"\.tsv$","",fn.lower())].extend(read_tsv(p))
    return tables

def col(row, key):
    for c in CANDIDATES[key]:
        if c in row and row[c] != "": return row[c]
    return None

def num(v, d=0.0):
    try: return float(str(v).replace(",", "."))
    except (TypeError, ValueError): return d

def index(rows, keycol="key"):
    return {r.get(keycol): r for r in rows if r.get(keycol)}

def humanise(k):
    k = re.sub(r"^wh\d?_(main|dlc\d+|pro\d+)_[a-z]{3}_", "", k)
    return k.replace("_", " ").title()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("--inspect", action="store_true")
    ap.add_argument("--no-heroes", action="store_true", help="exclut seigneurs et héros")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "..", "data"))
    a = ap.parse_args()
    T = load_tables(a.src, only_needed=not a.inspect)
    if a.inspect:
        for t, rows in sorted(T.items()):
            print(f"{t}: {len(rows)} lignes | colonnes: {', '.join(rows[0].keys()) if rows else '-'}")
        return
    for need in ("main_units", "land_units"):
        if not T.get(need): sys.exit(f"Table manquante : {need} (voir --inspect)")

    land = index(T["land_units"])
    ents = index(T.get("battle_entities", []))
    melee = index(T.get("melee_weapons", []))
    missile = index(T.get("missile_weapons", []))
    proj = index(T.get("projectiles", []))
    arm = index(T.get("unit_armour_types", []) or T.get("armour_types", []))
    mounts = index(T.get("mounts", []))
    # localisation
    loc = {}
    for t, rows in T.items():
        if t.startswith("text") or "loc" in t:
            for r in rows:
                if r.get("key"): loc[r["key"]] = r.get("text", "")
    # factions par unité (permissions de bataille personnalisée)
    fac_of = defaultdict(set)
    for r in T.get("units_custom_battle_permissions", []):
        u, f = col(r, "perm_unit"), col(r, "perm_faction")
        if u and f: fac_of[u].add(f)

    units, warn = [], defaultdict(int)
    for mu in T["main_units"]:
        key = mu.get("unit")
        lu = land.get(col(mu, "land_unit") or "")
        if not key or not lu: continue
        caste = (col(mu, "caste") or "").lower()
        if caste in ("lord", "hero") and a.no_heroes: continue
        if key not in fac_of: warn["sans_faction"] += 1; continue

        men = num(col(mu, "men") or col(lu, "land_men"), 0)
        ent = ents.get(col(lu, "man_entity") or "", {})
        mnt = mounts.get(col(lu, "mount") or "", {})
        ment = ents.get(col(mnt, "mount_entity") or "", {})
        # PV d'un modèle = cavalier + monture ; vitesse = celle de la monture si présente
        hp = num(col(ent, "entity_hp")) + num(col(ment, "entity_hp")) + num(col(lu, "hp_bonus"))
        a_raw = col(lu, "armour")
        armour = num(a_raw) if a_raw and re.fullmatch(r"[\d.,]+", a_raw) else num(col(arm.get(a_raw, {}), "armour") if a_raw in arm else None)
        mw = melee.get(col(lu, "melee_weapon") or "", {})
        ms = missile.get(col(lu, "missile_weapon") or "", {})
        pj = proj.get(col(ms, "m_projectile") or "", {})
        u = {
            "id": key,
            "name": loc.get(f"land_units_onscreen_name_{col(mu,'land_unit')}") or humanise(key),
            "role": None, "group": col(mu, "group") or "",
            "men": men, "hp": hp, "armour": armour,
            "ma": num(col(lu, "ma")), "md": num(col(lu, "md")),
            "charge": num(col(lu, "charge")), "ld": num(col(lu, "morale")),
            "speed": SPEED_UI * (num(col(ment, "speed")) if ment else num(col(ent, "speed"))),
            "acc": num(col(lu, "acc")), "caste": caste,
            "melee": {"dmg": num(col(mw, "w_dmg")), "ap": num(col(mw, "w_ap")),
                      "interval": num(col(mw, "w_interval"), 5) or 5,
                      "bvi": num(col(mw, "w_bvi")), "bvl": num(col(mw, "w_bvl"))},
            "ranged": None,
            "cost": num(col(mu, "cost")), "upkeep": num(col(mu, "upkeep")),
            "mpCost": num(col(mu, "mp_cost")),
            "recruitTurns": num(col(mu, "recruit_turns"), 1),
            "tier": num(col(mu, "tier")),
            "factions": sorted(fac_of[key]),
        }
        if pj:
            u["ranged"] = {"dmg": num(col(pj, "w_dmg")), "ap": num(col(pj, "w_ap")),
                           "range": num(col(pj, "p_range")),
                           "shots": num(col(pj, "m_shots"), 1) or 1,
                           "reload": num(col(pj, "m_reload"), 8) or 8,
                           "ammo": num(col(lu, "ammo"))}
        ROLE = {"melee_infantry": "inf_melee", "missile_infantry": "inf_ranged", "monstrous_infantry": "monster",
                "monster": "monster", "monstrous_cavalry": "monster", "melee_cavalry": "cav_melee",
                "missile_cavalry": "cav_ranged", "lord": "lord", "hero": "hero", "warmachine": "artillery", "chariot": "chariot", "war_beast": "beast"}
        u["role"] = ROLE.get(caste)
        if "(Custom VO)" in u["name"]: warn["doublons_custom_vo"] += 1; continue
        if not u["role"]:
            warn["caste_inconnue:" + caste] += 1; continue
        if not u["cost"] and not u["mpCost"]: warn["sans_cout"] += 1; continue
        if not u["cost"]: u["cost"] = u["mpCost"]
        for k in ("hp", "men", "ma", "cost"):
            if not u[k]: warn[f"{k}=0"] += 1
        units.append(u)

    flist = sorted({f for u in units for f in u["factions"]})
    factions = {f: loc.get(f"factions_screen_name_{f}") or humanise(f) for f in flist}
    flag_rows = index(T.get("factions", []))
    flags = {f: (flag_rows.get(f, {}).get("flags_path") or "").replace("\\", "/") for f in flist}
    out = {"demo": False, "factions": factions, "flags": flags, "units": units}
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, "units.json"), "w", encoding="utf-8") as f: json.dump(out, f, ensure_ascii=False, indent=1)
    with open(os.path.join(a.out, "units.js"), "w", encoding="utf-8") as f: f.write("window.TWW3_DATA=" + json.dumps(out, ensure_ascii=False) + ";")
    print(f"{len(units)} unités, {len(factions)} factions -> {os.path.abspath(a.out)}")
    for k, v in warn.items(): print(f"  ⚠ {k}: {v} unités (colonne introuvable ? lance --inspect)")

if __name__ == "__main__": main()
