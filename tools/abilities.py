#!/usr/bin/env python3
"""Capacités, sorts et attributs des unités (noms et descriptions FR/EN, icônes du jeu) -> data/abilities.js + img/abilities/.

  python tools/abilities.py DOSSIER_TABLES [--loc-fr DOSSIER_LOC_FR] [--icons DOSSIER_EXTRAIT]
    DOSSIER_TABLES : le dump des tables (ex. wh3-dump : db/*_tables + text/db pour l'anglais)
    --loc-fr       : localisation française exportée avec RPFM (localisation__.loc.tsv), comme pour convert_rpfm.py
    --icons        : dossier où « ui/ » a été extrait avec RPFM (icônes ui/battle ui/ability_icons)

Chaînes utilisées :
  capacités : main_units.land_unit -> land_units_to_unit_abilites_junctions -> unit_abilities (icône, type, cachée ou non)
              + unit_special_abilities (passive, coût en mana = sort, recharge, durée, nombre d'utilisations)
  attributs : land_units.attribute_group -> unit_attributes_to_groups_junctions -> unit_attributes (« Nom||Description »)
Le site lit data/units.json pour savoir quelles unités existent : à lancer après convert_rpfm.py.
"""
import argparse, csv, json, os, re, shutil, sys
csv.field_size_limit(10**8)
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")

def read_tsv(path):
    with open(path, encoding="utf-8-sig", newline="") as f:
        lines = [l for l in f.read().splitlines() if l and not l.startswith("#")]
    return list(csv.DictReader(lines, delimiter="\t", quoting=csv.QUOTE_NONE)) if lines else []
def table(dump, name):
    d, out = os.path.join(dump, "db", name), []
    if os.path.isdir(d):
        for fn in sorted(os.listdir(d)):
            if fn.endswith(".tsv"): out += read_tsv(os.path.join(d, fn))
    return out
def loc_dir(d):
    out = {}
    for dp, _, fs in os.walk(d):
        for fn in fs:
            if fn.endswith(".loc.tsv") or fn.endswith(".tsv"):
                for r in read_tsv(os.path.join(dp, fn)):
                    if r.get("key"): out[r["key"]] = r.get("text") or ""
    return out
def resolver(loc):
    def res(v):
        for _ in range(5):
            if not (v and v.startswith("{{tr:") and v.endswith("}}")): break
            v = loc.get(v[5:-2])
        return v or ""
    return res
def clean(s):                                       # balises du jeu ([[img:…]], [[col:…]], {{…}}) et retours à la ligne écrits « \n »
    s = re.sub(r"\[\[img:[^\]]*\]\]\[\[/img\]\]", "", s or "")
    s = re.sub(r"\[\[/?[a-z_]+(:[^\]]*)?\]\]", "", s)
    s = re.sub(r"\{\{[^}]*\}\}", "", s)
    s = re.sub(r"\\+n", "\n", s)
    return re.sub(r"[ \t]+", " ", s).strip()

ap = argparse.ArgumentParser()
ap.add_argument("dump"); ap.add_argument("--loc-fr"); ap.add_argument("--icons")
a = ap.parse_args()
units = json.load(open(os.path.join(root, "data", "units.json"), encoding="utf-8"))["units"]
ids = {u["id"] for u in units}
en = loc_dir(os.path.join(a.dump, "text"))
fr = loc_dir(a.loc_fr) if a.loc_fr else {}
res_en, res_fr = resolver(en), resolver(fr)
def txt(key):                                       # (fr, en) ; le français retombe sur l'anglais
    e = clean(res_en(en.get(key, ""))); f = clean(res_fr(fr.get(key, ""))) if fr else ""
    return f or e, e

land_of = {r["unit"]: r.get("land_unit") for r in table(a.dump, "main_units_tables") if r.get("unit") in ids}
abil_of_land = {}
for r in table(a.dump, "land_units_to_unit_abilites_junctions_tables"):
    abil_of_land.setdefault(r.get("land_unit"), []).append(r.get("ability"))
UA = {r["key"]: r for r in table(a.dump, "unit_abilities_tables")}
USA = {r["key"]: r for r in table(a.dump, "unit_special_abilities_tables")}
attr_group = {r["key"]: r.get("attribute_group") for r in table(a.dump, "land_units_tables")}
attrs_of_group = {}
for r in table(a.dump, "unit_attributes_to_groups_junctions_tables"):
    attrs_of_group.setdefault(r.get("attribute_group"), []).append(r.get("attribute"))

icon_src = {}                                       # nom d'icône -> fichier extrait (ui/battle ui/ability_icons)
if a.icons:
    for dp, _, fs in os.walk(a.icons):
        if "ability_icons" not in dp.replace("\\", "/").lower(): continue
        for fn in fs:
            if fn.lower().endswith(".png"): icon_src.setdefault(os.path.splitext(fn)[0].lower(), os.path.join(dp, fn))
def icon(name):
    n = os.path.splitext(os.path.basename((name or "").replace("\\", "/")))[0].lower()
    if n in icon_src:
        os.makedirs(os.path.join(root, "img", "abilities"), exist_ok=True)
        dst = os.path.join(root, "img", "abilities", n + ".png")
        if not os.path.exists(dst): shutil.copy(icon_src[n], dst)
        return n
    return ""
num = lambda v: float(v) if re.fullmatch(r"-?\d+(\.\d+)?", (v or "").strip()) else 0.0

# Capacités débloquées par l'arbre de compétences (sorts des seigneurs et héros surtout) :
# unité -> agent_subtypes.associated_unit_override -> character_skill_node_sets -> character_skill_node_set_items -> character_skill_nodes
# -> character_skill_level_to_effects_junctions -> effect_bonus_value_unit_ability_junctions (bonus « enable »)
base = lambda k: re.sub(r"_\d+$", "", k or "")
subs_of = {}
for r in table(a.dump, "agent_subtypes_tables"):
    if r.get("associated_unit_override"): subs_of.setdefault(base(r["associated_unit_override"]), set()).add(r["key"])
mounted_base = {r["mounted_unit"]: r["base_unit"] for r in table(a.dump, "units_custom_battle_mounts_tables") if r.get("mounted_unit") and r.get("base_unit")}
sets_of = {}
for r in table(a.dump, "character_skill_node_sets_tables"):
    if r.get("agent_subtype_key") and not r.get("faction_key") and not r.get("campaign_key"): sets_of.setdefault(r["agent_subtype_key"], []).append(r["key"])
items_of = {}
for r in table(a.dump, "character_skill_node_set_items_tables"):
    if r.get("mod_disabled") != "true": items_of.setdefault(r["set"], []).append(r["item"])
skill_of_node = {r["key"]: r.get("character_skill_key") for r in table(a.dump, "character_skill_nodes_tables") if r.get("visible_in_ui") != "false"}
effects_of_skill = {}
for r in table(a.dump, "character_skill_level_to_effects_junctions_tables"):
    effects_of_skill.setdefault(r["character_skill_key"], set()).add(r["effect_key"])
enables = {}
for r in table(a.dump, "effect_bonus_value_unit_ability_junctions_tables"):
    if r.get("bonus_value_id") == "enable": enables.setdefault(r["effect"], []).append(r["unit_ability"])
def skill_abilities(k):
    subs = subs_of.get(base(k)) or subs_of.get(base(mounted_base.get(k))) or set()
    out = []
    for s in sorted(subs):
        for st in sets_of.get(s, []):
            for node in items_of.get(st, []):
                for e in sorted(effects_of_skill.get(skill_of_node.get(node), ())):
                    out += enables.get(e, [])
    return list(dict.fromkeys(out))

AB, unit_ab, unit_sk, AT, unit_at = {}, {}, {}, {}, {}
def add_ability(ab):                                # True si la capacité est affichable (connue, non cachée, nommée)
    if ab in AB: return True
    r = UA.get(ab)
    if not r or r.get("is_hidden_in_ui") == "true": return False
    s = USA.get(ab, {})
    n_fr, n_en = txt(f"unit_abilities_onscreen_name_{ab}")
    if not n_en and not n_fr: return False
    d_fr, d_en = txt(f"unit_abilities_tooltip_text_{ab}")
    mana = num(s.get("mana_cost"))
    AB[ab] = {k2: v for k2, v in {
        "n": n_fr, "ne": n_en, "d": d_fr, "de": d_en, "ic": icon(r.get("icon_name")),
        "sp": 1 if mana > 0 else 0, "pa": 1 if s.get("passive") == "true" else 0, "mana": mana,
        "cd": num(s.get("recharge_time")), "dur": num(s.get("active_time")), "uses": int(num(s.get("num_uses"))),
    }.items() if v not in ("", 0, 0.0)}
    return True
for k in sorted(ids):
    lu = land_of.get(k)
    own = set()
    for ab in dict.fromkeys(abil_of_land.get(lu, [])):
        if add_ability(ab): unit_ab.setdefault(k, []).append(ab); own.add(ab)
    for ab in skill_abilities(k):
        if ab not in own and add_ability(ab): unit_sk.setdefault(k, []).append(ab)
    for at in dict.fromkeys(attrs_of_group.get(attr_group.get(lu), [])):
        if at not in AT:
            f, e = txt(f"unit_attributes_bullet_text_{at}")
            if not (f or e): continue
            nf, _, df = f.partition("||"); ne, _, de = e.partition("||")
            AT[at] = {k2: v for k2, v in {"n": nf.strip(), "ne": ne.strip(), "d": df.strip(), "de": de.strip(), "ic": icon(at)}.items() if v}
        if at in AT: unit_at.setdefault(k, []).append(at)
# Ordre d'affichage : sorts, capacités actives, passives
for d in (unit_ab, unit_sk):
    for k, l in d.items(): l.sort(key=lambda x: (-AB[x].get("sp", 0), AB[x].get("pa", 0), AB[x].get("n", "")))
with open(os.path.join(root, "data", "abilities.js"), "w", encoding="utf-8") as f:
    f.write("window.TWW3_ABIL=" + json.dumps({"ab": AB, "at": AT, "u": unit_ab, "sk": unit_sk, "ua": unit_at}, ensure_ascii=False, separators=(",", ":")) + ";\n")
n_sp = sum(1 for v in AB.values() if v.get("sp"))
print(f"{len(AB)} capacités dont {n_sp} sorts, {len(AT)} attributs ; {len(unit_ab)} unités avec capacités de base, {len(unit_sk)} avec capacités par compétences, {len(unit_at)} avec attributs ;"
      f" {sum(1 for v in list(AB.values()) + list(AT.values()) if v.get('ic'))} icônes ; textes FR : {'oui' if fr else 'non (anglais seulement)'}")
