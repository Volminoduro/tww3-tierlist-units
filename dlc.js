"use strict";
/* Mes DLC : masquer les unités des jeux / DLC que l'on ne possède pas.
   Données (tools/convert_rpfm.py) : D.dlc = {products: {clé: {n: nom, o: ordre de sortie, free, twa}}, packs: [[ensemble d'exigences = liste de produits]…]} ; u.pk = indices de paquets.
   Règle du jeu : un paquet est disponible si TOUS les produits d'au moins un de ses ensembles sont possédés ; une unité est disponible si AU MOINS un de ses paquets l'est
   (une unité peut venir de plusieurs DLC) ; sans paquet, elle est toujours disponible. Les produits gratuits sont toujours considérés comme possédés.
   L'état (activé ou non, produits possédés) est mémorisé ; il est lu par inScope() (prep.js), donc par tous les onglets. */
(() => {
  const DLC = D.dlc || {products: {}, packs: []}, keys = Object.keys(DLC.products);
  if (!keys.length) { document.querySelectorAll("[data-dlcui]").forEach(e => e.remove()); return; }
  let own = new Set(keys);                                   // par défaut : tout est possédé (le filtre ne change rien tant qu'on ne décoche rien)
  try { const s = JSON.parse(localStorage.getItem("dlcOwn") || "null"); if (Array.isArray(s)) own = new Set(s.filter(k => DLC.products[k])); DLCX.on = localStorage.getItem("dlcOn") === "1"; } catch (e) {}
  const owned = k => !!DLC.products[k] && (DLC.products[k].free || own.has(k));
  let okPack = [];
  const recalc = () => { okPack = DLC.packs.map(sets => sets.some(ps => ps.every(owned))); };
  DLCX.ok = u => !DLCX.on || !u.pk || u.pk.some(i => okPack[i]);
  recalc();
  const jeu = k => /^TW_WH1_/.test(k) ? 1 : /^TW_WH2_/.test(k) ? 2 : /^TW_WH3_/.test(k) ? 3 : 0;
  const GROUPS = {3: "Total War: Warhammer III", 2: "Total War: Warhammer II", 1: "Total War: Warhammer", 0: "Autres contenus"};
  const nUnits = {};                                          // unités qui dépendent (au moins en partie) de chaque produit
  for (const u of D.units) { const s = new Set(); (u.pk || []).forEach(i => DLC.packs[i].forEach(ps => ps.forEach(p => s.add(p)))); s.forEach(p => nUnits[p] = (nUnits[p] || 0) + 1); }

  const save = () => { try { localStorage.setItem("dlcOwn", JSON.stringify([...own])); localStorage.setItem("dlcOn", DLCX.on ? "1" : "0"); } catch (e) {} };
  const sync = () => { document.querySelectorAll("#dlcon,#bdlcon,#cdlcon").forEach(c => { c.checked = DLCX.on; });
    const miss = keys.filter(k => !owned(k)).length; document.querySelectorAll("[data-dlcbtn]").forEach(b => { b.textContent = miss ? `Choisir mes DLC… (${keys.length - miss}/${keys.length})` : "Choisir mes DLC…"; }); };
  const changed = () => { recalc(); save(); sync(); document.dispatchEvent(new Event("rorchange")); };     // même événement que les bataillons de renom : les onglets se redessinent

  const dlg = document.createElement("dialog"); dlg.id = "dlcdlg";
  document.body.appendChild(dlg);
  const draw = () => {
    const by = {3: [], 2: [], 1: [], 0: []}; keys.forEach(k => by[jeu(k)].push(k));
    dlg.innerHTML = `<div class="dlch"><h2>Mes DLC</h2><button class="x" type="button" data-close>✕</button></div>
      <p class="dlcp">Coche ce que tu possèdes. Quand le filtre est activé, les unités qui n'existent que grâce à un jeu ou DLC non coché sont masquées partout (tier list, unités par faction, combat). Les contenus gratuits sont toujours comptés comme possédés. Une unité offerte par plusieurs DLC reste visible si l'un d'eux est coché.</p>
      <label class="chk dlcmain"><input type="checkbox" data-on ${DLCX.on ? "checked" : ""}> Masquer les unités des DLC que je n'ai pas</label>
      <div class="dlcbar"><button type="button" data-a="all">Tout cocher</button><button type="button" data-a="none">Tout décocher</button><button type="button" data-a="free">Gratuits seulement</button></div>
      <div class="dlclist">${[3, 2, 1, 0].filter(g => by[g].length).map(g => `<h3>${GROUPS[g]}</h3>` + by[g].sort((a, b) => DLC.products[a].o - DLC.products[b].o || DLC.products[a].n.localeCompare(DLC.products[b].n)).map(k => { const p = DLC.products[k];
        return `<label class="dlcit${p.free ? " free" : ""}"><input type="checkbox" data-k="${k}" ${owned(k) ? "checked" : ""} ${p.free ? "disabled" : ""}><span>${p.n}</span><small>${p.free ? "gratuit · " : ""}${nUnits[k] || 0} unités</small></label>`; }).join("")).join("")}</div>`;
  };
  const open = () => { draw(); dlg.showModal(); };
  document.addEventListener("click", e => { if (e.target.closest("[data-dlcbtn]")) open(); });
  dlg.addEventListener("click", e => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close();
    const a = e.target.closest("[data-a]"); if (a) { own = new Set(a.dataset.a === "all" ? keys : a.dataset.a === "none" ? [] : keys.filter(k => DLC.products[k].free)); changed(); draw(); } });
  dlg.addEventListener("change", e => { const c = e.target;
    if (c.dataset.k) { c.checked ? own.add(c.dataset.k) : own.delete(c.dataset.k); changed(); }
    else if ("on" in c.dataset) { DLCX.on = c.checked; changed(); } });
  document.addEventListener("change", e => { if (["dlcon", "bdlcon", "cdlcon"].includes(e.target.id)) { DLCX.on = e.target.checked; changed(); } });
  sync();
})();
