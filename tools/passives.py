#!/usr/bin/env python3
"""Capacités PASSIVES des unités, fournies au SIMULATEUR (sim.js) : elles ne sont PAS intégrées aux stats affichées (la carte du jeu n'en tient pas compte : Flagellants 32 d'attaque
alors que « Frénésie » donne +10) ; le simulateur les applique pendant les duels et le calcul d'armée, avec leurs conditions.

Chaîne : main_units.land_unit -> land_units_to_unit_abilites_junctions -> unit_special_abilities (passive = true) -> special_ability_to_special_ability_phase_junctions (phase de durée −1)
-> special_ability_phase_stat_effects (stat, valeur, « add » ou « mult »).
Champ `pas` d'une unité = liste d'objets : {k: clé de capacité, e: [[stat, valeur, "a"|"m"]…], t: cibles ("s" soi, "f" alliés, "e" ennemis), i: [source, type, max, défaut] (intensité, facultatif),
c: [drapeaux d'usage invalide : "moving", "health_above_50%"…] (facultatif)}.
Écartées : les phases limitées dans le temps (capacités actives) et les capacités sans effet de stat.
Les valeurs de la carte (avant passifs) n'ont plus besoin d'être conservées : `apply` restaure aussi les unités déjà modifiées par l'ancienne version (champ `base`).
"""
import os, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

KEEP_FLAGS = ("moving", "health_above", "health_below", "morale_is")

def build(T):
    """Retourne {id d'unité: [objet de capacité, …]}."""
    lu2ab = defaultdict(set)
    for r in T.get("land_units_to_unit_abilites_junctions", []): lu2ab[r["land_unit"]].add(r["ability"])
    mu = {r["unit"]: r["land_unit"] for r in T.get("main_units", []) if r.get("unit")}
    sa = {r["key"]: r for r in T.get("unit_special_abilities", []) if r.get("key")}
    ph = {r["id"]: r for r in T.get("special_ability_phases", []) if r.get("id")}
    jun = defaultdict(list)
    for r in T.get("special_ability_to_special_ability_phase_junctions", []): jun[r["special_ability"]].append(r)
    stat = defaultdict(list)
    for r in T.get("special_ability_phase_stat_effects", []): stat[r["phase"]].append(r)
    inten = {r["ability"]: r for r in T.get("special_ability_intensity_settings", []) if r.get("ability")}
    flags = defaultdict(list)
    for r in T.get("special_ability_to_invalid_usage_flags", []):
        f = r.get("invalid_usage_flag", "")
        if r.get("special_ability") and f.startswith(KEEP_FLAGS): flags[r["special_ability"]].append(f)
    ability = {}
    for a, s in sa.items():
        if s.get("passive") != "true": continue
        # une entrée par jeu de cibles (soi / alliés / ennemis) : les effets de même cible sont regroupés
        groups = defaultdict(list)
        for j in jun.get(a, []):
            p = ph.get(j["phase"])
            if not p or p.get("duration") not in ("-1", "-1.0000", "-1.0"): continue
            t = ("s" if j.get("target_self") == "true" else "") + ("f" if j.get("target_friends") == "true" else "") + ("e" if j.get("target_enemies") == "true" else "")
            if not t: continue
            for e in stat.get(p["id"], []):
                try: groups[t].append([e["stat"], round(float(e["value"]), 4), "a" if e["how"] == "add" else "m"])
                except ValueError: pass
        out = []
        for t, effs in groups.items():
            o = {"k": a, "e": effs, "t": t}
            if a in inten:
                i = inten[a]; o["i"] = [i["intensity_source"], i["intensity_type"], float(i["max_amount"] or 0), float(i["default_amount"] or 0)]
            if flags.get(a): o["c"] = sorted(set(flags[a]))
            out.append(o)
        if out: ability[a] = out
    res = {}
    for uid, lu in mu.items():
        l = [o for a in sorted(lu2ab.get(lu, ())) for o in ability.get(a, ())]
        if l: res[uid] = l
    return res

def apply(units, pas):
    """Pose `pas` sur les unités (en place) et restaure les stats de la carte si l'ancienne intégration avait modifié l'unité (champ `base`). Retourne le nombre d'unités restaurées."""
    n = 0
    for u in units:
        if "base" in u:
            b = u["base"]; u["ma"], u["md"], u["ld"], u["charge"], u["speed"], u["armour"] = b["ma"], b["md"], b["ld"], b["charge"], b["speed"], b["armour"]
            if b.get("mass") is not None: u["mass"] = b["mass"]
            u["melee"]["dmg"], u["melee"]["ap"] = b["dmg"], b["ap"]
            if u.get("ranged") and "rdmg" in b:
                u["ranged"]["dmg"], u["ranged"]["ap"] = b["rdmg"], b["rap"]
                if b.get("range") is not None: u["ranged"]["range"] = b["range"]
            if "res" in b: u["res"] = b["res"]
            else: u.pop("res", None)
            del u["base"]; n += 1
        u.pop("pas", None)
        if pas.get(u["id"]): u["pas"] = pas[u["id"]]
    return n
