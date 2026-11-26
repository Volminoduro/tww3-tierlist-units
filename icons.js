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
  return `<div class="fb">${icon}<div><div class="fbn">${nm}</div><small>${sub} · ${n} unité${n > 1 ? "s" : ""} affichée${n > 1 ? "s" : ""}</small></div></div>`;
}
