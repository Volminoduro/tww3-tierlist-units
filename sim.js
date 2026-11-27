"use strict";
/* SIMULATEUR DE COMBAT PARTAGÉ : ce fichier unique est chargé par le navigateur (<script src="sim.js">) ET par Node (require),
   pour garantir des résultats strictement identiques sur le site et dans les calculs de duels précalculés.
/* Simulateur de combat (modèle agrégé, valeurs attendues, pas de 1 s).
   Formules reprises du jeu : touche = clamp(35 + MA − MD, 8, 90) % ; dégâts = base × (1 − armure/200) + perforants
   (jet d'armure uniforme 0..armure, plafonné à 100) ; bonus vs grands/infanterie répartis au prorata base/perforant ;
   intervalle d'attaque. Approximations : charge, moral, engagement, précision des tirs, vitesse → m/s.
   armies = {A:[{u, count}], B:[...]}, bonus = {A:{arm,dmg,hp,mor,up}, B:{...}} (en %), opts = {dist, acc, staticB, k?}. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(); else root.TWW3Sim = factory();
})(typeof self !== "undefined" ? self : this, function () {
const SIM = {SPEED_SCALE:0.24, TMAX:900, CHARGE_DECAY:13, CHARGE_DMG:200, REFLECT:2, REFLECT_MIN:0.7, ENGAGE:0.6, RANGED_IN_MELEE:0.4, MORALE_BASE:0.15, MORALE_K:0.6, RES_CAP:90,
  // Front de combat : nombre de modèles qui peuvent engager une unité adverse en même temps (approximation de la surface de contact)
  // FRONT_K : attaquants par modèle du front ; RANK_DEFAULT : nombre de rangs si la donnée manque ;
  // grands modèles (≤ 6) : surface de contact géométrique = périmètre du corps du défenseur ÷ (2 × demi-largeur de l'attaquant moyen) + π (formule de Steiner), voir plus bas ;
  // FRONT_LARGE : valeur de repli si les tailles de corps manquent dans les données
  FRONT_K:4, FRONT_LARGE:10, RANK_DEFAULT:5};
const isLarge = u => ["monster","chariot","cav_melee","cav_ranged"].includes(u.role);
const isInf = u => u.role === "inf_melee" || u.role === "inf_ranged";
const isBack = u => u.role === "inf_ranged" || u.role === "artillery"; // « arrière » : protégé par la ligne de front
// Résistances (u.res, en % : > 0 résiste, < 0 vulnérable) : tout (parade magique) toujours ; magie si l'attaque est magique, sinon physique ; feu si elle est enflammée ;
// missile si c'est un tir. Elles s'additionnent (pas de produit), après l'armure, avec un plafond de 90 % (plafond non vérifié pour WH3).
const resMul = (d, atk, ranged) => { const r = d.u.res; if (!r) return 1;
  const t = (r.all || 0) + (atk.mg ? r.ma || 0 : r.ph || 0) + (atk.fl ? r.fl || 0 : 0) + (ranged ? r.mi || 0 : 0);
  return 1 - clamp(t, -100, SIM.RES_CAP) / 100; };
const clamp = (v,a,b) => Math.min(b, Math.max(a, v));
const upk = (BON, side, e) => e.u.cost * (1 - BON[side].up/100); // base de comparaison = COÛT DE RECRUTEMENT (le champ « up » du camp = réduction de ce coût, en %)

function simulate(ARMY, BON, opts) {
  const mk = side => ARMY[side].map(e => {
    // e.mods (optionnel) : modificateurs propres à l'unité, issus des effets de seigneur/faction : ma, md, arm, ld, charge (points) ; ws, ms, spd, hp, ammo, range (%)
    const u = e.u, b = BON[side], m = e.mods || {}, cnt = e.count * (opts.k?.[side] ?? 1);
    const hp = u.hp * (1 + b.hp/100) * (1 + (m.hp||0)/100), pool = cnt * u.men * hp;
    return {side, u, cnt, hp, pool, pool0: pool, arm: Math.min(100, u.armour*(1+b.arm/100) + (m.arm||0)), dm: 1 + b.dmg/100,
            mdm: (1 + b.dmg/100) * (1 + (m.ws||0)/100), rdm: (1 + b.dmg/100) * (1 + (m.ms||0)/100),
            ma: u.ma + (m.ma||0), md: u.md + (m.md||0), charge: u.charge + (m.charge||0), spd: u.speed * (1 + (m.spd||0)/100),
            range: u.ranged ? u.ranged.range * (1 + (m.range||0)/100) : 0,
            ld: u.ld * (1 + b.mor/100) + (m.ld||0), dead: 0, at: new Set(u.at || []), up: upk(BON, side, e) * cnt, ammo: u.ranged ? (u.ranged.ammo || 30) * (1 + (m.ammo||0)/100) : 0, out: false, routed: false};
  });
  const S = {A: mk("A"), B: mk("B")};
  const spd = s => { let w=0, t=0; S[s].forEach(x => { w += x.cnt*x.u.men; t += x.cnt*x.u.men*x.spd; }); return w ? t/w*SIM.SPEED_SCALE : 0; };
  /* Charge (règles du jeu, voir TODO.md point 5) : seul le camp qui AVANCE charge ; un camp « tient sa position » (opts.hold.A / .B, ou opts.staticB pour B) ne reçoit pas de bonus de charge et
     peut être en bracing. Le bonus décroît linéairement sur CHARGE_DECAY = 13 s (charge_decay_duration). Attributs : charge_defense annule le bonus de tout attaquant face à un défenseur en bracing,
     charge_defense_vs_large celui des grands attaquants ; ogre_charge n'en perd que la moitié (le quart pour ogre_charge_upgraded) ; charge_reflection double les dégâts infligés aux ennemis qui chargent
     (tant que leur bonus restant dépasse REFLECT_MIN). */
  const hold = {A: !!(opts.hold && opts.hold.A === true), B: !!(opts.staticB || (opts.hold && opts.hold.B === true))};
  const vA = hold.A ? 0 : spd("A"), vB = hold.B ? 0 : spd("B"), closing = Math.max(0.5, vA + vB);
  const T0 = opts.dist / closing, upTot = s => S[s].reduce((a,x) => a + x.up, 0);
  const rawF = (a, t) => (hold[a.side] || t < T0) ? 0 : Math.max(0, 1 - (t - T0) / SIM.CHARGE_DECAY);
  const chargeF = (a, d, t) => { let f = rawF(a, t);
    if (f > 0 && hold[d.side] && (d.at.has("charge_defense") || (d.at.has("charge_defense_vs_large") && isLarge(a.u)))) f *= a.at.has("ogre_charge_upgraded") ? 0.75 : a.at.has("ogre_charge") ? 0.5 : 0;
    return f; };
  const reflected = (a, d, t) => hold[a.side] && a.at.has("charge_reflection") && rawF(d, t) >= SIM.REFLECT_MIN;
  const tot = {A: upTot("A"), B: upTot("B")}, timeline = [];
  const surv = s => S[s].reduce((a,x) => a + (x.out ? 0 : x.up * x.pool/x.pool0), 0);
  const active = s => S[s].some(x => !x.out);
  let t = 0;
  for (; t < SIM.TMAX; t++) {
    if (t % 5 === 0) timeline.push([t, surv("A"), surv("B")]);
    if (!active("A") || !active("B")) break;
    const dmgIn = {A: new Map(), B: new Map()}, meleeIn = {A: new Map(), B: new Map()}, engIn = {A: new Map(), B: new Map()}, radIn = {A: new Map(), B: new Map()};
    for (const me of ["A","B"]) {
      const foe = me === "A" ? "B" : "A", tg = S[foe].filter(x => !x.out);
      const W = tg.reduce((a,x) => a + x.pool/x.hp, 0);
      if (!W) continue;
      // Protection de l'arrière : tant qu'une unité de ligne du camp attaqué est debout, la mêlée adverse n'atteint les tireurs/artillerie qu'à (1 − protection)
      const protF = (BON[foe].prot || 0) / 100, frontAlive = protF > 0 && tg.some(x => !isBack(x.u));
      const wt = x => (frontAlive && isBack(x.u) ? 1 - protF : 1) * x.pool / x.hp;
      const Wm = frontAlive ? tg.reduce((a, x) => a + wt(x), 0) : W;
      for (const a of S[me]) {
        if (a.out) continue;
        const n = a.pool / a.hp, u = a.u;
        for (const d of tg) {
          const w = (d.pool/d.hp) / W; let dps = 0, dpsM = 0;
          if (t >= T0) { // mêlée
            const m = u.melee, eng = n * (u.men <= 6 ? 1 : SIM.ENGAGE);
            const f = chargeF(a, d, t), ma = a.ma + f * a.charge, hit = clamp(35 + ma - d.md, 8, 90) / 100;
            let dm = m.dmg, ap = m.ap, bonus = isLarge(d.u) ? m.bvl : isInf(d.u) ? m.bvi : 0;
            if (bonus && dm + ap > 0) { const s = dm + ap; dm += bonus*dm/s; ap += bonus*ap/s; }
            const cm = 1 + f * a.charge / SIM.CHARGE_DMG;
            dpsM = eng * hit * ((dm*cm*a.mdm) * (1 - d.arm/200) + ap*cm*a.mdm) / Math.max(1, m.interval) * resMul(d, m, false) * (reflected(a, d, t) ? SIM.REFLECT : 1);
            dps += dpsM;
            const wm = frontAlive ? wt(d) / Wm : w;                                                          // part de la mêlée dirigée vers d
            engIn[foe].set(d, (engIn[foe].get(d) || 0) + eng * wm);                                          // attaquants qui cherchent à engager d
            radIn[foe].set(d, (radIn[foe].get(d) || 0) + eng * wm * (u.rw || 0));                            // … et leur demi-largeur cumulée (pour la taille moyenne des attaquants)
          }
          const r = u.ranged;
          if (r && a.ammo > 0) { // distance : portée atteinte quand dist − closing·t ≤ portée
            const inRange = opts.dist - closing*t <= a.range, f = t >= T0 ? SIM.RANGED_IN_MELEE : 1;
            if (inRange || t >= T0) dps += n * (r.share ?? 1) * r.shots * ((r.dmg*a.rdm)*(1 - d.arm/200) + r.ap*a.rdm) * opts.acc * f / Math.max(1, r.reload) * resMul(d, r, true);
          }
          if (dps - dpsM) dmgIn[foe].set(d, (dmgIn[foe].get(d) || 0) + (dps - dpsM) * w);                      // tir : pas limité par le front
          if (dpsM) meleeIn[foe].set(d, (meleeIn[foe].get(d) || 0) + dpsM * (frontAlive ? wt(d) / Wm : w)); // mêlée : limitée par le front, voir plus bas
        }
        if (u.ranged && a.ammo > 0 && (opts.dist - closing*t <= a.range || t >= T0)) a.ammo -= 1/Math.max(1, u.ranged.reload);
      }
    }
    // Front de combat : la mêlée subie par une unité est réduite si plus d'attaquants cherchent à l'engager que la surface de contact ne le permet
    // Unités à effectif ≥ 7 : capacité = FRONT_K × largeur du front. Largeur d'une unité = hommes ÷ rangs (rank_depth du jeu), conservée tant qu'il reste assez de survivants (les rangs arrière comblent
    // les trous : la profondeur baisse, pas la largeur), puis égale au nombre de survivants. Grands modèles (≤ 6) : FRONT_LARGE attaquants chacun.
    for (const s of ["A","B"]) for (const [d, v] of meleeIn[s]) {
      const Nd = d.pool / d.hp, E = engIn[s].get(d) || 0;
      let cap;
      if (d.u.men <= 6) { // grand modèle : attaquants qui tiennent autour de son corps (périmètre ÷ largeur d'un attaquant + π), selon la taille moyenne des attaquants
        const rbar = E > 0 ? (radIn[s].get(d) || 0) / E : 0;
        cap = (d.u.per > 0 && rbar > 0 ? d.u.per / (2 * rbar) + Math.PI : SIM.FRONT_LARGE) * Nd;
      }
      else { const units = Math.max(1, d.cnt), w0 = d.u.men / (d.u.rd > 0 ? d.u.rd : SIM.RANK_DEFAULT); cap = SIM.FRONT_K * units * Math.min(w0, Nd / units); }
      dmgIn[s].set(d, (dmgIn[s].get(d) || 0) + v * (E > cap && E > 0 ? cap / E : 1));
    }
    for (const s of ["A","B"]) for (const [d, v] of dmgIn[s]) d.pool = Math.max(0, d.pool - v);
    // Régénération (capacité passive, u.regen = fraction des PV max par seconde, par modèle vivant). Le soin ne ressuscite personne : les modèles morts
    // (PV perdus ÷ PV d'un modèle, au pire moment) sont définitivement perdus, donc le total ne dépasse jamais (modèles vivants × PV d'un modèle).
    for (const x of [...S.A, ...S.B]) {
      if (!x.u.regen || x.out) continue;
      x.dead = Math.max(x.dead, Math.floor((x.pool0 - x.pool) / x.hp + 1e-9));
      const maxPool = x.pool0 - x.dead * x.hp;
      if (x.pool > 0 && x.pool < maxPool) x.pool = Math.min(maxPool, x.pool + x.u.regen * maxPool);
    }
    for (const x of [...S.A, ...S.B]) {
      if (x.out) continue;
      const c = 1 - x.pool/x.pool0;
      if (x.pool <= 0.5) x.out = true;
      else if (c >= SIM.MORALE_BASE + clamp(x.ld,0,100)/100 * SIM.MORALE_K) { x.out = x.routed = true; }
    }
  }
  timeline.push([t, surv("A"), surv("B")]);
  return {S, tot, timeline, time: t, sA: surv("A"), sB: surv("B"), T0, vA, vB};
}
/* Choix automatique « charger ou tenir sa position » : opts.hold.A / .B valent true (tient), false (charge) ou "auto". Un camp en « auto » ne peut avoir intérêt à tenir que s'il compte des unités
   à défense contre la charge ou à réflexion ; on part de « les deux chargent » puis chaque camp en « auto » bascule s'il améliore sa propre marge (survie en coût rapportée au coût de départ,
   moins celle de l'adversaire), jusqu'à stabilité (4 tours au plus). Les deux ne peuvent pas tenir en même temps (pas de contact). Renvoie le résultat de simulate() plus hold = choix retenus. */
const CAN_HOLD = e => !!(e.u.at && e.u.at.some(a => a === "charge_defense" || a === "charge_defense_vs_large" || a === "charge_reflection"));
function resolve(ARMY, BON, opts) {
  const want = opts.hold || {}, auto = {A: want.A === "auto", B: want.B === "auto"};
  let cur = {A: want.A === true, B: opts.staticB || want.B === true};
  const run = h => { const r = simulate(ARMY, BON, {...opts, hold: h}); return {r, m: (r.tot.A ? r.sA / r.tot.A : 0) - (r.tot.B ? r.sB / r.tot.B : 0)}; };
  let best = run(cur);
  const able = {A: auto.A && ARMY.A.some(CAN_HOLD), B: auto.B && ARMY.B.some(CAN_HOLD)};
  for (let it = 0; it < 4 && (able.A || able.B); it++) {
    let changed = false;
    for (const s of ["A", "B"]) {
      if (!able[s]) continue;
      const alt = {...cur, [s]: !cur[s]}; if (alt.A && alt.B) continue;
      const o = run(alt), sign = s === "A" ? 1 : -1;
      if ((o.m - best.m) * sign > 0.005) { best = o; cur = alt; changed = true; }
    }
    if (!changed) break;
  }
  return {...best.r, hold: cur, auto};
}
function equalK(ARMY, BON, opts) { // multiplicateur de l'armée A pour obtenir un match nul (survie en coût de recrutement absolu)
  const f = k => { const r = resolve(ARMY, BON, {...opts, k:{A:k,B:1}}); return r.sA - r.sB; };
  let lo = Math.log(1/40), hi = Math.log(40);
  if (f(Math.exp(lo)) > 0) return {k: Math.exp(lo), edge:"low"}; if (f(Math.exp(hi)) < 0) return {k: Math.exp(hi), edge:"high"};
  for (let i = 0; i < 30; i++) { const mid = (lo+hi)/2; f(Math.exp(mid)) > 0 ? hi = mid : lo = mid; }
  return {k: Math.exp((lo+hi)/2)};
}
return {SIM, isLarge, isInf, isBack, clamp, simulate, resolve, equalK, upk};
});
