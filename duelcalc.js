"use strict";
/* Calcul des duels « à coût de recrutement équivalent » et de leurs agrégats (taux de victoire, typologie « anti »…), partagé par tools/build_duels.js (Node) et par le navigateur
   (duelworker.js + profile duels de « Ma campagne »). Même simulateur (sim.js) partout. DuelCalc.make(Sim, units) -> {n, ROLES, duel, aggregate, units}. */
(function (root) {
  const BUDGET = 2000, MAX_ARMY = 20, OPTS = {dist: 400, acc: 0.4, staticB: false}; // mêmes réglages par défaut que l'onglet Combat
  const NO_BONUS = {A: {arm: 0, dmg: 0, hp: 0, mor: 0, up: 0}, B: {arm: 0, dmg: 0, hp: 0, mor: 0, up: 0}};
  const r3 = v => Math.round(v * 1000) / 1000;
  /* Race de l'adversaire -> étiquettes de condition (« vs:dwarf »…) ; clé = code de 3 lettres de la culture (wh_main_dwf_dwarfs -> dwf). */
  const CULT_TAGS = {emp: ["human"], brt: ["human", "bretonnia"], ksl: ["human"], cth: ["human"], dwf: ["dwarf"], hef: ["elf"], def: ["elf"], wef: ["elf"], grn: ["greenskin"], ogr: ["ogre"], skv: ["skaven", "corrupt"], lzd: ["lizardmen"],
    bst: ["beastmen"], vmp: ["undead", "vmp", "corrupt"], tmb: ["undead", "tmb"], nag: ["undead"], cst: ["undead"], chs: ["wc", "corrupt"], dae: ["daemons", "corrupt"], kho: ["khorne", "daemons", "corrupt"],
    nur: ["nurgle", "daemons", "corrupt"], sla: ["slaanesh", "daemons", "corrupt"], tze: ["tzeentch", "daemons", "corrupt"], chd: ["chd"], nor: ["norsca"]};
  const raceTags = u => { const t = new Set(); for (const c of (u.races ? [...u.races] : (u.cultures || []))) { const m = /_([a-z]{3})_/.exec(c); for (const g of (m && CULT_TAGS[m[1]]) || []) t.add("vs:" + g); } return t; };

  /* Modificateurs conditionnels d'un camp : prof = {fac, lord (id de l'unité du seigneur), cond: [{stat, v, pct, units, c}]} ; l'unité a doit appartenir à la faction du profil, b donne la race de l'adversaire. */
  function condMods(prof, a, b) {
    if (!prof || !prof.cond || !prof.cond.length) return undefined;
    if (!((a.factions || []).includes(prof.fac) || a.id === prof.lord)) return undefined;
    const t = raceTags(b), base = {ma: a.ma, md: a.md, arm: a.armour, ld: a.ld, charge: a.charge}, m = {}; let n = 0;
    for (const e of prof.cond) {
      if (!e.c || e.c.includes("?") || !e.c.some(g => t.has(g))) continue;
      if (!(e.units == null || (e.units === "lord" ? a.id === prof.lord : (e.units instanceof Set ? e.units.has(a.id) : e.units.includes(a.id))))) continue;
      n++; m[e.stat] = (m[e.stat] || 0) + (e.pct && base[e.stat] !== undefined ? base[e.stat] * e.v / 100 : e.v);
    }
    return n ? m : undefined;
  }

  function make(Sim, units) {
    const n = units.length, ROLES = [...new Set(units.map(u => u.role))].sort();
    /* ---------- Duels ---------- */
    function duel(a, b, key, ma, mb) {   // ma / mb : modificateurs (mods du simulateur) de chaque camp, facultatifs
      if (key === "count") {   // sans coût : MAX_ARMY exemplaires de chaque côté (20 contre 20)
        const r = Sim.resolve({A: [{u: a, count: MAX_ARMY, mods: ma}], B: [{u: b, count: MAX_ARMY, mods: mb}]}, NO_BONUS, {...OPTS, hold: {A: "auto", B: "auto"}});
        return (r.tot.A ? r.sA / r.tot.A : 0) - (r.tot.B ? r.sB / r.tot.B : 0);
      }
      const lo = Math.max(a[key], b[key]), hi = MAX_ARMY * Math.min(a[key], b[key]);
      if (lo > hi) return NaN; // budgets impossibles à aligner avec ≤ 20 exemplaires du moins cher
      const budget = Math.max(lo, Math.min(BUDGET, hi));
      const r = Sim.resolve({A: [{u: a, count: budget / a[key], mods: ma}], B: [{u: b, count: budget / b[key], mods: mb}]}, NO_BONUS, {...OPTS, hold: {A: "auto", B: "auto"}});
      return (r.tot.A ? r.sA / r.tot.A : 0) - (r.tot.B ? r.sB / r.tot.B : 0);
    }
    /* Marge du duel a contre b avec les effets conditionnels du profil prof (facultatif) pour chaque camp. */
    function duelProf(a, b, key, prof) { return duel(a, b, key, condMods(prof, a, b), condMods(prof, b, a)); }

    const mean = (a, f) => a.reduce((s, x) => s + f(x), 0) / Math.max(1, a.length);
    const REF = Object.fromEntries(ROLES.map(r => { const us = units.filter(u => u.role === r); return [r, {role: r, armour: mean(us, u => u.armour), md: mean(us, u => u.md)}]; }));
    function dpsVs(u, d) { // dégâts/s d'un exemplaire de l'unité contre le défenseur de référence d (valeurs du simulateur, sans distance ni charge)
      const m = u.melee, r = u.ranged, arm = Math.min(100, d.armour), A = {role: d.role};
      let mel = 0, rng = 0;
      if (m.dmg + m.ap > 0) {
        const hit = Sim.clamp(35 + u.ma - d.md, 8, 90) / 100; let dm = m.dmg, ap = m.ap, bonus = Sim.isLarge(A) ? m.bvl : Sim.isInf(A) ? m.bvi : 0;
        if (bonus && dm + ap > 0) { const s = dm + ap; dm += bonus * dm / s; ap += bonus * ap / s; }
        mel = u.men * (u.men <= 6 ? 1 : Sim.SIM.ENGAGE) * hit * (dm * (1 - arm / 200) + ap) / Math.max(1, m.interval);
      }
      if (r && r.dmg + r.ap > 0) rng = u.men * (r.share ?? 1) * r.shots * (r.dmg * (1 - arm / 200) + r.ap) * OPTS.acc / Math.max(1, r.reload);
      return {mel, rng};
    }
    const isRanged = u => { if (["inf_ranged", "cav_ranged", "artillery"].includes(u.role)) return true; const d = dpsVs(u, {role: "inf_melee", armour: 40, md: 30}); return d.rng > 0 && d.rng >= d.mel; };
    
    function percentiles(vals) { // vals : tableau de nombres -> fonction valeur -> percentile 0..100 (100 = meilleur)
      const s = vals.slice().sort((a, b) => a - b);
      return v => { if (s.length < 2) return 100; let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; s[m] < v ? lo = m + 1 : hi = m; } return Math.round(lo / (s.length - 1) * 100); };
    }

    /* Agrégats à partir de la matrice des marges M (n × n, M[i*n+j] = marge de i contre j, NaN = paire ignorée). */
    function aggregate(key, M, skipped) {
      const roleIdx = Object.fromEntries(ROLES.map((r, k) => [r, k]));
      const rows = [];
      for (let i = 0; i < n; i++) {
        let w = 0, sum = 0, cnt = 0; const rw = new Float64Array(ROLES.length), rn = new Float64Array(ROLES.length), opp = [];
        for (let j = 0; j < n; j++) {
          const m = M[i * n + j]; if (i === j || Number.isNaN(m)) continue;
          const k = roleIdx[units[j].role], s = m > 0 ? 1 : m < 0 ? 0 : 0.5;
          w += s; sum += m; cnt++; rw[k] += s; rn[k]++; opp.push([j, m]);
        }
        opp.sort((x, y) => y[1] - x[1]);
        const dv = {}; ROLES.forEach((r, k) => dv[r] = rn[k] ? rw[k] / rn[k] : null);
        const dps = {}; ROLES.forEach(r => { const v = dpsVs(units[i], REF[r]); dps[r] = (v.mel + v.rng) / (key === "count" ? 100 : units[i][key]) * 100; }); // dégâts/s pour 100 de budget
        rows.push({i, wr: cnt ? w / cnt : 0, margin: cnt ? sum / cnt : 0, duels: cnt, dv, dps, opp});
      }
      // Typologie « anti » : percentiles dans chaque famille (mêlée / distance), sur la base adaptée à la famille
      const fam = units.map(isRanged), pct = {};
      for (const kind of [true, false]) for (const r of ROLES) {
        const sel = rows.filter(x => fam[x.i] === kind && (kind ? x.dps[r] > 0 : x.dv[r] != null));
        pct[kind + r] = percentiles(sel.map(x => kind ? x.dps[r] : x.dv[r]));
      }
      const out = {};
      for (const x of rows) {
        const u = units[x.i], ranged = fam[x.i];
        const scores = ROLES.map(r => [r, ranged ? (x.dps[r] > 0 ? pct[true + r](x.dps[r]) : 0) : (x.dv[r] != null ? pct[false + r](x.dv[r]) : 0)]);
        out[u.id] = {
          wr: r3(x.wr), margin: r3(x.margin), duels: x.duels,
          vs: Object.fromEntries(ROLES.map(r => [r, x.dv[r] == null ? null : r3(x.dv[r])])),
          dps: Object.fromEntries(ROLES.map(r => [r, Math.round(x.dps[r] * 10) / 10])),
          basis: ranged ? "dps" : "duels",
          anti: scores.filter(s => s[1] >= 75).sort((a, b) => b[1] - a[1]).slice(0, 3),
          best: x.opp.slice(0, 8).map(([j, m]) => [units[j].id, r3(m)]),
          worst: x.opp.slice(-8).reverse().map(([j, m]) => [units[j].id, r3(m)]),
        };
      }
      return {skipped, units: out};
    }
    return {n, ROLES, units, duel, duelProf, aggregate, r3};
  }
  root.DuelCalc = {make, condMods, raceTags, CULT_TAGS, BUDGET, MAX_ARMY, OPTS};
  if (typeof module !== "undefined") module.exports = root.DuelCalc;
})(typeof window !== "undefined" ? window : globalThis);
