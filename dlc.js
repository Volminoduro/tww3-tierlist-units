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

  /* Code de partage : bits « possédé » des produits triés par clé (BigInt en base 36) précédés d'une empreinte de la liste des produits (refuse un code d'une autre version des données).
     Permet de connaître / transmettre la liste de DLC de quelqu'un sans compte : il copie son code ou son lien (?dlc=…), on le colle ici. */
  const sk = keys.slice().sort();
  const sig = (() => { let h = 2166136261; for (const c of sk.join("|")) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36).padStart(4, "0").slice(0, 4); })();
  const toCode = () => { let n = 0n; sk.forEach((k, i) => { if (owned(k)) n |= 1n << BigInt(i); }); return sig + "-" + n.toString(36); };
  const fromCode = c => {                                // renvoie null si importé, sinon la raison du refus
    const m = /^([0-9a-z]{4})-([0-9a-z]+)$/i.exec((c || "").trim()); if (!m) return "Code illisible.";
    if (m[1].toLowerCase() !== sig) return "Ce code vient d'une autre version des données : demande-lui d'en copier un nouveau.";
    let n = 0n; for (const ch of m[2].toLowerCase()) n = n * 36n + BigInt(parseInt(ch, 36));
    own = new Set(sk.filter((k, i) => ((n >> BigInt(i)) & 1n) === 1n)); return null;
  };
  const linkOf = () => { const u = new URL(location.href); u.searchParams.set("dlc", toCode()); return u.toString(); };
  { const q = new URLSearchParams(location.search).get("dlc"); if (q && fromCode(q) === null) { DLCX.on = true; recalc(); save(); } }   // lien partagé : ouvre avec la liste de l'autre personne

  /* Analyse du texte de la page des licences Steam : on cherche le nom de chaque produit dans le texte normalisé (minuscules, sans accents ni ponctuation), les noms les plus longs d'abord et
     en retirant ce qui est reconnu (« Shadows of Change » ne doit pas être reconnu à l'intérieur de « Shadows of Change - Kislev »). Le premier jeu est aussi connu sous « Total War: WARHAMMER » (sans « I »). */
  const norm = s => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
  const scanLicenses = text => {
    let h = " " + norm(text) + " "; const found = new Set();
    const names = keys.flatMap(k => { const n = norm(DLC.products[k].n); return [[k, n]].concat(/warhammer i$/.test(n) ? [[k, n.replace(/ i$/, "")]] : []); }).sort((a, b) => b[1].length - a[1].length);
    for (const [k, n] of names) { const pat = " " + n + " "; if (n && h.includes(pat)) { found.add(k); h = h.split(pat).join(" "); } }
    return found;
  };
  const dlg = document.createElement("dialog"); dlg.id = "dlcdlg";
  document.body.appendChild(dlg);
  const draw = () => {
    const shareOpen = !!(dlg.querySelector(".dlcshare:not(.dlcsteam)") || {}).open;            // les volets « Partager » et « Steam » gardent leur état quand la liste est redessinée
    const steamOpen = dlg.querySelector(".dlcsteam") ? dlg.querySelector(".dlcsteam").open : true;   // « Steam » est ouvert la première fois
    const by = {3: [], 2: [], 1: [], 0: []}; keys.forEach(k => by[jeu(k)].push(k));
    dlg.innerHTML = `<div class="dlch"><h2>Mes DLC</h2><button class="x" type="button" data-close>✕</button></div>
      <p class="dlcp">Coche ce que tu possèdes. Quand le filtre est activé, les unités qui n'existent que grâce à un jeu ou DLC non coché sont masquées partout (tier list, unités par faction, combat). Les contenus gratuits sont toujours comptés comme possédés. Une unité offerte par plusieurs DLC reste visible si l'un d'eux est coché.</p>
      <label class="chk dlcmain"><input type="checkbox" data-on ${DLCX.on ? "checked" : ""}> Masquer les unités des DLC que je n'ai pas</label>
      <div class="dlcbar"><button type="button" data-a="all">Tout cocher</button><button type="button" data-a="none">Tout décocher</button><button type="button" data-a="free">Gratuits seulement</button></div>
      <details class="dlcshare dlcsteam" ${steamOpen ? "open" : ""}><summary>Retrouver mes DLC depuis Steam</summary>
        <ol class="dlcp"><li>Connecté à ton compte, ouvre <a href="https://store.steampowered.com/account/licenses/" target="_blank" rel="noopener">store.steampowered.com/account/licenses</a> (liste de tout ce que tu possèdes, DLC compris).</li><li>Sélectionne toute la page (Ctrl+A) et copie (Ctrl+C).</li><li>Colle ici et clique sur « Analyser » : les produits reconnus sont cochés.</li></ol>
        <textarea data-lic rows="4" placeholder="Colle ici le texte de la page des licences Steam…" spellcheck="false"></textarea>
        <div class="dlcbar"><button type="button" data-scan>Analyser</button></div><small class="dlcmsg" data-msg2></small>
        <p class="dlcp">Le site ne lit rien de ton compte : le texte collé est analysé dans ton navigateur et n'est ni envoyé ni conservé. Vérifie ensuite la liste : un nom de DLC différent sur Steam peut ne pas être reconnu (tu peux alors cocher à la main ; chaque ligne a un lien « Steam » vers sa page).</p></details>
      <details class="dlcshare" ${shareOpen ? "open" : ""}><summary>Partager ou importer une liste de DLC</summary>
        <p class="dlcp">Il n'existe pas de moyen simple et fiable de lire les DLC de quelqu'un depuis un site (Steam ne les expose pas sans connexion de la personne). À la place : chacun copie son code ou son lien ici et l'envoie ; on le colle chez l'autre pour retrouver sa liste.</p>
        <div class="dlcbar"><button type="button" data-copy="code">Copier mon code</button><button type="button" data-copy="link">Copier le lien</button></div>
        <div class="dlcbar"><input type="text" data-code placeholder="Coller un code…" spellcheck="false"><button type="button" data-import>Importer</button></div><small class="dlcmsg" data-msg></small></details>
      <div class="dlclist">${[3, 2, 1, 0].filter(g => by[g].length).map(g => `<h3>${GROUPS[g]}</h3>` + by[g].sort((a, b) => DLC.products[a].o - DLC.products[b].o || DLC.products[a].n.localeCompare(DLC.products[b].n)).map(k => { const p = DLC.products[k];
        return `<label class="dlcit${p.free ? " free" : ""}"><input type="checkbox" data-k="${k}" ${owned(k) ? "checked" : ""} ${p.free ? "disabled" : ""}><span>${p.n}</span><small>${p.free ? "gratuit · " : ""}${nUnits[k] || 0} unités</small>${p.sid ? `<a class="dlcsl" href="https://store.steampowered.com/app/${p.sid}" target="_blank" rel="noopener" title="Voir sur Steam">Steam</a>` : ""}</label>`; }).join("")).join("")}</div>`;
  };
  const open = () => { draw(); dlg.showModal(); };
  document.addEventListener("click", e => { if (e.target.closest("[data-dlcbtn]")) open(); });
  dlg.addEventListener("click", async e => { if (e.target === dlg || e.target.closest("[data-close]")) dlg.close();
    const msg = t => { const m = dlg.querySelector("[data-msg]"); if (m) m.textContent = t; };
    const cp = e.target.closest("[data-copy]"); if (cp) { const txt = cp.dataset.copy === "link" ? linkOf() : toCode();
      try { await navigator.clipboard.writeText(txt); msg("Copié : " + txt); } catch (err) { const i = dlg.querySelector("[data-code]"); i.value = txt; i.select(); msg("Copie impossible ici : sélectionne et copie le texte du champ."); } }
    if (e.target.closest("[data-import]")) { const raw = dlg.querySelector("[data-code]").value.trim(), m = /[?&]dlc=([^&#\s]+)/.exec(raw), r = fromCode(m ? decodeURIComponent(m[1]) : raw);
      if (r === null) { DLCX.on = true; changed(); const open = dlg.querySelector(".dlcshare").open; draw(); dlg.querySelector(".dlcshare").open = open; msg(`Liste importée : ${keys.filter(owned).length}/${keys.length} produits, filtre activé.`); } else msg(r); }
    if (e.target.closest("[data-scan]")) { const t = dlg.querySelector("[data-lic]").value, m2 = dlg.querySelector("[data-msg2]");
      const found = scanLicenses(t), real = [...found].filter(k => !DLC.products[k].free);
      if (!real.length) m2.textContent = "Aucun produit reconnu : vérifie que tu as collé le texte de la page des licences (noms de jeux et de DLC en anglais).";
      else { own = new Set(found); DLCX.on = true; changed(); draw(); const m3 = dlg.querySelector("[data-msg2]"); m3.textContent = `${real.length} produit(s) reconnu(s) sur ${keys.filter(k => !DLC.products[k].free).length} (hors gratuits) : ${real.slice(0, 8).map(k => DLC.products[k].n).join(", ")}${real.length > 8 ? "…" : ""}. Filtre activé ; vérifie la liste ci-dessous.`; } }
    const a = e.target.closest("[data-a]"); if (a) { own = new Set(a.dataset.a === "all" ? keys : a.dataset.a === "none" ? [] : keys.filter(k => DLC.products[k].free)); changed(); draw(); } });
  dlg.addEventListener("change", e => { const c = e.target;
    if (c.dataset.k) { c.checked ? own.add(c.dataset.k) : own.delete(c.dataset.k); changed(); }
    else if ("on" in c.dataset) { DLCX.on = c.checked; changed(); } });
  document.addEventListener("change", e => { if (["dlcon", "bdlcon", "cdlcon"].includes(e.target.id)) { DLCX.on = e.target.checked; changed(); } });
  sync();
})();
