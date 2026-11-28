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
const SIM = {SPEED_SCALE:0.24, TMAX:900, CHARGE_DECAY:13, CHARGE_DMG:200, REFLECT:2, REFLECT_MIN:0.7, ENGAGE:0.6, RANGED_LOS:0.55, KITE_GAP:40, KITE_ROOM:400, IMPACT_MOD:0.6, IMPACT_NORM:0.8, IMPACT_E:3500, RANK2:2, IMPACT_PEN:0.5, IMPACT_MAX:70, IMPACT_AP:0.7, MORALE_BASE:0.15, MORALE_K:0.6, RES_CAP:90, FEAR_LD:8, TERROR_LD:50, TERROR_THR:13, SHOCK_ROUT:14, SHOCK_IMMUNE:85, MORALE_MODEL:"table", RECENT_WIN:10, MORALE_UPD:0.15, MORALE_MINSTEP:1, ARMY_PEN_K:1, FLANK_PEN:6, FORMED_MD:5, ENEMY_PEN_K:1, ENEMY_POWER_UNIT:125, FATIGUE_RES:0.5, FATIGUE:true, FATIGUE_SCALE:10, CHARGE_RUN:4,
  // Front de combat : nombre de modèles qui peuvent engager une unité adverse en même temps (approximation de la surface de contact)
  // FRONT_K : attaquants par modèle du front ; RANK_DEFAULT : nombre de rangs si la donnée manque ;
  // grands modèles (≤ 6) : surface de contact géométrique = périmètre du corps du défenseur ÷ (2 × demi-largeur de l'attaquant moyen) + π (formule de Steiner), voir plus bas ;
  // FRONT_LARGE : valeur de repli si les tailles de corps manquent dans les données
  FRONT_K:3, FRONT_LARGE:10, RANK_DEFAULT:5};
const isLarge = u => ["monster","chariot","cav_melee","cav_ranged"].includes(u.role);
const isInf = u => u.role === "inf_melee" || u.role === "inf_ranged";
const isBack = u => u.role === "inf_ranged" || u.role === "artillery"; // « arrière » : protégé par la ligne de front
// Résistances (u.res, en % : > 0 résiste, < 0 vulnérable) : tout (parade magique) toujours ; magie si l'attaque est magique, sinon physique ; feu si elle est enflammée ;
// missile si c'est un tir. Elles s'additionnent (pas de produit), après l'armure, avec un plafond de 90 % (plafond non vérifié pour WH3).
const resMul = (d, atk, ranged) => { const r = d.u.res; if (!r) return 1;
  const t = (r.all || 0) + (atk.mg ? r.ma || 0 : r.ph || 0) + (atk.fl ? r.fl || 0 : 0) + (ranged ? r.mi || 0 : 0);
  return 1 - clamp(t, -100, SIM.RES_CAP) / 100; };
/* Moral « table » : constantes de _kv_morale_tables (dump). Pénalités par pourcentage de pertes (interpolées linéairement entre les paliers, plafonnées au dernier) :
   total_casualties_penalty_* (pertes totales de l'unité, en PV : use_hitpoints_instead_of_casualties_prop_in_morale_calculation), recent_casualties_penalty_* (pertes sur la fenêtre RECENT_WIN,
   durée non fournie par les tables : 10 s supposées), extended_casualties_penalty_* (pertes de l'armée, interprétation). Combat gagné / perdu : winning_combat_* / losing_combat_*.
   Le moral courant rejoint la cible de MORALE_UPD (percent_update_per_tick = 0,15) par seconde, d'au moins MORALE_MINSTEP ; l'unité fuit à 0 (ums_broken_threshold_upper). */
const MTAB = {tot: [[10,-2],[20,-4],[30,-7],[40,-11],[50,-16],[60,-22],[70,-32],[80,-47],[90,-74]], rec: [[6,-6],[10,-12],[15,-20],[33,-44],[50,-80]], ext: [[10,-4],[15,-6],[33,-14],[50,-32],[80,-60]]};
/* Fatigue : taux d'activité (_kv_fatigue_tables) et effets par palier (unit_fatigue_effects : multiplicateurs de stats). ÉCHELLE DE TEMPS NON FOURNIE : on suppose des taux par 0,1 s (FATIGUE_SCALE = 10 par seconde),
   ce qui donne « fatigué » après ~65 s de mêlée. fatigue_immune : jamais fatigué ; unyielding_assault : l'attaque de mêlée ne baisse jamais. */
const FAT = {combat: 19, charging: 34, run: 4, runCav: 6, shoot: 18, walk: -1, idle: -18}, FMAX = 30000, FONE = {ma: 1, md: 1, arm: 1, ch: 1, ap: 1, rl: 1, sp: 1};
const FLV = [[27000, {ma: .7, md: .9, arm: .75, ch: .7, ap: .9, rl: .9, sp: .85}], [18000, {ma: .75, md: 1, arm: .9, ch: .75, ap: .9, rl: 1, sp: .85}], [12600, {ma: .85, md: 1, arm: 1, ch: .9, ap: .9, rl: 1, sp: .9}], [6600, {ma: .95, md: 1, arm: 1, ch: 1, ap: .9, rl: 1, sp: .95}], [2800, {ma: .95, md: 1, arm: 1, ch: 1, ap: 1, rl: 1, sp: 1}]];
const fatMul = f => { for (const [th, m] of FLV) if (f >= th) return m; return FONE; };
const mpen = (tab, pct) => { if (pct <= 0) return 0; let px = 0, py = 0; for (const [x, y] of tab) { if (pct <= x) return py + (y - py) * (pct - px) / (x - px); px = x; py = y; } return py; };
const clamp = (v,a,b) => Math.min(b, Math.max(a, v));
const upk = (BON, side, e) => e.u.cost * (1 - BON[side].up/100); // base de comparaison = COÛT DE RECRUTEMENT (le champ « up » du camp = réduction de ce coût, en %)

function simulate(ARMY, BON, opts) {
  const mk = side => ARMY[side].map(e => {
    // e.mods (optionnel) : modificateurs propres à l'unité, issus des effets de seigneur/faction : ma, md, arm, ld, charge (points) ; ws, ms, spd, hp, ammo, range (%)
    const u = e.u, b = BON[side], m = e.mods || {}, cnt = e.count * (opts.k?.[side] ?? 1);
    const hp = u.hp * (1 + b.hp/100) * (1 + (m.hp||0)/100), pool = cnt * u.men * hp;
    return {side, u, cnt, hp, pool, pool0: pool, arm: Math.min(100, u.armour*(1+b.arm/100) + (m.arm||0)), dm: 1 + b.dmg/100,
            mdm: (1 + b.dmg/100) * (1 + (m.ws||0)/100), rdm: (1 + b.dmg/100) * (1 + (m.ms||0)/100),
            ma: u.ma + (m.ma||0), md: u.md + (m.md||0) + ((u.at || []).includes("formed_attack") ? SIM.FORMED_MD : 0), charge: u.charge + (m.charge||0), spd: u.speed * (1 + (m.spd||0)/100),
            range: u.ranged ? u.ranged.range * (1 + (m.range||0)/100) : 0,
            vigK: Math.max(0, 1 + ((m.vig||0) + (u.vig||0))/100) * ((u.at || []).includes("fatigue_res") ? SIM.FATIGUE_RES : 1), pvOn: !!m.pv || !!u.pvx,   // perte de vigueur (% : −15 = 15 % de fatigue en moins) et vigueur parfaite (effets de seigneur, profil)
            ld: u.ld * (1 + b.mor/100) + (m.ld||0), dead: 0, at: new Set(u.at || []), up: upk(BON, side, e) * cnt, ammo: u.ranged ? (u.ranged.ammo || 30) * (1 + (m.ammo||0)/100) : 0, out: false, routed: false, flee: false, back: 0, imm: 0, M: u.ld * (1 + b.mor/100) + (m.ld||0), hist: [], fat: 0, fm: null};
  });
  const S = {A: mk("A"), B: mk("B")};
  const spd = s => { let w=0, t=0; S[s].forEach(x => { w += x.cnt*x.u.men; t += x.cnt*x.u.men*x.spd; }); return w ? t/w*SIM.SPEED_SCALE : 0; };
  /* Charge (règles du jeu, voir TODO.md point 5) : seul le camp qui AVANCE charge ; un camp « tient sa position » (opts.hold.A / .B, ou opts.staticB pour B) ne reçoit pas de bonus de charge et
     peut être en bracing. Le bonus décroît linéairement sur CHARGE_DECAY = 13 s (charge_decay_duration). Attributs : charge_defense annule le bonus de tout attaquant face à un défenseur en bracing,
     charge_defense_vs_large celui des grands attaquants ; ogre_charge n'en perd que la moitié (le quart pour ogre_charge_upgraded) ; charge_reflection double les dégâts infligés aux ennemis qui chargent
     (tant que leur bonus restant dépasse REFLECT_MIN). */
  const hold = {A: !!(opts.hold && opts.hold.A === true), B: !!(opts.staticB || (opts.hold && opts.hold.B === true))};
  /* Garder ses distances (hit and run, stratégie « kite » d'un camp de tireurs) : le camp K reste immobile et tire ; quand l'ennemi arrive à KITE_GAP m il recule (s'il est plus rapide que lui : vK > vE),
     puis s'arrête et tire de nouveau, jusqu'à avoir épuisé sa marge de recul (opts.room, KITE_ROOM = 400 m par défaut). Sur toute cette phase (qui dure room / vE) K ne tire qu'une fraction 1 − vE/vK du
     temps (reculer et tirer en alternance), sauf les unités à tir en mouvement (attribut mounted_fire_move) qui tirent en permanence. Le contact arrive à la fin. Si l'ennemi tient sa position, K avance
     jusqu'à sa portée et tire sans jamais engager ; si K n'est pas plus rapide que l'ennemi, il ne peut pas se dérober (il tient simplement sa position). Un seul camp peut garder ses distances. */
  const kiteReq = {A: !!(opts.hold && opts.hold.A === "kite"), B: !!(opts.hold && opts.hold.B === "kite")};
  const KS = kiteReq.A && !kiteReq.B ? "A" : kiteReq.B && !kiteReq.A ? "B" : null;
  const vRaw = {A: spd("A"), B: spd("B")};
  const vA = (hold.A || KS === "A") ? 0 : vRaw.A, vB = (hold.B || KS === "B") ? 0 : vRaw.B;
  let closing = Math.max(0.5, vA + vB), T0 = opts.dist / closing, kiteT = null;
  if (KS) { const E = KS === "A" ? "B" : "A", vK = vRaw[KS], vE = hold[E] ? 0 : vRaw[E];
    if (vE <= 0) { T0 = Infinity; closing = Math.max(0.5, vK); }
    else if (vK > vE) { const Tg = Math.max(0, (opts.dist - SIM.KITE_GAP) / vE); T0 = Tg + (opts.room ?? SIM.KITE_ROOM) / vE; kiteT = {side: KS, Tg, duty: 1 - vE / vK}; }
  }
  const walk = {A: !!(opts.hold && opts.hold.A === "walk"), B: !!(opts.hold && opts.hold.B === "walk")};   // « marche » : avance sans courir = pas de bonus de charge, mais pas en bracing
  /* Vitesse et fatigue : pendant l'approche la jauge monte (course 4 / cavalerie 6, marche −1, immobile −18, par 0,1 s) et les paliers ralentissent (scalar_speed : ×0,95 essoufflé … ×0,85 épuisé) ;
     le temps de contact T0 est intégré seconde par seconde (par camp : moyenne des unités pondérée par les effectifs). Ignoré pour le tir-fuite (KS). */
  if (SIM.FATIGUE && !KS && Number.isFinite(T0) && (vA > 0 || vB > 0)) {
    const spAt = (side, tt) => { let w = 0, m = 0; for (const x of S[side]) { const n = x.cnt * x.u.men; if (x.at.has("fatigue_immune") || x.pvOn) { w += n; m += n; continue; }
      const r = hold[side] ? FAT.idle : walk[side] ? FAT.walk : /^cav/.test(x.u.cls || "") ? FAT.runCav : FAT.run;
      w += n; m += n * fatMul(clamp(r * SIM.FATIGUE_SCALE * (r > 0 ? x.vigK : 1) * tt, 0, FMAX)).sp; } return w ? m / w : 1; };
    let pos = 0, tt = 0, cl = 0; while (pos < opts.dist && tt < 600) { cl = Math.max(0.5, vA * spAt("A", tt) + vB * spAt("B", tt)); pos += cl; tt++; }
    T0 = Math.max(0, tt - (pos - opts.dist) / cl);
  }
  const upTot = s => S[s].reduce((a,x) => a + x.up, 0);
  const meleeShoot = a => a.u.men <= 6 ? 0 : clamp((1 - 1 / (a.u.rd > 0 ? a.u.rd : SIM.RANK_DEFAULT)) * SIM.RANGED_LOS, 0, 1);   // tireurs au contact : les rangs arrière tirent encore, gênés par la ligne de mêlée (RANGED_LOS)
  /* Impact (collision) d'une charge : au premier contact, chaque modèle attaquant qui charge (ni « marche », ni « tient », ni « garde ses distances ») heurte le défenseur. Dégâts par modèle touché =
     min(IMPACT_MAX, IMPACT_MOD ÷ IMPACT_NORM × ½·masse·Δv² ÷ IMPACT_E) (IMPACT_MOD, IMPACT_NORM, IMPACT_MAX, IMPACT_AP viennent de _kv_rules ; IMPACT_E et IMPACT_PEN sont des échelles posées par nous, calibrées à vue : une charge de cavalerie lourde fauche de l'ordre de 20 à 30 fantassins légers, non vérifié), dont 70 % perforants (IMPACT_AP) ;
     Δv = vitesse de course de l'attaquant (+ celle du défenseur s'il avance : choc frontal). Pénétration : modèles heurtés par attaquant = 1 + IMPACT_PEN × log2(masse attaquant ÷ masse du défenseur), bornés par
     ses rangs ; un défenseur en bracing compte une masse accrue (jusqu'à ×4 à 8 rangs, ×2 de plus avec charge_defense). Ni renversement ni recul modélisés. */
  const impactDmg = (a, d, E) => {
    if (hold[a.side] || walk[a.side] || a.side === KS) return 0;
    const mA = a.u.mass || 0, rvD = (hold[d.side] || d.side === KS) ? 0 : d.spd / 10, dv = a.spd / 10 + rvD;
    if (!(mA > 0 && dv > 0 && E > 0)) return 0;
    const rd = d.u.rd > 0 ? d.u.rd : 1, brace = hold[d.side] ? 1 + 3 * Math.min(1, rd / 8) * (d.at.has("charge_defense") ? 2 : 1) : 1, mD = Math.max(1, (d.u.mass || 100) * brace);
    const dm = Math.min(SIM.IMPACT_MAX, SIM.IMPACT_MOD / SIM.IMPACT_NORM * 0.5 * mA * dv * dv / SIM.IMPACT_E) * (SIM.IMPACT_AP + (1 - SIM.IMPACT_AP) * (1 - d.arm / 200));
    const P = clamp(1 + SIM.IMPACT_PEN * Math.log2(Math.max(1, mA / mD)), 1, rd), wF = a.u.men <= 6 ? clamp((a.u.rw || 1) / (d.u.rw || 0.65), 1, 6) : 1, N = Math.min(d.pool / d.hp, E * P * wF);
    return N * dm * resMul(d, {}, false);
  };
  let impDone = false;
  const contactCap = (d, E, rbar) => {        // nombre maximal d'attaquants qui peuvent engager d en même temps (front de combat)
    if (d.u.men <= 6) return (d.u.per > 0 && rbar > 0 ? d.u.per / (2 * rbar) + Math.PI : SIM.FRONT_LARGE) * (d.pool / d.hp);
    const units = Math.max(1, d.cnt), w0 = d.u.men / (d.u.rd > 0 ? d.u.rd : SIM.RANK_DEFAULT); return SIM.FRONT_K * units * Math.min(w0, (d.pool / d.hp) / units);
  };
  const rawF = (a, t) => (hold[a.side] || walk[a.side] || t < T0) ? 0 : Math.max(0, 1 - (t - T0) / (SIM.CHARGE_DECAY * (a.at.has("glorious_charge") ? 2 : 1)));      // glorious_charge : durée du bonus de charge doublée
  const chargeF = (a, d, t) => { let f = rawF(a, t);
    if (f > 0 && hold[d.side] && (d.at.has("charge_defense") || (d.at.has("charge_defense_vs_large") && isLarge(a.u)))) f *= a.at.has("ogre_charge_upgraded") ? 0.75 : a.at.has("ogre_charge") ? 0.5 : 0;
    return f; };
  const reflected = (a, d, t) => hold[a.side] && a.at.has("charge_reflection") && rawF(d, t) >= SIM.REFLECT_MIN;
  const tot = {A: upTot("A"), B: upTot("B")}, timeline = [];
  const surv = s => S[s].reduce((a,x) => a + (x.out ? 0 : x.up * x.pool/x.pool0), 0);
  const active = s => S[s].some(x => !x.out);
  let t = 0;
  for (; t < (opts.tmax ?? SIM.TMAX); t++) {
    if (t % 5 === 0) timeline.push([t, surv("A"), surv("B")]);
    if (!active("A") || !active("B")) break;
    for (const x of [...S.A, ...S.B]) {                                                    // fatigue : taux selon l'activité de l'unité ce tick, puis multiplicateurs du palier atteint
      if (!SIM.FATIGUE || x.at.has("fatigue_immune") || x.pvOn) { x.fm = FONE; continue; }
      const cav = /^cav/.test(x.u.cls || ""), idle = hold[x.side] && t < T0, kite = x.side === KS;
      const rate = (t >= T0 && !x.out && !x.flee) ? FAT.combat : idle ? FAT.idle : walk[x.side] ? FAT.walk : (x.u.ranged && (kite || hold[x.side])) ? FAT.shoot : (t >= T0 - SIM.CHARGE_RUN && !kite) ? FAT.charging : cav ? FAT.runCav : FAT.run;
      x.fat = clamp(x.fat + rate * SIM.FATIGUE_SCALE * (rate > 0 ? x.vigK : 1), 0, FMAX);
      const m = fatMul(x.fat); x.fm = x.at.has("unyielding_assault") && m.ma < 1 ? {...m, ma: 1} : m;
    }
    const dmgIn = {A: new Map(), B: new Map()}, meleeIn = {A: new Map(), B: new Map()}, engIn = {A: new Map(), B: new Map()}, radIn = {A: new Map(), B: new Map()};
    for (const me of ["A","B"]) {
      const foe = me === "A" ? "B" : "A", tg = S[foe].filter(x => !x.out && !x.flee);
      const W = tg.reduce((a,x) => a + x.pool/x.hp, 0);
      if (!W) continue;
      // Protection de l'arrière : tant qu'une unité de ligne du camp attaqué est debout, la mêlée adverse n'atteint les tireurs/artillerie qu'à (1 − protection)
      const protF = (BON[foe].prot || 0) / 100, frontAlive = protF > 0 && tg.some(x => !isBack(x.u));
      const wt = x => (frontAlive && isBack(x.u) ? 1 - protF : 1) * x.pool / x.hp;
      const Wm = frontAlive ? tg.reduce((a, x) => a + wt(x), 0) : W;
      for (const a of S[me]) {
        if (a.out || a.flee) continue;
        const n = a.pool / a.hp, u = a.u;
        const kitingNow = kiteT && kiteT.side === me && t >= kiteT.Tg && t < T0;
        const rf = t >= T0 ? meleeShoot(a) : (kitingNow && !a.at.has("mounted_fire_move") ? kiteT.duty : 1);     // part du temps / des modèles qui tirent
        for (const d of tg) {
          const w = (d.pool/d.hp) / W; let dps = 0, dpsM = 0;
          if (t >= T0) { // mêlée
            const m = u.melee, eng = n * (u.men <= 6 ? 1 : SIM.ENGAGE);
            const sh = u.men > 6 ? Math.min(1, (1 + SIM.RANK2) / (Math.max(1, u.rd || SIM.RANK_DEFAULT) * SIM.ENGAGE)) : 1;   // part des modèles engagés qui chargent de plein fouet : seuls le 1er rang et une part du 2e (RANK2) heurtent à pleine vitesse
            const fa = a.fm || FONE, fd = d.fm || FONE, f = chargeF(a, d, t) * sh, ma = a.ma * fa.ma + f * a.charge * fa.ch, hit = clamp(35 + ma - d.md * fd.md, 8, 90) / 100;
            let dm = m.dmg, ap = m.ap, bonus = isLarge(d.u) ? m.bvl : isInf(d.u) ? m.bvi : 0;
            if (bonus && dm + ap > 0) { const s = dm + ap; dm += bonus*dm/s; ap += bonus*ap/s; }
            const cm = 1 + f * a.charge * fa.ch / SIM.CHARGE_DMG;
            dpsM = eng * hit * ((dm*cm*a.mdm) * (1 - d.arm * fd.arm/200) + ap*fa.ap*cm*a.mdm) / Math.max(1, m.interval) * resMul(d, m, false) * (reflected(a, d, t) ? SIM.REFLECT : 1);
            dps += dpsM;
            const wm = frontAlive ? wt(d) / Wm : w;                                                          // part de la mêlée dirigée vers d
            if (!impDone) { const Ee = Math.min(eng * wm * sh, contactCap(d, eng * wm * sh, u.rw || 0)), im = impactDmg(a, d, Ee); if (im > 0) dmgIn[foe].set(d, (dmgIn[foe].get(d) || 0) + im); }   // impact de la charge (une fois)
            engIn[foe].set(d, (engIn[foe].get(d) || 0) + eng * wm);                                          // attaquants qui cherchent à engager d
            radIn[foe].set(d, (radIn[foe].get(d) || 0) + eng * wm * (u.rw || 0));                            // … et leur demi-largeur cumulée (pour la taille moyenne des attaquants)
          }
          const r = u.ranged;
          if (r && a.ammo > 0) { // distance : portée atteinte quand dist − closing·t ≤ portée
            const inRange = opts.dist - closing*t <= a.range, f = rf;
            if (inRange || t >= T0) dps += n * (r.share ?? 1) * r.shots * ((r.dmg*a.rdm)*(1 - d.arm/200) + r.ap*a.rdm) * opts.acc * f / (Math.max(1, r.reload) / (a.fm || FONE).rl) * resMul(d, r, true);
          }
          if (dps - dpsM) dmgIn[foe].set(d, (dmgIn[foe].get(d) || 0) + (dps - dpsM) * w);                      // tir : pas limité par le front
          if (dpsM) meleeIn[foe].set(d, (meleeIn[foe].get(d) || 0) + dpsM * (frontAlive ? wt(d) / Wm : w)); // mêlée : limitée par le front, voir plus bas
        }
        if (u.ranged && a.ammo > 0 && (opts.dist - closing*t <= a.range || t >= T0)) a.ammo -= rf/Math.max(1, u.ranged.reload);
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
    if (t >= T0) impDone = true;
    for (const s of ["A","B"]) for (const [d, v] of dmgIn[s]) d.pool = Math.max(0, d.pool - v);
    // Régénération (capacité passive, u.regen = fraction des PV max par seconde, par modèle vivant). Le soin ne ressuscite personne : les modèles morts
    // (PV perdus ÷ PV d'un modèle, au pire moment) sont définitivement perdus, donc le total ne dépasse jamais (modèles vivants × PV d'un modèle).
    for (const x of [...S.A, ...S.B]) {
      if (!x.u.regen || x.out) continue;
      x.dead = Math.max(x.dead, Math.floor((x.pool0 - x.pool) / x.hp + 1e-9));
      const maxPool = x.pool0 - x.dead * x.hp;
      if (x.pool > 0 && x.pool < maxPool) x.pool = Math.min(maxPool, x.pool + x.u.regen * maxPool);
    }
    /* Moral : seuil de pertes (voir MORALE_BASE / MORALE_K) + psychologie. PEUR (causes_fear) : −FEAR_LD de moral au contact (constante du jeu ume_concerned_unit_frightened = −8).
       TERREUR (causes_terror) : choc de panique −TERROR_LD (ume_concerned_panic = −50) à la première rencontre ; si moral − 50 < TERROR_THR (13, morale_shock_terror_morale_threshold) l'unité fuit
       SHOCK_ROUT s (14) puis revient, insensible au choc SHOCK_IMMUNE s (85). Immunisées : immune_to_psychology et unbreakable (qui ne fuit jamais). Interprétation des constantes du jeu, non validée en jeu. */
    for (const x of [...S.A, ...S.B]) x.hist.push(x.pool);
    const fl = {A: 0, B: 0}, armyCas = {A: 0, B: 0};                                       // pertes récentes et pertes cumulées par camp (part des PV de départ)
    for (const side of ["A", "B"]) { let p0 = 0, lost = 0, rec = 0; for (const x of S[side]) { p0 += x.pool0; lost += x.pool0 - x.pool; const W0 = Math.max(0, x.hist.length - 1 - SIM.RECENT_WIN); rec += Math.max(0, x.hist[W0] - x.pool); } fl[side] = p0 ? rec / p0 : 0; armyCas[side] = p0 ? lost / p0 : 0; }
    const glo = {A: false, B: false};                                                      // glorious_charge : tant que son bonus dure, l'ennemi subit le malus de moral « attaqué de flanc » (was_attacked_in_flank = −6)
    if (t >= T0) for (const side of ["A", "B"]) for (const e of S[side]) if (!e.out && !e.flee && e.pool > 0 && e.at.has("glorious_charge") && rawF(e, t) > 0) glo[side === "A" ? "B" : "A"] = true;
    /* Malus d'ennemis proches (enemy_morale_penalty_* : de −3 à −24 quand la « puissance de combat » des ennemis à moins de 70 m passe de 4 à 32). Unité de puissance NON fournie par les tables : on prend le coût de
       recrutement restant des ennemis ÷ ENEMY_POWER_UNIT ; actif au contact. Tous les ennemis sont « proches » dans ce modèle agrégé. */
    const enP = {A: 0, B: 0};
    if (t >= T0) for (const side of ["A", "B"]) { let E = 0; for (const e of S[side === "A" ? "B" : "A"]) if (!e.out && !e.flee && e.pool > 0) E += e.up * e.pool / e.pool0; E /= SIM.ENEMY_POWER_UNIT;
      enP[side] = -SIM.ENEMY_PEN_K * (E <= 4 ? 3 * E / 4 : E >= 32 ? 24 : 3 + 21 * (E - 4) / 28); }
    const scary = {A: false, B: false}, terr = {A: false, B: false};                     // le camp adverse compte-t-il des unités qui causent peur / terreur (actives au contact) ?
    if (t >= T0) for (const side of ["A", "B"]) for (const e of S[side]) if (!e.out && !e.flee && e.pool > 0) { const o = side === "A" ? "B" : "A"; if (e.at.has("causes_fear") || e.at.has("causes_terror")) scary[o] = true; if (e.at.has("causes_terror")) terr[o] = true; }
    for (const x of [...S.A, ...S.B]) {
      if (x.out) continue;
      if (x.flee) { if (t >= x.back) { x.flee = false; x.imm = t + SIM.SHOCK_IMMUNE; } else continue; }
      const free = x.at.has("immune_to_psychology") || x.at.has("unbreakable");
      let ld = x.ld;
      if (!free && scary[x.side]) ld -= SIM.FEAR_LD;
      if (!free && terr[x.side] && t >= x.imm && x.ld - SIM.TERROR_LD < SIM.TERROR_THR && x.pool > 0.5) { x.flee = true; x.back = t + SIM.SHOCK_ROUT; continue; }
      const c = 1 - x.pool/x.pool0;
      if (x.pool <= 0.5) x.out = true;
      else if (!x.at.has("unbreakable")) {
        if (SIM.MORALE_MODEL === "threshold") { if (c >= SIM.MORALE_BASE + clamp(ld,0,100)/100 * SIM.MORALE_K) x.out = x.routed = true; }
        else {
          const W0 = Math.max(0, x.hist.length - 1 - SIM.RECENT_WIN), rec = (x.hist[W0] - x.pool) / x.pool0 * 100, o = x.side === "A" ? "B" : "A";
          const own = fl[x.side], foe = fl[o];                                                 // pertes récentes (part des PV de départ) de chaque camp : qui gagne le combat ?
          let cb = 0; if (own + foe > 0.01) { const r = foe / Math.max(own, 1e-6); cb = r >= 3 ? 8 : r >= 1.5 ? 6 : r >= 1.1 ? 3 : (1 / Math.max(r, 1e-6)) >= 3 ? -8 : (1 / Math.max(r, 1e-6)) >= 1.5 ? -3 : 0; }
          const target = clamp(ld, 0, 100) + mpen(MTAB.tot, c * 100) + mpen(MTAB.rec, rec) + SIM.ARMY_PEN_K * mpen(MTAB.ext, armyCas[x.side] * 100) + cb + enP[x.side] - (glo[x.side] ? SIM.FLANK_PEN : 0);
          const diff = target - x.M, step = Math.max(Math.abs(diff) * SIM.MORALE_UPD, Math.min(Math.abs(diff), SIM.MORALE_MINSTEP));
          x.M += Math.sign(diff) * Math.min(Math.abs(diff), step);
          if (x.M <= 0) x.out = x.routed = true;
        }
      }
    }
  }
  timeline.push([t, surv("A"), surv("B")]);
  return {S, tot, timeline, time: t, sA: surv("A"), sB: surv("B"), T0, vA, vB};
}
/* Choix automatique de la stratégie de chaque camp : CHARGER, MARCHER (avancer sans charger : évite la réflexion et les défenses, mais sans bonus de charge) ou TENIR SA POSITION (bracing, seulement
   pour un camp qui compte des unités à défense contre la charge ou à réflexion). opts.hold.A / .B valent false (charge), "walk", true (tient) ou "auto". Chaque camp « auto » joue au mieux pour lui :
   on simule toutes les combinaisons utiles (au plus 8 batailles), la marge étant la survie en coût rapportée au coût de départ de A moins celle de B (A la maximise, B la minimise), et on retient le point selle
   (équilibre en stratégies pures : aucune des deux armées ne gagne à changer seule) ; sans point selle, le maximin de A et le minimax de B. Deux camps qui tiennent ne se rencontrent pas : c'est une IMPASSE (aucun n'a intérêt à attaquer) : le résultat renvoyé est alors celui d'une bataille FORCÉE au contact, sans charge (les deux avancent en marchant) ; elle est l'équilibre quand aucun des deux n'a intérêt à attaquer (deux armées de mêlée à réflexion, ex. des lanciers). Si l'un des camps compte des tireurs, la combinaison est exclue (ils peuvent tirer).
   « Marcher » n'est utile que face à un camp pouvant tenir (sinon dominé par « charger »). Renvoie le résultat de simulate() plus choice = {A, B} parmi "charge" | "walk" | "hold". */
const CAN_HOLD = e => !!(e.u.at && e.u.at.some(a => a === "charge_defense" || a === "charge_defense_vs_large" || a === "charge_reflection"));
function resolve(ARMY, BON, opts) {
  const w = opts.hold || {};
  const fixed = s => w[s] === "auto" ? null : ((s === "B" && opts.staticB) || w[s] === true) ? "hold" : w[s] === "walk" ? "walk" : w[s] === "kite" ? "kite" : "charge";
  const canH = {A: ARMY.A.some(CAN_HOLD), B: ARMY.B.some(CAN_HOLD)};
  const army = s => ARMY[s], spdOf = s => { let w = 0, t = 0; army(s).forEach(e => { const n = e.count * e.u.men; w += n; t += n * e.u.speed; }); return w ? t / w : 0; };
  const canKite = s => { const o = s === "A" ? "B" : "A"; return army(s).some(e => e.u.ranged) && (spdOf(s) > spdOf(o) || canH[o]); };    // garder ses distances : tireurs plus rapides que l'ennemi (ou ennemi qui tient)
  const optsOf = s => { const f = fixed(s); if (f) return [f]; const o = ["charge"]; if (canH[s === "A" ? "B" : "A"]) o.push("walk"); if (canH[s]) o.push("hold"); if (canKite(s)) o.push("kite"); return o; };
  const oa = optsOf("A"), ob = optsOf("B"), cache = {}, H = x => x === "hold" ? true : x === "walk" ? "walk" : x === "kite" ? "kite" : false,
    bad = (a, b) => (a === "kite" && b === "kite") || (a === "hold" && b === "hold" && (ARMY.A.some(e => e.u.ranged) || ARMY.B.some(e => e.u.ranged)));   // avec des tireurs, deux camps immobiles ne sont pas une impasse (ils peuvent tirer) : combinaison exclue
  const run = (a, b) => cache[a + "|" + b] ??= (() => { const r = simulate(ARMY, BON, {...opts, hold: {A: H(a), B: H(b)}, tmax: a === "hold" && b === "hold" ? 1 : opts.tmax}); return {r, m: (r.tot.A ? r.sA / r.tot.A : 0) - (r.tot.B ? r.sB / r.tot.B : 0)}; })();
  let eq = null; const EPS = 0.005;
  if (oa.length === 1 && ob.length === 1) eq = [oa[0], ob[0]];
  else {
    for (const a of oa) { for (const b of ob) { if (bad(a, b)) continue; const m = run(a, b).m;
      if (oa.every(a2 => bad(a2, b) || run(a2, b).m <= m + EPS) && ob.every(b2 => bad(a, b2) || run(a, b2).m >= m - EPS)) { eq = [a, b]; break; } } if (eq) break; }
    if (!eq) {
      let bA = null, vA = -Infinity, bB = null, vB = Infinity;
      for (const a of oa) { let mn = Infinity; for (const b of ob) if (!bad(a, b)) mn = Math.min(mn, run(a, b).m); if (mn > vA) { vA = mn; bA = a; } }
      for (const b of ob) { let mx = -Infinity; for (const a of oa) if (!bad(a, b)) mx = Math.max(mx, run(a, b).m); if (mx < vB) { vB = mx; bB = b; } }
      eq = bad(bA, bB) ? [bA, "charge"] : [bA, bB];
    }
  }
  const imp = eq[0] === "hold" && eq[1] === "hold";
  const out = imp ? run("walk", "walk") : run(eq[0], eq[1]);       // impasse : on renvoie la bataille « forcée au contact » (les deux avancent sans charger), pour que le duel ait un vainqueur
  return {...out.r, impasse: imp, hold: {A: eq[0] === "hold", B: eq[1] === "hold"}, choice: {A: eq[0], B: eq[1]}, auto: {A: w.A === "auto", B: w.B === "auto"}};
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
