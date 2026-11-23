#!/usr/bin/env node
/* Précalcul des duels « à montant équivalent » pour une typologie d'usage orientée par les résultats.
   Utilise EXACTEMENT le même simulateur que le site (sim.js, chargé via require ici et via <script> dans le navigateur).

   Duels : pour chaque paire d'unités (A, B), autant d'exemplaires de chaque unité que nécessaire pour que les deux armées aient le même
   budget, soit en ENTRETIEN soit en COÛT DE RECRUTEMENT, avec au moins 1 et au plus 20 exemplaires par camp (limite d'une armée). Les paires
   dont les coûts sont trop éloignés pour respecter ces bornes (rapport > 20) sont ignorées. Les effectifs peuvent être fractionnaires.
   Résultat d'un duel = (part des forces de A encore debout) − (part des forces de B encore debout), dans [-1, 1] ; > 0 : A l'emporte.

   Typologie « anti-X » :
     - unités de mêlée      : taux de victoire en duel contre la catégorie X (percentile parmi les unités de mêlée) ;
     - unités à distance    : un duel contre de la mêlée n'a pas de sens, on utilise l'EFFICACITÉ DE DPS (dégâts/s par point de budget)
                              contre un défenseur moyen de la catégorie X (percentile parmi les unités à distance).

   Usage : node tools/build_duels.js [--out data] [--limit N]    (écrit data/duels.json et data/duels.js) */
const fs = require("fs"), path = require("path");
const Sim = require("../sim.js");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(__dirname, "..", arg("out", "data")), LIMIT = +arg("limit", 0);
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "units.json"), "utf8"));

const BUDGET = 2000, MAX_ARMY = 20, OPTS = {dist: 400, acc: 0.4, staticB: false}; // mêmes réglages par défaut que l'onglet Combat
const NO_BONUS = {A: {arm: 0, dmg: 0, hp: 0, mor: 0, up: 0}, B: {arm: 0, dmg: 0, hp: 0, mor: 0, up: 0}};
let units = D.units.filter(u => u.upkeep > 0 && u.cost > 0 && u.men > 0 && u.hp > 0); // seigneurs et héros INCLUS (voir NOTES)
if (LIMIT) units = units.slice(0, LIMIT);
const n = units.length, ROLES = [...new Set(units.map(u => u.role))].sort();
const r3 = v => Math.round(v * 1000) / 1000;

const NOTES = [
  "Résultats issus du simulateur du site (sim.js), un modèle approximatif : pas de ciblage ni de flanquement, moral simplifié, précision des tirs fixe.",
  "Les seigneurs et héros sont inclus volontairement, mais leurs sorts, capacités, objets, compétences et montures volantes ne sont pas modélisés : leurs résultats sont indicatifs et probablement sous-estimés.",
  "Duels 1 type d'unité contre 1 autre à budget équivalent (entretien ou recrutement), de 1 à 20 exemplaires par camp, sans bonus, distance de départ 400 m.",
  "Typologie « anti » : unités de mêlée = taux de victoire en duel contre la catégorie ; unités à distance = efficacité de DPS contre un défenseur moyen de la catégorie (un duel contre de la mêlée n'étant pas représentatif).",
];

/* ---------- Duels ---------- */
function duel(a, b, key) {
  const lo = Math.max(a[key], b[key]), hi = MAX_ARMY * Math.min(a[key], b[key]);
  if (lo > hi) return NaN; // budgets impossibles à aligner avec ≤ 20 exemplaires du moins cher
  const budget = Math.max(lo, Math.min(BUDGET, hi));
  const r = Sim.simulate({A: [{u: a, count: budget / a[key]}], B: [{u: b, count: budget / b[key]}]}, NO_BONUS, OPTS);
  return (r.tot.A ? r.sA / r.tot.A : 0) - (r.tot.B ? r.sB / r.tot.B : 0);
}

/* ---------- Efficacité de DPS contre un défenseur moyen de chaque catégorie ---------- */
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

function runMode(key) {
  const M = new Float32Array(n * n);
  let skipped = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const m = duel(units[i], units[j], key); if (Number.isNaN(m)) skipped++; M[i * n + j] = m; M[j * n + i] = -m; }
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
    const dps = {}; ROLES.forEach(r => { const v = dpsVs(units[i], REF[r]); dps[r] = (v.mel + v.rng) / units[i][key] * 100; }); // dégâts/s pour 100 de budget
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

const t0 = Date.now();
const result = {version: 2, budget: BUDGET, maxArmy: MAX_ARMY, opts: OPTS, units: n, notes: NOTES, roles: ROLES,
  caveat: units.filter(u => u.role === "lord" || u.role === "hero").map(u => u.id), modes: {}};
for (const key of ["upkeep", "cost"]) {
  const r = runMode(key); result.modes[key] = r.units;
  console.log(`mode ${key} : ${(n * (n - 1) / 2 - r.skipped)} duels joués, ${r.skipped} paires ignorées (rapport de coût > ${MAX_ARMY}), ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
fs.mkdirSync(OUT, {recursive: true});
fs.writeFileSync(path.join(OUT, "duels.json"), JSON.stringify(result));
fs.writeFileSync(path.join(OUT, "duels.js"), "window.TWW3_DUELS=" + JSON.stringify(result) + ";");
console.log(`écrit ${path.join(OUT, "duels.js")} (${(fs.statSync(path.join(OUT, "duels.js")).size / 1e6).toFixed(2)} Mo)`);
