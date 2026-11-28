#!/usr/bin/env node
/* Précalcul des duels « à montant équivalent » pour une typologie d'usage orientée par les résultats.
   Utilise EXACTEMENT le même simulateur que le site (sim.js, chargé via require ici et via <script> dans le navigateur).

   Duels : pour chaque paire d'unités (A, B), autant d'exemplaires de chaque unité que nécessaire pour que les deux armées aient le même
   budget de COÛT DE RECRUTEMENT (les unités sans entretien, comme les Rois des Tombes ou les Hommes-Bêtes, sont ainsi traitées comme les autres), avec au moins 1 et au plus 20 exemplaires par camp (limite d'une armée). Les paires
   dont les coûts sont trop éloignés pour respecter ces bornes (rapport > 20) sont ignorées. Les effectifs peuvent être fractionnaires.
   Résultat d'un duel = (part des forces de A encore debout) − (part des forces de B encore debout), dans [-1, 1] ; > 0 : A l'emporte.

   Typologie « anti-X » :
     - unités de mêlée      : taux de victoire en duel contre la catégorie X (percentile parmi les unités de mêlée) ;
     - unités à distance    : un duel contre de la mêlée n'a pas de sens, on utilise l'EFFICACITÉ DE DPS (dégâts/s par point de budget)
                              contre un défenseur moyen de la catégorie X (percentile parmi les unités à distance).

   Usage : node tools/build_duels.js [--out data] [--limit N]    (écrit data/duels.json, data/duels.js et data/duels_matrix.bin) */
const fs = require("fs"), path = require("path"), os = require("os");
const {Worker, isMainThread, parentPort, workerData} = require("worker_threads");
const Sim = require("../sim.js"), DuelCalc = require("../duelcalc.js");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(__dirname, "..", arg("out", "data")), LIMIT = +arg("limit", 0);
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "units.json"), "utf8"));

let units = D.units.filter(u => u.cost > 0 && u.men > 0 && u.hp > 0); // seigneurs et héros INCLUS (voir NOTES)
if (LIMIT) units = units.slice(0, LIMIT);
const DC = DuelCalc.make(Sim, units), n = DC.n, ROLES = DC.ROLES;

const NOTES = [
  "Résultats issus du simulateur du site (sim.js), un modèle approximatif : pas de ciblage ni de flanquement, moral simplifié, précision des tirs fixe.",
  "Les seigneurs et héros sont inclus volontairement, mais leurs sorts, capacités, objets, compétences et montures volantes ne sont pas modélisés : leurs résultats sont indicatifs et probablement sous-estimés.",
  "Duels 1 type d'unité contre 1 autre à coût de recrutement équivalent, de 1 à 20 exemplaires par camp, sans bonus, distance de départ 400 m.",
  "Typologie « anti » : unités de mêlée = taux de victoire en duel contre la catégorie ; unités à distance = efficacité de DPS contre un défenseur moyen de la catégorie (un duel contre de la mêlée n'étant pas représentatif).",
];

/* Calcul parallèle de la matrice des duels : chaque thread prend les lignes i ≡ k (mod W) (la ligne i compte n − i − 1 duels : l'entrelacement équilibre la charge). */
if (!isMainThread) {
  const {k, W, key} = workerData, rows = [];
  for (let i = k; i < n; i += W) { const row = new Float32Array(n); for (let j = i + 1; j < n; j++) row[j] = DC.duel(units[i], units[j], key); rows.push([i, row]); }
  parentPort.postMessage(rows); return;
}
const matrix = key => new Promise((resolve, reject) => {
  const W = Math.max(1, +arg("threads", os.cpus().length)), M = new Float32Array(n * n); let skipped = 0, left = W;
  for (let k = 0; k < W; k++) {
    const w = new Worker(__filename, {workerData: {k, W, key}, argv: process.argv.slice(2)});
    w.on("message", rows => { for (const [i, row] of rows) for (let j = i + 1; j < n; j++) { const m = row[j]; if (Number.isNaN(m)) skipped++; M[i * n + j] = m; M[j * n + i] = -m; } });
    w.on("error", reject); w.on("exit", () => { if (--left === 0) resolve({M, skipped}); });
  }
});
const t0 = Date.now();
const result = {version: 2, budget: DuelCalc.BUDGET, maxArmy: DuelCalc.MAX_ARMY, opts: DuelCalc.OPTS, units: n, notes: NOTES, roles: ROLES,
  caveat: units.filter(u => u.role === "lord" || u.role === "hero").map(u => u.id), modes: {}};
(async () => {
  let M0 = null;
  for (const key of ["cost"]) {
    const {M, skipped: sk} = await matrix(key), r = DC.aggregate(key, M, sk); result.modes[key] = r.units; M0 = M;
    console.log(`mode ${key} : ${(n * (n - 1) / 2 - r.skipped)} duels joués, ${r.skipped} paires ignorées (rapport de coût > ${DuelCalc.MAX_ARMY}), ${((Date.now() - t0) / 1000).toFixed(1)} s sur ${Math.max(1, +arg("threads", os.cpus().length))} threads`);
  }
  /* Matrice des marges (triangle supérieur, une marge par octet = round(marge × 127), −128 = paire ignorée) : sert au navigateur à ne recalculer que les paires touchées par « Ma campagne ». */
  const tri = new Int8Array(n * (n - 1) / 2); let p = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const m = M0[i * n + j]; tri[p++] = Number.isNaN(m) ? -128 : Math.max(-127, Math.min(127, Math.round(m * 127))); }
  result.matrix = {file: "duels_matrix.bin", n, scale: 127, ids: units.map(u => u.id)};
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(path.join(OUT, "duels_matrix.bin"), Buffer.from(tri.buffer));
  fs.writeFileSync(path.join(OUT, "duels.json"), JSON.stringify(result));
  fs.writeFileSync(path.join(OUT, "duels.js"), "window.TWW3_DUELS=" + JSON.stringify(result) + ";");
  console.log(`écrit ${path.join(OUT, "duels.js")} (${(fs.statSync(path.join(OUT, "duels.js")).size / 1e6).toFixed(2)} Mo) et duels_matrix.bin (${(tri.length / 1e6).toFixed(2)} Mo)`);
})();
