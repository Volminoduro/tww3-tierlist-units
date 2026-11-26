"use strict";
/* Emblèmes de rôle (SVG originaux) + portraits optionnels extraits du jeu (img/units/<id>.png, listés dans data/icons.js). */
const ROLE_ICON = {
  inf_melee: '<path d="M24 5 38 10v13c0 9-6 16-14 20C16 39 10 32 10 23V10z"/><path d="M24 13v22M18 20h12"/>',
  inf_ranged: '<path d="M17 7c19 8 19 26 0 34M17 7v34"/><path d="M8 24h31M39 24l-6-4v8z"/>',
  cav_melee: '<path d="M13 41h22v-5c0-7 3-12-1-19l4-6-7-2-3-4-2 4c-8 2-13 9-11 18l5-2c0 4-3 8-6 10z"/><circle cx="29" cy="15" r="1"/>',
  cav_ranged: '<path d="M12 41h20v-5c0-7 3-10-1-17l3-5-6-2-3-4-2 4c-8 2-11 8-9 16l5-2c0 4-3 8-7 10z"/><path d="M36 10c6 6 6 16 0 22M36 10v22M30 21h14"/>',
  monster: '<path d="M11 6c0 9 4 11 7 14M37 6c0 9-4 11-7 14"/><path d="M15 20h18l2 10-7 11h-8L13 30z"/><path d="M19 28l3 2M29 28l-3 2M21 36h6"/>',
  chariot: '<circle cx="22" cy="29" r="12"/><circle cx="22" cy="29" r="3"/><path d="M22 17v24M10 29h24M13.5 20.5l17 17M30.5 20.5l-17 17"/><path d="M34 29h9M6 12h20"/>',
  artillery: '<path d="M7 27 33 14l5 9L12 35z"/><circle cx="17" cy="37" r="6"/><circle cx="17" cy="37" r="1.5"/><path d="M38 18l5-3M40 24l4-1"/>',
  beast: '<ellipse cx="24" cy="32" rx="9" ry="7"/><circle cx="12" cy="23" r="3.5"/><circle cx="20" cy="15" r="3.5"/><circle cx="30" cy="15" r="3.5"/><circle cx="38" cy="23" r="3.5"/>',
  lord: '<path d="M8 35 11 15l9 9 4-14 4 14 9-9 3 20z"/><path d="M9 40h30"/>',
  hero: '<path d="M24 5l5 12 13 1-10 8 3 13-11-7-11 7 3-13-10-8 13-1z"/>',
  _: '<path d="M24 6 42 24 24 42 6 24z"/><path d="M24 14 34 24 24 34 14 24z"/>',
};
/* Petite icône de catégorie (puces de filtre) : même tracé que l'emblème de rôle */
const roleIc = r => `<svg class="ri" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${r ? (ROLE_ICON[r] || ROLE_ICON._) : '<rect x="8" y="8" width="13" height="13" rx="2"/><rect x="27" y="8" width="13" height="13" rx="2"/><rect x="8" y="27" width="13" height="13" rx="2"/><rect x="27" y="27" width="13" height="13" rx="2"/>'}</svg>`;
const ICON_SET = new Set(window.TWW3_ICONS || []), FLAG_SET = new Set(window.TWW3_FLAGS || []);
/* Tier de l'unité DANS LE JEU (colonne « tier » de main_units, 1 à 5) : indicatif, distinct du tier S→F calculé par le site. 0 = non applicable (seigneurs, héros, unités sans tier) : rien n'est affiché. */
/* Icône du jeu (img/tiers/unit_tier_N.png, ui/skins/default de ui2.pack) devant le texte ; retirée si l'image manque. */
function gtier(u) { return u && u.tier > 0 ? `<i class="gt" title="Tier de l'unité dans le jeu (indicatif, table main_units) ; à ne pas confondre avec le tier S–F du site"><img class="gti" src="img/tiers/unit_tier_${u.tier}.png" alt="" onerror="this.remove()">Tier jeu ${u.tier}</i>` : ""; }
/* Bataillon de renom (unité à part dans le jeu, recrutée sur condition) : laurier doré, cadre et bandeau dorés repris du style « Regiment of Renown » du jeu */
const ROR_SVG = '<svg class="rori" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.5V8.5"/><path d="M12 5l1.3 2.6 2.9.4-2.1 2 .5 2.9L12 11.5 9.4 12.9l.5-2.9-2.1-2 2.9-.4z" fill="currentColor" stroke="none"/><path d="M8.5 20c-3.5-1-5.5-4-5.5-8M15.5 20c3.5-1 5.5-4 5.5-8"/><path d="M5 15.5l-2-1.2M5.8 11.5L3.7 10.5M7.6 8L5.8 6.6M19 15.5l2-1.2M18.2 11.5l2.1-1M16.4 8l1.8-1.4"/></svg>';
function rortag(u) { return u && u.ror ? `<i class="rortag" title="Bataillon de renom : unité à part, recrutée sous condition (campagne)">${ROR_SVG}Bataillon de renom</i>` : ""; }
function roricon(u) { return u && u.ror ? `<span class="rormark" title="Bataillon de renom">${ROR_SVG}</span>` : ""; }
/* Portrait à utiliser pour une unité : le sien s'il existe, sinon celui du même personnage sans la monture ou la variante (ex. wh3_dlc29_vmp_cha_neferata_zombie_dragon -> …_neferata), sinon celui d'une unité de même nom de base. */
const _ICON_MEMO = {};
function iconId(u) {
  if (!u) return null;
  if (ICON_SET.has(u.id)) return u.id;
  if (u.id in _ICON_MEMO) return _ICON_MEMO[u.id];
  let found = null; const t = u.id.split("_");
  for (let n = t.length - 1; n >= 4 && !found; n--) {                      // on retire des mots de la fin de la clé : …_neferata_zombie_dragon -> …_neferata_zombie -> …_neferata
    const pre = t.slice(0, n).join("_");
    found = [pre, pre + "_0", pre + "_1"].find(k => ICON_SET.has(k)) || null;
  }
  if (!found) {                                                            // même nom de base (avant la parenthèse de variante) et même race : une autre version du personnage
    const nb = u.name.replace(/ \(.*$/, ""), key = x => (x.cultures || []).concat(x.groups || []).join("|");
    if (!_ICON_BY_NAME) { _ICON_BY_NAME = {}; for (const x of D.units) if (ICON_SET.has(x.id)) (_ICON_BY_NAME[x.name.replace(/ \(.*$/, "")] ??= []).push(x); }
    const c = (_ICON_BY_NAME[nb] || []).filter(x => key(x) === key(u) || x.role === u.role)[0];
    found = c ? c.id : null;
  }
  return _ICON_MEMO[u.id] = found;
}
let _ICON_BY_NAME = null;
function portrait(u, cls = "") {
  const svg = `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ROLE_ICON[u.role] || ROLE_ICON._}</svg>`;
  const ic = iconId(u), img = ic ? `<img src="img/units/${ic}.png" alt="" loading="lazy" onload="if(this.naturalWidth/this.naturalHeight>.8)this.classList.add('sq')" onerror="this.remove()">` : "";
  return `<span class="pt ${cls}${u.ror ? " ror" : ""}"${ic ? ` style="--pi:url('img/units/${ic}.png')"` : ""}>${svg}${img}</span>`;
}

/* Images du jeu associées aux unités et aux races par tools/copy_icons.py (data/icons.js). Chaque image est retirée si elle manque. */
const CATS = window.TWW3_CATS || {}, INFO = window.TWW3_INFO || {}, MOUNTS = window.TWW3_MOUNTS || {}, RACE_SET = new Set(window.TWW3_RACES || []);
/* Icône de catégorie des cartes d'unité du jeu (lanciers, cavalerie de choc, monstre…) */
function catIc(u) { const c = u && CATS[u.id]; return c ? `<img class="cati" src="img/cats/${c}.png" alt="" onerror="this.remove()">` : ""; }
/* Icône de la monture (variantes montées des seigneurs et héros) */
function mountIc(u) { const m = u && MOUNTS[u.id]; return m ? `<img class="mnti" src="img/mounts/${m}.png" alt="" title="Monture" onerror="this.remove()">` : ""; }
/* Attributs d'attaque, avec les icônes de modificateurs du jeu : magique, enflammé, perforant (dégâts perforants ≥ dégâts de base), bonus contre l'infanterie / les grandes cibles */
function attrs(u) {
  if (!u) return "";
  const m = u.melee || {}, r = u.ranged || {}, a = [];
  const add = (ic, t) => a.push(`<i class="attr" title="${t}"><img src="img/stats/modifier_icon_${ic}.png" alt="" onerror="this.remove()">${t}</i>`);
  if (m.mg || r.mg) add("magical", "Attaques magiques");
  if (m.fl || r.fl) add("flaming", "Attaques enflammées");
  if (m.dmg > 0 && m.ap >= m.dmg) add("armour_piercing", "Perforant (mêlée)");
  if (r.dmg > 0 && r.ap >= r.dmg) add("armour_piercing_ranged", "Perforant (tir)");
  if (m.bvi > 0) add("bonus_vs_infantry", `Bonus contre l'infanterie (+${Math.round(m.bvi)})`);
  if (m.bvl > 0) add("bonus_vs_large", `Bonus contre les grandes cibles (+${Math.round(m.bvl)})`);
  return a.length ? `<div class="attrs">${a.join("")}</div>` : "";
}
/* Fiche d'unité : grande illustration du panneau d'information du jeu (ui/units/infopics) si elle existe, sinon le portrait entier */
function fullPic(u) { const i = u && INFO[u.id]; return i ? `<span class="pt full info"><img src="img/info/${i}.png" alt="" loading="lazy" onerror="this.remove()"></span>` : portrait(u, "full"); }

/* Capacités, sorts et attributs (data/abilities.js, produit par tools/abilities.py) : fichier lourd (~1,7 Mo), chargé seulement à la
   première ouverture d'une fiche. Son adresse versionnée (?v=) est dans <link id="abilsrc"> de index.html (tenue à jour par cache_bust.py). */
let _abilP = null;
function loadAbil() {
  if (window.TWW3_ABIL) return Promise.resolve();
  return _abilP ??= new Promise(done => {
    const l = document.getElementById("abilsrc"), s = document.createElement("script");
    s.src = l ? l.getAttribute("href") : "data/abilities.js"; s.onload = s.onerror = () => done(); document.head.appendChild(s);
  });
}
const htmlEsc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
function abilItem(a, isAttr) {
  const en = window.LANG === "en", n = (en ? a.ne : a.n) || a.ne || a.n, d = (en ? a.de : a.d) || a.de || a.d || "";
  const L = en ? {sp: "Spell", pa: "Passive", ac: "Active", cd: "cooldown", u: "uses"} : {sp: "Sort", pa: "Passif", ac: "Actif", cd: "recharge", u: "util."};   // ligne assemblée : écrite directement dans la langue
  const meta = isAttr ? [] : [a.sp ? `${L.sp}${a.mana ? ` · ${a.mana} mana` : ""}` : a.pa ? L.pa : L.ac,
    a.dur > 0 && !a.pa ? `${Math.round(a.dur)} s` : "", a.cd > 0 ? `${L.cd} ${Math.round(a.cd)} s` : "", a.uses > 0 ? `${a.uses} ${L.u}` : ""].filter(Boolean);
  const ic = a.ic ? `<img src="img/abilities/${a.ic}.png" alt="" loading="lazy" onerror="this.remove()">` : "";
  return `<div class="ab${a.sp ? " sp" : ""}${a.pa ? " pa" : ""}" title="${htmlEsc(d)}">${ic}<div><b>${htmlEsc(n)}</b>${meta.length ? `<small>${meta.join(" · ")}</small>` : ""}${d ? `<p>${htmlEsc(d)}</p>` : ""}</div></div>`;
}
function abilHTML(u) {
  const A = window.TWW3_ABIL; if (!A) return `<p class="abmsg">Capacités indisponibles.</p>`;
  const list = (ks, isAttr) => (ks || []).map(k => (isAttr ? A.at : A.ab)[k]).filter(Boolean).map(a => abilItem(a, isAttr)).join("");
  const base = list(A.u[u.id]), sk = list(A.sk[u.id]), at = list(A.ua[u.id], true);
  return (base ? `<h4>Capacités</h4><div class="abl">${base}</div>` : "")
    + (sk ? `<h4>Sorts et capacités par compétences</h4><div class="abl">${sk}</div>` : "")
    + (at ? `<h4>Attributs</h4><div class="abl at">${at}</div>` : "") || `<p class="abmsg">Aucune capacité.</p>`;
}
/* Bloc de la fiche : rendu vide puis rempli une fois les données chargées (si la fiche montre encore la même unité). */
function abilBlock(u) { return `<details class="more abil" data-u="${u.id}"><summary>Capacités, sorts et attributs</summary><div class="abc">${window.TWW3_ABIL ? abilHTML(u) : `<p class="abmsg">Chargement…</p>`}</div></details>`; }
function fillAbil(root, u) {
  loadAbil().then(() => { const el = root.querySelector(`details.abil[data-u="${u.id}"] .abc`); if (el) el.innerHTML = abilHTML(u); });
}

/* Emblème de faction : drapeau extrait du jeu (img/factions/<clé>.png) ou écusson avec initiales. */
function crest(key, cls = "", labelOverride = "") {
  const name = (labelOverride || D.factions[key] || key).replace(/^(the|les?|la) /i, ""), ini = key === ALL ? "✦" : name.split(/[\s'’-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  const svg = `<svg viewBox="0 0 48 56" aria-hidden="true"><path d="M24 3 43 9v20c0 12-8 20-19 24C13 49 5 41 5 29V9z" fill="none" stroke="currentColor" stroke-width="2.2"/><text x="24" y="35" text-anchor="middle" font-family="Cinzel,serif" font-weight="700" font-size="17" fill="currentColor">${ini}</text></svg>`;
  const img = FLAG_SET.has(key) ? `<img src="img/factions/${key}.png" alt="" loading="lazy" onerror="this.remove()">` : "";
  return `<span class="crest ${cls}">${svg}${img}</span>`;
}
function factionBanner(key, n) {
  const c = cultOf(key), race = isRace(key), icon = race ? crest(mainFacOf(c), "", D.cultures[c]) : crest(key);
  const nm = race ? D.cultures[c] + " — toute la race" : D.factions[key] || key;
  const sub = key === ALL ? "Toutes les races" : race ? `${factionsOfRace(c).length} factions` : D.cultures[c];
  const rb = key !== ALL && RACE_SET.has(c) ? ` hasrb" style="--rb:url('img/races/${c}.png')` : "";   // bandeau de race du jeu (écran de choix de race)
  return `<div class="fb${rb}">${icon}<div><div class="fbn">${nm}</div><small>${sub} · ${n} unité${n > 1 ? "s" : ""} affichée${n > 1 ? "s" : ""}</small></div></div>`;
}
