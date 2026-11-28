#!/usr/bin/env python3
"""Capacités PASSIVES des unités : leurs modificateurs de stats sont intégrés aux stats des unités (comme en bataille), les valeurs de la carte de jeu restent dans `base`.

Chaîne : main_units.land_unit -> land_units_to_unit_abilites_junctions -> unit_special_abilities (passive = true) -> special_ability_to_special_ability_phase_junctions (phase sur soi, durée −1)
-> special_ability_phase_stat_effects (stat, valeur, « add » ou « mult »).
Écartées : les passifs à INTENSITÉ (special_ability_intensity_settings : temps en mêlée, victimes faites…), à condition d'usage (special_ability_to_invalid_usage_flags) et les phases limitées dans le temps,
qui ne sont pas des bonus permanents ; « Blessures » (wh3_main_unit_passive_single_entity, monstres et seigneurs : malus de dégâts et de vitesse qui croît avec les blessures) est appliquée À MOITIÉ (moyenne sur un combat).
Vérifié en jeu : la carte des Flagellants affiche 32 d'attaque (valeur du dump) alors que « Frénésie » donne +10 : les passifs ne sont pas dans les stats affichées.
Ordre : (base + somme des « add ») × produit des « mult ». Champs ajoutés : `pas` = [[clé de capacité, [[stat, valeur, mode]…]]…] et `base` = valeurs de la carte (seulement si quelque chose change).
"""
import csv, os, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

HALF = {"wh3_main_unit_passive_single_entity"}            # malus qui croît avec les blessures : appliqué à moitié

def build(T):
    """Retourne {id d'unité: [[clé de capacité, [[stat, valeur, mode], ...]], ...]} pour les passifs permanents sur soi."""
    lu2ab = defaultdict(set)
    for r in T.get("land_units_to_unit_abilites_junctions", []): lu2ab[r["land_unit"]].add(r["ability"])
    mu = {r["unit"]: r["land_unit"] for r in T.get("main_units", []) if r.get("unit")}
    sa = {r["key"]: r for r in T.get("unit_special_abilities", []) if r.get("key")}
    ph = {r["id"]: r for r in T.get("special_ability_phases", []) if r.get("id")}
    jun = defaultdict(list)
    for r in T.get("special_ability_to_special_ability_phase_junctions", []): jun[r["special_ability"]].append(r)
    stat = defaultdict(list)
    for r in T.get("special_ability_phase_stat_effects", []): stat[r["phase"]].append(r)
    inten = {r["ability"] for r in T.get("special_ability_intensity_settings", []) if r.get("ability")}
    flags = {r["special_ability"] for r in T.get("special_ability_to_invalid_usage_flags", []) if r.get("special_ability")}
    ability = {}
    for a, s in sa.items():
        if s.get("passive") != "true" or a in inten or a in flags: continue
        effs = []
        for j in jun.get(a, []):
            if j.get("target_self") != "true" or j.get("target_enemies") == "true" or j.get("target_friends") == "true": continue
            p = ph.get(j["phase"])
            if not p or p.get("duration") not in ("-1", "-1.0000", "-1.0"): continue
            for e in stat.get(p["id"], []):
                try: effs.append([e["stat"], float(e["value"]), e["how"]])
                except ValueError: pass
        if effs: ability[a] = effs
    out = {}
    for uid, lu in mu.items():
        l = [[a, ability[a]] for a in sorted(lu2ab.get(lu, ())) if a in ability]
        if l: out[uid] = l
    return out

RES = {"stat_resistance_physical": "ph", "stat_resistance_all": "all", "stat_resistance_magic": "ma", "stat_resistance_missile": "mi", "stat_resistance_flame": "fl"}

def apply(units, pas):
    """Intègre les passifs aux unités (en place) ; `base` garde les valeurs de la carte de jeu."""
    n = 0
    for u in units:
        if "base" in u:                                          # idempotent : on repart des valeurs de la carte
            b = u["base"]; u["ma"], u["md"], u["ld"], u["charge"], u["speed"], u["armour"] = b["ma"], b["md"], b["ld"], b["charge"], b["speed"], b["armour"]
            if b.get("mass") is not None: u["mass"] = b["mass"]
            u["melee"]["dmg"], u["melee"]["ap"] = b["dmg"], b["ap"]
            if u.get("ranged") and "rdmg" in b:
                u["ranged"]["dmg"], u["ranged"]["ap"] = b["rdmg"], b["rap"]
                if b.get("range") is not None: u["ranged"]["range"] = b["range"]
            if "res" in b: u["res"] = b["res"]
            else: u.pop("res", None)
            del u["base"]
        u.pop("pas", None)
        lst = pas.get(u["id"])
        if not lst: continue
        add, mul = defaultdict(float), defaultdict(lambda: 1.0)
        for a, effs in lst:
            for stat, v, how in effs:
                if a in HALF:
                    if how == "mult": v = 1 + (v - 1) / 2
                    else: v = v / 2
                if how == "add": add[stat] += v
                else: mul[stat] *= v
        def val(base, a_stat, m_stat=None):
            return (base + add.get(a_stat, 0)) * mul.get(m_stat or a_stat, 1.0)
        m, r = dict(u["melee"]), (dict(u["ranged"]) if u.get("ranged") else None)
        base = {"res": dict(u["res"]) if u.get("res") else None, "ma": u["ma"], "md": u["md"], "ld": u["ld"], "charge": u["charge"], "speed": u["speed"], "armour": u["armour"], "dmg": m["dmg"], "ap": m["ap"], "mass": u.get("mass")}
        if r: base["rdmg"] = r["dmg"]; base["rap"] = r["ap"]; base["range"] = r.get("range")
        new_ma = (u["ma"] + add.get("stat_melee_attack", 0)) * mul.get("stat_melee_attack", 1.0)
        changed = False
        def setf(obj, key, v):
            nonlocal changed
            v = round(v, 3)
            if abs(v - obj[key]) > 1e-9: obj[key] = v; changed = True
        setf(u, "ma", new_ma)
        setf(u, "md", u["md"] + add.get("stat_melee_defence", 0))
        setf(u, "ld", u["ld"] + add.get("stat_morale", 0))
        setf(u, "charge", u["charge"] * mul.get("stat_charge_bonus", 1.0))
        setf(u, "speed", u["speed"] * mul.get("scalar_speed", 1.0))
        if add.get("stat_armour"): setf(u, "armour", min(100, u["armour"] + add["stat_armour"]) if u["armour"] < 100 else u["armour"])
        if u.get("mass") and mul.get("stat_mass", 1.0) != 1.0: setf(u, "mass", u["mass"] * mul["stat_mass"])
        mm = u["melee"]
        setf(mm, "dmg", (mm["dmg"] + add.get("stat_melee_damage_base", 0)) * mul.get("stat_melee_damage_base", 1.0))
        setf(mm, "ap", (mm["ap"] + add.get("stat_melee_damage_ap", 0)) * mul.get("stat_melee_damage_ap", 1.0))
        if u.get("ranged"):
            rr = u["ranged"]
            setf(rr, "dmg", rr["dmg"] * mul.get("scalar_missile_damage_base", 1.0)); setf(rr, "ap", rr["ap"] * mul.get("scalar_missile_damage_ap", 1.0))
            if mul.get("scalar_missile_range", 1.0) != 1.0 and rr.get("range"): setf(rr, "range", rr["range"] * mul["scalar_missile_range"])
        res_add = {RES[s]: v for s, v in add.items() if s in RES}
        if res_add:
            res = dict(u.get("res") or {})
            for k, v in res_add.items(): res[k] = round(res.get(k, 0) + v, 3)
            if res != (u.get("res") or {}): u["res"] = res; changed = True
        if changed:
            u["base"] = {k: v for k, v in base.items() if v is not None}
            u["pas"] = lst; n += 1
        else: u["pas"] = lst
    return n
