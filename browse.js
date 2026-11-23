"use strict";
/* Onglet « Unités par faction » : chaque stat + rang en percentile (Top X % / Bottom X %). */
(() => {
  const N = (u, k) => u.melee[k], R = (u, k) => u.ranged ? u.ranged[k] : 0;
  const hasM = u => u.melee.dmg + u.melee.ap > 0, hasR = u => u.ranged && u.ranged.dmg + u.ranged.ap > 0;
  // [clé, libellé, groupe, valeur, sens (1 = plus = mieux, -1 = moins = mieux), applicable, zéro significatif]
  const ST = [
    ["cost","Coût","Général",u=>u.cost,-1],["upkeep","Entretien","Général",u=>u.upkeep,-1],["rt","Recrut. (tours)","Général",u=>u.recruitTurns,-1,0,1],
    ["men","Hommes","Défense",u=>u.men,1],["hp","PV / modèle","Défense",u=>u.hp,1],["thp","PV totaux","Défense",u=>u.men*u.hp,1],
    ["arm","Armure","Défense",u=>u.armour,1,0,1],["md","Défense CàC","Défense",u=>u.md,1,0,1],["ld","Moral","Défense",u=>u.ld,1,0,1],
    ["ma","Attaque CàC","Attaque",u=>u.ma,1,0,1],["ch","Charge","Attaque",u=>u.charge,1,0,1],["dmg","Dégâts de base","Attaque",u=>N(u,"dmg"),1,hasM],
    ["ap","Dégâts perforants","Attaque",u=>N(u,"ap"),1,hasM],["str","Force d'arme","Attaque",u=>N(u,"dmg")+N(u,"ap"),1,hasM],
    ["int","Intervalle (s)","Attaque",u=>N(u,"interval"),-1,hasM],["dps","DPS / modèle","Attaque",u=>(N(u,"dmg")+N(u,"ap"))/Math.max(1,N(u,"interval")),1,hasM],
    ["bvl","Bonus vs grands","Attaque",u=>N(u,"bvl"),1,u=>N(u,"bvl")>0],["bvi","Bonus vs infanterie","Attaque",u=>N(u,"bvi"),1,u=>N(u,"bvi")>0],
    ["rdmg","Tir : dégâts","Tir",u=>R(u,"dmg"),1,hasR],["rap","Tir : perforants","Tir",u=>R(u,"ap"),1,hasR],["rng","Portée","Tir",u=>R(u,"range"),1,hasR],
    ["rel","Rechargement (s)","Tir",u=>R(u,"reload"),-1,hasR],["amm","Munitions","Tir",u=>R(u,"ammo"),1,u=>hasR(u)&&R(u,"ammo")>0],
    ["spd","Vitesse","Mobilité",u=>u.speed,1],
  ].map(([k,l,g,v,d,ok,z]) => ({k,l,g,v,d,ok:typeof ok==="function"?ok:()=>true,z:!!z}));
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

  const fs = $b("#bfac"); Object.entries(D.factions).sort((a,b) => a[1].localeCompare(b[1])).forEach(([k,n]) => fs.add(new Option(n, k)));
  let role = null, sortK = "cost", sortD = 1;
  $b("#bgrp").innerHTML = GROUPS.map(g => `<label><input type="checkbox" data-g="${g}" checked>${g}</label>`).join("");
  $b("#bgrp").onchange = e => { e.target.checked ? shown.add(e.target.dataset.g) : shown.delete(e.target.dataset.g); render(); };
  ["bfac","bpool","bq"].forEach(i => $b("#"+i).addEventListener("input", render));
  $b("#brole").onclick = e => { if (e.target.dataset.r !== undefined) { role = e.target.dataset.r || null; render(); } };
  $b("#btab").onclick = e => { const th = e.target.closest("th[data-k]"); if (th) { sortD = sortK === th.dataset.k ? -sortD : 1; sortK = th.dataset.k; render(); } };
  $b("#bnote").textContent = "Chaque stat est suivie de son rang parmi le groupe de comparaison choisi : « Top 8 % » = dans les 8 % meilleurs, « Bottom 20 % » = dans les 20 % moins bons. Pour le coût, l'entretien, l'intervalle d'attaque et le rechargement, « mieux » = plus bas. Les stats non applicables (ex. tir pour une unité de mêlée) sont ignorées. Survole un badge pour voir le détail. Clique un en-tête pour trier.";

  function render() {
    const fac = fs.value, mode = $b("#bpool").value, q = $b("#bq").value.toLowerCase();
    const inFac = uniq(D.units.filter(u => u.factions.includes(fac)));
    const roles = [...new Set(inFac.map(u => u.role))];
    $b("#bfban").innerHTML = factionBanner(fac, inFac.length);
    $b("#brole").innerHTML = `<button data-r="" class="${role?"":"on"}">Toutes</button>` + roles.map(r => `<button data-r="${r}" class="${role===r?"on":""}">${ROLES[r]||r}</button>`).join("");
    const rows = inFac.filter(u => (!role || u.role === role) && u.name.toLowerCase().includes(q));
    const poolOf = u => mode === "all" ? D.units : mode === "fac" ? inFac : mode === "role_fac" ? inFac.filter(x => x.role === u.role) : D.units.filter(x => x.role === u.role);
    const keyOf = u => `${mode}|${mode.endsWith("fac") ? fac : ""}|${mode.startsWith("role") ? u.role : ""}`;
    const pools = {}; rows.forEach(u => { const k = keyOf(u); if (!pools[k]) { const p = uniq(poolOf(u)); pools[k] = {n: p.length, st: stats(p, k)}; } });
    const cols = ST.filter(s => shown.has(s.g));
    const sk = ST.find(s => s.k === sortK) || ST[0];
    const val = u => applies(sk, u) ? sk.v(u) : (sortD > 0 ? Infinity : -Infinity);
    rows.sort((a,b) => (val(a) - val(b)) * sortD || a.name.localeCompare(b.name));
    $b("#btab").innerHTML = `<table><tr><th>Unité (${rows.length})</th><th>Catégorie</th>${cols.map(s => `<th data-k="${s.k}" title="${s.g}">${s.l}${s.k===sortK?(sortD>0?" ▲":" ▼"):""}</th>`).join("")}</tr>` +
      rows.map(u => { const P = pools[keyOf(u)];
        return `<tr><td><div class="nm">${portrait(u,"s")}<span>${u.name}</span></div></td><td style="text-align:left">${ROLES[u.role]||u.role}<small>vs ${P.n} unités</small></td>` + cols.map(s => {
          if (!applies(s,u)) return `<td class="na">—</td>`;
          const p = pct(s, u, P.st[s.k]); const rank = P.st[s.k].length - upper(P.st[s.k], s.d * s.v(u)) + 1;
          return `<td>${f(s.v(u))}<br>${badge(p, `${s.l} : ${rank}ᵉ sur ${P.st[s.k].length}${s.d<0?" (moins = mieux)":""}`)}</td>`; }).join("") + "</tr>"; }).join("") + "</table>";
  }
  document.querySelector('[data-tab=browse]').addEventListener("click", render);
  render();
})();
