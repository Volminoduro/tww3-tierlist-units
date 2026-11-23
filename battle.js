"use strict";
/* Le simulateur lui-même est dans sim.js (partagé avec les calculs de duels en Node) ; ce fichier ne contient que l'interface. */
const {SIM, isLarge, isInf} = TWW3Sim;
const clamp = (v,a,b) => Math.min(b, Math.max(a, v));
const UNIT = Object.fromEntries(D.units.map(u => [u.id, u]));
const ARMY = {A:[], B:[]}, BON = {A:{arm:0,dmg:0,hp:0,mor:0,up:0}, B:{arm:0,dmg:0,hp:0,mor:0,up:0}};
const BONLAB = {arm:"Armure +%",dmg:"Dégâts +%",hp:"PV +%",mor:"Moral +%",up:"Entretien −%"};
const upk = (side, e) => e.u.upkeep * (1 - BON[side].up/100);
const fmt = n => Math.round(n).toLocaleString("fr-FR");

const simulate = (_, opts) => TWW3Sim.simulate(ARMY, BON, opts);
const equalK = opts => TWW3Sim.equalK(ARMY, BON, opts);

/* ---------- UI ---------- */
const $$ = (s, r=document) => r.querySelector(s);
const unitsOf = f => D.units.filter(u => f === ALL || u.factions.includes(f)).sort((a,b) => a.name.localeCompare(b.name));
document.querySelectorAll("#nav button").forEach(b => b.onclick = () => {
  document.querySelectorAll("#nav button").forEach(x => x.classList.toggle("on", x === b));
  document.querySelectorAll("[id^=tab-]").forEach(e => e.hidden = e.id !== "tab-" + b.dataset.tab); });
$("#bhow").innerHTML = "<b>Repris du jeu :</b> chance de toucher = 35 + attaque − défense (bornée 8–90 %) ; jet d'armure uniforme entre 0 et la valeur d'armure (plafond 100) qui réduit les dégâts de base, pas les perforants ; bonus contre grands/infanterie répartis entre base et perforants ; cadence d'attaque de l'arme ; munitions. <b>Approximé :</b> engagement (60 % des hommes au contact, 100 % pour monstres), élan de charge (6 s, + attaque et dégâts), précision des tirs (réglable), vitesse convertie en m/s (×0,2), cibles réparties au prorata des effectifs adverses (pas de ciblage ni de flanquement), moral = déroute quand les pertes dépassent 15 % + 0,6 × moral. Résultat déterministe (valeurs attendues) : il sert à comparer des compositions, pas à prédire une bataille précise. Les unités doivent venir de ton export de données.";
document.querySelectorAll(".army").forEach(el => {
  const side = el.dataset.side, fs = $$(".fac", el), us = $$(".usel", el);
  initPicker(fs, side === "A" ? "wh_main_emp_empire" : "wh_main_chs_chaos");
  const fill = () => { us.innerHTML = ""; unitsOf(fs.value).forEach(u => us.add(new Option(`${u.name} — entretien ${Math.round(u.upkeep)}`, u.id))); };
  fs.onchange = fill; fill();
  $$(".addbtn", el).onclick = () => { const u = UNIT[us.value]; if (!u) return;
    const e = ARMY[side].find(x => x.u.id === u.id); e ? e.count++ : ARMY[side].push({u, count: 1}); draw(side); };
  $$(".bon", el).innerHTML = Object.entries(BONLAB).map(([k,l]) => `<label class="sl"><span>${l}</span><b id="b${side}${k}">0</b><input type="range" min="0" max="50" value="0" data-k="${k}"></label>`).join("");
  $$(".bon", el).oninput = e => { const k = e.target.dataset.k; BON[side][k] = +e.target.value; $("#b"+side+k).textContent = e.target.value; draw(side); };
  $$(".match", el).onclick = () => { const o = side === "A" ? "B" : "A", target = ARMY[o].reduce((a,e) => a + upk(o,e)*e.count, 0), cur = ARMY[side].reduce((a,e) => a + upk(side,e)*e.count, 0);
    if (!cur || !target) return; const f = target/cur; ARMY[side].forEach(e => e.count = Math.max(1, Math.round(e.count*f))); draw(side); };
  draw(side);
});
function draw(side) {
  const el = $$(`.army[data-side=${side}]`), a = ARMY[side];
  $$(".list", el).innerHTML = a.map((e,i) => `<div class="it"><span class="nm">${portrait(e.u,"s")}<span>${e.u.name}<br><small>${ROLES[e.u.role]||e.u.role}</small></span></span>
    <input type="number" min="1" max="40" value="${e.count}" data-i="${i}"><span class="up" title="Entretien par unité">⚙ ${Math.round(upk(side,e))}<br><small>= ${fmt(upk(side,e)*e.count)}</small></span><button class="x" data-i="${i}">✕</button></div>`).join("") || "<small>Ajoute des unités ci-dessus.</small>";
  const nU = a.reduce((s,e) => s+e.count, 0), up = a.reduce((s,e) => s+upk(side,e)*e.count, 0), c = a.reduce((s,e) => s+e.u.cost*e.count, 0);
  $$(".tot", el).innerHTML = `<b>${nU}</b> unité(s)${nU>20?' <span style="color:#ff6a6a">⚠ plus de 20</span>':""} · entretien total <b class="up">⚙ ${fmt(up)}</b> · recrutement <b>${fmt(c)}</b>`;
  $$(".list", el).querySelectorAll("input").forEach(i => i.onchange = () => { ARMY[side][+i.dataset.i].count = Math.max(1, +i.value || 1); draw(side); });
  $$(".list", el).querySelectorAll(".x").forEach(b => b.onclick = () => { ARMY[side].splice(+b.dataset.i, 1); draw(side); });
}
$("#sim").onclick = () => {
  if (!ARMY.A.length || !ARMY.B.length) { $("#result").innerHTML = '<div class="res">Ajoute au moins une unité de chaque côté.</div>'; return; }
  const opts = {dist: +$("#dist").value || 0, acc: clamp(+$("#acc").value, 5, 100)/100, staticB: $("#static").checked};
  const r = simulate(null, opts), eq = equalK(opts);
  const win = r.sA > r.sB ? "A" : r.sB > r.sA ? "B" : null;
  const kill = (s, o) => r.tot[o] - (s === "A" ? r.sB : r.sA); // entretien adverse détruit
  const rdA = kill("A","B")/r.tot.A, rdB = kill("B","A")/r.tot.B, eff = r.tot.B/(eq.k*r.tot.A);
  const effTxt = eq.edge === "high" ? "&lt; 1/40" : eq.edge === "low" ? "&gt; 40" : (eff >= 1 ? `A ×${eff.toFixed(2)}` : `B ×${(1/eff).toFixed(2)}`);
  const pct = (v, t) => t ? Math.round(v/t*100) : 0;
  const svg = (() => { const W = 600, H = 150, mx = r.time || 1, my = Math.max(r.tot.A, r.tot.B) || 1;
    const line = (i, col) => `<polyline fill="none" stroke="${col}" stroke-width="2" points="${r.timeline.map(p => `${p[0]/mx*W},${H-8-p[i]/my*(H-16)}`).join(" ")}"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${line(1,"#6aa9ff")}${line(2,"#ff8a6a")}</svg>`; })();
  const rows = ["A","B"].flatMap(s => r.S[s].map(x => `<tr><td>${s}</td><td>${x.u.name}</td><td>${fmt(x.cnt*x.u.men*(x.pool/x.pool0))} / ${fmt(x.cnt*x.u.men)}</td><td>${pct(x.pool,x.pool0)} %</td><td>${x.routed ? "en déroute" : x.out ? "détruite" : "debout"}</td><td>${fmt(x.up)}</td></tr>`)).join("");
  $("#result").innerHTML = `<div class="res"><div class="verdict ${win||""}">${win ? `Victoire de l'armée ${win}` : "Match nul"} <small style="font-weight:400;color:var(--m)">— après ${r.time} s (contact à ${Math.round(r.T0)} s)</small></div>
   <div class="kpis"><div class="kpi"><small>Entretien survivant A</small><b>⚙ ${fmt(r.sA)} / ${fmt(r.tot.A)}</b></div><div class="kpi"><small>Entretien survivant B</small><b>⚙ ${fmt(r.sB)} / ${fmt(r.tot.B)}</b></div>
   <div class="kpi"><small>Rendement : entretien adverse détruit ÷ entretien propre</small><b>A ${rdA.toFixed(2)} · B ${rdB.toFixed(2)}</b></div>
   <div class="kpi"><small>Armée la plus efficace par point d’entretien</small><b>${effTxt}</b></div></div>
   <small style="color:var(--m)">Efficacité : l'armée A devrait être multipliée par ×${eq.k.toFixed(2)} (entretien ⚙ ${fmt(eq.k*r.tot.A)}) pour faire jeu égal avec B (⚙ ${fmt(r.tot.B)}).</small>
   ${svg}<small style="color:var(--m)">Entretien restant au combat : A en bleu, B en orange (0 → ${r.time} s).</small>
   <table><tr><th>Camp</th><th>Unité</th><th>Hommes</th><th>PV restants</th><th>État</th><th>Entretien</th></tr>${rows}</table></div>`;
};
