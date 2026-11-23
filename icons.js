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
const ICON_SET = new Set(window.TWW3_ICONS || []), FLAG_SET = new Set(window.TWW3_FLAGS || []);
function portrait(u, cls = "") {
  const svg = `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ROLE_ICON[u.role] || ROLE_ICON._}</svg>`;
  const img = ICON_SET.has(u.id) ? `<img src="img/units/${u.id}.png" alt="" loading="lazy" onerror="this.remove()">` : "";
  return `<span class="pt ${cls}">${svg}${img}</span>`;
}

/* Emblème de faction : drapeau extrait du jeu (img/factions/<clé>.png) ou écusson avec initiales. */
function crest(key, cls = "") {
  const name = (D.factions[key] || key).replace(/^(the|les?|la) /i, ""), ini = name.split(/[\s'’-]+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join("");
  const svg = `<svg viewBox="0 0 48 56" aria-hidden="true"><path d="M24 3 43 9v20c0 12-8 20-19 24C13 49 5 41 5 29V9z" fill="none" stroke="currentColor" stroke-width="2.2"/><text x="24" y="35" text-anchor="middle" font-family="Cinzel,serif" font-weight="700" font-size="17" fill="currentColor">${ini}</text></svg>`;
  const img = FLAG_SET.has(key) ? `<img src="img/factions/${key}.png" alt="" loading="lazy" onerror="this.remove()">` : "";
  return `<span class="crest ${cls}">${svg}${img}</span>`;
}
function factionBanner(key, n) {
  return `<div class="fb">${crest(key)}<div><div class="fbn">${D.factions[key] || key}</div><small>${D.cultures[(D.facInfo[key] || {}).culture] || ""} · ${n} unité${n > 1 ? "s" : ""} affichée${n > 1 ? "s" : ""}</small></div></div>`;
}
