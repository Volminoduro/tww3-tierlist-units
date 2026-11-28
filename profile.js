"use strict";
/* Profil de campagne GLOBAL (« Ma campagne »), voir TODO.md point 0.
   Un profil = une faction + son seigneur (niveau, compétences et technologies viendront s'y ajouter : points 1 et 3). Il produit des modificateurs PAR UNITÉ
   (ma, md, arm, ld, charge en points ; ws, ms, spd, hp, ammo, range en %), exactement ceux que le Combat applique déjà au seigneur d'une armée (data/effects.js).
   NIVEAU du seigneur (TODO point 1) : un curseur 1 à 40 donne N − 1 points de compétence, dépensés automatiquement (arbres de data/skills.js, voir allocate()). La valeur d'un niveau de compétence est le TOTAL à ce niveau (vérifié : rapport médian niveau 2 / niveau 1 = 2,0).
   Ici ils sont appliqués aux STATS des unités (D.units modifiées sur place, valeurs d'origine gardées dans u._b) : tier list, unités par faction, fiche d'unité et
   Combat lisent donc tous les stats modifiées, et les rangs « Top / Bottom % » se recalculent d'eux-mêmes. Seules les unités de la faction choisie sont touchées
   (un bonus « toutes les unités » ne gonfle pas les unités des autres factions). Les duels sont rejoués automatiquement pour le profil (campduels.js).
   Le Combat n'ajoute pas une seconde fois l'effet du même seigneur (u._pm = « déjà modifiée par le profil », lu par battle.js). État mémorisé (PREF « profile »). */
const PROFILE = {on: false, fac: null, lord: "auto", level: 1, st: null, n: 0, alloc: [], sv: null, fromSave: false, condEff: []};
(() => {
  const FX = window.TWW3_EFFECTS || {leaders: {}, lords: {}}, SK = window.TWW3_SKILLS || {lords: {}, sets: []};
  const UN = Object.fromEntries(D.units.map(u => [u.id, u]));
  const LAB = {ma: "Attaque", md: "Défense", arm: "Armure", ld: "Moral", charge: "Charge", ws: "Force d'arme", ms: "Force de tir", spd: "Vitesse", hp: "PV", ammo: "Munitions", range: "Portée", vig: "Perte de vigueur", pv: "Vigueur parfaite"};
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  /* Valeurs d'origine de chaque unité (avant tout profil) */
  for (const u of D.units) u._b = {ma: u.ma, md: u.md, armour: u.armour, ld: u.ld, charge: u.charge, speed: u.speed, hp: u.hp, m: {...u.melee}, r: u.ranged ? {...u.ranged} : null};

  const facs = Object.keys(FX.leaders).filter(f => D.facInfo[f]);                          // factions dont on connaît le seigneur de départ
  const inFac = (u, f) => u.factions.includes(f);                                          // périmètre : disponible dans cette faction (indépendant des filtres DLC / renom)
  const lordLabel = st => { const l = FX.lords[st], u = l && UN[l.unit]; return u ? u.name : st.replace(/^wh\d*_[a-z0-9]+_[a-z]{3}_/, "").replace(/_/g, " "); };
  const autoLord = f => (FX.leaders[f] || [])[0] || null;
  const lordChoices = f => Object.keys(FX.lords).filter(st => { const u = UN[FX.lords[st].unit]; return u ? inFac(u, f) : (FX.leaders[f] || []).includes(st); })
    .sort((a, b) => lordLabel(a).localeCompare(lordLabel(b), "fr"));
  const stOf = () => !PROFILE.fac ? null : PROFILE.lord === "none" ? null : PROFILE.lord === "auto" ? autoLord(PROFILE.fac) : PROFILE.lord;
  const effOf = st => { const l = st && FX.lords[st]; return l ? l.effects.filter(e => e.stat && !e.cond) : []; };
  const hits = (e, u, lord) => e.units == null || (e.units === "lord" ? !!lord && u.id === lord.unit : (e.units instanceof Set ? e.units.has(u.id) : e.units.includes(u.id)));

  /* Modificateurs d'une unité (même conversion que le Combat : un effet en % sur une stat « en points » devient des points) */
  function modsFor(u, lord, eff) {
    const m = {};
    for (const x of eff) { if (!hits(x, u, lord)) continue;
      const base = {ma: u.ma, md: u.md, arm: u.armour, ld: u.ld, charge: u.charge}[x.stat];
      m[x.stat] = (m[x.stat] || 0) + (x.pct && base !== undefined ? base * x.v / 100 : x.v); }
    return m;
  }
  function restore(u) {
    const b = u._b; u.ma = b.ma; u.md = b.md; u.armour = b.armour; u.ld = b.ld; u.charge = b.charge; u.speed = b.speed; u.hp = b.hp;
    u.melee = {...b.m}; u.ranged = b.r ? {...b.r} : null; u._pm = false; u.vig = 0; u.pvx = false;
  }
  function modify(u, m) {
    const p = v => 1 + (v || 0) / 100;
    u.ma += m.ma || 0; u.md += m.md || 0; u.ld += m.ld || 0; u.charge += m.charge || 0; u.armour = u.armour >= 100 ? u.armour : Math.min(100, u.armour + (m.arm || 0));
    u.speed *= p(m.spd); u.hp *= p(m.hp);
    if (m.ws) { u.melee.dmg *= p(m.ws); u.melee.ap *= p(m.ws); u.melee.bvi *= p(m.ws); u.melee.bvl *= p(m.ws); }
    if (u.ranged) {
      if (m.ms) { u.ranged.dmg *= p(m.ms); u.ranged.ap *= p(m.ms); }
      if (m.range) u.ranged.range *= p(m.range);
      if (m.ammo && u.ranged.ammo) u.ranged.ammo *= p(m.ammo);
    }
    if (m.vig) u.vig = (u.vig || 0) + m.vig; if (m.pv) u.pvx = true;                          // fatigue : lu par sim.js (u.vig en %, u.pvx = vigueur parfaite)
    u._pm = true;
  }

  /* ---------- Compétences : dépense automatique des points ---------- */
  const SETS = {}, setOf = i => (SETS[i] ??= new Set(SK.sets[i]));
  const maxLv = t => Math.max(...Object.keys(t.L).map(Number));
  /* Valeur approximative d'une unité de chaque stat (en % de puissance) ; ×  la part de la faction touchée par l'effet. Heuristique : le but est d'ordonner les compétences, pas de mesurer leur gain exact. */
  const W = {ma: 1.5, md: 1.5, arm: 0.8, ld: 0.4, charge: 0.4, ws: 1, ms: 1, spd: 0.3, hp: 1, ammo: 0.2, range: 0.2, vig: -0.05, pv: 4}, BASE = {ma: 40, md: 35, arm: 45, ld: 65, charge: 35};
  const RANGED_ONLY = new Set(["ms", "ammo", "range"]);
  let pool = null, poolFac = null; const memo = {};
  const getPool = () => { if (poolFac !== PROFILE.fac) { poolFac = PROFILE.fac; pool = D.units.filter(u => inFac(u, PROFILE.fac) && u.role !== "lord" && u.role !== "hero" && !u.ror); Object.keys(memo).forEach(k => delete memo[k]); } return pool; };
  const cover = e => {                                   // part de la faction qui profite de l'effet
    if (e.u === "lord") return 0.04;                     // le seigneur seul : un modèle sur ~25
    const P = getPool(), ranged = RANGED_ONLY.has(e.s), key = (e.u === null ? "a" : e.u) + (ranged ? "r" : "m");
    return memo[key] ??= (P.filter(u => (e.u === null || setOf(e.u).has(u.id)) && (!ranged || u._b.r)).length / Math.max(1, P.length));
  };
  const effValue = effs => effs.reduce((a, e) => a + (e.c ? 0 : 1) * W[e.s] * (e.p && BASE[e.s] ? BASE[e.s] * e.v / 100 : e.v) * cover(e), 0);
  const atLevel = (t, l) => (l > 0 ? t.L[l] || [] : []);
  /* Dépense `points` points : à chaque étape on prend le niveau de compétence qui apporte le plus (valeur ajoutée par rapport au niveau actuel), compétence débloquée si ses prérequis (parents avec au moins 1 point) sont remplis. */
  function allocate(st, points) {
    const tree = SK.lords[st] || [], lv = tree.map(() => 0);
    tree.forEach((t, i) => { if (t.p0 > 0 && t.L[1]) lv[i] = 1; });                      // compétence innée : donnée à la création
    for (let p = 0; p < points; p++) {
      let best = -1, bg = 0;
      tree.forEach((t, i) => {
        if (lv[i] >= maxLv(t) || !t.L[lv[i] + 1]) return;
        if (t.rq > 0 && t.pa.filter(j => lv[j] > 0).length < t.rq) return;
        const g = effValue(t.L[lv[i] + 1]) - effValue(atLevel(t, lv[i]));
        if (g > bg) { bg = g; best = i; }
      });
      if (best < 0) break;
      lv[best]++;
    }
    return tree.map((t, i) => ({i, n: t.n, lv: lv[i], max: maxLv(t), effs: atLevel(t, lv[i]), innate: t.p0 > 0})).filter(x => x.lv > 0);
  }
  /* Compétences réellement prises dans la sauvegarde (clé de compétence -> niveau), au lieu de la dépense automatique. */
  function fromSaveAlloc(st) {
    const tree = SK.lords[st] || [], got = (PROFILE.sv && PROFILE.sv.lords[st] || {}).skills || {};
    return tree.map((t, i) => ({i, n: t.n, lv: Math.min(maxLv(t), got[t.k] || 0), max: maxLv(t), innate: t.p0 > 0})).filter(x => x.lv > 0).map(x => ({...x, effs: atLevel(tree[x.i], x.lv)}));
  }
  const usingSave = st => !!(PROFILE.fromSave && PROFILE.sv && st && PROFILE.sv.lords[st]);
  const toEff = e => ({stat: e.s, v: e.v, pct: !!e.p, units: e.u === null ? null : e.u === "lord" ? "lord" : setOf(e.u), cond: !!e.c, c: e.c, label: "", src: "compétence"});
  const spent = () => PROFILE.alloc.reduce((a, x) => a + x.lv - (x.innate ? 1 : 0), 0);
  function apply() {
    const st = PROFILE.on ? stOf() : null, lord = st ? FX.lords[st] : null;
    PROFILE.alloc = !st ? [] : usingSave(st) ? fromSaveAlloc(st) : allocate(st, Math.max(0, PROFILE.level - 1));
    const all = effOf(st).concat(PROFILE.alloc.flatMap(x => x.effs.map(toEff))), eff = all.filter(e => !e.cond);
    PROFILE.condEff = all.filter(e => e.cond);                                     // effets conditionnels des compétences : appliqués par le Combat selon le contexte (battle.js)
    PROFILE.st = st; PROFILE.n = 0;
    for (const u of D.units) {
      restore(u);
      if (!st || !eff.length || !(inFac(u, PROFILE.fac) || (lord && u.id === lord.unit))) continue;
      const m = modsFor(u, lord, eff); if (Object.keys(m).length) { modify(u, m); PROFILE.n++; }
    }
  }
  const save = () => PREF.set("profile", {on: PROFILE.on, fac: PROFILE.fac, lord: PROFILE.lord, level: PROFILE.level, sv: PROFILE.sv, fromSave: PROFILE.fromSave});
  const changed = () => { apply(); save(); drawBar(); if (typeof CampDuels !== "undefined") CampDuels.schedule(); document.dispatchEvent(new Event("rorchange")); };

  { const s = PREF.get("profile", null);
    if (s && s.fac && facs.includes(s.fac)) { PROFILE.fac = s.fac; PROFILE.lord = typeof s.lord === "string" ? s.lord : "auto"; PROFILE.on = !!s.on; PROFILE.level = Math.min(50, Math.max(1, Math.round(+s.level) || 1)); if (s.sv && s.sv.lords) { PROFILE.sv = s.sv; PROFILE.fromSave = !!s.fromSave; } } }
  if (!PROFILE.fac) PROFILE.fac = facs.find(f => f === "wh_main_emp_empire") || facs[0] || null;
  if (!facs.length) { document.querySelectorAll("[data-profui]").forEach(e => e.remove()); return; }

  /* ---------- Bandeau permanent (sous les onglets) : on sait toujours si un profil est actif ---------- */
  const bar = document.createElement("div"); bar.className = "profbar"; bar.dataset.profui = "1";
  const nav = document.getElementById("nav"); (nav ? nav.parentNode : document.body).insertBefore(bar, nav ? nav.nextSibling : null);
  function drawBar() {
    const st = PROFILE.on ? PROFILE.st : null;
    if (PROFILE.on) {
      const who = st ? lordLabel(st) : "sans seigneur", fn = D.factions[PROFILE.fac] || PROFILE.fac;
      bar.className = "profbar on";
      bar.innerHTML = `<span class="pbtxt">⚑ <b>Ma campagne</b> : ${esc(fn)} — ${esc(who)}${PROFILE.level > 1 ? ` niv. ${PROFILE.level}` : ""} · stats modifiées de ${PROFILE.n} unité${PROFILE.n > 1 ? "s" : ""}</span>` +
        `<small class="pbst">${esc(PROFILE.duelSt || "")}</small><button type="button" data-pedit>Modifier</button><button type="button" data-poff>Désactiver</button>`;
    } else { bar.className = "profbar"; bar.innerHTML = `<button type="button" data-pedit>Ma campagne…</button><small>Applique à tout le site le seigneur et les bonus de ta faction.</small>`; }
  }

  /* ---------- Fenêtre de réglage ---------- */
  const dlg = document.createElement("dialog"); dlg.id = "profdlg"; dlg.dataset.profui = "1"; document.body.appendChild(dlg);
  const byCul = {}; facs.forEach(f => (byCul[D.facInfo[f].culture] ??= []).push(f));

  /* ---------- Sélecteurs avec icônes (faction : blason ; seigneur : portrait) ---------- */
  const lordIcon = st => { const u = FX.lords[st] && UN[FX.lords[st].unit]; return u && typeof portrait === "function" ? portrait(u, "pks") : ""; };
  const facBtn = f => `${crest(f, "s")}<span class="pkt">${esc(D.factions[f] || f)}</span>`;
  const lordBtn = () => { const st = stOf(); return `${st ? lordIcon(st) : ""}<span class="pkt">${st ? esc(lordLabel(st)) + (PROFILE.lord === "auto" ? " (auto)" : "") : "Aucun seigneur"}</span>`; };
  const pkItem = (kind, v, ic, label, sel) => `<div class="pki${sel ? " sel" : ""}" data-pk-${kind}="${esc(v)}" data-q="${esc(label.toLowerCase())}">${ic}<span class="pkt">${esc(label)}</span></div>`;
  const picker = (kind, label, btn, items) => `<div class="pkw"><small>${label}</small><button type="button" class="pkb" data-pkbtn="${kind}">${btn}<i>▾</i></button><div class="pkp" hidden><input class="pkq" placeholder="Filtrer…" spellcheck="false"><div class="pkl">${items}</div></div></div>`;
  const draw = () => {
    const st = stOf(), lord = st ? FX.lords[st] : null, eff = effOf(st), cond = lord ? lord.effects.filter(e => e.stat && e.cond).length : 0;
    const cults = D.cultureOrder.filter(c => byCul[c]).sort((a, b) => D.cultures[a].localeCompare(D.cultures[b], "fr"));
    const auto = autoLord(PROFILE.fac), tgt = e => e.units === "lord" ? "le seigneur seul" : e.units == null ? "toutes les unités de la faction" : `certaines unités (${e.units.length} type${e.units.length > 1 ? "s" : ""})`;
    dlg.innerHTML = `<div class="dlch"><h2>Ma campagne</h2><button class="x" type="button" data-close>✕</button></div>
      <p class="dlcp">Choisis ta faction et son seigneur : ses bonus de stats par défaut sont appliqués aux unités de la faction <b>partout sur le site</b> (tier list, unités par faction, fiche d'unité, combat). Les rangs « Top / Bottom % » se recalculent sur les stats modifiées.</p>
      <label class="chk dlcmain"><input type="checkbox" data-on ${PROFILE.on ? "checked" : ""}> Activer ma campagne</label>
      <div class="profsv"><b>Ma sauvegarde</b> <input type="file" id="profsave" accept=".save,*/*" hidden><button type="button" data-svbtn>${PROFILE.sv ? "Importer une autre sauvegarde…" : "Importer ma sauvegarde (.save)…"}</button><button type="button" data-svpath title="%AppData%\\The Creative Assembly\\Warhammer3\\save_games">Copier le dossier des sauvegardes</button><small data-svmsg>${PROFILE.sv ? svInfo() : "Lue dans ton navigateur, rien n'est envoyé. Remplit la faction, le seigneur, son niveau et ses compétences prises, et retient les technologies recherchées."}</small>${PROFILE.sv && !PROFILE.fromSave ? `<button type="button" data-svuse>Reprendre les compétences de la sauvegarde</button>` : ""}</div>
      <div class="profrow">${picker("fac", "Faction", facBtn(PROFILE.fac), cults.map(c => `<div class="pkh">${esc(D.cultures[c])}</div>` + byCul[c].sort((a, b) => D.factions[a].localeCompare(D.factions[b], "fr")).map(f => pkItem("fac", f, crest(f, "s"), D.factions[f], f === PROFILE.fac)).join("")).join(""))}
      ${picker("lord", "Seigneur", lordBtn(), pkItem("lord", "auto", auto ? lordIcon(auto) : "", "Auto — " + (auto ? lordLabel(auto) : "aucun seigneur de départ connu"), PROFILE.lord === "auto") + pkItem("lord", "none", "", "Aucun seigneur", PROFILE.lord === "none") + lordChoices(PROFILE.fac).sort((a, b) => ((svLord(b) || {}).rank || 0) - ((svLord(a) || {}).rank || 0)).map(x => pkItem("lord", x, lordIcon(x), lordLabel(x) + (svLord(x) ? ` — niv. ${svLord(x).rank} (sauvegarde)` : ""), PROFILE.lord === x)).join(""))}</div>
      <div class="profrow"><label><span>Niveau du seigneur : <b data-lvtxt>${PROFILE.level}</b> <small>(${Math.max(0, PROFILE.level - 1)} point${PROFILE.level > 2 ? "s" : ""} de compétence${PROFILE.alloc.length ? `, ${spent()} dépensé${spent() > 1 ? "s" : ""} dans les bonus d'armée` : ""})</small></span>
        <input type="range" min="1" max="50" value="${PROFILE.level}" data-level></label><button type="button" data-lvmax>Tout au max (niveau 50)</button></div>
      <h3>Effets appliqués${st ? " — " + esc(lordLabel(st)) : ""}</h3>
      <ul class="proflist">${eff.length ? eff.map(e => `<li title="${esc(e.label)} (${esc(e.src)})">${LAB[e.stat]} ${e.v > 0 ? "+" : ""}${e.v}${e.pct ? " %" : ""} — ${tgt(e)}</li>`).join("") : `<li class="none">${st ? "Aucun effet de stats par défaut (ses effets de départ sont surtout des effets de campagne)." : "Aucun seigneur : aucun effet."}</li>`}${cond ? `<li class="none">${cond} effet(s) conditionnel(s) non appliqué(s) (terrain, embuscade, race adverse…).</li>` : ""}</ul>
      ${PROFILE.alloc.length ? `<h3>${usingSave(st) ? "Compétences prises dans ta sauvegarde" : "Compétences choisies automatiquement"}</h3><ul class="proflist">${PROFILE.alloc.map(x => `<li>${esc(x.n)} <b>${x.lv}/${x.max}</b> — ${x.effs.map(e => `${LAB[e.s]} ${e.v > 0 ? "+" : ""}${e.v}${e.p ? " %" : ""}${e.u === "lord" ? " (seigneur)" : ""}${e.c ? ` <i>si ${e.c.map(g => (typeof TAG_TXT !== "undefined" && TAG_TXT[g]) || g).join(" / ")} (Combat)</i>` : ""}`).join(", ")}${x.innate ? " · innée" : ""}</li>`).join("")}</ul>` : ""}
      <p class="dlcp">Le site dépense les points tout seul, en priorisant ce qui apporte le plus à la faction (heuristique) ; pas de choix compétence par compétence. Pas encore pris en compte : technologies et autres bonus de faction (chantiers à venir). Les duels et le classement par duels sont recalculés automatiquement pour ton profil (voir le bandeau). Dans le Combat, l'effet de ce même seigneur n'est pas compté deux fois.</p>
      <p class="dlcp" style="margin-bottom:16px"><button type="button" data-poff2>Désactiver et revenir aux stats du jeu</button></p>`;
  };

  /* ---------- Import d'une sauvegarde (.save) : voir savereader.js ---------- */
  const svLord = st => PROFILE.sv && PROFILE.sv.lords[st];
  const svInfo = () => { const v = PROFILE.sv, n = Object.keys(v.lords).length; return `${esc(v.name || "Sauvegarde")} · ${esc(D.factions[v.fac] || v.fac)} · ${n} seigneur${n > 1 ? "s" : ""} lu${n > 1 ? "s" : ""}, ${v.techs.length} technologie${v.techs.length > 1 ? "s" : ""} recherchée${v.techs.length > 1 ? "s" : ""}${PROFILE.fromSave ? " · compétences de la sauvegarde appliquées" : ""}`; };
  async function importSave(file) {
    const msg = t => { const m = dlg.querySelector("[data-svmsg]"); if (m) m.textContent = t; };
    if (!window.SaveReader) { msg("Lecteur de sauvegarde indisponible."); return; }
    try {
      msg("Lecture de " + file.name + " (" + (file.size / 1048576).toFixed(1) + " Mo)…"); await new Promise(r => setTimeout(r, 30));
      const buf = await file.arrayBuffer(); await new Promise(r => setTimeout(r, 30));
      const res = SaveReader.read(buf, t => msg(t));
      const hk = res.humans.find(k => res.factions[k].chars.length) || res.humans[0];
      if (!hk) { msg("Aucune faction jouée par un joueur dans cette sauvegarde."); return; }
      const f = res.factions[hk], lords = {};
      for (const c of f.chars) if (c.type === "general" && FX.lords[c.st] && !lords[c.st]) lords[c.st] = {rank: c.rank, xp: c.xp, unspent: c.unspent, skills: c.skills};
      const best = Object.keys(lords).sort((a, b) => lords[b].rank - lords[a].rank)[0];
      PROFILE.sv = {name: file.name.replace(/\.save$/i, "").replace(/_/g, " "), fac: hk, techs: f.techs, lords};
      if (D.facInfo[hk]) PROFILE.fac = hk;
      PROFILE.lord = best || "auto"; PROFILE.level = best ? Math.min(50, lords[best].rank) : PROFILE.level; PROFILE.fromSave = !!best; PROFILE.on = true;
      changed(); draw();
      const m = dlg.querySelector("[data-svmsg]"); if (m && !D.facInfo[hk]) m.textContent += " · faction « " + hk + " » inconnue du site : choisis-la à la main.";
    } catch (e) { msg("Échec de lecture : " + (e && e.message || e)); console.error(e); }
  }
  const open = () => { draw(); dlg.showModal(); };
  document.addEventListener("click", e => { if (e.target.closest("[data-pedit]")) open(); const o = e.target.closest("[data-poff]"); if (o) { PROFILE.on = false; changed(); } });
  dlg.addEventListener("click", e => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close();
    if (e.target.closest("[data-poff2]")) { PROFILE.on = false; changed(); draw(); } });
  dlg.addEventListener("click", e => {
    const b = e.target.closest("[data-pkbtn]");
    if (b) { const p = b.parentNode.querySelector(".pkp"), was = p.hidden; dlg.querySelectorAll(".pkp").forEach(x => { x.hidden = true; }); p.hidden = !was; if (!p.hidden) { const q = p.querySelector(".pkq"); q.value = ""; p.querySelectorAll(".pki,.pkh").forEach(x => { x.hidden = false; }); q.focus(); const sel = p.querySelector(".pki.sel"); if (sel) sel.scrollIntoView({block: "nearest"}); } return; }
    const f = e.target.closest("[data-pk-fac]"), l = e.target.closest("[data-pk-lord]");
    if (f) { PROFILE.fac = f.dataset.pkFac; PROFILE.lord = "auto"; PROFILE.on = true; changed(); draw(); return; }
    if (l) { PROFILE.lord = l.dataset.pkLord; PROFILE.on = true; const sl = svLord(PROFILE.lord); if (sl) { PROFILE.fromSave = true; PROFILE.level = Math.min(50, sl.rank); } changed(); draw(); return; }
    if (!e.target.closest(".pkp")) dlg.querySelectorAll(".pkp").forEach(x => { x.hidden = true; });
  });
  dlg.addEventListener("input", e => { const q = e.target.closest(".pkq"); if (!q) return; const t = q.value.trim().toLowerCase();
    q.parentNode.querySelectorAll(".pki").forEach(x => { x.hidden = !!t && !x.dataset.q.includes(t); });
    q.parentNode.querySelectorAll(".pkh").forEach(h => { let n = h.nextElementSibling, any = false; while (n && n.classList.contains("pki")) { if (!n.hidden) any = true; n = n.nextElementSibling; } h.hidden = !!t && !any; }); });
  dlg.addEventListener("click", e => {
    if (e.target.closest("[data-svbtn]")) {
      if (window.showOpenFilePicker) {                       // Chrome / Edge : le sélecteur retient le dernier dossier (id) ; un navigateur ne peut pas imposer un chemin
        showOpenFilePicker({id: "tww3save", startIn: "documents", types: [{description: "Sauvegarde Warhammer III", accept: {"application/octet-stream": [".save"]}}]})
          .then(h => h.getFile()).then(f => importSave(f)).catch(err => { if (!err || err.name !== "AbortError") dlg.querySelector("#profsave").click(); });
      } else dlg.querySelector("#profsave").click();
    }
    if (e.target.closest("[data-svpath]")) { const p = "%AppData%\\The Creative Assembly\\Warhammer3\\save_games", m = dlg.querySelector("[data-svmsg]");
      (navigator.clipboard ? navigator.clipboard.writeText(p) : Promise.reject()).then(() => { m.textContent = "Chemin copié : colle-le dans la barre d'adresse de la fenêtre de sélection."; }, () => { m.textContent = "Chemin : " + p; }); }
    if (e.target.closest("[data-svuse]")) { PROFILE.fromSave = true; const l = svLord(stOf()); if (l) PROFILE.level = Math.min(50, l.rank); changed(); draw(); }
  });
  dlg.addEventListener("change", e => { if (e.target.id === "profsave" && e.target.files[0]) importSave(e.target.files[0]); });
  dlg.addEventListener("input", e => { if ("level" in e.target.dataset) dlg.querySelector("[data-lvtxt]").textContent = e.target.value; });     // pendant le glissement : seulement l'affichage
  dlg.addEventListener("click", e => { if (e.target.closest("[data-lvmax]")) { PROFILE.level = 50; PROFILE.fromSave = false; PROFILE.on = true; changed(); draw(); } });
  dlg.addEventListener("change", e => { const c = e.target;
    if ("level" in c.dataset) { PROFILE.level = +c.value; PROFILE.fromSave = false; PROFILE.on = true; }
    else if ("on" in c.dataset) PROFILE.on = c.checked;
    else if ("fac" in c.dataset) { PROFILE.fac = c.value; PROFILE.lord = "auto"; PROFILE.on = true; }
    else if ("lord" in c.dataset) { PROFILE.lord = c.value; PROFILE.on = true; }
    else return;
    changed(); draw(); });
  apply(); drawBar();
})();
