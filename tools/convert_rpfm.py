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

CULTURE_FR = {"wh_main_grn_greenskins": "Peaux-Vertes", "wh_dlc08_nor_norsca": "Norsca", "wh2_main_skv_skaven": "Skavens",
    "wh_main_chs_chaos": "Guerriers du Chaos", "wh3_main_ogr_ogre_kingdoms": "Royaumes Ogres", "wh_main_emp_empire": "Empire",
    "wh_dlc05_wef_wood_elves": "Elfes Sylvains", "wh2_main_def_dark_elves": "Elfes Noirs", "wh2_main_lzd_lizardmen": "Hommes-Lézards",
    "wh_main_dwf_dwarfs": "Nains", "wh2_main_hef_high_elves": "Hauts Elfes", "wh_main_brt_bretonnia": "Bretonnie",
    "wh_main_vmp_vampire_counts": "Comtes Vampires", "wh_dlc03_bst_beastmen": "Hommes-Bêtes", "wh3_main_cth_cathay": "Grand Cathay",
    "wh2_dlc09_tmb_tomb_kings": "Rois des Tombes", "wh2_dlc11_cst_vampire_coast": "Côte Vampire", "wh3_main_kho_khorne": "Khorne",
    "wh3_main_tze_tzeentch": "Tzeentch", "wh3_main_ksl_kislev": "Kislev", "wh3_main_nur_nurgle": "Nurgle", "wh3_main_sla_slaanesh": "Slaanesh",
    "wh3_dlc23_chd_chaos_dwarfs": "Nains du Chaos", "wh3_main_dae_daemons": "Démons du Chaos", "wh3_dlc29_nag_undead_legions": "Légions des morts"}
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
          "unit_armour_types", "armour_types", "mounts", "factions", "units_custom_battle_permissions", "cultures_subcultures",
          "custom_battle_factions", "units_to_groupings_military_permissions"}

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
    # Hiérarchie race (culture) -> faction -> groupe militaire -> unités recrutables
    fac_rows = index(T.get("factions", []))
    sub2cul = {r["subculture"]: r["culture"] for r in T.get("cultures_subcultures", [])}
    groups_of = defaultdict(set)
    for r in T.get("units_to_groupings_military_permissions", []): groups_of[r["unit"]].add(r["military_group"])
    facinfo = {}
    for r in T.get("custom_battle_factions", []):
        fk = r.get("faction_key"); fr = fac_rows.get(fk, {})
        cul = sub2cul.get(fr.get("subculture"))
        if fr.get("military_group") and cul:
            facinfo[fk] = {"culture": cul, "group": fr["military_group"], "sort": int(num(r.get("sort_order"))), "cs": int(num(r.get("culture_sort_order")))}
    if not facinfo: sys.exit("Aucune faction trouvée (tables custom_battle_factions / factions / cultures_subcultures ?)")
    used_groups = {i["group"] for i in facinfo.values()}
    perm_of = defaultdict(set)  # permissions de bataille personnalisée (seigneurs, héros et unités par faction)
    for r in T.get("units_custom_battle_permissions", []):
        pu, pf = col(r, "perm_unit"), col(r, "perm_faction")
        if pu and pf in facinfo: perm_of[pu].add(pf)

    units, warn = [], defaultdict(int)
    for mu in T["main_units"]:
        key = mu.get("unit")
        lu = land.get(col(mu, "land_unit") or "")
        if not key or not lu: continue
        caste = (col(mu, "caste") or "").lower()
        if caste in ("lord", "hero") and a.no_heroes: continue
        ugroups = sorted(groups_of.get(key, set()) & used_groups)
        if not ugroups and key not in perm_of: warn["sans_faction"] += 1; continue

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
            "groups": ugroups, "facs": sorted(perm_of.get(key, ())) if caste not in ("lord", "hero") else [],
            "cultures": sorted({facinfo[f]["culture"] for f in perm_of.get(key, ())}) if caste in ("lord", "hero") else [],
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

    names = {f: loc.get(f"factions_screen_name_{f}") or humanise(f) for f in facinfo}
    dup = defaultdict(list)
    for f, n in names.items(): dup[n].append(f)
    for n, fs_ in dup.items():
        if len(fs_) > 1:
            cs = [facinfo[f]["culture"] for f in fs_]  # homonymes : on précise la race, sinon la fin de la clé
            for f in fs_:
                suffix = CULTURE_FR.get(facinfo[f]["culture"], "") if len(set(cs)) == len(cs) else f.split("_", 2)[-1]
                names[f] = f"{n} ({suffix})"
    cult_keys = sorted({i["culture"] for i in facinfo.values()}, key=lambda c: min(i["cs"] for i in facinfo.values() if i["culture"] == c))
    cultures = {c: CULTURE_FR.get(c) or humanise(c) for c in cult_keys}
    flags = {f: (fac_rows.get(f, {}).get("flags_path") or "").replace("\\", "/") for f in facinfo}
    out = {"demo": False, "cultures": cultures, "cultureOrder": cult_keys, "factions": names, "facInfo": facinfo, "flags": flags, "units": units}
    factions = names
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, "units.json"), "w", encoding="utf-8") as f: json.dump(out, f, ensure_ascii=False, indent=1)
    with open(os.path.join(a.out, "units.js"), "w", encoding="utf-8") as f: f.write("window.TWW3_DATA=" + json.dumps(out, ensure_ascii=False) + ";")
    print(f"{len(units)} unités, {len(factions)} factions -> {os.path.abspath(a.out)}")
    for k, v in warn.items(): print(f"  ⚠ {k}: {v} unités (colonne introuvable ? lance --inspect)")

if __name__ == "__main__": main()
