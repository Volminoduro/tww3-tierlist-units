"use strict";
const D = window.TWW3_DATA;
/* Langue : noms de races dans la langue choisie ; noms d'unités et de factions en français si un fichier de noms français (data/names_fr.js) est fourni, sinon les noms officiels anglais du dump. */
D.culturesFr = D.cultures;
if (window.LANG === "en") {
  D.cultures = D.culturesEn || D.cultures;
  const toEn = Object.fromEntries(Object.keys(D.culturesFr).map(c => [D.culturesFr[c], D.cultures[c]]));
  for (const k of Object.keys(D.factions)) D.factions[k] = D.factions[k].replace(/\(([^)]+)\)$/, (m, x) => toEn[x] ? `(${toEn[x]})` : m);   // « Tong (Norsca) » : suffixe de race
} else {
  const NF = window.TWW3_NAMES_FR || {};
  for (const u of D.units) if (NF.units && NF.units[u.id]) { u.nameEn = u.name; u.name = NF.units[u.id]; }
  for (const k of Object.keys(NF.factions || {})) if (D.factions[k]) D.factions[k] = NF.factions[k];
}
const ALL = "__all__";  // entrée « Toutes les factions » des sélecteurs
const RACE = "race:";   // entrée « race entière » : "race:<clé de culture>"
D.factions[ALL] = "Toutes les factions";
D.cultureOrder.forEach(c => { D.factions[RACE + c] = D.cultures[c] + " (race entière)"; });
const isRace = k => k.startsWith(RACE);
const cultOf = f => f === ALL ? null : isRace(f) ? f.slice(RACE.length) : D.facInfo[f].culture;
const factionsOfRace = c => Object.keys(D.facInfo).filter(f => D.facInfo[f].culture === c);
const mainFacOf = c => factionsOfRace(c).sort((a, b) => D.facInfo[a].sort - D.facInfo[b].sort)[0]; // faction « principale » d'une race (icône)
/* Une unité fait partie du périmètre choisi (toutes les factions, une race entière ou une faction) ? */
const inScope = (u, key) => key === ALL || (isRace(key) ? u.races.has(key.slice(RACE.length)) : u.factions.includes(key));

/* Prépare la hiérarchie race -> faction : calcule u.factions (clés des factions où l'unité est disponible) et u.races.
   Unités : groupe militaire de la faction (recrutement) ou permission explicite ; seigneurs/héros : par race. */
(() => {
  const byGroup = {}, byCulture = {};
  for (const [f, i] of Object.entries(D.facInfo || {})) { (byGroup[i.group] ??= []).push(f); (byCulture[i.culture] ??= []).push(f); }
  for (const u of D.units) {
    const s = new Set(u.facs || []);
    (u.groups || []).forEach(g => (byGroup[g] || []).forEach(f => s.add(f)));
    (u.cultures || []).forEach(c => (byCulture[c] || []).forEach(f => s.add(f)));
    u.factions = [...s];
    u.races = new Set(u.factions.map(f => D.facInfo[f].culture));
  }
})();

/* Sélecteur en arbre : races (ordre alphabétique, avec icône) puis leurs factions (ordre alphabétique, avec icône), dans un seul menu.
   Cliquer sur le nom d'une race choisit la race entière ; le chevron ▸/▾ la déplie. Une entrée « Toutes les factions » est en tête.
   Le <select> d'origine reste dans la page, masqué : facEl.value est la clé choisie (faction, "race:<culture>" ou ALL), avec un événement « change » à chaque choix. */
function initPicker(facEl, defaultKey) {
  const cmp = (a, b) => a.localeCompare(b, "fr");
  const cultures = [...D.cultureOrder].sort((a, b) => cmp(D.cultures[a], D.cultures[b]));
  const byCul = {}; Object.keys(D.facInfo).forEach(f => (byCul[D.facInfo[f].culture] ??= []).push(f));
  cultures.forEach(c => byCul[c].sort((a, b) => cmp(D.factions[a], D.factions[b])));
  facEl.innerHTML = "";
  facEl.appendChild(new Option(D.factions[ALL], ALL));
  cultures.forEach(c => {
    const g = document.createElement("optgroup"); g.label = D.cultures[c];
    g.appendChild(new Option(D.factions[RACE + c], RACE + c)); byCul[c].forEach(f => g.appendChild(new Option(D.factions[f], f))); facEl.appendChild(g);
  });
  facEl.value = defaultKey === ALL || (defaultKey && (isRace(defaultKey) ? D.cultures[defaultKey.slice(RACE.length)] : D.facInfo[defaultKey])) ? defaultKey : byCul[cultures[0]][0];
  facEl.hidden = true;

  const root = document.createElement("div"); root.className = "tp";
  root.innerHTML = `<button type="button" class="tp-btn"></button><div class="tp-pop" hidden><input class="tp-q" placeholder="Filtrer races et factions…"><div class="tp-list"></div></div>`;
  facEl.after(root);
  const btn = root.querySelector(".tp-btn"), pop = root.querySelector(".tp-pop"), q = root.querySelector(".tp-q"), list = root.querySelector(".tp-list");
  const open = new Set();   // races dépliées : aucune au départ ; la race d'un choix de l'utilisateur est dépliée aux ouvertures suivantes
  let chosen = false;
  const label = () => {
    const f = facEl.value, c = cultOf(f);
    const icon = isRace(f) ? crest(mainFacOf(c), "s", D.cultures[c]) : crest(f, "s");
    const name = isRace(f) ? D.cultures[c] + " — toute la race" : D.factions[f];
    const sub = f === ALL ? "Toutes les races" : isRace(f) ? `${byCul[c].length} factions` : D.cultures[c];
    btn.innerHTML = `${icon}<span class="tp-t"><b>${name}</b><small>${sub}</small></span><span class="tp-c">▾</span>`;
  };
  const render = () => {
    const t = q.value.trim().toLowerCase();
    const allRow = !t || D.factions[ALL].toLowerCase().includes(t)
      ? `<div class="tp-all${facEl.value === ALL ? " sel" : ""}" data-f="${ALL}">${crest(ALL, "s")}<span>${D.factions[ALL]}</span></div>` : "";
    list.innerHTML = allRow + cultures.map(c => {
      const raceHit = t && D.cultures[c].toLowerCase().includes(t);
      const fs = !t || raceHit ? byCul[c] : byCul[c].filter(f => D.factions[f].toLowerCase().includes(t));
      if (!fs.length) return "";
      const isOpen = !!t || open.has(c);
      return `<div class="tp-race${facEl.value === RACE + c ? " sel" : ""}" data-c="${c}" title="Cliquer pour déplier / replier">${crest(mainFacOf(c), "s", D.cultures[c])}<span>${D.cultures[c]}</span><small>${byCul[c].length}</small><button type="button" class="tp-pick" title="Choisir toute la race">Tout</button><i>${isOpen ? "▾" : "▸"}</i></div>` +
        (isOpen ? fs.map(f => `<div class="tp-it${f === facEl.value ? " sel" : ""}" data-f="${f}">${crest(f, "s")}<span>${D.factions[f]}</span></div>`).join("") : "");
    }).join("") || (allRow ? "" : '<div class="tp-none">Aucun résultat</div>');
  };
  const close = () => { pop.hidden = true; };
  const choose = v => { chosen = true; facEl.value = v; label(); close(); ["input", "change"].forEach(t => facEl.dispatchEvent(new Event(t, {bubbles: true}))); };
  const openPop = () => {
    const r = btn.getBoundingClientRect();
    Object.assign(pop.style, {left: r.left + "px", top: r.bottom + 4 + "px", width: r.width + "px", boxSizing: "border-box", maxHeight: Math.max(220, Math.min(innerHeight - r.bottom - 16, 560)) + "px"});
    q.value = ""; if (chosen && cultOf(facEl.value)) open.add(cultOf(facEl.value)); render(); pop.hidden = false; q.focus();
    const sel = list.querySelector(".tp-it.sel,.tp-race.sel,.tp-all.sel"); if (sel) sel.scrollIntoView({block: "nearest"});
  };
  btn.onclick = () => pop.hidden ? openPop() : close();
  q.oninput = render;
  list.onclick = e => {
    // un clic sur une race la déplie ; « Tout » (ou la ligne « Toute la race ») la choisit en entier ; un clic sur une faction la choisit
    const pk = e.target.closest(".tp-pick"), it = e.target.closest(".tp-it,.tp-all"), rc = e.target.closest(".tp-race");
    if (pk) choose(RACE + pk.closest(".tp-race").dataset.c);
    else if (it) choose(it.dataset.f);
    else if (rc) { const c = rc.dataset.c; open.has(c) ? open.delete(c) : open.add(c); render(); }
  };
  document.addEventListener("click", e => { if (!e.composedPath().includes(root)) close(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  addEventListener("resize", close); addEventListener("scroll", e => { if (!pop.contains(e.target)) close(); }, true);
  facEl.addEventListener("change", label);
  label();
}
