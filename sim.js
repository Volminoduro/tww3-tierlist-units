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
const SIM = {SPEED_SCALE:0.24, TMAX:900, CHARGE_T:6, CHARGE_DMG:200, ENGAGE:0.6, RANGED_IN_MELEE:0.4, MORALE_BASE:0.15, MORALE_K:0.6,
  // Front de combat : nombre de modèles qui peuvent engager une unité adverse en même temps (approximation de la surface de contact)
  // FRONT_K : attaquants par modèle du front ; FRONT_LARGE : attaquants par grand modèle (≤ 6 modèles) ; RANK_DEFAULT : nombre de rangs si la donnée manque
  FRONT_K:4, FRONT_LARGE:10, RANK_DEFAULT:5};
const isLarge = u => ["monster","chariot","cav_melee","cav_ranged"].includes(u.role);
const isInf = u => u.role === "inf_melee" || u.role === "inf_ranged";
const isBack = u => u.role === "inf_ranged" || u.role === "artillery"; // « arrière » : protégé par la ligne de front
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
            ld: u.ld * (1 + b.mor/100) + (m.ld||0), up: upk(BON, side, e) * cnt, ammo: u.ranged ? (u.ranged.ammo || 30) * (1 + (m.ammo||0)/100) : 0, out: false, routed: false};
  });
  const S = {A: mk("A"), B: mk("B")};
  const spd = s => { let w=0, t=0; S[s].forEach(x => { w += x.cnt*x.u.men; t += x.cnt*x.u.men*x.spd; }); return w ? t/w*SIM.SPEED_SCALE : 0; };
  const vA = spd("A"), vB = opts.staticB ? 0 : spd("B"), closing = Math.max(0.5, vA + vB);
  const T0 = opts.dist / closing, upTot = s => S[s].reduce((a,x) => a + x.up, 0);
  const tot = {A: upTot("A"), B: upTot("B")}, timeline = [];
  const surv = s => S[s].reduce((a,x) => a + (x.out ? 0 : x.up * x.pool/x.pool0), 0);
  const active = s => S[s].some(x => !x.out);
  let t = 0;
  for (; t < SIM.TMAX; t++) {
    if (t % 5 === 0) timeline.push([t, surv("A"), surv("B")]);
    if (!active("A") || !active("B")) break;
    const dmgIn = {A: new Map(), B: new Map()}, meleeIn = {A: new Map(), B: new Map()}, engIn = {A: new Map(), B: new Map()};
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
        const n = a.pool / a.hp, u = a.u, charging = t >= T0 && t < T0 + SIM.CHARGE_T;
        for (const d of tg) {
          const w = (d.pool/d.hp) / W; let dps = 0, dpsM = 0;
          if (t >= T0) { // mêlée
            const m = u.melee, eng = n * (u.men <= 6 ? 1 : SIM.ENGAGE);
            const ma = a.ma + (charging ? a.charge : 0), hit = clamp(35 + ma - d.md, 8, 90) / 100;
            let dm = m.dmg, ap = m.ap, bonus = isLarge(d.u) ? m.bvl : isInf(d.u) ? m.bvi : 0;
            if (bonus && dm + ap > 0) { const s = dm + ap; dm += bonus*dm/s; ap += bonus*ap/s; }
            const cm = charging ? 1 + a.charge/SIM.CHARGE_DMG : 1;
            dpsM = eng * hit * ((dm*cm*a.mdm) * (1 - d.arm/200) + ap*cm*a.mdm) / Math.max(1, m.interval);
            dps += dpsM;
            const wm = frontAlive ? wt(d) / Wm : w;                                                          // part de la mêlée dirigée vers d
            engIn[foe].set(d, (engIn[foe].get(d) || 0) + eng * wm);                                          // attaquants qui cherchent à engager d
          }
          const r = u.ranged;
          if (r && a.ammo > 0) { // distance : portée atteinte quand dist − closing·t ≤ portée
            const inRange = opts.dist - closing*t <= a.range, f = t >= T0 ? SIM.RANGED_IN_MELEE : 1;
            if (inRange || t >= T0) dps += n * (r.share ?? 1) * r.shots * ((r.dmg*a.rdm)*(1 - d.arm/200) + r.ap*a.rdm) * opts.acc * f / Math.max(1, r.reload);
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
      if (d.u.men <= 6) cap = SIM.FRONT_LARGE * Nd;
      else { const units = Math.max(1, d.cnt), w0 = d.u.men / (d.u.rd > 0 ? d.u.rd : SIM.RANK_DEFAULT); cap = SIM.FRONT_K * units * Math.min(w0, Nd / units); }
      dmgIn[s].set(d, (dmgIn[s].get(d) || 0) + v * (E > cap && E > 0 ? cap / E : 1));
    }
    for (const s of ["A","B"]) for (const [d, v] of dmgIn[s]) d.pool = Math.max(0, d.pool - v);
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
function equalK(ARMY, BON, opts) { // multiplicateur de l'armée A pour obtenir un match nul (survie en coût de recrutement absolu)
  const f = k => { const r = simulate(ARMY, BON, {...opts, k:{A:k,B:1}}); return r.sA - r.sB; };
  let lo = Math.log(1/40), hi = Math.log(40);
  if (f(Math.exp(lo)) > 0) return {k: Math.exp(lo), edge:"low"}; if (f(Math.exp(hi)) < 0) return {k: Math.exp(hi), edge:"high"};
  for (let i = 0; i < 30; i++) { const mid = (lo+hi)/2; f(Math.exp(mid)) > 0 ? hi = mid : lo = mid; }
  return {k: Math.exp((lo+hi)/2)};
}
return {SIM, isLarge, isInf, isBack, clamp, simulate, equalK, upk};
});
