"use strict";
/* Langue du site : français (langue source) ou anglais.
   - Le choix est mémorisé (localStorage) et peut être forcé par ?lang=en ou ?lang=fr ; changer de langue recharge la page.
   - En anglais, un traducteur remplace les textes français affichés (nœuds texte, title, placeholder, aria-label) d'après le dictionnaire de i18n_en.js,
     y compris pour les textes recréés plus tard par le site (MutationObserver).
   - Clés du dictionnaire : le texte français, avec les nombres remplacés par « # » et les noms d'unités / de factions / de races par « @ » ;
     la traduction réutilise « # » et « @ » dans le même ordre (ou « #1 », « @2 » pour réordonner). */
(function () {
  let lang = "fr";
  try {
    const q = new URLSearchParams(location.search).get("lang");
    lang = q === "en" || q === "fr" ? q : (localStorage.getItem("lang") || "fr");
    if (q) localStorage.setItem("lang", lang);
  } catch (e) {}
  const I18N = window.I18N = {lang: lang === "en" ? "en" : "fr", dict: {}, nameRe: null};
  window.LANG = I18N.lang;
  document.documentElement.lang = I18N.lang;

  I18N.set = l => { try { localStorage.setItem("lang", l); } catch (e) {} const u = new URL(location.href); u.searchParams.set("lang", l); location.href = u.toString(); };

  const NUM = /\d+(?:[   ]\d{3})*(?:[.,]\d+)?/g;
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  I18N.buildNames = () => {
    const names = new Set();
    try { D.units.forEach(u => u.name && names.add(u.name)); Object.values(D.factions).forEach(n => names.add(n)); Object.values(D.cultures).forEach(n => names.add(n)); } catch (e) {}
    const list = [...names].filter(n => n && n.length >= 4).sort((a, b) => b.length - a.length);
    I18N.nameRe = list.length ? new RegExp(list.map(esc).join("|"), "g") : null;
  };
  I18N.norm = (s, withNames) => {
    const names = [], nums = []; let key = s;
    if (withNames && I18N.nameRe) key = key.replace(I18N.nameRe, m => (names.push(m), "@"));
    key = key.replace(NUM, m => (nums.push(m), "#"));
    return {key, names, nums};
  };
  const fill = (tpl, names, nums) => {
    let i = 0, j = 0;
    return tpl.replace(/@(\d)?|#(\d)?/g, (m, a, b) => m[0] === "@" ? (names[(a ? +a : ++i) - 1] ?? "") : (nums[(b ? +b : ++j) - 1] ?? ""));
  };
  /* Dictionnaire compilé : clés « exactes » (espaces normalisés, nombres = #) et modèles contenant {} (joker = texte quelconque, traduit récursivement ; # = nombre). */
  const sp = x => x.replace(/\s+/g, " ").trim();
  let exact = null, tpls = null;
  const NUMRE = "(\\d+(?:[ \u00a0\u202f]\\d{3})*(?:[.,]\\d+)?)";
  function compile() {
    exact = new Map(); tpls = [];
    for (const [k, v] of Object.entries(I18N.dict)) {
      const key = sp(k);
      if (!key.includes("{}")) { exact.set(key, v); continue; }
      const kinds = [], src = key.split(/(\{\}|#)/).map(part => part === "{}" ? (kinds.push("{}"), "(.+?)") : part === "#" ? (kinds.push("#"), NUMRE) : esc(part)).join("");
      tpls.push({re: new RegExp("^" + src + "$"), kinds, out: v, weight: key.replace(/\{\}|#/g, "").length});
    }
    tpls.sort((a, b) => b.weight - a.weight);
  }
  I18N.tr = text => {
    if (!exact) compile();
    const m = text.match(/^(\s*)([\s\S]*?)(\s*)$/), core = sp(m[2]);
    if (!core) return null;
    const pad = t => m[1] + t + m[3];
    let e = exact.get(core);
    if (e !== undefined) return pad(e);
    const n = I18N.norm(core, false);
    if (n.nums.length && (e = exact.get(n.key)) !== undefined) return pad(fill(e, n.names, n.nums));
    for (const t of tpls) {
      const mm = core.match(t.re); if (!mm) continue;
      let gi = 0; const caps = t.kinds.map(() => mm[++gi]);
      let ki = 0; return pad(t.out.split(/(\{\}|#)/).map(part => { if (part !== "{}" && part !== "#") return part; const c = caps[ki++] ?? ""; return part === "{}" ? (I18N.tr(c) ?? c) : c; }).join(""));
    }
    return null;
  };

  const ATTRS = ["title", "placeholder", "aria-label"], SKIP = new Set(["SCRIPT", "STYLE", "CODE"]);
  function doText(node) {
    if (SKIP.has(node.parentNode && node.parentNode.nodeName)) return;
    const t = I18N.tr(node.nodeValue); if (t !== null && t !== node.nodeValue) { node.__fr ??= node.nodeValue; node.nodeValue = t; }
  }
  function doEl(el) {
    for (const a of ATTRS) { if (!el.hasAttribute || !el.hasAttribute(a)) continue; const t = I18N.tr(el.getAttribute(a)); if (t !== null && t !== el.getAttribute(a)) el.setAttribute(a, t); }
  }
  function walk(root) {
    if (root.nodeType === 3) return doText(root);
    if (root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
    doEl(root);
    for (let c = root.firstChild; c; c = c.nextSibling) walk(c);
  }
  I18N.start = () => {
    I18N.buildNames();
    // commutateur FR | EN
    const sw = document.createElement("div"); sw.id = "langsw";
    sw.innerHTML = `<button type="button" data-l="fr" title="Français">FR</button><button type="button" data-l="en" title="English">EN</button>`;
    sw.querySelector(`[data-l=${I18N.lang}]`).classList.add("on");
    sw.onclick = e => { const b = e.target.closest("button[data-l]"); if (b && b.dataset.l !== I18N.lang) I18N.set(b.dataset.l); };
    (document.querySelector("header") || document.body).appendChild(sw);
    if (I18N.lang !== "en") return;
    document.title = I18N.tr(document.title) || document.title;
    walk(document.body);
    const obs = new MutationObserver(muts => {
      obs.disconnect();
      for (const m of muts) {
        if (m.type === "childList") m.addedNodes.forEach(walk);
        else if (m.type === "characterData") doText(m.target);
        else if (m.type === "attributes") doEl(m.target);
      }
      obs.observe(document.body, cfg);
    });
    const cfg = {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS};
    obs.observe(document.body, cfg);
  };
})();
