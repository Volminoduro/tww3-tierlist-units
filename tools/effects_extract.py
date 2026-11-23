"""Extraction des effets « par défaut » des seigneurs (et de leur trait de faction) qui modifient les stats des unités en bataille.

Pour chaque sous-type de seigneur (agent_subtype) on retient :
  - son effet de départ        : faction_starting_general_effects -> effect_bundles_to_effects_junctions ;
  - ses compétences innées     : nœuds de ses ensembles (character_skill_node_sets/_items) avec points_on_creation > 0, niveau 1
                                 -> character_skill_level_to_effects_junctions.
Seuls les effets de stats d'unités sont gardés (attaque, défense, armure, moral, vitesse, PV, force d'arme, force de tir, munitions, portée, charge).
Leur portée sur les unités vient de effect_bonus_value_ids_unit_sets -> unit_sets / unit_set_to_unit_junctions.
Les effets conditionnels (embuscade, désert, contre une race…) sont repérés par leur clé et marqués « cond » : ils ne sont pas appliqués.

Limites : les effets présents au démarrage d'une campagne mais définis dans les fichiers de départ de campagne (hors tables) sont inconnus ;
les effets de campagne (entretien, recrutement, mouvement) sont ignorés ; certains effets (résistances, sorts) ne sont pas modélisés.
"""
import re
from collections import defaultdict

# (motif de clé d'effet, stat du simulateur, en pourcentage ?) ; la nature % / points est confirmée par la localisation quand elle existe
STATS = [
    (r"stat_melee_attack", "ma", False), (r"stat_melee_defence", "md", False), (r"stat_armour", "arm", False),
    (r"stat_leadership", "ld", False), (r"stat_charge_bonus", "charge", False),
    (r"stat_weapon_strength", "ws", True), (r"stat_missile_damage", "ms", True), (r"stat_speed", "spd", True),
    (r"stat_unit_health", "hp", True), (r"stat_ammunition", "ammo", True), (r"stat_range", "range", True),
]
UNSUPPORTED = re.compile(r"stat_(physical_resistance|missile_resistance|magic_resistance|fire_resistance|ap_damage|miscast|reload|accuracy|damage_)")
COND = re.compile(r"(ambush|retreat|desert|forest|snow|jungle|vs_|_when_|_while_|during|siege|night|rain|underground|settlement|garrison|reinforc|naval|_sea|_in_[a-z]+$)")
ARMY_SCOPES = ("to_force",)       # effets qui touchent l'armée
CHAR_SCOPES = ("to_character",)   # effets qui touchent le seigneur seul


def build_effects(T, units, loc, facinfo):
    index = lambda rows, k: {r.get(k): r for r in rows if r.get(k)}
    ids = {u["id"] for u in units}

    # --- appartenance aux ensembles d'unités ---
    junc = defaultdict(list)
    for r in T.get("unit_set_to_unit_junctions", []): junc[r["unit_set"]].append(r)
    def matches(row, u):
        fields = (("unit_caste", "caste"), ("unit_category", "cat"), ("unit_class", "cls"), ("unit_record", "id"))
        if not any(row.get(f) for f, _ in fields): return False
        return all(not row.get(f) or row[f] == u.get(a) for f, a in fields)
    cache = {}
    def members(sk):
        if sk not in cache:
            rows = junc.get(sk, []); inc = [r for r in rows if r.get("exclude") != "true"]; exc = [r for r in rows if r.get("exclude") == "true"]
            cache[sk] = sorted(u["id"] for u in units if any(matches(r, u) for r in inc) and not any(matches(r, u) for r in exc))
        return cache[sk]
    eff_sets = defaultdict(set)
    for r in T.get("effect_bonus_value_ids_unit_sets", []): eff_sets[r["effect"]].add(r["unit_set"])

    def describe(effect, scope, value, src):
        key = effect
        stat = next(((s, p) for pat, s, p in STATS if re.search(pat, key)), None)
        if stat is None:
            return {"k": key, "stat": None, "unsupported": bool(UNSUPPORTED.search(key)), "src": src} if re.search(r"_stat_", key) else None
        if not (any(s in scope for s in ARMY_SCOPES) or any(s in scope for s in CHAR_SCOPES)): return None
        desc = loc.get("effects_description_" + key) or ""
        pct = ("%+n%" in desc) if desc else stat[1]
        try: v = float(value)
        except ValueError: return None
        cond = bool(COND.search(key))             # effet conditionnel (terrain, embuscade, race adverse…) : non appliqué par défaut
        units_ = None
        if eff_sets.get(key):
            lst = sorted({i for s in eff_sets[key] for i in members(s)})
            units_ = lst
        elif "_character_stat_" in key:
            units_ = "lord"                      # stat de personnage : le seigneur lui-même
        if any(s in scope for s in CHAR_SCOPES) and not any(s in scope for s in ARMY_SCOPES): units_ = "lord"
        if isinstance(units_, list) and len(units_) >= 0.98 * len(ids): units_ = None   # « toutes les unités » : inutile de répéter la liste
        return {"k": key, "stat": stat[0], "v": v, "pct": pct, "units": units_, "cond": cond, "src": src,
                "label": re.sub(r"\s+", " ", re.sub(r"\[\[[^\]]*\]\]", "", desc).replace("%+n%", "").replace("%+n", "").replace(":", "")).strip() or key}

    # --- effets par défaut de chaque sous-type de seigneur ---
    bundle_eff = defaultdict(list)
    for r in T.get("effect_bundles_to_effects_junctions", []): bundle_eff[r["effect_bundle_key"]].append(r)
    start = {r["agent_subtype"]: r["effect_bundle"] for r in T.get("faction_starting_general_effects", [])}
    skill_eff = defaultdict(list)
    for r in T.get("character_skill_level_to_effects_junctions", []):
        if r.get("level") == "1": skill_eff[r["character_skill_key"]].append(r)
    nodes = index(T.get("character_skill_nodes", []), "key")
    set_items = defaultdict(list)
    for r in T.get("character_skill_node_set_items", []): set_items[r["set"]].append(r["item"])
    sub_sets = defaultdict(list)
    for r in T.get("character_skill_node_sets", []):
        if r.get("agent_subtype_key"): sub_sets[r["agent_subtype_key"]].append(r["key"])
    agents = index(T.get("agent_subtypes", []), "key")

    lords, n_unsupported = {}, 0
    for st, ag in agents.items():
        unit = ag.get("associated_unit_override")
        raw = []
        for sk in sub_sets.get(st, []):
            for it in set_items.get(sk, []):
                n = nodes.get(it)
                if n and n.get("points_on_creation") not in ("0", "", None):
                    raw += [(r["effect_key"], r["effect_scope"], r["value"], "compétence innée") for r in skill_eff.get(n["character_skill_key"], [])]
        if st in start: raw += [(r["effect_key"], r["effect_scope"], r["value"], "trait de départ") for r in bundle_eff.get(start[st], [])]
        out, seen = [], set()
        for e, sc, v, src in raw:
            d = describe(e, sc, v, src)
            if d and (d["k"], d.get("v")) not in seen: seen.add((d["k"], d.get("v"))); out.append(d)
        if unit and (out or st in start or any(n for n in sub_sets.get(st, []))):
            lords[st] = {"unit": unit, "effects": out}
    # --- seigneurs de départ de chaque faction (choix « auto ») ---
    leaders = defaultdict(list)
    for r in T.get("frontend_faction_leaders", []):
        f, st = r.get("faction"), r.get("agent_subtype_record")
        if f in facinfo and st in lords and st not in leaders[f]: leaders[f].append(st)
    # on ne garde que les seigneurs utiles (au moins un effet exploitable) ou désignés comme seigneur de départ
    keep = {st for fl in leaders.values() for st in fl} | {st for st, l in lords.items() if any(e.get("stat") for e in l["effects"])}
    lords = {st: l for st, l in lords.items() if st in keep}
    return {"leaders": dict(leaders), "lords": lords}
