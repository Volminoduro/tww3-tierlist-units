"use strict";
/* Onglet « Unités par faction » : chaque stat + rang en percentile (Top X % / Bottom X %). */
(() => {
  const N = (u, k) => u.melee[k], R = (u, k) => u.ranged ? u.ranged[k] : 0;
  const hasM = u => u.melee.dmg + u.melee.ap > 0, hasR = u => u.ranged && u.ranged.dmg + u.ranged.ap > 0;
  // [clé, libellé, groupe, valeur, sens (1 = plus = mieux, -1 = moins = mieux), applicable, zéro significatif]
  const ST = [
    ["cost","Coût","Général",u=>u.cost,-1],["upkeep","Entretien","Général",u=>u.upkeep,-1],["rt","Recrut. (tours)","Général",u=>u.recruitTurns,-1,0,1],
    ["mp","Coût MP","Général",u=>u.mpCost,-1],
    ["men","Hommes","Défense",u=>u.men,1],["hp","PV / modèle","Défense",u=>u.hp,1],["thp","PV totaux","Défense",u=>u.men*u.hp,1],
    ["arm","Armure","Défense",u=>u.armour,1,0,1],["md","Défense CàC","Défense",u=>u.md,1,0,1],["ld","Moral","Défense",u=>u.ld,1,0,1],
    ["ma","Attaque CàC","Attaque",u=>u.ma,1,0,1],["ch","Charge","Attaque",u=>u.charge,1,0,1],["dmg","Dégâts de base","Attaque",u=>N(u,"dmg"),1,hasM],
    ["ap","Dégâts perforants","Attaque",u=>N(u,"ap"),1,hasM],["str","Force d'arme","Attaque",u=>N(u,"dmg")+N(u,"ap"),1,hasM],
    ["int","Intervalle (s)","Attaque",u=>N(u,"interval"),-1,hasM],["dps","DPS / modèle","Attaque",u=>(N(u,"dmg")+N(u,"ap"))/Math.max(1,N(u,"interval")),1,hasM],
    ["bvl","Bonus vs grands","Attaque",u=>N(u,"bvl"),1,u=>N(u,"bvl")>0],["bvi","Bonus vs infanterie","Attaque",u=>N(u,"bvi"),1,u=>N(u,"bvi")>0],
    ["rdmg","Tir : dégâts","Tir",u=>R(u,"dmg"),1,hasR],["rap","Tir : perforants","Tir",u=>R(u,"ap"),1,hasR],["rng","Portée","Tir",u=>R(u,"range"),1,hasR],
    ["rel","Rechargement (s)","Tir",u=>R(u,"reload"),-1,hasR],["amm","Munitions","Tir",u=>R(u,"ammo"),1,u=>hasR(u)&&R(u,"ammo")>0],
    ["spd","Vitesse","Mobilité",u=>u.speed,1],
    ["dwc","Victoires en duel, à coût de recrutement égal (%)","Duels",u=>{const d=duelOf(u,"cost");return d?Math.round(d.wr*1000)/10:NaN;},1,0,1],
  ].map(([k,l,g,v,d,ok,z]) => ({k,l,g,v,d,ok:typeof ok==="function"?ok:()=>true,z:!!z}));
  // colonnes affichées par défaut (de quoi tenir dans la largeur) ; « Toutes les colonnes » affiche les 26
  const ESS = new Set(["cost","upkeep","rt","thp","arm","md","ld","ma","ch","str","dps","rdmg","rng","spd","dwc"]);
  const GROUPS = [...new Set(ST.map(s => s.g))], shown = new Set(GROUPS), $b = s => document.querySelector(s);
  const applies = (s, u) => { const v = s.v(u); return s.ok(u) && Number.isFinite(v) && (s.z || v > 0); };
  const lower = (a, x) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo+hi)>>1; a[m] < x ? lo = m+1 : hi = m; } return lo; };
  const upper = (a, x) => { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo+hi)>>1; a[m] <= x ? lo = m+1 : hi = m; } return lo; };
  const uniq = arr => { const s = new Set(); return arr.filter(u => !s.has(u.id) && s.add(u.id)); };
  const cache = {};
  function stats(pool, key) { // tableaux triés par « qualité » (sens appliqué), un par stat
    return cache[key] ??= Object.fromEntries(ST.map(s => [s.k, pool.filter(u => applies(s,u)).map(u => s.d * s.v(u)).sort((a,b) => a-b)]));
  }
  function pct(s, u, arr) { // percentile 0-100, 100 = le meilleur du lot
    if (!applies(s,u) || arr.length < 2) return null;
    const g = s.d * s.v(u); return (lower(arr, g) + .5 * (upper(arr, g) - lower(arr, g))) / arr.length * 100;
  }
  const badge = (p, tip) => p == null ? "" :
    `<span class="pb" style="background:hsl(${p*1.2},55%,62%)" title="${tip}">${p >= 50 ? "Top " + Math.max(1, Math.round(100-p)) : "Bottom " + Math.max(1, Math.round(p))} %</span>`;
  const f = v => v >= 1000 ? Math.round(v).toLocaleString("fr-FR") : (Math.round(v*10)/10).toString();

  const fs = $b("#bfac"); initPicker(fs, ALL); // sélection de départ : toutes les factions
  let sortK = "cost", sortD = 1; // catégories, usages, faction, recherche et seigneurs/héros : état PARTAGÉ avec le tier list (variables globales de app.js)
  $b("#bgrp").innerHTML = GROUPS.map(g => `<label><input type="checkbox" data-g="${g}" checked>${g}</label>`).join("");
  $b("#bgrp").onchange = e => { e.target.checked ? shown.add(e.target.dataset.g) : shown.delete(e.target.dataset.g); render(); };
  ["bpool","bq","bcols","bheroes"].forEach(i => $b("#"+i).addEventListener("input", render));
  /* Filtres communs aux deux onglets : faction, recherche et case « seigneurs & héros » sont recopiés dans les deux sens ; catégories et usages sont les mêmes ensembles (role, TYPO) */
  const fsel2 = document.querySelector("#faction"), q1 = document.querySelector("#q"), h1 = document.querySelector("#heroes"), h2 = $b("#bheroes");
  const copyFac = (from, to) => { if (to.value !== from.value) { to.value = from.value; to.dispatchEvent(new Event("change")); } };
  fs.addEventListener("change", () => { copyFac(fs, fsel2); render(); }); fsel2.addEventListener("change", () => copyFac(fsel2, fs));
  $b("#bq").addEventListener("input", () => { q1.value = $b("#bq").value; }); q1.addEventListener("input", () => { $b("#bq").value = q1.value; });
  h2.addEventListener("input", () => { h1.checked = h2.checked; }); h1.addEventListener("input", () => { h2.checked = h1.checked; });
  h2.checked = h1.checked; $b("#bq").value = q1.value; copyFac(fsel2, fs);
  $b("#brole").onclick = e => { const b = e.target.closest("button[data-r]"); if (!b) return; const r = b.dataset.r; if (!r) role.clear(); else role.has(r) ? role.delete(r) : role.add(r); render(); };
  const BTYPO = TYPO; // même sélection d'usages que le tier list
  $b("#btypo").onclick = e => { const b = e.target.closest("button"); if (!b || b.disabled) return; const k = b.dataset.k; k === "" ? BTYPO.clear() : BTYPO.has(k) ? BTYPO.delete(k) : BTYPO.add(k); render(); };
  $b("#btab").onclick = e => { const th = e.target.closest("th[data-k]"); if (th) { sortD = sortK === th.dataset.k ? -sortD : 1; sortK = th.dataset.k; render(); } };
  $b("#bnote").textContent = "Chaque stat est suivie de son rang parmi le groupe de comparaison choisi : « Top 8 % » = dans les 8 % meilleurs, « Bottom 20 % » = dans les 20 % moins bons. Pour le coût, l'entretien, l'intervalle d'attaque et le rechargement, « mieux » = plus bas. Les stats non applicables (ex. tir pour une unité de mêlée) sont ignorées. Survole un badge pour voir le détail. Clique un en-tête pour trier.";

  function render() {
    const fac = fs.value, mode = $b("#bpool").value, q = $b("#bq").value.toLowerCase();
    const inFac = uniq(D.units.filter(u => inScope(u, fac)));
    const byName = inFac.filter(u => u.name.toLowerCase().includes(q));
    const incl = h2.checked, LH = u => u.role === "lord" || u.role === "hero";   // « Toutes » exclut seigneurs et héros sauf case cochée (comme le tier list)
    const cnt = r => byName.filter(u => (r ? u.role === r : (incl || !LH(u))) && [...BTYPO].every(k => canDo(u, k))).length; // périmètre, recherche et usages actifs
    $b("#bfban").innerHTML = factionBanner(fac, inFac.length);
    [...role].forEach(r => { if (!cnt(r)) role.delete(r); }); // une catégorie devenue vide est retirée de la sélection
    $b("#brole").innerHTML = roleChips(roles, role, cnt);
    const rows = typoApply(byName.filter(u => role.size ? role.has(u.role) : (incl || !LH(u))), u => u, BTYPO, $b("#btypo"));
    const poolOf = u => mode === "all" ? D.units : mode === "fac" ? inFac : mode === "role_fac" ? inFac.filter(x => x.role === u.role) : D.units.filter(x => x.role === u.role);
    const keyOf = u => `${mode}|${mode.endsWith("fac") ? fac : ""}|${mode.startsWith("role") ? u.role : ""}`;
    const pools = {}; rows.forEach(u => { const k = keyOf(u); if (!pools[k]) { const p = uniq(poolOf(u)); pools[k] = {n: p.length, st: stats(p, k)}; } });
    const full = $b("#bcols").value === "all";
    const cols = ST.filter(s => shown.has(s.g) && (full || ESS.has(s.k)) && rows.some(u => applies(s, u))); // les colonnes sans aucune valeur (ex. tir pour de la mêlée) sont masquées : moins de défilement horizontal
    const sk = ST.find(s => s.k === sortK) || ST[0];
    const val = u => applies(sk, u) ? sk.v(u) : (sortD > 0 ? Infinity : -Infinity);
    rows.sort((a,b) => (val(a) - val(b)) * sortD || a.name.localeCompare(b.name));
    $b("#btab").innerHTML = `<table><tr><th>Unité (${rows.length})</th>${cols.map(s => `<th data-k="${s.k}" title="${s.g}">${s.l}${s.k===sortK?(sortD>0?" ▲":" ▼"):""}</th>`).join("")}</tr>` +
      rows.map(u => { const P = pools[keyOf(u)];
        return `<tr><td><div class="nm">${portrait(u,"s")}<span>${u.name} ${gtier(u)}<small>${ROLES[u.role]||u.role} · vs ${P.n} unités</small></span></div></td>` + cols.map(s => {
          if (!applies(s,u)) return `<td class="na">—</td>`;
          const p = pct(s, u, P.st[s.k]); const rank = P.st[s.k].length - upper(P.st[s.k], s.d * s.v(u)) + 1;
          return `<td>${f(s.v(u))}<br>${badge(p, `${s.l} : ${rank}ᵉ sur ${P.st[s.k].length}${s.d<0?" (moins = mieux)":""}`)}</td>`; }).join("") + "</tr>"; }).join("") + "</table>";
  }
  document.querySelector('[data-tab=browse]').addEventListener("click", () => { copyFac(fsel2, fs); h2.checked = h1.checked; $b("#bq").value = q1.value; render(); });
  window.TWW3Stats = {ST, applies, stats, pct, upper}; // partagé avec la fiche d'unité (rang Top / Bottom % de chaque stat)
  render();
})();
