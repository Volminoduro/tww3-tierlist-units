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
for k in pngs:                                      # même nom à plusieurs endroits : vraies cartes d'abord, puis vignettes basse qualité (minspec),
    pngs[k].sort(key=lambda p: ("minspec" in p.lower()) + 2 * ("portholes" in p.lower()))   # puis médaillons de campagne (portholes)
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
                    if not v: continue
                    for n in dict.fromkeys((strip(v), strip(v).replace("_ch_", "_cha_"))):   # les fichiers écrivent parfois _cha_ là où la table dit _ch_
                        yield n + "_0"; yield n
    if k in setpiece: yield setpiece[k]

# Rapprochement tolérant (dernier recours) : la table dit « vmp_cha_lahmian_vampire_campaign_01 » mais le fichier s'appelle
# « vmp_lahmian_vampire_hero_campaign_01_0 », ou « neu_cha_ulrika » pour « neu_ulrika_0 ». On prend le portrait de personnage
# dont le nom contient tous les mots de la variante (hors cha/ch), avec le moins de mots en plus (2 au plus).
# Sources de secours, utilisées seulement en tout dernier : vignettes basse qualité (ui/units/minspec_portholes, nommées
# comme les unités) et médaillons de campagne (ui/portraits/portholes). Un nom qui n'existe que là n'est pas « bon ».
low = lambda p: "minspec" in p.lower() or "portholes" in p.lower()
good = {n for n, ps in pngs.items() if not low(ps[0])}
sing = lambda w: w[:-1] if len(w) > 4 and w.endswith("s") else w      # shadows / shadow, beastlords / beastlord
def tokens(pool): return [(n, {sing(w) for w in n.split("_")} - {"0"}) for n in pool if any("portraits" in p.lower() for p in pngs[n])]
def fuzzy(k, toks_pool):
    best = None
    for v in dict.fromkeys(portrait_names(k)):
        want = {sing(w) for w in v.split("_")} - {"cha", "ch", "0"}
        if len(want) < 2: continue
        for n, toks in toks_pool:
            extra = len(toks - want - {"cha", "ch"})
            if want <= toks and extra <= 2 and (best is None or extra < best[0]): best = (extra, n)
        if best: return best[1]
    return None

via_card = via_portrait = via_sibling = via_fuzzy = via_low = 0
fuzzy_log = []
found_by_base, found = {}, {}
def find(k, pool, toks_pool):
    global via_card, via_portrait, via_fuzzy
    hit = next((n for n in [k.lower()] + [c for _, c in sorted(cards.get(k, []))] if n in pool), None)
    if hit: via_card += hit != k.lower()
    elif dump:
        hit = next((n for n in portrait_names(k) if n in pool), None)
        via_portrait += bool(hit)
        if not hit and "_cha_" in k:
            hit = fuzzy(k, toks_pool); via_fuzzy += bool(hit)
            if hit: fuzzy_log.append(f"{k} -> {hit}")
    return hit
def take(k, hit):
    shutil.copy(pngs[hit][0], os.path.join(root, "img", "units", k + ".png")); units.append(k)
    found_by_base.setdefault(base(k), hit); found[k] = hit
good_tokens = tokens(good)
for k in ids:
    hit = find(k, good, good_tokens)
    if hit: take(k, hit)
core = lambda k: strip(base(k))                    # clé sans préfixe d'extension ni numéro : wh2_dlc15_hef_cha_princess_6 -> hef_cha_princess
found_by_core = {}
for b, hit in found_by_base.items(): found_by_core.setdefault(strip(b), hit)
mounted_base = {}                                   # unité montée -> unité de base (…_chaos_lord_mkho_juggernaut -> …_chaos_lord_mkho)
if dump:
    for r in read_table("units_custom_battle_mounts_tables"):
        if r.get("mounted_unit") and r.get("base_unit"): mounted_base.setdefault(r["mounted_unit"], r["base_unit"])
def sibling(k):
    hit = found_by_base.get(base(k)) or found_by_core.get(core(k))
    b = mounted_base.get(k)
    if not hit and b: hit = found.get(b) or found_by_base.get(base(b)) or found_by_core.get(core(b))
    return hit
def siblings_pass():
    global via_sibling
    for k in ids:                                   # variantes (monture…) sans image propre : celle d'une variante sœur, de l'unité à pied, ou d'une autre extension
        if k in units: continue
        hit = sibling(k)
        if hit:
            shutil.copy(pngs[hit][0], os.path.join(root, "img", "units", k + ".png")); units.append(k); via_sibling += 1; found[k] = hit
siblings_pass()
all_tokens = tokens(pngs)                           # dernier recours : vignettes basse qualité et médaillons de campagne
for k in ids:
    if k in units: continue
    hit = find(k, pngs, all_tokens)
    if hit: take(k, hit); via_low += 1
for b, hit in found_by_base.items(): found_by_core.setdefault(strip(b), hit)
siblings_pass()
# Variantes de domaine de magie ou de monture ajoutées plus tard (…master_necromancer_undeath, …sorcerer_lord_shadows_msla) :
# même portrait que le personnage dont la clé est un préfixe (on retire les derniers mots, en gardant au moins 3 mots).
via_prefix = 0
cores = sorted(found_by_core)
for k in ids:
    if k in units or "_cha_" not in k: continue
    t = core(k).split("_")
    for n in range(len(t) - 1, 2, -1):
        p = "_".join(t[:n])
        hit = found_by_core.get(p) or found_by_core.get(p + "_0")   # préfixe exact seulement : « wizard » seul mènerait à un autre sorcier
        if hit:
            shutil.copy(pngs[hit][0], os.path.join(root, "img", "units", k + ".png")); units.append(k); found[k] = hit; via_prefix += 1
            fuzzy_log.append(f"[préfixe] {k} -> {hit}")
            break
siblings_pass()
if dump: print(f"  {via_prefix} variantes rattachées au personnage de base par préfixe de clé")
if dump: print(f"  dont {via_card} via unit_card, {via_portrait} via portraits de personnages, {via_fuzzy} par rapprochement de nom, {via_sibling} via une variante sœur ; {via_low} images de secours (minspec / médaillon de campagne)")
if "-v" in sys.argv: print("\n".join(fuzzy_log))
for fk, path in data.get("flags", {}).items():
    cands = dirs.get(os.path.basename(path).lower(), []) if path else []
    for d in cands:
        files = [os.path.join(d, f) for f in os.listdir(d) if f.lower().endswith(".png")]
        if not files: continue
        pick = next((f for f in files if os.path.basename(f).lower() == "mon_64.png"), max(files, key=os.path.getsize))
        shutil.copy(pick, os.path.join(root, "img", "factions", fk + ".png")); flags.append(fk); break
tiers = 0                                           # icônes de tier d'unité du jeu (ui2.pack : ui/skins/default/unit_tier_1..5.png)
for n in range(1, 6):
    p = pngs.get(f"unit_tier_{n}")
    if p:
        os.makedirs(os.path.join(root, "img", "tiers"), exist_ok=True)
        shutil.copy(p[0], os.path.join(root, "img", "tiers", f"unit_tier_{n}.png")); tiers += 1
print(f"{tiers} icônes de tier sur 5")
STATS = ["icon_stat_" + n for n in ("health", "armour", "defence", "attack", "charge_bonus", "morale", "speed", "damage", "ranged_damage", "range", "reload_time", "ammo")] \
      + ["modifier_icon_" + n for n in ("armour_piercing", "armour_piercing_ranged", "bonus_vs_infantry", "bonus_vs_large", "magical", "flaming", "shield")]
stats = 0                                           # icônes de stats et de modificateurs du jeu (ui2.pack : ui/skins/default), utilisées par app.js (GAME_STAT) et icons.js (attributs)
for n in STATS:
    p = pngs.get(n)
    if p:
        os.makedirs(os.path.join(root, "img", "stats"), exist_ok=True)
        shutil.copy(p[0], os.path.join(root, "img", "stats", f"{n}.png")); stats += 1
print(f"{stats} icônes de stats et modificateurs sur {len(STATS)}")

SKIN = ["panel_back_tile_stone", "panel_back_border", "panel_bar_top", "metal_line_h",   # textures d'interface (ui/skins/default) pour theme.css
        "button_square_medium_text_active", "button_square_medium_text_selected"]
skin = 0
for n in SKIN:
    p = next((q for q in pngs.get(n, []) if "skins/default/" in q.lower().replace("\\", "/")), None)
    if p:
        os.makedirs(os.path.join(root, "img", "skin"), exist_ok=True)
        shutil.copy(p, os.path.join(root, "img", "skin", n + ".png")); skin += 1
print(f"{skin} textures d'interface sur {len(SKIN)}")

def in_dir(name, part):                             # chemin d'une image de ce nom située dans un dossier donné
    return next((p for p in pngs.get(name.lower(), []) if part in p.lower().replace("\\", "/")), None)
def put(src, sub, name):
    os.makedirs(os.path.join(root, "img", sub), exist_ok=True)
    dst = os.path.join(root, "img", sub, name + ".png")
    if not os.path.exists(dst) or os.path.getsize(dst) != os.path.getsize(src): shutil.copy(src, dst)
cats, infos, mounts, races = {}, {}, {}, []
if dump:
    # Icône de catégorie (celle des cartes d'unité du jeu) : main_units.ui_unit_group_land -> ui_unit_groupings.icon -> ui/common ui/unit_category_icons/<icon>.png
    group_icon = {r["key"]: r.get("icon") for r in read_table("ui_unit_groupings_tables")}
    for r in read_table("main_units_tables"):
        k, ic = r.get("unit"), group_icon.get(r.get("ui_unit_group_land") or "")
        p = ic and in_dir(ic, "common ui/unit_category_icons/")
        if k in ids and p: put(p, "cats", ic.lower()); cats[k] = ic.lower()
    # Grande illustration de l'unité (panneau d'information du jeu) : ui/units/infopics/<carte>.png, même nom que la carte d'unité
    for k in ids:
        for n in [k.lower()] + [c for _, c in sorted(cards.get(k, []))] + ([mounted_base[k].lower()] if k in mounted_base else []):
            p = in_dir(n, "units/infopics/")
            if p: put(p, "info", n); infos[k] = n; break
    # Monture (variantes montées des seigneurs et héros) : units_custom_battle_mounts.icon_name -> ui/campaign ui/mounts/<icône>.png
    for r in read_table("units_custom_battle_mounts_tables"):
        k, ic = r.get("mounted_unit"), os.path.splitext(os.path.basename((r.get("icon_name") or "").replace("\\", "/")))[0].lower()
        p = ic and in_dir(ic, "campaign ui/mounts/")
        if k in ids and p: put(p, "mounts", ic); mounts[k] = ic
# Bandeau de race (écran de choix de race du jeu) : ui/frontend ui/race_select_images/large/<culture>.png
for c in data.get("cultures", {}):
    p = in_dir(c, "race_select_images/large/")
    if p: put(p, "races", c.lower()); races.append(c)
print(f"{len(cats)} icônes de catégorie, {len(infos)} illustrations d'unités, {len(mounts)} montures, {len(races)} bandeaux de race sur {len(data.get('cultures', {}))}")
open(os.path.join(root, "data", "icons.js"), "w").write("window.TWW3_ICONS=" + json.dumps(sorted(units)) + ";\nwindow.TWW3_FLAGS=" + json.dumps(sorted(flags)) + ";\n"
    + "window.TWW3_CATS=" + json.dumps(cats, sort_keys=True) + ";\nwindow.TWW3_INFO=" + json.dumps(infos, sort_keys=True) + ";\n"
    + "window.TWW3_MOUNTS=" + json.dumps(mounts, sort_keys=True) + ";\nwindow.TWW3_RACES=" + json.dumps(sorted(races)) + ";\n")
print(f"{len(units)} portraits d'unités sur {len(ids)} ; {len(flags)} drapeaux sur {len(data.get('flags', {}))} factions.")
