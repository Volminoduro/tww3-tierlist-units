"use strict";
const $ = s => document.querySelector(s);
const ROLES = {inf_melee:"Infanterie",inf_ranged:"Tireurs",cav_melee:"Cavalerie",cav_ranged:"Cavalerie à distance",monster:"Monstres",chariot:"Chars",artillery:"Artillerie",beast:"Bêtes de guerre",lord:"Seigneurs",hero:"Héros"};
const TIERS = [["S",.10],["A",.30],["B",.55],["C",.80],["D",.93],["F",1]];
const W = [ // [id,label,min,max,default,step,group]
 ["wMelee","Poids mêlée",0,2,1,.1,"w1"],["wRanged","Poids distance",0,2,1,.1,"w1"],["wDef","Poids survie (PV+armure)",0,2,1,.1,"w1"],
 ["wMob","Poids vitesse",0,2,.5,.1,"w1"],["wMor","Poids moral",0,2,.5,.1,"w1"],
 ["turns","Entretien pris en compte (tours) — 0 = recrutement seul",0,60,0,1,"w2"],["turnVal","Valeur d'un tour d'attente (or)",0,500,100,10,"w2"],
 ["tArm","Bonus armure (%)",0,50,0,1,"w3"],["tDmg","Bonus dégâts (%)",0,50,0,1,"w3"],["tHp","Bonus PV (%)",0,50,0,1,"w3"],
 ["tCost","Réduction coût recrutement (%)",0,50,0,1,"w3"],["tUp","Réduction entretien (%)",0,50,0,1,"w3"],["tRt","Tours de recrutement en moins",0,2,0,1,"w3"]];
const USE_SH={inf:"Anti-infanterie",large:"Anti-gros",armour:"Anti-armure",tank:"Encaisser",ranged:"Distance",charge:"Charge",speed:"Mobilité"}; // libellés courts (puces, matrice)
const ARCH = {global:"Typologie : globale (tout usage)",inf:"Anti-infanterie",large:"Anti-large (monstres, cavalerie)",armour:"Anti-armure",tank:"Encaisser la ligne de front",ranged:"Dégâts à distance",charge:"Charge / briseur de flanc",speed:"Mobilité"};
const ARCHK = Object.keys(ARCH).filter(k=>k!=="global");
const S = {}; let view = "tiers", role = new Set(), sortKey = "score", sortDir = -1;
const factions = D.factions;
$("#demo").hidden = !D.demo;
$("#how").innerHTML = "Puissance = √(PV effectifs × dégâts/s) × bonus vitesse × bonus moral. PV effectifs = hommes × PV ÷ (1 − armure/200). Dégâts : (dégâts + 0,7×perforants) × chance de toucher ÷ intervalle (mêlée, pondéré par la charge et le bonus vs grands) ; tireurs : projectiles × dégâts ÷ rechargement × portée. Coût effectif (campagne) = coût de recrutement + tours d'attente × valeur du tour (+ entretien × durée si tu règles « Entretien pris en compte » au-dessus de 0 : par défaut 0, pour comparer toutes les factions sur la même base, certaines n'ayant pas d'entretien). Les typologies comparent chaque unité à des cibles de référence (infanterie moyenne, grande cible, très blindé) ou à un attaquant moyen (encaisser). Tier = rang en percentile (S top 10 %, A 20 %, B 25 %, C 25 %, D 13 %, F 7 %). C'est un modèle simplifié et ajustable : il ne remplace pas le jugement.";
for (const [id,l,mn,mx,df,st,g] of W) { S[id]=df;
 $("#"+g).insertAdjacentHTML("beforeend",`<div class="sl"><span>${l}</span><b id="v_${id}">${df}</b><input type="range" id="${id}" min="${mn}" max="${mx}" step="${st}" value="${df}"></div>`);
 $("#"+id).oninput = e => { S[id]=+e.target.value; $("#v_"+id).textContent=e.target.value; render(); }; }
const fsel=$("#faction"); initPicker(fsel,ALL,true); // sélection de départ : toutes les factions
const roles = [...new Set(D.units.map(u=>u.role))];
$("#roles").innerHTML = `<button data-r="">Toutes</button>` + roles.map(r=>`<button data-r="${r}">${ROLES[r]||r}</button>`).join("");
/* Catégories : sélection multiple (aucune sélectionnée = « Toutes ») */
$("#roles").onclick = e => { const b=e.target.closest("button[data-r]"); if(!b) return; const r=b.dataset.r; if(!r) role.clear(); else role.has(r)?role.delete(r):role.add(r); render(); };
/* Filtre par typologie d'usage : une unité « peut faire » un usage selon des règles simples sur ses stats (voir ARCH_RULE). */
const ARCH_RULE={inf:"Dégâts de base dominants (≥ 50 % des dégâts) ou bonus contre l'infanterie",armour:"Dégâts perforants dominants (≥ 50 % des dégâts)",large:"Bonus contre les grands, ou dégâts perforants dominants",tank:"Armure ≥ 50, défense ≥ 40 ou PV totaux ≥ 12 000",ranged:"Possède une arme à distance",charge:"Bonus de charge ≥ 25",speed:"Vitesse ≥ 40 (cavalerie, bêtes rapides, vol…)"};
function canDo(u,k){
 const m=u.melee,r=u.ranged,tot=m.dmg+m.ap+(r?r.dmg+r.ap:0),apS=(m.ap+(r?r.ap:0))/Math.max(1,tot);
 switch(k){
  case "inf": return tot>0&&(apS<=.5||m.bvi>0);
  case "armour": return tot>0&&apS>=.5;
  case "large": return m.bvl>0||(tot>0&&apS>=.5);
  case "tank": return u.armour>=50||u.md>=40||u.men*u.hp>=12000;
  case "ranged": return !!r&&r.dmg+r.ap>0;
  case "charge": return u.charge>=25;
  case "speed": return u.speed>=40;
 } return false;
}
/* Applique les pastilles actives (ET) et redessine la rangée : une pastille est grisée si plus aucune unité de la sélection ne la permet. */
function typoApply(items,get,state,el){
 const ok=(x,skip)=>[...state].every(o=>o===skip||canDo(get(x),o));
 for(let g=0;g<ARCHK.length;g++){let pr=false;for(const k of [...state])if(!items.some(x=>canDo(get(x),k)&&ok(x,k))){state.delete(k);pr=true;} if(!pr)break;}
 el.innerHTML=`<span class="lbl">Usage</span>`+ARCHK.map(k=>{const n=items.filter(x=>canDo(get(x),k)&&ok(x,k)).length,on=state.has(k),dis=!n&&!on;
  return `<button data-k="${k}" class="${on?"on":""}" ${dis?"disabled":""} title="${ARCH_RULE[k]}${dis?" — aucune unité de la sélection actuelle":""}">${uic(k)}<span>${USE_SH[k]||ARCH[k]}</span> <small>(${n})</small></button>`;}).join("")+(state.size?`<button data-k="" class="clr">Effacer</button>`:"");
 return items.filter(x=>ok(x,null));
}
const TYPO=new Set();
$("#typo").onclick=e=>{const b=e.target.closest("button");if(!b||b.disabled)return;const k=b.dataset.k;k===""?TYPO.clear():TYPO.has(k)?TYPO.delete(k):TYPO.add(k);render();};
["faction","heroes","mode","metric","scope","q"].forEach(i=>$("#"+i).addEventListener("input",render));
/* Interrupteur « Tenir compte du coût » (en-tête) : activé = métrique « efficacité » (puissance ou usage ÷ coût), désactivé = « puissance brute » (la meilleure unité par usage, quel que soit son prix).
   Il pilote le menu « Tier par… » et reste synchronisé avec lui. « Résultats de duels » est déjà à coût égal : l'interrupteur est alors sans effet (grisé). */
const costSw=$("#costsw")||document.createElement("div"), costBtns=[...costSw.querySelectorAll("button")]; // garde-fou : un index.html plus ancien sans ce bloc ne casse pas la page
/* « Avec coût / Sans coût » : tiers par efficacité ou par puissance brute ET duels à coût équivalent ou 20 contre 20 (mode de duels « cost » / « count »). Reste actif quand la métrique est « duels ». */
let COSTON=true; try{COSTON=localStorage.getItem("costOn")!=="0"}catch(e){}
const syncCost=()=>{costSw.classList.remove("dis"); costBtns.forEach(b=>{b.disabled=false; b.classList.toggle("on",(b.dataset.on==="1")===COSTON);});};
const setCost=on=>{COSTON=on; try{localStorage.setItem("costOn",on?"1":"0")}catch(e){} syncCost(); if(typeof CampDuels!=="undefined") CampDuels.schedule(); render();};
costSw.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;setCost(b.dataset.on==="1");});
$("#metric").value="duels";   // tiers et ordre : TOUJOURS le taux de victoire en duels ; « Avec/Sans coût » choisit le mode de duels (coût équivalent / 20 contre 20)
syncCost();
$("#noror").addEventListener("input",e=>setRor(e.target.checked)); document.addEventListener("rorchange",()=>render());
$("#noror").checked=RORX.off;
document.querySelector('[data-tab=tier]').addEventListener("click",()=>render()); // revient sur les filtres modifiés dans l'onglet « Unités par faction »
$("#viewsel").onchange=()=>{view=$("#viewsel").value;render()};
const syncView=()=>document.querySelectorAll("#viewseg button").forEach(b=>b.classList.toggle("on",b.dataset.v===view));
/* Raccourcis clavier 1 / 2 / 3 : Tiers / Tableau / Matrice (onglet Tier list actif, hors saisie de texte et fenêtres) */
document.addEventListener("keydown",e=>{
 /* touches physiques (e.code) : rangée du haut (« & é " » en AZERTY, 1 2 3 en QWERTY) et pavé numérique, quelle que soit la disposition du clavier ; avec ou sans Maj */
 const m=/^(?:Digit|Numpad)([123])$/.exec(e.code||"");
 if(e.ctrlKey||e.metaKey||e.altKey||!m) return;
 if(e.target.closest&&e.target.closest("input,textarea,select,[contenteditable],dialog")) return;
 if(document.querySelector("dialog[open]")) return;
 const tab=document.querySelector("#nav button.on"); if(!tab||tab.dataset.tab!=="tier") return;
 const b=document.querySelectorAll("#viewseg button")[+m[1]-1]; if(b){e.preventDefault();b.click();}
});
$("#viewseg").onclick=e=>{const b=e.target.closest("button");if(!b)return;view=b.dataset.v;$("#viewsel").value=view;syncView();render()};
$("#reset").onclick=()=>{for(const w of W){S[w[0]]=w[4];$("#"+w[0]).value=w[4];$("#v_"+w[0]).textContent=w[4]}render()};

function archeScores(u){
 const dm=1+S.tDmg/100, arm0=Math.min(100,u.armour*(1+S.tArm/100)), hp=u.hp*(1+S.tHp/100), m=u.melee, r=u.ranged, eng=u.men<=6?1:.6;
 const REF={inf:{md:30,arm:40,large:false,inf:true},large:{md:35,arm:60,large:true,inf:false},armour:{md:30,arm:80,large:false,inf:true}};
 const vs=(t,ch)=>{const hit=Math.min(90,Math.max(8,35+u.ma+(ch?u.charge:0)-t.md))/100; let d=m.dmg,a=m.ap,b=t.large?m.bvl:t.inf?m.bvi:0;
  if(b&&d+a>0){const s=d+a;d+=b*d/s;a+=b*a/s;} const cm=ch?1+u.charge/200:1, red=1-t.arm/200;
  const mel=u.men*eng*hit*((d*cm*dm)*red+a*cm*dm)/Math.max(1,m.interval);
  const rg=r?u.men*(r.share??1)*r.shots*((r.dmg*dm)*red+r.ap*dm)*.5/Math.max(1,r.reload):0; return {mel,rg};};
 const tot=t=>{const v=vs(t,false);return v.mel+v.rg;};
 return {inf:tot(REF.inf), large:tot(REF.large), armour:tot(REF.armour),
  tank:u.men*hp/(1-arm0/200)*(1+u.md/150)*(1+.5*(u.ld-60)/100),
  ranged:r?vs(REF.inf,false).rg*(1+r.range/400):0, charge:vs(REF.inf,true).mel*6, speed:u.speed};
}
/* Résultats de duels précalculés (data/duels.js, générés par tools/build_duels.js avec le même sim.js) */
let DU = window.TWW3_DUELS || null; const DU0 = DU; window.setDU = o => { DU = o || DU0; render(); };   // setDU(objet) : duels recalculés pour « Ma campagne » (campduels.js) ; setDU(null) : retour aux précalculés
const UNIT_BY_ID = Object.fromEntries(D.units.map(u => [u.id, u]));
const duelMode = () => (COSTON || !(DU && DU.modes.count)) ? "cost" : "count"; // « cost » : duels à coût de recrutement équivalent ; « count » : 20 contre 20, sans coût
const duelOf = (u, mode) => { const m = mode || duelMode(); return DU && DU.modes[m] ? DU.modes[m][u.id] || null : null; };
/* ---------- Duels « avec ma campagne » ----------
   Les duels précalculés se jouent sans seigneur. Quand « Ma campagne » est active et que l'unité en fait partie, on peut recalculer à la volée ses duels contre toutes les autres unités : les stats du profil sont déjà
   dans l'unité (profile.js) et les effets CONDITIONNELS du seigneur dont la condition dépend de l'adversaire (« contre les Nains »…) s'ajoutent duel par duel, la race de l'adversaire étant connue.
   Même méthode que tools/build_duels.js : budget de recrutement équivalent (1 à 20 exemplaires), stratégie automatique, 400 m. */
const CDUEL = {};   // cache : clé profil|unité -> résultat
const cduelKey = u => [duelMode(), u.id, PROFILE.fac, PROFILE.st, PROFILE.level, PROFILE.fromSave, (PROFILE.condEff || []).length].join("|");
function cduelRun(u, onProgress, done) {
 const mode = duelMode(), Sim = window.TWW3Sim, FX = window.TWW3_EFFECTS || {lords: {}}, lord = FX.lords[PROFILE.st];
 const conds = ((lord && lord.effects) || []).filter(e => e.cond).concat(PROFILE.condEff || []);
 const hits = e => e.units == null || (e.units === "lord" ? !!lord && u.id === lord.unit : (e.units instanceof Set ? e.units.has(u.id) : e.units.includes(u.id)));
 const mine = conds.filter(hits), NB = {A: {arm: 0, dmg: 0, hp: 0, mor: 0, up: 0}, B: {arm: 0, dmg: 0, hp: 0, mor: 0, up: 0}};
 const base = {ma: u.ma, md: u.md, arm: u.armour, ld: u.ld, charge: u.charge};
 const tagsOf = v => { const t = new Set(); for (const c of (v.races || [])) { const m = /_([a-z]{3})_/.exec(c); for (const g of (m && CULT_TAGS[m[1]]) || []) t.add("vs:" + g); } return t; };
 const modsVs = v => { const t = tagsOf(v), m = {}; let n = 0;
  for (const e of mine) if (condOn(e, t)) { n++; m[e.stat] = (m[e.stat] || 0) + (e.pct && base[e.stat] !== undefined ? base[e.stat] * e.v / 100 : e.v); }
  return {m: n ? m : undefined, n}; };
 const pool = D.units.filter(v => v.id !== u.id && v.cost > 0 && v.men > 0 && v.hp > 0);
 const res = []; let i = 0, nCond = 0; const t0 = Date.now();
 const step = () => {
  const end = Math.min(pool.length, i + 60);
  for (; i < end; i++) { const v = pool[i], lo = Math.max(u.cost, v.cost), hi = 20 * Math.min(u.cost, v.cost);
   if (mode !== "count" && lo > hi) continue; const budget = Math.max(lo, Math.min(2000, hi)), {m, n} = modsVs(v); if (n) nCond++;
   const cA = mode === "count" ? 20 : budget / u.cost, cB = mode === "count" ? 20 : budget / v.cost;
   const r = Sim.resolve({A: [{u, count: cA, mods: m}], B: [{u: v, count: cB}]}, NB, {dist: 400, acc: 0.4, staticB: false, hold: {A: "auto", B: "auto"}});
   res.push([v.id, (r.tot.A ? r.sA / r.tot.A : 0) - (r.tot.B ? r.sB / r.tot.B : 0), n]); }
  onProgress(i, pool.length);
  if (i < pool.length) return setTimeout(step, 0);
  const w = res.reduce((a, [, m]) => a + (m > 0 ? 1 : m < 0 ? 0 : .5), 0) / Math.max(1, res.length), sorted = res.slice().sort((a, b) => b[1] - a[1]);
  done({wr: w, n: res.length, nCond, best: sorted.slice(0, 3), worst: sorted.slice(-3).reverse(), ms: Date.now() - t0});
 };
 step();
}
function cduelHtml(u){
 if(typeof PROFILE==="undefined"||!PROFILE.on||!PROFILE.st||!(u.factions||[]).includes(PROFILE.fac)) return "";
 const r=CDUEL[cduelKey(u)], nm=id=>(UNIT_BY_ID[id]||{name:id}).name, d=duelOf(u);
 if(!r) return `<div class="cduel"><button type="button" data-cduel="${u.id}">Recalculer ces duels avec ma campagne…</button><small>Stats du profil et effets conditionnels du seigneur selon la race de chaque adversaire.</small></div>`;
 const top=l=>l.map(([id,m])=>`${nm(id)} (${m>0?"+":""}${Math.round(m*100)})`).join(", "), delta=d?Math.round((r.wr-d.wr)*100):null;
 return `<div class="cduel"><b>Avec ma campagne : ${Math.round(r.wr*100)} % de victoires</b>${delta!==null?` <span class="${delta>0?"up":delta<0?"dn":""}">(${delta>0?"+":""}${delta} points par rapport aux duels sans campagne)</span>`:""}
  <small>${r.n} duels, dont ${r.nCond} où un effet conditionnel du seigneur s'applique (race de l'adversaire). Bat le mieux : ${top(r.best)} · Battue par : ${top(r.worst)}</small></div>`;
}
document.addEventListener("click",e=>{
 const b=e.target.closest("[data-cduel]"); if(!b) return; const u=UNIT_BY_ID[b.dataset.cduel]; if(!u) return;
 b.disabled=true; const box=b.closest(".cduel"), say=t=>{box.querySelector("small").textContent=t;};
 cduelRun(u,(i,n)=>say(`Calcul… ${Math.round(i/n*100)} %`),r=>{CDUEL[cduelKey(u)]=r; const dt=$("#detail"); if(dt&&!dt.hidden&&dt.dataset.unit===u.id){const x=(window._us||[]).find(y=>y.u.id===u.id); if(x) detail(x);} });
});
function duelPanel(u){
 if(!DU) return "";
 const d=duelOf(u), rl=r=>ROLES[r]||r, nm=id=>(UNIT_BY_ID[id]||{name:id}).name;
 if(!d) return `<h4>Résultats de duels</h4><small>Pas de duels précalculés pour cette unité (coût de recrutement nul).</small>`;
 const ranged=d.basis==="dps", lbl=duelMode()==="count"?"en 20 contre 20 (sans tenir compte du coût)":"à coût de recrutement équivalent", wr=Math.round(d.wr*100);
 const rows=Object.keys(d.vs).filter(r=>ranged?d.dps[r]>0:d.vs[r]!=null).map(r=>`<div class="kv"><span>${ranged?"DPS /100 vs ":"Victoires vs "}${rl(r)}</span><b>${ranged?d.dps[r]:Math.round(d.vs[r]*100)+" %"}</b></div>`).join("");
 const top=l=>l.slice(0,3).map(([id,m])=>`${nm(id)} (${m>0?"+":""}${Math.round(m*100)})`).join(", ");
 return `<h4>Résultats de duels</h4><div class="duelhead"><div class="big" style="color:hsl(${wr*1.2},55%,62%)">${wr} %<small>de victoires ${lbl}</small></div>
  <div class="anti">${si("target")}<span>${d.anti.length?"Domine : "+d.anti.map(([r,p])=>`${rl(r)} (top ${Math.max(1,100-p)} %)`).join(", "):"Aucune typologie dominante"}</span></div></div>
  <details class="more"><summary>Détail par catégorie et adversaires</summary>${rows}
  <small class="kv2">Bat le mieux : ${top(d.best)}<br>Battue par : ${top(d.worst)}</small></details>
  ${cduelHtml(u)}
  ${DU.caveat.includes(u.id)?`<p class="dn">Seigneur / héros : sorts, capacités et objets non modélisés, résultats indicatifs.</p>`:""}
  ${ranged?`<p class="dn">Unité à distance : la typologie vient du DPS contre un défenseur moyen de chaque catégorie (${ranged?"efficacité de DPS":"duels"}), pas de duels contre de la mêlée.</p>`:""}`;
}
function score(u){
 const mp=$("#mode").value==="mp", k=1;
 const hp=u.hp*(1+S.tHp/100), arm=Math.min(100,u.armour*(1+S.tArm/100)), dm=1+S.tDmg/100;
 const ehp=u.men*hp/(1-arm/200)*(1+u.md/150);
 const hit=Math.min(90,Math.max(8,35+u.ma-40))/100, m=u.melee;
 let mel=u.men*.6*((m.dmg+.7*m.ap)*dm*(1+m.bvl/Math.max(1,m.dmg+m.ap)*.25))*hit/Math.max(1,m.interval)*(1+u.charge/150);
 let rng=0; if(u.ranged){const r=u.ranged; rng=u.men*(r.share??1)*r.shots*(r.dmg+.7*r.ap)*dm*.5/Math.max(1,r.reload)*(1+r.range/400);}
 const off=mel*S.wMelee+rng*S.wRanged, def=Math.pow(ehp,S.wDef/1);
 const power=Math.sqrt(Math.max(1,off)*Math.pow(ehp,S.wDef))*(1+S.wMob*(u.speed-40)/100)*(1+S.wMor*(u.ld-60)/100);
 const rt=Math.max(0,u.recruitTurns-S.tRt);
 const cost=mp? u.mpCost : u.cost*(1-S.tCost/100)+u.upkeep*(1-S.tUp/100)*S.turns+rt*S.turnVal;
 return {power, cost, value: power/Math.max(1,cost), ehp, mel, rng, rt, arche: archeScores(u), duels: (duelOf(u)||{}).wr ?? 0};
}
function compute(withLH){ // withLH : inclure seigneurs et héros dans le périmètre (et donc dans le classement)
 const seen=new Set();   // le classement porte TOUJOURS sur toutes les unités (comme pour seigneurs/héros) : la faction choisie ne filtre que l'affichage (voir render)
 let us=D.units.filter(u=>inScope(u,ALL)&&(withLH||!["lord","hero"].includes(u.role))).map(u=>({u,...score(u)}));
 us=us.filter(x=>!seen.has(x.u.id)&&seen.add(x.u.id));
 const key=$("#metric").value;
 // Mobilité : vitesse pure, jamais divisée par le coût (une unité lente et bon marché ne devient pas « mobile »)
 us.forEach(x=>{x.rg=((duelOf(x.u)||{}).basis==="dps"); x.score=x.rg?(COSTON?x.value:x.power):x[key];});   // distance : efficacité (avec coût) ou puissance brute (sans coût) ; mêlée (y compris hybrides à dominante mêlée) : taux de victoire en duels
 us.forEach(x=>{x.pct={};});
 /* Échelle de référence : seigneurs et héros n'y comptent JAMAIS (sinon cocher la case ferait bouger le tier des autres unités). Ils sont simplement placés sur l'échelle des autres unités.
    pos(ref,val,v) = position d'insertion de v parmi les valeurs de ref (égalités = milieu de la plage), ref étant la liste triée des valeurs de référence. */
 const LHr=x=>x.u.role==="lord"||x.u.role==="hero";
 const spread=(vals,v)=>{let lo=0,hi=vals.length;while(lo<hi){const m=(lo+hi)>>1;vals[m]<v?lo=m+1:hi=m;}const a=lo;hi=vals.length;while(lo<hi){const m=(lo+hi)>>1;vals[m]<=v?lo=m+1:hi=m;}return [a,lo];};
 const refOf=l=>{const r=l.filter(x=>!LHr(x));return r.length?r:l;};
 ARCHK.forEach(k=>{const v=x=>COSTON&&k!=="speed"?x.arche[k]/Math.max(1,x.cost):x.arche[k];
   const vals=refOf(us).map(v).sort((a,b)=>a-b), n=vals.length;
   // égalités = même percentile (moyenne des rangs) ; une unité qui ne sait pas faire l'usage (valeur 0) est à 0, pas étalée sur l'échelle
   us.forEach(x=>{const val=v(x),[lo,hi]=spread(vals,val);const r=Math.min(n-1,Math.max(0,(lo+hi)/2-.5));x.pct[k]=val<=0?0:n>1?Math.round(r/(n-1)*100):100;});});
 /* Les unités à distance (base « dps » des duels) sont classées ENTRE ELLES : leurs duels contre de la mêlée sont peu représentatifs (pas de ciblage, de couvert ni de flanquement). Échelles de tiers séparées. */
 const groups={}; us.forEach(x=>(groups[($("#scope").value==="role"?x.u.role:"all")+(x.rg?"|d":"|m")]??=[]).push(x));
 for(const g of Object.values(groups)){ const ref=refOf(g).slice().sort((a,b)=>a.score-b.score), n=ref.length, vals=ref.map(x=>x.score), idx=new Map(ref.map((x,i)=>[x,i]));
  g.forEach(x=>{let p;
   if(idx.has(x)) p=(idx.get(x)+.5)/n;                         // unité de référence : rang dans le groupe, comme avant
   else {const [lo,hi]=spread(vals,x.score); p=(lo+hi)/2/n;}    // seigneur / héros : inséré sur l'échelle sans la modifier
   x.rk=p; x.tier=TIERS.find(t=>1-p<=t[1])[0]; });}   // rk = position (0-1) sur l'échelle de la famille : seule grandeur comparable entre mêlée et distance
 return us;
}
/* Pastilles de catégories : « Nom (nombre d'unités disponibles) », grisées s'il n'y en a aucune. cnt(r) = effectif pour la catégorie r (null = toutes). */
function roleChips(list,sel,cnt){
 return `<button data-r="" class="${sel.size?"":"on"}">${roleIc("")}<span>Toutes</span> <small>(${cnt(null)})</small></button>`+list.map(r=>{const n=cnt(r),on=sel.has(r);
  return `<button data-r="${r}" class="${on?"on":""}" ${!n&&!on?"disabled":""}>${roleIc(r)}<span>${ROLES[r]||r}</span> <small>(${n})</small></button>`;}).join("");
}
function render(){
 syncView();
 // Seigneurs et héros : exclus de « Toutes » sauf si la case est cochée, mais toujours accessibles (et comptés) via leurs pastilles « Seigneurs » / « Héros »
 const incl=$("#heroes").checked, LH=x=>x.u.role==="lord"||x.u.role==="hero", shown=x=>role.size?role.has(x.u.role):(incl||!LH(x));
 const wantLH=incl||role.has("lord")||role.has("hero"), q=$("#q").value.toLowerCase();
 const inFac=x=>inScope(x.u,fsel.value);       // tiers calculés sur toutes les unités ; la faction ne filtre que l'affichage
 let us=compute(wantLH);                       // classement : seigneurs/héros seulement s'ils sont affichés
 const pool=(wantLH?us:compute(true)).filter(inFac);
 us=us.filter(inFac);           // effectifs des pastilles : tous les seigneurs/héros comptés, même masqués
 const byName=pool.filter(x=>x.u.name.toLowerCase().includes(q));
 const cnt=r=>byName.filter(x=>(r?x.u.role===r:(incl||!LH(x)))&&[...TYPO].every(k=>canDo(x.u,k))).length; // périmètre, recherche et usages actifs
 [...role].forEach(r=>{if(!cnt(r))role.delete(r);}); // une catégorie devenue vide est retirée de la sélection
 $("#roles").innerHTML=roleChips(roles,role,cnt);
 us=us.filter(x=>x.u.name.toLowerCase().includes(q)&&shown(x));
 us=typoApply(us,x=>x.u,TYPO,$("#typo"));
 $("#tiers").hidden=view!=="tiers"; $("#table").hidden=view!=="table"; $("#matrix").hidden=view!=="matrix";
 $("#fban").innerHTML=factionBanner(fsel.value,us.length);
 const all=fsel.value===ALL||isRace(fsel.value)||isMulti(fsel.value), fn=u=>all?`<div class="f">${facIcons(u,fsel.value)}</div>`:"";
 const cardInfo=x=>`${catIc(x.u)}${ROLES[x.u.role]||x.u.role} · ${Math.round(x.cost)} or`;
 if(view==="tiers"){
  const col={S:"--S",A:"--A",B:"--B",C:"--C",D:"--D",F:"--F"};
  $("#tiers").innerHTML=`<p class="tcap">Ordre dans un tier : score décroissant, métrique « ${({value:"efficacité (puissance ÷ coût)",power:"puissance brute",duels:"résultats de duels"})[$("#metric").value]} » (score en cible, taux de victoire en duels à côté sur chaque carte). Les unités à distance sont classées entre elles (échelle de tiers à part), sur leur efficacité (Avec coût) ou leur puissance brute (Sans coût) : leurs duels contre de la mêlée ne sont pas représentatifs, le simulateur ne modélisant ni ciblage, ni couvert, ni flanquement. Les unités de mêlée pouvant tirer restent classées en mêlée.</p>`+TIERS.map(([t])=>{const l=us.filter(x=>x.tier===t).sort((a,b)=>b.rk-a.rk);
   return `<div class="row"><div class="lab" style="background:var(${col[t]})">${t}</div><div class="cards">${l.map(x=>`<div class="card${x.u.ror?" ror":""}" data-t="${x.tier}" data-id="${x.u.id}">${portrait(x.u,"tall")}<div class="ct"><b>${x.u.name}</b><div class="tags">${rortag(x.u)}${gtier(x.u)}</div><small>${cardInfo(x)}</small>${cardStats(x)}${fn(x.u)}</div></div>`).join("")}</div></div>`}).join("");
 } else if(view==="matrix"){
  const mk=sortKey.startsWith("m:")?sortKey.slice(2):null;
  us.sort((a,b)=>((mk?a.pct[mk]-b.pct[mk]:a.rk-b.rk)||0)*sortDir);
  const best=x=>ARCHK.reduce((p,k)=>x.pct[k]>x.pct[p]?k:p,ARCHK[0]);
  const tb=t=>`<span class="tb" style="background:var(--${t})">${t}</span>`;
  const cell=(x,k,mx)=>{const p=x.pct[k]; if(p<=0) return `<td class="hc z" title="Ne sait pas faire cet usage">–</td>`;
   return `<td class="hc${p===mx&&p>=60?" top":""}" style="--p:${p}%;background:hsl(${Math.round(p*1.25)},${38+Math.round(p*.2)}%,${20+Math.round(p*.2)}%)" title="Valeur brute : ${Math.round(x.arche[k])}${p===mx&&p>=60?" · meilleur usage de l'unité":""}">${p}</td>`};
  const SH=USE_SH;
  $("#matrix").innerHTML=`<table><colgroup><col class="c-n"><col class="c-t">${ARCHK.map(()=>'<col class="c-a">').join("")}<col class="c-b"></colgroup><tr><th data-k="score">Unité</th><th data-k="score">Tier</th>${ARCHK.map(k=>`<th data-k="m:${k}" title="${ARCH[k]}" style="text-align:center" aria-label="${ARCH[k]}">${uic(k)}</th>`).join("")}<th>Meilleur usage</th></tr>`+
   us.map(x=>{const mx=Math.max(...ARCHK.map(k=>x.pct[k]));return `<tr data-id="${x.u.id}"><td class="mn"><div class="mu">${portrait(x.u,"tall")}<span><b>${roricon(x.u)}${x.u.name}</b><small>${catIc(x.u)}${ROLES[x.u.role]||x.u.role} · ${Math.round(x.cost)} or</small></span></div></td><td class="mt">${tb(x.tier)}</td>${ARCHK.map(k=>cell(x,k,mx)).join("")}<td class="best" title="${ARCH[best(x)]}">${uic(best(x))}<span>${SH[best(x)]||ARCH[best(x)]}</span></td></tr>`}).join("")+
   `</table><p style="padding:8px;color:var(--m);font-size:12px">Chaque case = percentile (0-100) de l'unité (rapporté au coût si le mode « efficacité » est choisi) parmi les unités affichées de la faction pour cet usage. 100 = la meilleure pour ça. La mobilité est la vitesse seule, jamais rapportée au coût. Cliquer un en-tête trie.</p>`;
 } else {
  /* colonnes : [libellé, valeur, rendu, icône, couleur de barre, infobulle] ; « Puissance » n'apparaît que si elle diffère du score (mode « avec coût ») */
  const same=us.every(x=>Math.abs(x.score-x.power)<1e-6);
  const cols=[["Unité",x=>x.u.name,x=>`<div class="mu">${portrait(x.u,"tall")}<span><b>${roricon(x.u)}${x.u.name}</b></span></div>`],
   ["Tier",x=>x.tier,x=>x.tier],
   ["Rôle",x=>ROLES[x.u.role],x=>`<span class="rl">${catIc(x.u)}${ROLES[x.u.role]||x.u.role}</span>`],
   ["Score",x=>Math.round(x.rk*100)/100,null,"target","#d6b25e","Position de l'unité sur l'échelle de sa famille (mêlée : duels ; distance : efficacité ou puissance) : fixe le tier"]]
   .concat(same?[]:[["Puissance",x=>x.power,null,"attack","#b996d9","Puissance brute (avant division par le coût)"]])
   .concat([["Coût eff.",x=>x.cost,null,"coin","#9a98a8","Coût effectif (recrutement + entretien selon les réglages)"],["PV eff.",x=>x.ehp,null,"hp","#5fb98a","Points de vie effectifs (armure et défense comprises)"],["Mêlée/s",x=>x.mel,null,"weapon","#e0804f","Dégâts de mêlée par seconde"],["Dist./s",x=>x.rng,null,"bow","#5b9bd6","Dégâts à distance par seconde"]]);
  const sk=cols.find(c=>c[0]===sortKey)||cols.find(c=>c[0]==="Score"); us.sort((a,b)=>{const A=sk[1](a),B=sk[1](b);return (A>B?1:A<B?-1:0)*sortDir});
  const f=v=>typeof v==="number"?(v>=100?Math.round(v):v.toFixed(2)):v;
  /* Barre : valeur ÷ P95 de la colonne (parmi les unités affichées), plafonnée à 100 %. Chaque colonne a sa couleur et sa piste ; les barres sont inscrites avec une marge pour que deux barres pleines côte à côte restent distinctes. */
  const p95=c=>{const v=us.map(x=>c[1](x)).filter(n=>typeof n==="number"&&isFinite(n)).sort((a,b)=>a-b);if(!v.length)return 0;return v[Math.floor(.95*(v.length-1))]||v[v.length-1]||0};
  const P=cols.map(p95);
  const cellT=(c,x,i)=>{const v=c[1](x);
   if(c[0]==="Tier") return `<td class="tcell" style="background:var(--${x.tier})">${x.tier}</td>`;
   const num=typeof v==="number", fill=num&&P[i]>0?Math.max(0,Math.min(1,v/P[i])):0;
   return `<td class="${num?"num bar":""}"${num?` style="--f:${fill.toFixed(3)};--bc:${c[4]}"`:""}>${c[2]?c[2](x):f(v)}</td>`};
  $("#table").innerHTML=`<table><tr>${cols.map(c=>`<th data-k="${c[0]}"${c[5]?` title="${c[5]}"`:""}>${c[3]?si(c[3]):""}<span>${c[0]}</span></th>`).join("")}</tr>${us.map(x=>`<tr data-id="${x.u.id}">${cols.map((c,i)=>cellT(c,x,i)).join("")}</tr>`).join("")}</table><p style="padding:8px;color:var(--m);font-size:12px">Barres : valeur ÷ P95 de la colonne parmi les unités affichées (100 % = les plus fortes), une couleur par colonne. Cliquer un en-tête trie ; cliquer dans le vide ferme la fiche.</p>`;
 }
 window._us=us; syncDetail(us); saveUI();
}
/* La fiche d'unité suit la liste : elle se met à jour si l'unité reste affichée, et se ferme si un filtre la fait disparaître. */
function syncDetail(us){
 const dt=$("#detail"); if(dt.hidden||!dt.dataset.unit) return;
 const x=us.find(y=>y.u.id===dt.dataset.unit);
 if(!x){dt.hidden=true;return;}
 const st=dt.scrollTop; detail(x); dt.scrollTop=st;
}
document.addEventListener("click",e=>{
 const th=e.target.closest("th[data-k]"); if(th){sortDir=sortKey===th.dataset.k?-sortDir:-1;sortKey=th.dataset.k;return render();}
 const c=e.target.closest("[data-id]"); if(c){const x=window._us.find(y=>y.u.id===c.dataset.id); if(x) detail(x);}
 if(e.target.id==="close")$("#detail").hidden=true;
 /* Clic dans le vide (élément non interactif, hors fiche) : ferme la fiche */
 const dt=$("#detail");
 if(dt&&!dt.hidden&&e.target.isConnected&&!e.target.closest("#detail,[data-id],button,a,input,select,textarea,label,summary,dialog,.tp,.tp-pop,th,[role=button],[data-p],#nav,.dseg")) dt.hidden=true;
});
/* Icônes de types de stats (fiche d'unité) : tracés simples, couleur de l'accent */
const STAT_ICON={
 hp:'<path d="M12 20.5S4 16 4 9.5a4.2 4.2 0 0 1 8-1.8 4.2 4.2 0 0 1 8 1.8C20 16 12 20.5 12 20.5z"/>',
 armour:'<path d="M12 3l7.5 2.8v5.7c0 4.8-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.7-7.5-9.5V5.8z"/>',
 attack:'<path d="M5 5l14 14M19 5L5 19M3.5 8.5l5-5M15.5 20.5l5-5"/>',
 charge:'<path d="M3 12h13M12 6l6 6-6 6"/>',
 morale:'<path d="M6 21V3M6 4.5h12l-3.5 4 3.5 4H6"/>',
 speed:'<path d="M5 6l6 6-6 6M12 6l6 6-6 6"/>',
 weapon:'<path d="M12 2.5l3 9-3 3-3-3z M12 14.5v6.5M8 17.5h8"/>',
 target:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><path d="M12 12h.01"/>',
 bow:'<path d="M7 3.5c11 4.5 11 12.5 0 17M7 3.5v17M3 12h17M20 12l-4-3v6z"/>',
 clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
 ammo:'<path d="M8 20V8l2-3 2 3v12M14 20V10l2-3 2 3v10"/>',
 coin:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10M9.5 9.5c0-1.6 5-1.6 5 0s-5 1.4-5 3 5 1.6 5 0"/>',
 upkeep:'<path d="M7 3h10M7 21h10M8 3c0 6 8 6 8 9s-8 3-8 9M16 3c0 6-8 6-8 9"/>',
 calendar:'<path d="M4 6h16v14H4zM4 10.5h16M8 3.5v4M16 3.5v4"/>',
 bolt:'<path d="M13 2.5L5.5 13.5H11l-1 8 7.5-11H12z"/>',
 u_inf:'<circle cx="9" cy="6.5" r="2.7"/><path d="M4 20v-4.5c0-2.5 2-4.5 5-4.5s5 2 5 4.5V20"/><path d="M15 4l5 5M13.5 8.5l6.5-6.5"/>',
 u_large:'<path d="M3 21c0-6 3.5-10 8-10s8 4 8 10"/><path d="M4 7l9 4M4 7l1.2 4.6M4 7l4.2-1.7"/><circle cx="16" cy="6" r="1.2"/>',
 u_armour:'<path d="M12 3l7.5 2.8v5.7c0 4.8-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.7-7.5-9.5V5.8z"/><path d="M12 7.5v8M8.8 12.8l3.2 3.2 3.2-3.2"/>',
 u_tank:'<path d="M12 3l7.5 2.8v5.7c0 4.8-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.7-7.5-9.5V5.8z"/><path d="M12 8v7M8.5 11.5h7"/>',
 u_ranged:'<path d="M7 3.5c11 4.5 11 12.5 0 17M7 3.5v17M3 12h17M20 12l-4-3v6z"/>',
 u_charge:'<path d="M3 8h5M3 12h9M3 16h5M14 6.5l7 5.5-7 5.5z"/>',
 u_speed:'<path d="M9 3h5.5v8l5.5 3.5V20H8.5c-1 0-1.5-.7-1.5-1.6V3.5z"/><path d="M2.5 8h3M2.5 12h3M2.5 16h3"/>',
 u_global:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4"/><path d="M12 12h.01"/>',
 men:'<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-4 3-6 6-6s6 2 6 6M15 20c0-2.5 2-4 4-4s3 1.5 3 4"/>',
};
STAT_ICON.defence=STAT_ICON.armour; STAT_ICON.range=STAT_ICON.target; STAT_ICON.reload=STAT_ICON.clock;
/* Icônes de stats du jeu (img/stats/icon_stat_*.png, ui/skins/default de ui2.pack, copiées par tools/copy_icons.py) : utilisées
   à la place du tracé quand le jeu en a une ; le DPS estimé, le coût, l'entretien et les usages gardent leur tracé. */
const GAME_STAT={hp:"icon_stat_health",armour:"icon_stat_armour",defence:"icon_stat_defence",attack:"icon_stat_attack",charge:"icon_stat_charge_bonus",morale:"icon_stat_morale",speed:"icon_stat_speed",weapon:"icon_stat_damage",bow:"icon_stat_ranged_damage",range:"icon_stat_range",reload:"icon_stat_reload_time",ammo:"icon_stat_ammo",
 coin:"icon_treasury",upkeep:"icon_upkeep",calendar:"icon_turns_counter",clock:"icon_cooldown",
 vs_large:"modifier_icon_bonus_vs_large",vs_inf:"modifier_icon_bonus_vs_infantry",ap:"modifier_icon_armour_piercing",rap:"modifier_icon_armour_piercing_ranged",
 // usages du site : icône du jeu la plus proche (anti-X = modificateur « bonus contre X » du jeu)
 u_inf:"modifier_icon_bonus_vs_infantry",u_large:"modifier_icon_bonus_vs_large",u_armour:"modifier_icon_armour_piercing",u_ranged:"icon_stat_ranged_damage",u_tank:"icon_stat_armour",u_charge:"icon_stat_charge_bonus",u_speed:"icon_stat_speed"};
STAT_ICON.vs_large=STAT_ICON.target; STAT_ICON.vs_inf=STAT_ICON.target; STAT_ICON.ap=STAT_ICON.weapon; STAT_ICON.rap=STAT_ICON.bow;
const uic=k=>si("u_"+k);
const si=k=>GAME_STAT[k]?`<img class="si sig" src="img/stats/${GAME_STAT[k]}.png" alt="" onerror="this.remove()">`:`<svg class="si" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${STAT_ICON[k]||""}</svg>`;
/* Fiche d'unité : chaque stat avec son rang (« Top 8 % » / « Bottom 20 % ») et une barre remplie à valeur ÷ 95ᵉ centile du groupe de comparaison (pleine au-delà). */
let DPOOL="role_all"; // groupe de comparaison : même catégorie (tout le jeu), toutes les unités, ou périmètre affiché
const STAT_IC={cost:"coin",upkeep:"upkeep",rt:"calendar",mp:"coin",men:"men",hp:"hp",thp:"hp",ehp:"armour",arm:"armour",md:"defence",ld:"morale",ma:"attack",ch:"charge",dmg:"weapon",ap:"ap",str:"weapon",int:"clock",dps:"bolt",bvl:"vs_large",bvi:"vs_inf",rdmg:"bow",rap:"rap",rng:"range",rel:"reload",amm:"ammo",spd:"speed",dwc:"attack"};
/* Tuile : chiffres clés (PV totaux, armure, dégâts/s estimés, vitesse) et les deux meilleurs usages (icône + percentile), pour remplir la tuile avec de l'information utile */
const kfmt=v=>v>=10000?Math.round(v/1000)+"k":v>=1000?(v/1000).toFixed(1).replace(".",",")+"k":String(Math.round(v));
function cardStats(x){
 const u=x.u, dps=x.mel+x.rng, top=ARCHK.slice().sort((a,b)=>x.pct[b]-x.pct[a]).slice(0,2);
 const c=(ic,v,t)=>`<span class="cs1" title="${t}">${si(ic)}${v}</span>`;
 const sc=x.rg?(COSTON?x.score.toFixed(2):kfmt(x.score)):Math.round(x.score*100)+" %", wr=Math.round(((duelOf(u)||{}).wr||0)*100);
 const MET=x.rg?(COSTON?"efficacité (puissance ÷ coût), unités à distance":"puissance brute, unités à distance"):"taux de victoire en duels";
 return `<div class="cs sc">${c("target",sc,"Score de classement : "+MET+". Il fixe le tier et l'ordre dans le tier (décroissant)")}${c("attack",wr+" %","Taux de victoire en duels à coût équivalent (indicatif, sert à classer les unités de mêlée)")}</div><div class="cs">${c("hp",kfmt(u.men*u.hp),"PV totaux")}${c("armour",Math.round(u.armour),"Armure")}${c("bolt",kfmt(dps),"Dégâts par seconde estimés (mêlée + tir)")}${c("speed",Math.round(u.speed),"Vitesse")}</div>
  <div class="cu">${top.map(k=>`<span class="cu1" title="${ARCH[k]} : percentile ${x.pct[k]}">${uic(k)}${x.pct[k]}</span>`).join("")}</div>`;
}
const fmtv=v=>v>=1000?Math.round(v).toLocaleString("fr-FR"):(Math.round(v*10)/10).toString();
const rankTxt=p=>p==null?"":p>=50?`Top ${Math.max(1,Math.round(100-p))} %`:`Bottom ${Math.max(1,Math.round(p))} %`;
function srow(ic,label,val,fill,p,tip,clip){
 const col=p==null?"var(--gold3)":`hsl(${p*1.2},55%,50%)`;
 return `<div class="sr" title="${tip||""}"><div class="sh"><span>${si(ic)}${label}</span><b>${val}</b></div><div class="sb"><div class="bar"><i style="width:${fill}%;background:${col}"></i>${clip?'<span class="cap" title="Au-delà du 95ᵉ centile du groupe : barre pleine">▸</span>':""}</div>${p==null?"":`<span class="pb" style="background:hsl(${p*1.2},55%,62%)">${rankTxt(p)}</span>`}</div></div>`;
}
/* Valeurs de la fiche : une entrée par stat applicable (valeur, rang, remplissage de barre). Sert au résumé « En bref » et à la liste complète. */
/* Groupe de comparaison de la fiche : 3 boutons avec l'effectif de chaque groupe (« Ma sélection » seulement si elle diffère de tout le jeu) */
/* Nom du périmètre choisi dans « Race & faction » : la faction ou la race, ou « N sélections » */
function scopeName(){ const ks=keysOf(fsel.value); if(ks.length>1) return ks.length+" sélections"; const k=ks[0]; return k.startsWith(RACE)?D.cultures[k.slice(RACE.length)]:D.factions[k]; }
function dpoolBar(u){
 const multi=fsel.value!==ALL, cur=DPOOL==="scope"&&!multi?"all":DPOOL, n=p=>(p==="all"?D.units:p==="scope"?D.units.filter(v=>inScope(v,fsel.value)):D.units.filter(v=>v.role===u.role)).length;
 const opts=[["role_all",`${ROLES[u.role]||u.role}, tout le jeu`,`Comparer aux unités de la même catégorie (${ROLES[u.role]||u.role}) de tout le jeu`],["all","Tout le jeu","Comparer à toutes les unités du jeu"]].concat(multi?[["scope",scopeName(),`Comparer aux unités de « ${scopeName()} » (le filtre « Race & faction » du tier list)`]]:[]);
 return `<div class="dpool"><small>Comparée à</small><div class="dseg" role="group">${opts.map(([p,l,t])=>`<button type="button" data-p="${p}" title="${t}" class="${p===cur?"on":""}">${l}<i>${fmtv(n(p))}</i></button>`).join("")}</div></div>`;
}
function statList(u){
 const TS=window.TWW3Stats; if(!TS) return [];
 const pool=DPOOL==="all"?D.units:DPOOL==="scope"?D.units.filter(v=>inScope(v,fsel.value)):D.units.filter(v=>v.role===u.role);
 const arr=TS.stats(pool,`detail|${DPOOL}|${DPOOL==="scope"?fsel.value:""}|${DPOOL==="role_all"?u.role:""}`);
 const out=[];
 for(const s of TS.ST){ if(!TS.applies(s,u)) continue;
  const a=arr[s.k], v=s.v(u), p=TS.pct(s,u,a), raw=a.map(x=>s.d*x).sort((x,y)=>x-y), mx=raw[raw.length-1];  // valeurs brutes du groupe (a est trié par « qualité » : plus bas = mieux pour le coût, l'intervalle, le rechargement)
  const p95=raw[Math.floor(0.95*(raw.length-1))], ref=p95>0?p95:mx;                                     // barre = valeur ÷ 95ᵉ centile du groupe (au-delà : barre pleine ▸), pour que quelques valeurs extrêmes n'écrasent pas les autres barres
  const clip=ref>0&&v>ref, fill=ref>0?Math.min(100,Math.max(2,v/ref*100)):0, rank=a.length-TS.upper(a,s.d*v)+1;
  out.push({s,v,p,ref,mx,clip,fill,rank,n:a.length});
 }
 return out;
}
const EHP_TIP="PV totaux ajustés par l'armure et la défense au corps à corps : ce que l'unité peut encaisser avant de tomber. ";
const statTip=o=>`${o.s.k==="ehp"?EHP_TIP:""}${o.s.l} : ${o.rank}ᵉ sur ${o.n}${o.s.d<0?" (moins = mieux)":""} — 95ᵉ centile du groupe : ${fmtv(o.ref)} ; maximum : ${fmtv(o.mx)}`;
function statRows(list){ // liste complète, par groupe
 let h="",g="";
 for(const o of list){ if(o.s.g!==g){g=o.s.g;h+=`<h4>${g}</h4>`}
  h+=srow(STAT_IC[o.s.k]||"target",o.s.l,`${fmtv(o.v)}<small> · P95 ${fmtv(o.ref)}</small>`,o.fill,o.p,statTip(o),o.clip); }
 return h;
}
/* « En bref » : les 6 chiffres qui décident d'un recrutement, en tuiles (valeur + rang) */
const BRIEF=[["cost","Coût"],["ehp","Encaissement"],["dps","DPS / modèle"],["rdmg","Tir : dégâts"],["spd","Vitesse"]];
function briefTiles(list){
 const by=Object.fromEntries(list.map(o=>[o.s.k,o])), keys=["cost","ehp"].concat(by.dps?["dps"]:[],by.rdmg?["rdmg"]:[],["spd"]).slice(0,6);
 return `<div class="brief">${keys.filter(k=>by[k]).map(k=>{const o=by[k],lab=(BRIEF.find(b=>b[0]===k)||[k,o.s.l])[1];
  return `<div class="bt" title="${statTip(o)}"><small>${si(STAT_IC[k]||"target")}${lab}</small><b>${fmtv(o.v)}</b>${o.p==null?"":`<span class="pb" style="background:hsl(${o.p*1.2},55%,62%)">${rankTxt(o.p)}</span>`}</div>`}).join("")}</div>`;
}
/* « Pour quoi l'utiliser » : les 3 meilleurs usages en évidence, les autres repliés */
/* Fiche : factions d'où vient l'unité quand le périmètre en couvre plusieurs (toutes, une race ou une sélection multiple) */
function facBlock(u){
 const k=fsel.value; if(!(k===ALL||isRace(k)||isMulti(k))) return "";
 const fl=facsInScope(u,k); if(!fl.length) return "";
 return `<div class="dfac"><small>Disponible chez</small><div class="fis">${facIcons(u,k)}</div></div>`;
}
function usageBlock(x){
 const ks=ARCHK.slice().sort((a,b)=>x.pct[b]-x.pct[a]), top=ks.slice(0,3), rest=ks.slice(3);
 const row=k=>srow("u_"+k,ARCH[k],x.pct[k],x.pct[k],x.pct[k],"Percentile parmi les unités affichées");
 return `<h4>Pour quoi l'utiliser</h4>${top.map(row).join("")}<details class="more"><summary>Autres usages</summary>${rest.map(row).join("")}</details>`;
}
function detail(x){const u=x.u,m=u.melee,r=u.ranged;
 const dt=$("#detail"), st=dt.scrollTop, prevUnit=dt.dataset.unit; dt.hidden=false; dt.dataset.unit=u.id; dt.style.setProperty("--tc",`var(--${x.tier})`); dt.dataset.tier=x.tier;
 const list=statList(u), wasOpen=prevUnit===u.id?dt.querySelector("details.all")?.open:false, wasAbilOpen=dt.querySelector("details.abil")?.open;
 dt.innerHTML=`<div class="dtop"><div class="dh"><div><h3 title="Tier ${x.tier} — clé de l'unité dans les tables : ${u.id}">${u.name}</h3><small>${catIc(u)}${ROLES[u.role]||u.role}${mountIc(u)}</small>${rortag(u)}${gtier(u)}${attrs(u)}</div><button class="x" id="close">✕</button></div>
 ${dpoolBar(u)}
 <div class="dbrief">${fullPic(u)}${briefTiles(list)}</div></div>
 ${facBlock(u)}
 ${usageBlock(x)}
 ${duelPanel(u)}
 ${abilBlock(u)}
 <details class="more all"><summary>Toutes les statistiques (${list.length})</summary>${statRows(list)}
  <dl><dt>${si("bolt")}Puissance</dt><dd>${Math.round(x.power)}</dd><dt>${si("coin")}Coût effectif</dt><dd>${Math.round(x.cost)}</dd><dt>${si("bolt")}Efficacité</dt><dd>${(x.value*1000).toFixed(1)}</dd></dl></details>`;
 if(wasOpen)dt.querySelector("details.all").open=true;
 if(prevUnit===u.id&&wasAbilOpen)dt.querySelector("details.abil").open=true; fillAbil(dt,u);
 dt.scrollTop=st;
}
$("#detail").addEventListener("click",e=>{ const b=e.target.closest(".dseg button"); if(b){ DPOOL=b.dataset.p; saveUI(); syncDetail(window._us||[]); } }); // changer de groupe de comparaison redessine la fiche
/* Mémorisation des filtres et réglages (PREF « ui », localStorage) : faction, catégories, usages, recherche, seigneurs & héros, mode, métrique, rang, typologie, vue, curseurs, groupe de comparaison.
   Les DLC, les bataillons de renom, la langue, l'onglet, les armées du combat et les options de « Unités par faction » ont leur propre entrée. */
function saveUI(){ if(!uiReady) return; PREF.set("ui",{fac:fsel.value,roles:[...role],typo:[...TYPO],q:$("#q").value,heroes:$("#heroes").checked,mode:$("#mode").value,metric:$("#metric").value,scope:$("#scope").value,view,S,dpool:DPOOL}); }
let uiReady=false;
(()=>{ const s=PREF.get("ui",null); if(s){
  if(okFacKey(s.fac)){ setFac(fsel,s.fac); fsel.dispatchEvent(new Event("change")); }
  (s.roles||[]).filter(r=>roles.includes(r)).forEach(r=>role.add(r)); (s.typo||[]).filter(k=>ARCHK.includes(k)).forEach(k=>TYPO.add(k));
  if(typeof s.q==="string") $("#q").value=s.q; $("#heroes").checked=!!s.heroes;
  for(const [id,v] of [["mode",s.mode],["scope",s.scope]]) if(v&&[...$("#"+id).options].some(o=>o.value===v)) $("#"+id).value=v;
  if(["tiers","table","matrix"].includes(s.view)){ view=s.view; $("#viewsel").value=view; }
  if(["role_all","all","scope"].includes(s.dpool)) DPOOL=s.dpool;
  for(const w of W){ const v=s.S&&s.S[w[0]]; if(typeof v==="number"&&v>=w[2]&&v<=w[3]){ S[w[0]]=v; $("#"+w[0]).value=v; $("#v_"+w[0]).textContent=v; } }
  syncCost();
 }
 uiReady=true; })();
render();
