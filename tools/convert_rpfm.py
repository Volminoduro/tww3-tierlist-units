#!/usr/bin/env python3
"""Convertit des tables exportées avec RPFM (TSV) en data/units.js pour le site.

Usage :
  python tools/convert_rpfm.py --inspect DOSSIER_TSV      # liste tables/colonnes trouvées
  python tools/convert_rpfm.py DOSSIER_TSV                # génère data/units.js + units.json

Le script a été écrit SANS accès aux fichiers du jeu : les noms de colonnes
candidats sont listés dans CANDIDATES. Si une stat sort vide/0, lance --inspect,
repère le vrai nom de colonne et ajoute-le à la liste correspondante.
"""
import argparse, csv, json, math, os, re, subprocess, sys
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
CULTURE_EN = {"wh_main_grn_greenskins": "Greenskins", "wh_dlc08_nor_norsca": "Norsca", "wh2_main_skv_skaven": "Skaven",
    "wh_main_chs_chaos": "Warriors of Chaos", "wh3_main_ogr_ogre_kingdoms": "Ogre Kingdoms", "wh_main_emp_empire": "Empire",
    "wh_dlc05_wef_wood_elves": "Wood Elves", "wh2_main_def_dark_elves": "Dark Elves", "wh2_main_lzd_lizardmen": "Lizardmen",
    "wh_main_dwf_dwarfs": "Dwarfs", "wh2_main_hef_high_elves": "High Elves", "wh_main_brt_bretonnia": "Bretonnia",
    "wh_main_vmp_vampire_counts": "Vampire Counts", "wh_dlc03_bst_beastmen": "Beastmen", "wh3_main_cth_cathay": "Grand Cathay",
    "wh2_dlc09_tmb_tomb_kings": "Tomb Kings", "wh2_dlc11_cst_vampire_coast": "Vampire Coast", "wh3_main_kho_khorne": "Khorne",
    "wh3_main_tze_tzeentch": "Tzeentch", "wh3_main_ksl_kislev": "Kislev", "wh3_main_nur_nurgle": "Nurgle", "wh3_main_sla_slaanesh": "Slaanesh",
    "wh3_dlc23_chd_chaos_dwarfs": "Chaos Dwarfs", "wh3_main_dae_daemons": "Daemons of Chaos", "wh3_dlc29_nag_undead_legions": "Undead Legions"}
SPEED_UI = 10  # vitesse de la carte d'unité du jeu = vitesse de course brute × 10 (ex. 3.0 -> 30)

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
          "custom_battle_factions", "units_to_groupings_military_permissions",
          # montures des seigneurs/héros (unité de base -> unité montée) : nom localisé de la monture pour les noms français
          "units_custom_battle_mounts",
          # effets par défaut des seigneurs (tools/effects_extract.py)
          "agent_subtypes", "faction_starting_general_effects", "effect_bundles_to_effects_junctions", "character_skill_nodes",
          "character_skill_node_sets", "character_skill_node_set_items", "character_skill_node_links", "character_skill_level_to_effects_junctions",
          "effect_bonus_value_ids_unit_sets", "unit_set_to_unit_junctions", "frontend_faction_leaders",
          # véhicules / artillerie (machines) et dégâts d'explosion des projectiles
          "battlefield_engines", "projectiles_explosions",
          # DLC : unité -> paquets de contenu -> ensembles d'exigences -> produits (jeux et DLC)
          "main_unit_ownership_content_pack_junctions", "unit_attributes_to_groups_junctions", "ownership_content_pack_requirements", "ownership_content_pack_required_products", "ownership_products",
          # capacités passives de soin (régénération) : unité -> capacité -> phase -> soin
          "land_units_to_unit_abilites_junctions", "unit_special_abilities", "special_ability_to_special_ability_phase_junctions", "special_ability_phases", "special_ability_phase_stat_effects"}

def load_tables(root, only_needed=False):
    tables = defaultdict(list)
    for dp, _, fs in os.walk(root):
        for fn in fs:
            if fn.lower().endswith(".tsv"):
                p = os.path.join(dp, fn)
                if only_needed:
                    name = norm_table(p) if "_tables" in p.lower() else fn.lower()
                    if not (name in NEEDED or name.startswith("land_units__") or name.startswith("factions__") or name.startswith("effects__") or name.startswith("character_skills__") or name.startswith("ownership_products__") or name.startswith("units_custom_battle_mounts__")): continue
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

def provenance(src, units):
    """Provenance des données : dépôt source, commit (si le dossier est un dépôt git), version du jeu (text/build_info)."""
    meta = {"source": "Shazbot/wh3-dump", "sourceUrl": "https://github.com/Shazbot/wh3-dump", "units": len(units)}
    def git(*args):
        try: return subprocess.run(["git", "-C", src, *args], capture_output=True, text=True, timeout=20).stdout.strip()
        except Exception: return ""
    c = git("log", "-1", "--format=%H|%cI|%s")
    if c.count("|") >= 2: h, d, subj = c.split("|", 2); meta.update({"commit": h, "commitDate": d, "commitSubject": subj})
    try:
        lines = open(os.path.join(src, "text", "build_info"), encoding="utf-8").read().splitlines()
        meta.update({"patch": lines[2] if len(lines) > 2 else "", "build": lines[4] if len(lines) > 4 else "", "buildDate": lines[6] if len(lines) > 6 else ""})
    except OSError: pass
    return meta

def read_loc_binary(path):
    """Lit un fichier .loc binaire de Total War (extrait d'un pack sans conversion) : [BOM FF FE] « LOC\\0 », version u32, nombre d'entrées u32,
    puis pour chaque entrée : clé (u16 = nombre de caractères, UTF-16LE), texte (idem), indicateur d'info-bulle (1 octet)."""
    import struct
    b = open(path, "rb").read(); i = b.find(b"LOC\x00")
    if i < 0 or i > 8: raise ValueError(f"{path} : en-tête LOC introuvable")
    ver, n = struct.unpack_from("<II", b, i + 4); pos = i + 12; out = []
    for _ in range(n):
        k_len = struct.unpack_from("<H", b, pos)[0]; pos += 2; key = b[pos:pos + 2 * k_len].decode("utf-16-le"); pos += 2 * k_len
        t_len = struct.unpack_from("<H", b, pos)[0]; pos += 2; txt = b[pos:pos + 2 * t_len].decode("utf-16-le"); pos += 2 * t_len
        pos += 1                                                          # info-bulle
        out.append((key, txt))
    return out

def humanise(k):
    k = re.sub(r"^wh\d?_(main|dlc\d+|pro\d+)_[a-z]{3}_", "", k)
    return k.replace("_", " ").title()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("--inspect", action="store_true")
    ap.add_argument("--no-heroes", action="store_true", help="exclut seigneurs et héros")
    ap.add_argument("--loc-fr", help="dossier contenant la localisation FRANÇAISE du jeu exportée avec RPFM (land_units__.loc.tsv, factions__.loc.tsv) : génère data/names_fr.js")
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
    engines_t = index(T.get("battlefield_engines", []), "key")
    explo = index(T.get("projectiles_explosions", []), "key")
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

    # Régénération : capacités passives sans durée (wh_main_unit_passive_regeneration, …) -> fraction des PV max rendue par seconde (heal_amount ÷ hp_change_frequency)
    # Les autres soins passifs (la Faim des vampires, bonus de seigneur, objets…) sont conditionnels ou temporaires : ils ne sont pas pris en compte.
    REGEN_ABILITIES = {"wh_main_unit_passive_regeneration", "wh2_dlc15_unit_passive_regeneration_map", "wh2_dlc17_unit_passive_horrible_regeneration"}
    phases_t = index(T.get("special_ability_phases", []), "id")
    regen_of_ability = {}
    for j in T.get("special_ability_to_special_ability_phase_junctions", []):
        ab_k = j.get("special_ability")
        if ab_k not in REGEN_ABILITIES: continue
        ph = phases_t.get(j.get("phase"), {})
        freq, heal = num(ph.get("hp_change_frequency"), 1) or 1, num(ph.get("heal_amount"))
        if heal > 0 and num(ph.get("duration"), -1) < 0: regen_of_ability[ab_k] = regen_of_ability.get(ab_k, 0) + heal / freq
    # Résistance au feu : effets de stat des phases des capacités passives sans durée (stat_resistance_flame > 0 : moins de dégâts de feu ; stat_weakness_flame < 0 : plus de dégâts,
    # ex. la régénération donne −20 : « une bénédiction freinée par le feu »). On les additionne pour l'unité ; les attaques enflammées (ignition_amount > 0) en tiennent compte.
    flame_of_phase = defaultdict(float)
    for r in T.get("special_ability_phase_stat_effects", []):
        if r.get("stat") in ("stat_resistance_flame", "stat_weakness_flame") and (r.get("how") or "add") == "add": flame_of_phase[r.get("phase")] += num(r.get("value"))
    passive_ab = {r.get("key") for r in T.get("unit_special_abilities", []) if (r.get("passive") or "").lower() == "true"}
    flame_of_ability = defaultdict(float)
    for j in T.get("special_ability_to_special_ability_phase_junctions", []):
        ph = phases_t.get(j.get("phase"), {})
        if j.get("special_ability") in passive_ab and num(ph.get("duration"), -1) < 0 and flame_of_phase.get(j.get("phase")):
            flame_of_ability[j["special_ability"]] += flame_of_phase[j["phase"]]
    flame_of_land = defaultdict(float)
    for r in T.get("land_units_to_unit_abilites_junctions", []):
        if r.get("ability") in flame_of_ability: flame_of_land[r.get("land_unit")] += flame_of_ability[r["ability"]]
    regen_of_land = defaultdict(float)
    for r in T.get("land_units_to_unit_abilites_junctions", []):
        if r.get("ability") in regen_of_ability: regen_of_land[r.get("land_unit")] = max(regen_of_land[r.get("land_unit")], regen_of_ability[r["ability"]])

    def body(e):
        """Taille du corps du modèle principal (battle_entities) : demi-largeur rw et périmètre per, pour la surface de contact en mêlée.
        cercle : rayon = radius ; ellipse / capsule : radius = demi-longueur, radii_ratio × radius = demi-largeur."""
        R = num(e.get("radius"))
        if R <= 0: return 0.0, 0.0
        shape = (e.get("shape") or "circle").lower(); k = num(e.get("radii_ratio"), 1) or 1
        if shape == "circle" or k >= 1 and shape == "ellipse": return round(R, 3), round(2 * math.pi * R, 3)
        w = min(R, R * k)
        if shape == "capsule": return round(w, 3), round(4 * (R - w) + 2 * math.pi * w, 3)
        a, b = R, w; h = ((a - b) / (a + b)) ** 2     # ellipse : approximation de Ramanujan
        return round(b, 3), round(math.pi * (a + b) * (1 + 3 * h / (10 + math.sqrt(4 - 3 * h))), 3)

    # Attributs de charge (unit_attributes) : land_units.attribute_group -> unit_attributes_to_groups_junctions
    CHARGE_ATTRS = {"charge_defense", "charge_defense_vs_large", "charge_reflection", "ogre_charge", "ogre_charge_upgraded", "mounted_fire_move", "causes_fear", "causes_terror", "immune_to_psychology", "unbreakable"}   # + psychologie (peur, terreur, immunité, indémoralisable)   # + tir en mouvement (cavalerie à arc)
    attrs_of_group = defaultdict(set)
    for r in T.get("unit_attributes_to_groups_junctions", []):
        if r.get("attribute") in CHARGE_ATTRS: attrs_of_group[r.get("attribute_group")].add(r["attribute"])
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
        eng = engines_t.get(lu.get("engine") or "")            # machine : canon, char, véhicule
        eent = ents.get(eng.get("battle_entity", ""), {}) if eng else {}
        n_eng = num(lu.get("num_engines")) if eng else 0
        men_fight = men                                         # modèles qui combattent (= men, sauf équipage de monstre)
        soldier_hp, bonus_hp = num(col(ent, "entity_hp")), num(col(lu, "hp_bonus"))
        mount_hp, n_mount = num(col(ment, "entity_hp")), num(col(lu, "mounts"))
        # PV totaux selon les formules de la fiche d'unité (cf. page « Méthode ») puis ramenés à un PV par modèle combattant
        if eng and n_eng > 0 and eng.get("missile_weapon"):    # artillerie : (équipage + pièces) × bonus + équipage × PV soldat + pièces × PV pièce
            guns, crew = n_eng, max(0.0, men - n_eng)
            total_hp = (crew + guns) * bonus_hp + crew * soldier_hp + guns * num(col(eent, "entity_hp"))
        elif eng and n_eng > 0:                                 # char / véhicule : (équipage + machines tractées) × PV soldat + machines × (PV machine + bonus) + bêtes de trait
            drawn = n_eng if n_mount > 0 else 0
            total_hp = (men + drawn) * soldier_hp + n_eng * (num(col(eent, "entity_hp")) + bonus_hp) + n_mount * mount_hp
        elif n_mount > 0:                                       # montés : montures × (PV monture + bonus) + hommes × PV soldat (= (soldat + monture + bonus) × modèles quand montures = hommes)
            total_hp = n_mount * (mount_hp + bonus_hp) + men * soldier_hp
            if n_mount < men: men_fight = n_mount               # monstre portant un équipage : le bonus va au monstre une seule fois ; l'équipage compte dans les PV mais seul le monstre combat
        else:                                                   # cas général : (PV soldat + bonus) × modèles
            total_hp = men * (soldier_hp + bonus_hp)
        if "steam_tank" in key and caste == "chariot" and men_fight == 3: men_fight = 1   # le Tank à vapeur est UN seul modèle en jeu (num_men = 3 compte l'équipage) ; PV totaux inchangés
        hp = total_hp / men_fight if men_fight else 0
        # vitesse de la carte = vitesse de course (ou de vol si plus élevée) de la monture, de la machine ou du soldat, × 10
        sp_ent = ment if ment else (eent if eng else ent)
        speed_card = SPEED_UI * max(num(col(sp_ent, "speed")), num(sp_ent.get("fly_speed")))
        a_raw = col(lu, "armour")
        armour = num(a_raw) if a_raw and re.fullmatch(r"[\d.,]+", a_raw) else num(col(arm.get(a_raw, {}), "armour") if a_raw in arm else None)
        mw = melee.get(col(lu, "melee_weapon") or "", {})
        ms = missile.get((eng.get("missile_weapon") if eng and eng.get("missile_weapon") else col(lu, "missile_weapon")) or "", {})
        pj = proj.get(col(ms, "m_projectile") or "", {})
        u = {
            "id": key,
            # certains noms sont des renvois « {{tr:autre_clé}} » vers une autre entrée de localisation
            "name": (lambda v: loc.get(v[5:-2]) if v and v.startswith("{{tr:") else v)(loc.get(f"land_units_onscreen_name_{col(mu,'land_unit')}")) or humanise(key),
            "role": None, "group": col(mu, "group") or "",
            "men": men_fight, "hp": hp, "armour": armour,
            "ma": num(col(lu, "ma")), "md": num(col(lu, "md")),
            "charge": num(col(lu, "charge")), "ld": num(col(lu, "morale")),
            "speed": speed_card,
            "acc": num(col(lu, "acc")), "rd": num(lu.get("rank_depth")), "rw": body(sp_ent)[0], "per": body(sp_ent)[1], "mass": round(num(sp_ent.get("mass")), 1), "caste": caste, "cat": lu.get("category", ""), "cls": lu.get("class", ""),
            "melee": {"dmg": num(col(mw, "w_dmg")), "ap": num(col(mw, "w_ap")),
                      "interval": num(col(mw, "w_interval"), 5) or 5,
                      "bvi": num(col(mw, "w_bvi")), "bvl": num(col(mw, "w_bvl")), "fl": 1 if num(mw.get("ignition_amount")) > 0 else 0, "mg": 1 if (mw.get("is_magical") or "").lower() == "true" else 0},
            "ranged": None,
            "cost": num(col(mu, "cost")), "upkeep": num(col(mu, "upkeep")),
            "mpCost": num(col(mu, "mp_cost")),
            "recruitTurns": num(col(mu, "recruit_turns"), 1),
            "tier": num(col(mu, "tier")),
            "mount": col(lu, "mount") or "",
            **({"at": sorted(attrs_of_group[lu.get("attribute_group")])} if attrs_of_group.get(lu.get("attribute_group")) else {}),
            # Bataillon de renom : drapeau is_renown de main_units ou clé en « _ror » ; hors seigneurs/héros, unités « boss » et dragons de monture d'Imrik / barge de Grungni (montures de seigneurs)
            **({"ror": 1} if ((mu.get("is_renown") or "").lower() == "true" or re.search(r"_ror(_|$)", key)) and caste not in ("lord", "hero") and "_boss" not in key and not re.search(r"_imrik|thunderbarge_grungni", key) else {}),
            "regen": round(regen_of_land.get(col(mu, "land_unit"), 0), 5), "res": {"ph": num(lu.get("damage_mod_physical")), "mi": num(lu.get("damage_mod_missile")), "ma": num(lu.get("damage_mod_magic")),
                    "fl": num(lu.get("damage_mod_flame")) + flame_of_land.get(col(mu, "land_unit"), 0), "all": num(lu.get("damage_mod_all"))},
            "groups": ugroups, "facs": sorted(perm_of.get(key, ())) if caste not in ("lord", "hero") else [],
            "cultures": sorted({facinfo[f]["culture"] for f in perm_of.get(key, ())}) if caste in ("lord", "hero") else [],
        }
        if pj:
            # dégâts par projectile = base + dégâts d'explosion ; projectiles par volée = nombre × tirs × rafale ; munitions de la carte = volées = munitions ÷ tirs par volée
            ex = explo.get(pj.get("explosion_type", ""), {})
            spv = max(1.0, num(pj.get("shots_per_volley"), 1))
            volley = max(1.0, num(pj.get("projectile_number"), 1)) * spv * max(1.0, num(pj.get("burst_size"), 1))
            reload_ = num(col(pj, "m_reload"))
            if reload_ > 0:  # sans temps de rechargement dans la table, la fiche n'indique ni rechargement ni DPS : on n'invente rien
                u["ranged"] = {"dmg": num(col(pj, "w_dmg")) + num(ex.get("detonation_damage")), "ap": num(col(pj, "w_ap")) + num(ex.get("detonation_damage_ap")),
                               "range": num(col(pj, "p_range")), "shots": volley, "reload": reload_,
                               "ammo": round(num(col(lu, "ammo")) / spv, 2),
                               "share": round(n_eng / men, 4) if eng and n_eng > 0 and men else 1,
                               "fl": 1 if max(num(pj.get("ignition_amount")), num(ex.get("ignition_amount"))) > 0 else 0,
                               "mg": 1 if "true" in ((pj.get("is_magical") or "").lower(), (ex.get("is_magical") or "").lower()) else 0}   # part des modèles qui tirent (pièces d'artillerie)
            else: warn["tir_sans_rechargement"] += 1
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
    cultures_en = {c: CULTURE_EN.get(c) or humanise(c) for c in cult_keys}
    # seigneurs/héros sans permission de bataille personnalisée : rattachés à leur race par le préfixe de leur clé (ex. wh2_dlc14_def_cha_... -> « def » -> Elfes Noirs)
    code2cul = {c.split("_")[2]: c for c in cult_keys if len(c.split("_")) > 2}
    fixed = 0
    for u in units:
        parts = u["id"].split("_")
        if u["role"] in ("lord", "hero") and not u["cultures"] and len(parts) > 2 and parts[2] in code2cul:
            u["cultures"] = [code2cul[parts[2]]]; fixed += 1
    print(f"  {fixed} seigneurs/héros sans race rattachés par leur préfixe de clé")
    # --- Doublons : même nom dans une même faction/race ---
    # 1) fusion des unités strictement identiques (mêmes stats : ex. les copies « _mp » de la bataille multijoueur) ; on garde la clé sans « _mp » et on réunit leurs factions
    # 2) les variantes réellement différentes (monture, version 0/1/2…) reçoivent un suffixe tiré de leur clé : « Neferata (Barded Nightmare) », « Arkhan the Black (#2) »
    SIGF = ("hp", "men", "armour", "ma", "md", "charge", "ld", "speed", "melee", "ranged", "cost", "mpCost", "role", "regen", "res", "upkeep", "recruitTurns", "rw", "per")
    sig = lambda u: json.dumps([u.get(k) for k in SIGF], sort_keys=True)
    by_name = defaultdict(list)
    for u in units: by_name[u["name"]].append(u)
    removed = {}
    for n, lst in by_name.items():
        seen = {}
        for u in sorted(lst, key=lambda x: (x["id"].endswith("_mp"), x["id"])):
            k = sig(u)
            if k in seen:
                keep = seen[k]
                for f in ("groups", "facs", "cultures"): keep[f] = sorted(set(keep[f]) | set(u[f]))
                removed[u["id"]] = keep["id"]
            else: seen[k] = u
    units = [u for u in units if u["id"] not in removed]
    by_name = defaultdict(list)
    for u in units: by_name[u["name"]].append(u)
    labelled = 0; vlabels = {}                      # suffixe de variante ajouté au nom (réutilisé pour les noms français)
    vrace = {}                                      # suffixe = race d'origine (clé de culture), traduit pour les noms français
    # Nom anglais officiel de la monture (text/db/units_custom_battle_mounts__.loc.tsv) : « Barded Nightmare », « Chaos Steed »…
    # plutôt que la clé technique (« Barded Nightmare Hero », « Chaos Steed Lords »).
    _mloc = {r.get("key"): r.get("text") or "" for r in T.get("units_custom_battle_mounts__.loc", [])}
    def _mres(v):
        for _ in range(5):
            if not (v and v.startswith("{{tr:") and v.endswith("}}")): break
            v = _mloc.get(v[5:-2])
        return re.sub(r"\s+", " ", re.sub(r"\\+n|\n", " ", v or "")).strip()
    en_mount = {}
    for r in T.get("units_custom_battle_mounts", []):
        nm = _mres(_mloc.get(f"units_custom_battle_mounts_mount_name_{r.get('base_unit')}{r.get('mounted_unit')}"))
        if nm and r.get("mounted_unit"): en_mount.setdefault(r["mounted_unit"], nm)
    for n, lst in by_name.items():
        if len(lst) < 2: continue
        ctx = lambda u: set(u["groups"]) | set(u["facs"]) | set(u["cultures"])
        conf = [u for u in lst if any(v is not u and ctx(u) & ctx(v) for v in lst)]   # seules les unités qui se retrouvent dans une même faction/race sont renommées
        if len(conf) < 2: continue
        def core(k):                                     # retire le préfixe d'extension (wh2_dlc09_, wh3_main_, wh3_dlc29_…) pour comparer les clés
            t = k.split("_")
            if t and re.fullmatch(r"wh\d*", t[0]): t = t[1:]
            if t and re.fullmatch(r"main|dlc\d+|pro\d+|twa\d+|survival|cp\d+", t[0]): t = t[1:]
            return t
        toks = [core(u["id"]) for u in conf]
        pre = 0
        while all(len(t) > pre for t in toks) and len({t[pre] for t in toks}) == 1: pre += 1
        races = {t[0] for t in toks if t}
        for u, t in zip(conf, toks):
            # Même nom, races d'origine différentes (ex. Squelettes des Rois des Tombes « tmb » et des Comtes Vampires « vmp »,
            # recrutables ensemble par l'Ost de Nagash) : le suffixe est le nom de la race, pas la clé technique.
            # Plusieurs variantes de la même race : on ajoute la monture (« Guerriers du Chaos, Manticore »).
            if pre == 0 and len(races) > 1 and t and t[0] in code2cul:
                c = code2cul[t[0]]
                mt = [x for x in core(u.get("mount") or "") if x not in ("mnt", "mount")]
                mt = en_mount.get(u["id"]) or (" ".join(mt[1:] if len(mt) > 1 and len(mt[0]) == 3 else mt).title() if mt else "")
                lab = cultures_en[c] + (f", {mt}" if mt else "")
                u["name"] = f"{n} ({lab})"; vlabels[u["id"]] = lab; vrace[u["id"]] = (c, mt); labelled += 1
                continue
            rest = [x for x in t[pre:] if x != "mp"]
            if not rest: continue                                     # version de base : garde le nom simple
            if all(x.isdigit() for x in rest):                # variantes numérotées (_0 … _5) : en pratique des montures différentes ; sinon #N
                mt = core(u.get("mount") or "")
                mt = [x for x in mt if x not in ("mnt", "mount")]
                lab = en_mount.get(u["id"]) or (" ".join(mt[1:] if len(mt) > 1 and len(mt[0]) == 3 else mt).title() if mt else "")
                if not lab and int("".join(rest)) > 0: lab = "#" + str(int("".join(rest)) + 1)
            else: lab = " ".join(x for x in rest if not x.isdigit()).title()
            if lab: u["name"] = f"{n} ({lab})"; vlabels[u["id"]] = lab; labelled += 1
    # les rares noms encore identiques dans une même faction reçoivent #2, #3…
    by_name = defaultdict(list)
    for u in units: by_name[u["name"]].append(u)
    for n, lst in by_name.items():
        if len(lst) < 2: continue
        for i, u in enumerate(sorted(lst, key=lambda x: x["id"])):
            if i and any(v is not u and (set(u["groups"]) | set(u["facs"]) | set(u["cultures"])) & (set(v["groups"]) | set(v["facs"]) | set(v["cultures"])) for v in lst): u["name"] = f"{n} (#{i + 1})"; vlabels[u["id"]] = f"#{i + 1}"; labelled += 1
    print(f"  doublons : {len(removed)} unités identiques fusionnées, {labelled} variantes renommées")
    # --- DLC : un paquet de contenu est disponible si TOUS les produits d'au moins un de ses ensembles d'exigences sont possédés ; une unité est disponible si AU MOINS un de ses paquets l'est
    #     (une même unité peut venir de plusieurs DLC) ; une unité sans paquet (base, gratuite, invoquée) est toujours disponible.
    prods = {}
    for r in T.get("ownership_products", []):
        k = r.get("key")
        if k: prods[k] = {"n": loc.get("ownership_products_description_" + k) or humanise(k), "o": int(num(r.get("release_order"))), "free": 1 if (r.get("is_flc") or "").lower() == "true" else 0, "twa": 1 if (r.get("is_twa") or "").lower() == "true" else 0, "sid": (r.get("steam_store_id") or r.get("steam_app_id") or "").strip()}
    req_prod = defaultdict(list)
    for r in T.get("ownership_content_pack_required_products", []): req_prod[r.get("requirement_set")].append(r.get("product"))
    pack_sets = defaultdict(list)
    for r in T.get("ownership_content_pack_requirements", []):
        ps = sorted(set(req_prod.get(r.get("key"), [])))
        if ps and ps not in pack_sets[r.get("content_pack")]: pack_sets[r.get("content_pack")].append(ps)
    unit_packs = defaultdict(set)
    for r in T.get("main_unit_ownership_content_pack_junctions", []): unit_packs[r.get("main_unit")].add(r.get("ownership_content_pack"))
    used_packs = sorted({p for u in units for p in unit_packs.get(u["id"], ()) if pack_sets.get(p)})
    pidx = {p: i for i, p in enumerate(used_packs)}
    removed_to = removed
    for u in units:
        ids_ = {u["id"]} | {k for k, v in removed_to.items() if v == u["id"]}      # une unité fusionnée garde les paquets de ses copies
        pk = sorted({pidx[p] for i_ in ids_ for p in unit_packs.get(i_, ()) if p in pidx})
        if pk: u["pk"] = pk
    dlc = {"products": prods, "packs": [pack_sets[p] for p in used_packs]}
    print(f"  DLC : {len(prods)} produits, {len(used_packs)} paquets, {sum(1 for u in units if u.get('pk'))} unités liées")
    flags = {f: (fac_rows.get(f, {}).get("flags_path") or "").replace("\\", "/") for f in facinfo}
    meta = provenance(a.src, units)
    out = {"demo": False, "meta": meta, "cultures": cultures, "culturesEn": cultures_en, "cultureOrder": cult_keys, "factions": names, "facInfo": facinfo, "flags": flags, "dlc": dlc, "units": units}
    factions = names
    from effects_extract import build_effects  # effets par défaut des seigneurs et de leur trait
    effects = build_effects(T, units, loc, facinfo)
    skills = {"sets": effects.pop("skillSets"), "lords": effects.pop("skills")}   # arbres de compétences -> data/skills.js (chargé par profile.js)
    def remap(o):                                   # les unités fusionnées (doublons identiques) renvoient à celle conservée
        if isinstance(o, dict): return {k: (removed.get(v, v) if k == "unit" and isinstance(v, str) else remap(v)) for k, v in o.items()}
        if isinstance(o, list): return [remap(x) for x in o]
        return o
    effects = remap(effects)
    if a.loc_fr:  # noms français officiels, lus dans la localisation française exportée
        _fr = {}
        def read_loc(prefix):
            # Toutes les entrées de localisation du dossier (la clé suffit à les distinguer) : soit un seul gros fichier « localisation__.loc » (cas de local_fr.pack : text/localisation__.loc),
            # soit les exports par table (land_units__.loc.tsv, factions__.loc.tsv…) ; formats lus : TSV de RPFM et .loc binaire.
            if not _fr:
                for dp, _, fs in os.walk(a.loc_fr):
                    for fn in fs:
                        path = os.path.join(dp, fn)
                        if fn.endswith(".tsv"):
                            for r in read_tsv(path):
                                if r.get("key"): _fr[r["key"]] = r.get("text", "")
                        elif fn.endswith(".loc"):
                            for k, t in read_loc_binary(path): _fr[k] = t
                print(f"  localisation française : {len(_fr)} entrées lues")
            return _fr
        fr_units, fr_fac = read_loc("land_units__"), read_loc("factions__")
        def res(v):                                  # suit les renvois {{tr:clé}} (éventuellement en chaîne)
            for _ in range(5):
                if not (v and v.startswith("{{tr:") and v.endswith("}}")): break
                v = fr_units.get(v[5:-2])
            return v
        clean = lambda s: re.sub(r"\s+", " ", re.sub(r"\\+n|\n", " ", s)).strip()   # retours à la ligne du jeu (« \n » écrit en toutes lettres) -> espace
        mount_fr = {}                                # unité montée -> nom français de la monture (« Destrier Infernal »…)
        for r in T.get("units_custom_battle_mounts", []):
            nm = res(fr_units.get(f"units_custom_battle_mounts_mount_name_{r.get('base_unit')}{r.get('mounted_unit')}"))
            if nm and r.get("mounted_unit"): mount_fr.setdefault(r["mounted_unit"], clean(nm))
        mount_of = {u["id"]: u.get("mount") or "" for u in units}
        by_mount = {}                                # clé de monture -> nom français vu sur une autre unité montée
        for r in T.get("units_custom_battle_mounts", []):
            mk = mount_of.get(r.get("mounted_unit"))
            if mk and r.get("mounted_unit") in mount_fr: by_mount.setdefault(mk, mount_fr[r["mounted_unit"]])
        def mount_label(mk):                         # même calcul que le suffixe anglais tiré de la monture (cf. plus haut)
            t = mk.split("_")
            if t and re.fullmatch(r"wh\d*", t[0]): t = t[1:]
            if t and re.fullmatch(r"main|dlc\d+|pro\d+|twa\d+|survival|cp\d+", t[0]): t = t[1:]
            t = [x for x in t if x not in ("mnt", "mount")]
            return " ".join(t[1:] if len(t) > 1 and len(t[0]) == 3 else t).title() if t else ""
        for k, lab in vlabels.items():               # suffixe anglais venu de la monture, sans nom propre à l'unité : nom de la même monture ailleurs
            mk = mount_of.get(k)
            if k in mount_fr or not mk: continue
            from_mount = lab == mount_label(mk) or k in vrace and vrace[k][1] == mount_label(mk)
            if not from_mount: continue
            if mk in by_mount: mount_fr[k] = by_mount[mk]
            elif re.fullmatch(r"Warhorse( 360| Deprecated)?", mount_label(mk)):
                mount_fr[k] = "Cheval de guerre"     # anciens chevaux sans entrée de bataille personnalisée (terme officiel du jeu)
        names_fr = {"units": {}, "factions": {}}
        unit_ids = {u["id"] for u in units}
        for mu in T["main_units"]:
            nm = res(fr_units.get(f"land_units_onscreen_name_{mu.get('land_unit')}"))
            if nm and mu.get("unit") in unit_ids:
                k = mu["unit"]   # variantes : nom français de la monture si connu, sinon même suffixe qu'en anglais
                if k in vrace:                       # race d'origine (+ monture) : « Lanciers Squelettes (Comtes Vampires) », « … (Guerriers du Chaos, Manticore) »
                    c, mt = vrace[k]; suf = cultures.get(c) or vlabels[k]
                    if mt: suf += ", " + (mount_fr.get(k) or mt)
                    names_fr["units"][k] = clean(nm) + f" ({suf})"
                else:
                    names_fr["units"][k] = clean(nm) + (f" ({mount_fr.get(k) or vlabels[k]})" if k in vlabels else "")
        print(f"  montures traduites : {sum(1 for k in vlabels if k in mount_fr and k in names_fr['units'])} sur {sum(1 for k in vlabels if k in names_fr['units'])} variantes")
        for f_ in facinfo:
            nm = fr_fac.get(f"factions_screen_name_{f_}")
            if nm: names_fr["factions"][f_] = nm
        with open(os.path.join(a.out, "names_fr.js"), "w", encoding="utf-8") as f: f.write("window.TWW3_NAMES_FR=" + json.dumps(names_fr, ensure_ascii=False) + ";")
        print(f"noms français : {len(names_fr['units'])} unités, {len(names_fr['factions'])} factions")
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, "effects.js"), "w", encoding="utf-8") as f: f.write("window.TWW3_EFFECTS=" + json.dumps(effects, ensure_ascii=False) + ";")
    with open(os.path.join(a.out, "skills.js"), "w", encoding="utf-8") as f: f.write("window.TWW3_SKILLS=" + json.dumps(skills, ensure_ascii=False, separators=(",", ":")) + ";")
    print(f"effets par défaut : {len(effects['lords'])} seigneurs, {sum(len(v) for v in effects['leaders'].values())} associations faction -> seigneur de départ")
    with open(os.path.join(a.out, "units.json"), "w", encoding="utf-8") as f: json.dump(out, f, ensure_ascii=False, indent=1)
    with open(os.path.join(a.out, "units.js"), "w", encoding="utf-8") as f: f.write("window.TWW3_DATA=" + json.dumps(out, ensure_ascii=False) + ";")
    print(f"{len(units)} unités, {len(factions)} factions -> {os.path.abspath(a.out)}")
    for k, v in warn.items(): print(f"  ⚠ {k}: {v} unités (colonne introuvable ? lance --inspect)")

if __name__ == "__main__": main()
