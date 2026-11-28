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

   Reconstruction INCRÉMENTALE : une empreinte du code (sim.js, duelcalc.js, constantes) et une empreinte par unité sont enregistrées dans data/duels.js. À la relance, seules les paires
   dont une unité a changé (ou est nouvelle) sont rejouées ; si le code ou les constantes ont changé, tout est rejoué. Les marges inchangées viennent du cache pleine précision
   data/.duels_cache/ (hors dépôt) ou, à défaut, des matrices int8 versionnées (écart ≤ 0,004). `--full` force le recalcul complet.

   Usage : node tools/build_duels.js [--out data] [--limit N] [--full]    (écrit data/duels.json, data/duels.js et les matrices data/duels_matrix*.bin) */
const fs = require("fs"), path = require("path"), os = require("os"), crypto = require("crypto");
const {Worker, isMainThread, parentPort, workerData} = require("worker_threads");
const Sim = require("../sim.js"), DuelCalc = require("../duelcalc.js");
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = path.resolve(__dirname, "..", arg("out", "data")), LIMIT = +arg("limit", 0);
const D = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "units.json"), "utf8"));

let units = D.units.filter(u => u.cost > 0 && u.men > 0 && u.hp > 0); // seigneurs et héros INCLUS (voir NOTES)
if (LIMIT) units = units.slice(0, LIMIT);
const DC = DuelCalc.make(Sim, units), n = DC.n, ROLES = DC.ROLES;
const sha = s => crypto.createHash("sha1").update(s).digest("hex").slice(0, 16);
const CODE_FP = sha(["sim.js", "duelcalc.js"].map(f => fs.readFileSync(path.join(__dirname, "..", f), "utf8")).join("\0") + JSON.stringify([DuelCalc.BUDGET, DuelCalc.MAX_ARMY, DuelCalc.OPTS]));
const UNIT_FP = units.map(u => sha(JSON.stringify(u)));
const MODES = ["cost", "count"], CACHE_DIR = path.join(OUT, ".duels_cache");

/* Matrices précédentes (par identifiant d'unité) : cache pleine précision, sinon matrices int8 du dépôt. */
function loadPrevious() {
  if (process.argv.includes("--full")) return null;
  let old; try { old = JSON.parse(fs.readFileSync(path.join(OUT, "duels.js"), "utf8").replace(/^window\.TWW3_DUELS=/, "").replace(/;$/, "")); } catch (e) { return null; }
  if (!old.fp || old.fp.code !== CODE_FP || !old.matrix) return null;
  const ids = old.matrix.ids, no = ids.length, idx = new Map(ids.map((id, i) => [id, i])), mats = {}; let precise = true;
  for (const key of MODES) {
    const tri = fs.existsSync(path.join(CACHE_DIR, key + ".f32")) && fs.existsSync(path.join(CACHE_DIR, "ids.json")) && JSON.stringify(JSON.parse(fs.readFileSync(path.join(CACHE_DIR, "ids.json"), "utf8"))) === JSON.stringify(ids)
      ? new Float32Array(fs.readFileSync(path.join(CACHE_DIR, key + ".f32")).buffer.slice(0)) : null;
    let src;
    if (tri) src = tri; else {
      precise = false; const f = old.matrix.files && old.matrix.files[key]; if (!f || !fs.existsSync(path.join(OUT, f))) return null;
      const raw = new Int8Array(fs.readFileSync(path.join(OUT, f)).buffer.slice(0)); src = new Float32Array(raw.length);
      for (let q = 0; q < raw.length; q++) src[q] = raw[q] === -128 ? NaN : raw[q] / old.matrix.scale;
    }
    if (src.length !== no * (no - 1) / 2) return null;
    mats[key] = (i, j) => { const a = idx.get(units[i].id), c = idx.get(units[j].id); if (a === undefined || c === undefined) return undefined; const lo = Math.min(a, c), hi = Math.max(a, c), v = src[lo * no - lo * (lo + 1) / 2 + (hi - lo - 1)]; return a < c ? v : -v; };
  }
  return {old, mats, precise};
}
const PREV = loadPrevious();
const dirty = new Uint8Array(n);                           // unités à rejouer : nouvelles ou modifiées (tout si pas de base réutilisable)
if (!PREV) dirty.fill(1); else { const oldFp = PREV.old.fp.units, ids = new Set(PREV.old.matrix.ids); for (let i = 0; i < n; i++) dirty[i] = (!ids.has(units[i].id) || oldFp[units[i].id] !== UNIT_FP[i]) ? 1 : 0; }
const nDirty = dirty.reduce((a, c) => a + c, 0);

const NOTES = [
  "Résultats issus du simulateur du site (sim.js), un modèle approximatif : pas de ciblage ni de flanquement, moral simplifié, précision des tirs fixe.",
  "Les seigneurs et héros sont inclus volontairement, mais leurs sorts, capacités, objets, compétences et montures volantes ne sont pas modélisés : leurs résultats sont indicatifs et probablement sous-estimés.",
  "Duels 1 type d'unité contre 1 autre, sans bonus, distance de départ 400 m : mode « cost » à coût de recrutement équivalent (de 1 à 20 exemplaires par camp) ; mode « count » 20 contre 20 sans tenir compte du coût.",
  "Typologie « anti » : unités de mêlée = taux de victoire en duel contre la catégorie ; unités à distance = efficacité de DPS contre un défenseur moyen de la catégorie (un duel contre de la mêlée n'étant pas représentatif).",
];

/* Calcul parallèle de la matrice des duels : chaque thread prend les lignes i ≡ k (mod W) (la ligne i compte n − i − 1 duels : l'entrelacement équilibre la charge). */
if (!isMainThread) {
  const {k, W, key} = workerData, rows = [];
  for (let i = k; i < n; i += W) { const row = new Float32Array(n).fill(2); for (let j = i + 1; j < n; j++) if (dirty[i] || dirty[j]) row[j] = DC.duel(units[i], units[j], key); rows.push([i, row]); }   // 2 = non rejoué
  parentPort.postMessage(rows); return;
}
const matrix = key => new Promise((resolve, reject) => {
  const W = Math.max(1, +arg("threads", os.cpus().length)), M = new Float32Array(n * n); let skipped = 0, left = W;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { if (dirty[i] || dirty[j]) continue; const m = PREV.mats[key](i, j); if (m === undefined) { dirty[i] = dirty[j] = 1; } else { M[i * n + j] = m; M[j * n + i] = -m; } }
  for (let k = 0; k < W; k++) {
    const w = new Worker(__filename, {workerData: {k, W, key}, argv: process.argv.slice(2)});
    w.on("message", rows => { for (const [i, row] of rows) for (let j = i + 1; j < n; j++) { const m = row[j]; if (m === 2) continue; M[i * n + j] = m; M[j * n + i] = -m; } });
    w.on("error", reject); w.on("exit", () => { if (--left === 0) { for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Number.isNaN(M[i * n + j])) skipped++; resolve({M, skipped}); } });
  }
});
const t0 = Date.now();
const result = {version: 2, budget: DuelCalc.BUDGET, maxArmy: DuelCalc.MAX_ARMY, opts: DuelCalc.OPTS, units: n, notes: NOTES, roles: ROLES,
  caveat: units.filter(u => u.role === "lord" || u.role === "hero").map(u => u.id), modes: {}};
(async () => {
  const mats = {};
  const pairs = nDirty === n ? n * (n - 1) / 2 : n * (n - 1) / 2 - (n - nDirty) * (n - nDirty - 1) / 2;
  console.log(!PREV ? `reconstruction complète (${PREV === null && !process.argv.includes("--full") ? "aucune base réutilisable : code ou constantes modifiés, ou pas de duels précédents" : "--full"}) : ${n} unités` : `reconstruction incrémentale : ${nDirty} unité(s) modifiée(s) ou nouvelle(s) sur ${n}, ${pairs.toLocaleString("fr-FR")} paires à rejouer par mode${PREV.precise ? "" : " (base int8 : cache pleine précision absent)"}`);
  for (const key of MODES) {
    const {M, skipped: sk} = await matrix(key), r = DC.aggregate(key, M, sk); result.modes[key] = r.units; mats[key] = M;
    console.log(`mode ${key} : ${(n * (n - 1) / 2 - r.skipped)} duels joués, ${r.skipped} paires ignorées (rapport de coût > ${DuelCalc.MAX_ARMY}), ${((Date.now() - t0) / 1000).toFixed(1)} s sur ${Math.max(1, +arg("threads", os.cpus().length))} threads`);
  }
  /* Matrice des marges (triangle supérieur, une marge par octet = round(marge × 127), −128 = paire ignorée) : sert au navigateur à ne recalculer que les paires touchées par « Ma campagne ». */
  fs.mkdirSync(OUT, {recursive: true});
  const files = {cost: "duels_matrix.bin", count: "duels_matrix_count.bin"};
  for (const key of Object.keys(mats)) {
    const M0 = mats[key], tri = new Int8Array(n * (n - 1) / 2); let p = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const m = M0[i * n + j]; tri[p++] = Number.isNaN(m) ? -128 : Math.max(-127, Math.min(127, Math.round(m * 127))); }
    fs.writeFileSync(path.join(OUT, files[key]), Buffer.from(tri.buffer));
  }
  result.matrix = {files, n, scale: 127, ids: units.map(u => u.id)};
  result.fp = {code: CODE_FP, units: Object.fromEntries(units.map((u, i) => [u.id, UNIT_FP[i]]))};
  if (!LIMIT) {   // cache pleine précision (hors dépôt) : triangle supérieur en Float32
    fs.mkdirSync(CACHE_DIR, {recursive: true});
    for (const key of Object.keys(mats)) { const M0 = mats[key], f = new Float32Array(n * (n - 1) / 2); let p = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) f[p++] = M0[i * n + j]; fs.writeFileSync(path.join(CACHE_DIR, key + ".f32"), Buffer.from(f.buffer)); }
    fs.writeFileSync(path.join(CACHE_DIR, "ids.json"), JSON.stringify(result.matrix.ids));
  }
  fs.writeFileSync(path.join(OUT, "duels.json"), JSON.stringify(result));
  fs.writeFileSync(path.join(OUT, "duels.js"), "window.TWW3_DUELS=" + JSON.stringify(result) + ";");
  console.log(`écrit ${path.join(OUT, "duels.js")} (${(fs.statSync(path.join(OUT, "duels.js")).size / 1e6).toFixed(2)} Mo) et les matrices ${Object.values(files).join(", ")}`);
})();
