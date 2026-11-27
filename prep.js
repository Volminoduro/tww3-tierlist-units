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
/* Sélection multiple (sélecteurs « Tier list » et « Unités par faction ») : plusieurs clés (factions ou "race:<culture>") jointes par « | », ex. "wh_main_emp_empire|race:dwarfs". */
const isMulti = k => k.includes("|");
const isRace = k => k.startsWith(RACE) && !isMulti(k);
const cultOf = f => f === ALL || isMulti(f) ? null : isRace(f) ? f.slice(RACE.length) : D.facInfo[f].culture;
/* Les clés d'une sélection (une seule clé si ce n'est pas une sélection multiple) */
const keysOf = k => k === ALL ? [] : k.split("|");
/* Une clé est-elle valide (faction, race ou sélection multiple de celles-ci) ? */
const okFacKey = k => k === ALL || (typeof k === "string" && k !== "" && k.split("|").every(f => f.startsWith(RACE) ? D.cultures[f.slice(RACE.length)] : D.facInfo[f]));
/* Affecte la valeur d'un sélecteur de faction, en créant l'option correspondante s'il s'agit d'une sélection multiple (le <select> masqué n'a que les options simples). */
function setFac(el, v) {
  [...el.options].forEach(o => { if (o.dataset.multi && o.value !== v) o.remove(); });
  if (![...el.options].some(o => o.value === v)) { const o = new Option(v, v); o.dataset.multi = "1"; el.appendChild(o); }
  el.value = v;
}
const factionsOfRace = c => Object.keys(D.facInfo).filter(f => D.facInfo[f].culture === c);
const mainFacOf = c => factionsOfRace(c).sort((a, b) => D.facInfo[a].sort - D.facInfo[b].sort)[0]; // faction « principale » d'une race (icône)
/* Une unité fait partie du périmètre choisi (toutes les factions, une race entière ou une faction) ? */
/* Bataillons de renom : option « exclure » partagée par tous les onglets (mémorisée). setRor(v) recopie les deux cases à cocher et prévient les onglets (événement « rorchange »). */
/* Préférences mémorisées dans le navigateur (localStorage, préfixe « tww3. ») : filtres, réglages, DLC, langue (clé « lang », i18n.js)… Toujours sous try/catch : navigation privée, stockage bloqué. */
const PREF = {
  get(k, d) { try { const v = localStorage.getItem("tww3." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("tww3." + k, JSON.stringify(v)); } catch (e) {} },
};
const RORX = {off: false}, DLCX = {on: false, ok: () => true};   // DLCX : état « Mes DLC » (dlc.js)
try { RORX.off = localStorage.getItem("noRor") === "1"; } catch (e) {}
function setRor(v) {
  RORX.off = !!v; try { localStorage.setItem("noRor", v ? "1" : "0"); } catch (e) {}
  document.querySelectorAll("#noror,#bnoror").forEach(c => { c.checked = RORX.off; });
  document.dispatchEvent(new Event("rorchange"));
}
const inScope = (u, key) => !(RORX.off && u.ror) && DLCX.ok(u) && (key === ALL || keysOf(key).some(k => k.startsWith(RACE) ? u.races.has(k.slice(RACE.length)) : u.factions.includes(k)));

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
function initPicker(facEl, defaultKey, multi = false) {
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
  root.innerHTML = `<button type="button" class="tp-btn"></button><div class="tp-pop" hidden><input class="tp-q" placeholder="Filtrer races et factions…">${multi ? '<div class="tp-hint">Coche plusieurs races ou factions pour les combiner.</div>' : ""}<div class="tp-list"></div></div>`;
  facEl.after(root);
  const btn = root.querySelector(".tp-btn"), pop = root.querySelector(".tp-pop"), q = root.querySelector(".tp-q"), list = root.querySelector(".tp-list");
  const open = new Set();   // races dépliées : aucune au départ ; la race d'un choix de l'utilisateur est dépliée aux ouvertures suivantes
  let chosen = false;
  /* Sélection multiple : sel = ensemble des clés cochées (vide = toutes les factions) ; facEl.value = clés triées jointes par « | » */
  const sel = new Set(), tokName = t => t.startsWith(RACE) ? D.cultures[t.slice(RACE.length)] : D.factions[t];
  const readSel = () => { sel.clear(); keysOf(facEl.value).forEach(k => sel.add(k)); };
  const isSel = t => multi ? sel.has(t) : facEl.value === t;
  const covered = (f, c) => sel.has(f) || sel.has(RACE + c);                      // faction cochée, seule ou via sa race
  const raceState = c => sel.has(RACE + c) || byCul[c].every(f => sel.has(f)) ? 2 : byCul[c].some(f => sel.has(f)) ? 1 : 0;   // 2 = toute la race, 1 = en partie
  const label = () => {
    if (multi && keysOf(facEl.value).length > 1) {
      const ks = keysOf(facEl.value);
      btn.innerHTML = `${crest(ALL, "s")}<span class="tp-t"><b>${ks.length} sélections</b><small>${ks.map(tokName).join(", ")}</small></span><span class="tp-c">▾</span>`; return;
    }
    const f = facEl.value, c = cultOf(f);
    const icon = isRace(f) ? crest(mainFacOf(c), "s", D.cultures[c]) : crest(f, "s");
    const name = isRace(f) ? D.cultures[c] + " — toute la race" : D.factions[f];
    const sub = f === ALL ? "Toutes les races" : isRace(f) ? `${byCul[c].length} factions` : D.cultures[c];
    btn.innerHTML = `${icon}<span class="tp-t"><b>${name}</b><small>${sub}</small></span><span class="tp-c">▾</span>`;
  };
  /* Factions / races sans aucune unité disponible avec les filtres actuels (bataillons de renom exclus, DLC non possédés) : grisées et non sélectionnables. */
  let avail = {}; document.addEventListener("rorchange", () => { avail = {}; });
  const has = f => avail[f] ??= D.units.some(u => inScope(u, f));
  const NA = "Aucune unité disponible avec tes filtres (bataillons de renom, DLC)";
  const render = () => {
    const t = q.value.trim().toLowerCase();
    const allRow = !t || D.factions[ALL].toLowerCase().includes(t)
      ? `<div class="tp-all${facEl.value === ALL ? " sel" : ""}" data-f="${ALL}">${crest(ALL, "s")}<span>${D.factions[ALL]}</span></div>` : "";
    list.innerHTML = allRow + cultures.map(c => {
      const raceHit = t && D.cultures[c].toLowerCase().includes(t);
      const fs = !t || raceHit ? byCul[c] : byCul[c].filter(f => D.factions[f].toLowerCase().includes(t));
      if (!fs.length) return "";
      const isOpen = !!t || open.has(c);
      const rs = multi ? raceState(c) : 0;
      return `<div class="tp-race${multi ? (rs === 2 ? " sel" : rs === 1 ? " part" : "") : facEl.value === RACE + c ? " sel" : ""}${has(RACE + c) ? "" : " na"}" data-c="${c}" title="${has(RACE + c) ? "Cliquer pour déplier / replier" : NA}">${crest(mainFacOf(c), "s", D.cultures[c])}<span>${D.cultures[c]}</span><small>${byCul[c].length}</small><button type="button" class="tp-pick" title="Choisir toute la race">${multi ? (rs === 2 ? "✓ Tout" : "Tout") : "Tout"}</button><i>${isOpen ? "▾" : "▸"}</i></div>` +
        (isOpen ? fs.map(f => { const on = multi ? covered(f, c) : f === facEl.value; return `<div class="tp-it${on ? " sel" : ""}${has(f) ? "" : " na"}" data-f="${f}"${has(f) ? "" : ` title="${NA}"`}>${multi ? `<i class="tp-cb${on ? " on" : ""}"></i>` : ""}${crest(f, "s")}<span>${D.factions[f]}</span></div>`; }).join("") : "");
    }).join("") || (allRow ? "" : '<div class="tp-none">Aucun résultat</div>');
  };
  const close = () => { pop.hidden = true; };
  const choose = v => { chosen = true; setFac(facEl, v); label(); close(); ["input", "change"].forEach(t => facEl.dispatchEvent(new Event(t, {bubbles: true}))); };
  /* Sélection multiple : coche / décoche sans fermer la liste. Une race dont toutes les factions sont cochées devient « race entière ». */
  const commit = () => { chosen = true; const v = sel.size ? [...sel].sort().join("|") : ALL; setFac(facEl, v); label(); render(); ["input", "change"].forEach(t => facEl.dispatchEvent(new Event(t, {bubbles: true}))); };
  const toggleFac = f => {
    const c = D.facInfo[f].culture;
    if (sel.has(RACE + c)) { sel.delete(RACE + c); byCul[c].forEach(x => { if (x !== f) sel.add(x); }); }
    else { sel.has(f) ? sel.delete(f) : sel.add(f); if (byCul[c].every(x => sel.has(x))) { byCul[c].forEach(x => sel.delete(x)); sel.add(RACE + c); } }
    commit();
  };
  const toggleRace = c => { const full = raceState(c) === 2; byCul[c].forEach(x => sel.delete(x)); sel.delete(RACE + c); if (!full) sel.add(RACE + c); commit(); };
  const openPop = () => {
    const r = btn.getBoundingClientRect();
    Object.assign(pop.style, {left: r.left + "px", top: r.bottom + 4 + "px", width: r.width + "px", boxSizing: "border-box", maxHeight: Math.max(220, Math.min(innerHeight - r.bottom - 16, 560)) + "px"});
    q.value = ""; if (multi) { readSel(); keysOf(facEl.value).forEach(k => open.add(k.startsWith(RACE) ? k.slice(RACE.length) : D.facInfo[k].culture)); }
    else if (chosen && cultOf(facEl.value)) open.add(cultOf(facEl.value)); render(); pop.hidden = false; q.focus();
    const sel = list.querySelector(".tp-it.sel,.tp-race.sel,.tp-all.sel"); if (sel) sel.scrollIntoView({block: "nearest"});
  };
  btn.onclick = () => pop.hidden ? openPop() : close();
  q.oninput = render;
  list.onclick = e => {
    // un clic sur une race la déplie ; « Tout » (ou la ligne « Toute la race ») la choisit en entier ; un clic sur une faction la choisit
    const pk = e.target.closest(".tp-pick"), it = e.target.closest(".tp-it,.tp-all"), rc = e.target.closest(".tp-race");
    if ((pk || it) && (pk || it).closest(".na") && !(multi ? covered((it || {dataset: {}}).dataset.f, ((it && D.facInfo[it.dataset.f]) || {}).culture) : (pk ? pk.closest(".tp-race") : it).dataset.f === facEl.value)) return;   // grisé : non sélectionnable (sauf pour décocher)
    if (multi) {
      if (pk) toggleRace(pk.closest(".tp-race").dataset.c);
      else if (it && it.dataset.f === ALL) { sel.clear(); commit(); close(); }
      else if (it) toggleFac(it.dataset.f);
      else if (rc) { const c = rc.dataset.c; open.has(c) ? open.delete(c) : open.add(c); render(); }
      return;
    }
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
