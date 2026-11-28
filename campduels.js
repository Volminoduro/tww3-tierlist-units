"use strict";
/* Classement COMPLET par duels avec « Ma campagne » (bouton du bandeau). Les duels précalculés (data/duels.js) se jouent sans seigneur ; la matrice des marges (data/duels_matrix.bin) permet de ne rejouer
   que les paires où au moins une unité appartient à la faction du profil (stats du profil déjà dans les unités, effets conditionnels du seigneur selon la race de l'adversaire), réparties sur des Web Workers
   (duelworker.js, un par cœur). Le reste vient de la matrice précalculée ; les agrégats (taux de victoire, typologie « anti », meilleurs adversaires) sont ensuite recalculés avec le même code que le précalcul
   (duelcalc.js) et remplacent les duels précalculés (setDU, app.js) jusqu'au prochain changement du profil. Marges de la matrice quantifiées à 1/127 : écart ≤ 0,004 sur les paires non rejouées. */
const CampDuels = (() => {
  let matrix = null, running = false;
  async function loadMatrix(DU0) {
    if (matrix) return matrix;
    const r = await fetch("data/" + DU0.matrix.file + "?n=" + DU0.matrix.n); if (!r.ok) throw new Error("matrice des duels introuvable (" + r.status + ")");
    const tri = new Int8Array(await r.arrayBuffer()), n = DU0.matrix.n, M = new Float32Array(n * n); let p = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const v = tri[p++], m = v === -128 ? NaN : v / DU0.matrix.scale; M[i * n + j] = m; M[j * n + i] = -m; }
    return matrix = M;
  }
  async function run(progress) {
    if (running) return null; running = true;
    try {
      const DU0 = window.TWW3_DUELS; if (!DU0 || !DU0.matrix) throw new Error("matrice des duels absente (relancer tools/build_duels.js)");
      const units = D.units.filter(u => u.cost > 0 && u.men > 0 && u.hp > 0), n = units.length;
      if (n !== DU0.matrix.n || units.some((u, i) => u.id !== DU0.matrix.ids[i])) throw new Error("les unités ont changé depuis le précalcul : relancer tools/build_duels.js");
      progress("Téléchargement de la matrice des duels…");
      const M = (await loadMatrix(DU0)).slice();                                                // copie : la matrice précalculée reste intacte
      const FX = window.TWW3_EFFECTS || {lords: {}}, lord = FX.lords[PROFILE.st], lordUnit = lord ? lord.unit : null;
      const prof = {fac: PROFILE.fac, lord: lordUnit, cond: ((lord && lord.effects) || []).filter(e => e.cond).concat(PROFILE.condEff || [])};
      const touched = units.map(u => (u.factions || []).includes(PROFILE.fac) || u.id === lordUnit);
      const pairs = []; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if ((touched[i] || touched[j]) && !Number.isNaN(M[i * n + j])) pairs.push(i, j);
      const total = pairs.length / 2, W = Math.max(1, Math.min(navigator.hardwareConcurrency || 4, 8)), CH = 3000;
      progress(`${total.toLocaleString("fr-FR")} duels à rejouer (les autres viennent de la matrice) sur ${W} thread${W > 1 ? "s" : ""}…`);
      let next = 0, done = 0; const t0 = Date.now(), workers = [];
      await new Promise((resolve, reject) => {
        let alive = W;
        const feed = (w, id) => {
          if (next >= total) { if (--alive === 0) resolve(); w.terminate(); return; }
          const a = next, b = Math.min(total, a + CH); next = b;
          const chunk = Int32Array.from(pairs.slice(2 * a, 2 * b)); w.postMessage({type: "run", id: a, pairs: chunk}, [chunk.buffer]);
        };
        for (let k = 0; k < W; k++) {
          const w = new Worker("duelworker.js"); workers.push(w);
          w.onerror = e => { workers.forEach(x => x.terminate()); reject(new Error(e.message || "erreur du worker")); };
          w.onmessage = e => { const m = e.data;
            if (m.type === "ready") feed(w);
            else if (m.type === "done") {
              const a = m.id; for (let q = 0; q < m.out.length; q++) { const i = pairs[2 * (a + q)], j = pairs[2 * (a + q) + 1]; M[i * n + j] = m.out[q]; M[j * n + i] = -m.out[q]; }
              done += m.out.length; const el = (Date.now() - t0) / 1000, eta = done ? Math.round(el / done * (total - done)) : 0;
              progress(`Duels rejoués : ${Math.round(done / total * 100)} % (${done.toLocaleString("fr-FR")} / ${total.toLocaleString("fr-FR")}) · reste ~${eta} s`); feed(w);
            } };
          w.postMessage({type: "init", units, prof});
        }
      });
      progress("Calcul du classement…"); await new Promise(r => setTimeout(r, 20));
      let skipped = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (Number.isNaN(M[i * n + j])) skipped++;
      const DC = DuelCalc.make(window.TWW3Sim, units), out = DC.aggregate("cost", M, skipped);
      return {...DU0, modes: {cost: out.units}, matrix: undefined, forProfile: true};
    } finally { running = false; }
  }
  return {run, isRunning: () => running};
})();

document.addEventListener("click", async e => {
  const b = e.target.closest("[data-pduel]"); if (!b || CampDuels.isRunning()) return;
  const st = document.querySelector(".profbar .pbst"), say = t => { if (st) st.textContent = t; };
  b.disabled = true;
  try {
    const r = await CampDuels.run(say);
    if (r) { PROFILE.duelsOk = true; window.setDU(r); say("Classement par duels recalculé pour ma campagne (métrique « résultats de duels » et matrice).");
      b.textContent = "Duels recalculés ✓"; }
  } catch (err) { say("Échec : " + (err && err.message || err)); console.error(err); }
  b.disabled = false;
});
