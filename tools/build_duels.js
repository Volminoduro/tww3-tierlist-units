#!/usr/bin/env node
/* Précalcul des duels « à montant équivalent » pour une typologie d'usage orientée par les résultats.
   Utilise EXACTEMENT le même simulateur que le site (sim.js, chargé via require ici et via <script> dans le navigateur).

   Pour chaque paire d'unités (A, B) on met en présence autant d'exemplaires de chaque unité que nécessaire pour que les deux armées
   aient le même budget (BUDGET), soit en ENTRETIEN soit en COÛT DE RECRUTEMENT. Les effectifs peuvent être fractionnaires.
   Résultat d'un duel = (part des forces de A encore debout) − (part des forces de B encore debout), dans [-1, 1] ; > 0 : A l'emporte.

   Usage : node tools/build_duels.js [--out data] [--limit N]    (écrit data/duels.json et data/duels.js) */
const fs = require("fs"), path = require("path");
const Sim = require("../sim.js");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(__dirname, "..", arg("out", "data")), LIMIT = +arg("limit", 0);
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "units.json"), "utf8"));

const BUDGET = 2000, OPTS = {dist: 400, acc: 0.4, staticB: false}; // mêmes réglages par défaut que l'onglet Combat
const NO_BONUS = {A: {arm: 0, dmg: 0, hp: 0, mor: 0, up: 0}, B: {arm: 0, dmg: 0, hp: 0, mor: 0, up: 0}};
let units = D.units.filter(u => u.upkeep > 0 && u.cost > 0 && u.men > 0 && u.hp > 0); // seigneurs et héros INCLUS (voir NOTES)
if (LIMIT) units = units.slice(0, LIMIT);
const n = units.length, ROLES = [...new Set(units.map(u => u.role))].sort();

const NOTES = [
  "Résultats issus du simulateur du site (sim.js), un modèle approximatif : pas de ciblage ni de flanquement, moral simplifié, précision des tirs fixe.",
  "Les seigneurs et héros sont inclus volontairement, mais leurs sorts, capacités, objets, compétences et montures volantes ne sont pas modélisés : leurs résultats sont indicatifs et probablement sous-estimés.",
  "Duels 1 type d'unité contre 1 autre à budget équivalent (entretien ou recrutement), sans bonus, distance de départ 400 m.",
];

function duel(a, b, key) {
  // Budget du duel : BUDGET, ramené dans [max(coûts), 20 × min(coûts)] pour avoir au moins 1 exemplaire de chaque côté et, si possible,
  // au plus 20 de l'unité la moins chère (limite d'une armée) : évite l'artefact « 80 paysans contre 1 unité d'élite ».
  const lo = Math.max(a[key], b[key]), hi = 20 * Math.min(a[key], b[key]), budget = Math.max(lo, Math.min(BUDGET, hi));
  const ca = budget / a[key], cb = budget / b[key];
  const r = Sim.simulate({A: [{u: a, count: ca}], B: [{u: b, count: cb}]}, NO_BONUS, OPTS);
  return (r.tot.A ? r.sA / r.tot.A : 0) - (r.tot.B ? r.sB / r.tot.B : 0);
}
function runMode(key) {
  const M = new Float32Array(n * n); // M[i*n+j] = résultat de i contre j
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const m = duel(units[i], units[j], key); M[i * n + j] = m; M[j * n + i] = -m; }
  const out = {};
  const roleIdx = Object.fromEntries(ROLES.map((r, k) => [r, k]));
  for (let i = 0; i < n; i++) {
    let w = 0, sum = 0; const rw = new Float64Array(ROLES.length), rn = new Float64Array(ROLES.length), opp = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue; const m = M[i * n + j], k = roleIdx[units[j].role], s = m > 0 ? 1 : m < 0 ? 0 : 0.5;
      w += s; sum += m; rw[k] += s; rn[k]++; opp.push([j, m]);
    }
    opp.sort((x, y) => y[1] - x[1]);
    const r2 = v => Math.round(v * 1000) / 1000;
    out[units[i].id] = {
      wr: r2(w / (n - 1)), margin: r2(sum / (n - 1)),
      vs: Object.fromEntries(ROLES.map((r, k) => [r, rn[k] ? r2(rw[k] / rn[k]) : null])),
      best: opp.slice(0, 8).map(([j, m]) => [units[j].id, r2(m)]),   // adversaires que cette unité bat le plus nettement
      worst: opp.slice(-8).reverse().map(([j, m]) => [units[j].id, r2(m)]), // adversaires qui la battent le plus nettement
    };
  }
  return out;
}

const t0 = Date.now();
const result = {version: 1, budget: BUDGET, opts: OPTS, units: n, notes: NOTES, roles: ROLES,
  caveat: units.filter(u => u.role === "lord" || u.role === "hero").map(u => u.id), modes: {}};
for (const [mode, key] of [["upkeep", "upkeep"], ["cost", "cost"]]) { result.modes[mode] = runMode(key); console.log(`mode ${mode} : ${n * (n - 1) / 2} duels, ${((Date.now() - t0) / 1000).toFixed(1)} s`); }
fs.mkdirSync(OUT, {recursive: true});
fs.writeFileSync(path.join(OUT, "duels.json"), JSON.stringify(result));
fs.writeFileSync(path.join(OUT, "duels.js"), "window.TWW3_DUELS=" + JSON.stringify(result) + ";");
console.log(`écrit ${path.join(OUT, "duels.json")} (${(fs.statSync(path.join(OUT, "duels.json")).size / 1e6).toFixed(2)} Mo)`);
