"use strict";
const D = window.TWW3_DATA;
const ALL = "__all__"; // entrée « Toutes les factions » des sélecteurs
D.factions[ALL] = "Toutes les factions";
const cultOf = f => f === ALL ? null : D.facInfo[f].culture;
/* Prépare la hiérarchie race -> faction : calcule u.factions (clés des factions où l'unité est disponible).
   Unités : groupe militaire de la faction (recrutement) ou permission explicite ; seigneurs/héros : par race. */
(() => {
  const byGroup = {}, byCulture = {};
  for (const [f, i] of Object.entries(D.facInfo || {})) { (byGroup[i.group] ??= []).push(f); (byCulture[i.culture] ??= []).push(f); }
  for (const u of D.units) {
    const s = new Set(u.facs || []);
    (u.groups || []).forEach(g => (byGroup[g] || []).forEach(f => s.add(f)));
    (u.cultures || []).forEach(c => (byCulture[c] || []).forEach(f => s.add(f)));
    u.factions = [...s];
  }
})();

/* Sélecteur en arbre : races (ordre alphabétique, avec icône) puis leurs factions (ordre alphabétique, avec icône), dans un seul menu.
   Le <select> d'origine reste dans la page, masqué : facEl.value est la clé de la faction et un événement « change » est émis à chaque choix. */
function initPicker(facEl, defaultKey) {
  const cmp = (a, b) => a.localeCompare(b, "fr");
  const cultures = [...D.cultureOrder].sort((a, b) => cmp(D.cultures[a], D.cultures[b]));
  const byCul = {}; Object.keys(D.facInfo).forEach(f => (byCul[D.facInfo[f].culture] ??= []).push(f));
  cultures.forEach(c => byCul[c].sort((a, b) => cmp(D.factions[a], D.factions[b])));
  const mainOf = c => byCul[c].slice().sort((a, b) => D.facInfo[a].sort - D.facInfo[b].sort)[0];
  facEl.innerHTML = "";
  facEl.appendChild(new Option(D.factions[ALL], ALL));
  cultures.forEach(c => { const g = document.createElement("optgroup"); g.label = D.cultures[c]; byCul[c].forEach(f => g.appendChild(new Option(D.factions[f], f))); facEl.appendChild(g); });
  facEl.value = defaultKey === ALL || D.facInfo[defaultKey] ? defaultKey : byCul[cultures[0]][0];
  facEl.hidden = true;

  const root = document.createElement("div"); root.className = "tp";
  root.innerHTML = `<button type="button" class="tp-btn"></button><div class="tp-pop" hidden><input class="tp-q" placeholder="Filtrer races et factions…"><div class="tp-list"></div></div>`;
  facEl.after(root);
  const btn = root.querySelector(".tp-btn"), pop = root.querySelector(".tp-pop"), q = root.querySelector(".tp-q"), list = root.querySelector(".tp-list");
  const open = new Set([cultOf(facEl.value)]);
  const label = () => { const f = facEl.value; btn.innerHTML = `${crest(f, "s")}<span class="tp-t"><b>${D.factions[f]}</b><small>${f === ALL ? "Toutes les races" : D.cultures[cultOf(f)]}</small></span><span class="tp-c">▾</span>`; };
  const render = () => {
    const t = q.value.trim().toLowerCase();
    const allRow = !t || D.factions[ALL].toLowerCase().includes(t)
      ? `<div class="tp-all${facEl.value === ALL ? " sel" : ""}" data-f="${ALL}">${crest(ALL, "s")}<span>${D.factions[ALL]}</span></div>` : "";
    list.innerHTML = allRow + cultures.map(c => {
      const raceHit = t && D.cultures[c].toLowerCase().includes(t);
      const fs = !t || raceHit ? byCul[c] : byCul[c].filter(f => D.factions[f].toLowerCase().includes(t));
      if (!fs.length) return "";
      const isOpen = !!t || open.has(c);
      return `<div class="tp-race" data-c="${c}">${crest(mainOf(c), "s", D.cultures[c])}<span>${D.cultures[c]}</span><small>${byCul[c].length}</small><i>${isOpen ? "▾" : "▸"}</i></div>` +
        (isOpen ? fs.map(f => `<div class="tp-it${f === facEl.value ? " sel" : ""}" data-f="${f}">${crest(f, "s")}<span>${D.factions[f]}</span></div>`).join("") : "");
    }).join("") || (allRow ? "" : '<div class="tp-none">Aucun résultat</div>');
  };
  const close = () => { pop.hidden = true; };
  const openPop = () => {
    const r = btn.getBoundingClientRect();
    Object.assign(pop.style, {left: r.left + "px", top: r.bottom + 4 + "px", width: Math.max(r.width, 320) + "px", maxHeight: Math.max(220, Math.min(innerHeight - r.bottom - 16, 560)) + "px"});
    q.value = ""; if (cultOf(facEl.value)) open.add(cultOf(facEl.value)); render(); pop.hidden = false; q.focus();
    const sel = list.querySelector(".sel"); if (sel) sel.scrollIntoView({block: "nearest"});
  };
  btn.onclick = () => pop.hidden ? openPop() : close();
  q.oninput = render;
  list.onclick = e => {
    const it = e.target.closest(".tp-it,.tp-all"), rc = e.target.closest(".tp-race");
    if (it) { facEl.value = it.dataset.f; label(); close(); ["input", "change"].forEach(t => facEl.dispatchEvent(new Event(t, {bubbles: true}))); }
    else if (rc) { const c = rc.dataset.c; open.has(c) ? open.delete(c) : open.add(c); render(); }
  };
  document.addEventListener("click", e => { if (!e.composedPath().includes(root)) close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  addEventListener("resize", close); addEventListener("scroll", e => { if (!pop.contains(e.target)) close(); }, true);
  facEl.addEventListener("change", label);
  label();
}
