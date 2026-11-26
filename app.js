"use strict";
const $ = s => document.querySelector(s);
const ROLES = {inf_melee:"Infanterie CàC",inf_ranged:"Tireurs",cav_melee:"Cavalerie CàC",cav_ranged:"Cavalerie à distance",monster:"Monstres",chariot:"Chars",artillery:"Artillerie",beast:"Bêtes de guerre",lord:"Seigneurs",hero:"Héros"};
const TIERS = [["S",.10],["A",.30],["B",.55],["C",.80],["D",.93],["F",1]];
const W = [ // [id,label,min,max,default,step,group]
 ["wMelee","Poids mêlée",0,2,1,.1,"w1"],["wRanged","Poids distance",0,2,1,.1,"w1"],["wDef","Poids survie (PV+armure)",0,2,1,.1,"w1"],
 ["wMob","Poids vitesse",0,2,.5,.1,"w1"],["wMor","Poids moral",0,2,.5,.1,"w1"],
 ["turns","Durée d'usage (tours d'entretien)",0,60,20,1,"w2"],["turnVal","Valeur d'un tour d'attente (or)",0,500,100,10,"w2"],
 ["tArm","Bonus armure (%)",0,50,0,1,"w3"],["tDmg","Bonus dégâts (%)",0,50,0,1,"w3"],["tHp","Bonus PV (%)",0,50,0,1,"w3"],
 ["tCost","Réduction coût recrutement (%)",0,50,0,1,"w3"],["tUp","Réduction entretien (%)",0,50,0,1,"w3"],["tRt","Tours de recrutement en moins",0,2,0,1,"w3"]];
const ARCH = {global:"Typologie : globale (tout usage)",inf:"Anti-infanterie",large:"Anti-large (monstres, cavalerie)",armour:"Anti-armure",tank:"Encaisser la ligne de front",ranged:"Dégâts à distance",charge:"Charge / briseur de flanc",speed:"Mobilité"};
const ARCHK = Object.keys(ARCH).filter(k=>k!=="global");
Object.entries(ARCH).forEach(([k,l])=>$("#arch").add(new Option(l,k)));
const S = {}; let view = "tiers", role = new Set(), sortKey = "score", sortDir = -1;
const factions = D.factions;
$("#demo").hidden = !D.demo;
$("#how").innerHTML = "Puissance = √(PV effectifs × dégâts/s) × bonus vitesse × bonus moral. PV effectifs = hommes × PV ÷ (1 − armure/200). Dégâts : (dégâts + 0,7×perforants) × chance de toucher ÷ intervalle (mêlée, pondéré par la charge et le bonus vs grands) ; tireurs : projectiles × dégâts ÷ rechargement × portée. Coût effectif (campagne) = recrutement + entretien × durée + tours d'attente × valeur du tour. Les typologies comparent chaque unité à des cibles de référence (infanterie moyenne, grande cible, très blindé) ou à un attaquant moyen (encaisser). Tier = rang en percentile (S top 10 %, A 20 %, B 25 %, C 25 %, D 13 %, F 7 %). C'est un modèle simplifié et ajustable : il ne remplace pas le jugement.";
for (const [id,l,mn,mx,df,st,g] of W) { S[id]=df;
 $("#"+g).insertAdjacentHTML("beforeend",`<div class="sl"><span>${l}</span><b id="v_${id}">${df}</b><input type="range" id="${id}" min="${mn}" max="${mx}" step="${st}" value="${df}"></div>`);
 $("#"+id).oninput = e => { S[id]=+e.target.value; $("#v_"+id).textContent=e.target.value; render(); }; }
const fsel=$("#faction"); initPicker(fsel,ALL); // sélection de départ : toutes les factions
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
  return `<button data-k="${k}" class="${on?"on":""}" ${dis?"disabled":""} title="${ARCH_RULE[k]}${dis?" — aucune unité de la sélection actuelle":""}">${ARCH[k]} <small>(${n})</small></button>`;}).join("")+(state.size?`<button data-k="" class="clr">Effacer</button>`:"");
 return items.filter(x=>ok(x,null));
}
const TYPO=new Set();
$("#typo").onclick=e=>{const b=e.target.closest("button");if(!b||b.disabled)return;const k=b.dataset.k;k===""?TYPO.clear():TYPO.has(k)?TYPO.delete(k):TYPO.add(k);render();};
["faction","heroes","mode","metric","scope","arch","q"].forEach(i=>$("#"+i).addEventListener("input",render));
$("#viewsel").onchange=()=>{view=$("#viewsel").value;render()};
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
const DU = window.TWW3_DUELS || null, UNIT_BY_ID = Object.fromEntries(D.units.map(u => [u.id, u]));
const duelMode = () => $("#mode").value === "mp" ? "cost" : "upkeep";
const duelOf = (u, mode) => DU && DU.modes[mode || duelMode()] ? DU.modes[mode || duelMode()][u.id] || null : null;
function duelPanel(u){
 if(!DU) return "";
 const d=duelOf(u), rl=r=>ROLES[r]||r, nm=id=>(UNIT_BY_ID[id]||{name:id}).name;
 if(!d) return `<h4>Résultats de duels</h4><small>Pas de duels précalculés pour cette unité (entretien ou coût nul).</small>`;
 const ranged=d.basis==="dps", lbl=duelMode()==="cost"?"à coût de recrutement équivalent":"à entretien équivalent";
 const rows=Object.keys(d.vs).filter(r=>ranged?d.dps[r]>0:d.vs[r]!=null).map(r=>`<dt style="padding-left:8px">${ranged?"DPS /100 vs ":"Victoires vs "}${rl(r)}</dt><dd>${ranged?d.dps[r]:Math.round(d.vs[r]*100)+" %"}</dd>`).join("");
 const top=l=>l.slice(0,3).map(([id,m])=>`${nm(id)} (${m>0?"+":""}${Math.round(m*100)})`).join(", ");
 return `<h4>Résultats de duels (${lbl})</h4><dl><dt>${si("attack")}Taux de victoire global</dt><dd>${Math.round(d.wr*100)} %</dd>
  <dt>${si("target")}Typologie « anti » (${ranged?"efficacité de DPS":"duels"})</dt><dd>${d.anti.length?d.anti.map(([r,p])=>`${rl(r)} (top ${Math.max(1,100-p)} %)`).join(", "):"aucune dominante"}</dd>${rows}</dl>
  <small>Bat le mieux : ${top(d.best)}<br>Battue par : ${top(d.worst)}</small>
  ${DU.caveat.includes(u.id)?`<p class="dn">Seigneur / héros : sorts, capacités et objets non modélisés, résultats indicatifs.</p>`:""}
  ${ranged?`<p class="dn">Unité à distance : la typologie vient du DPS contre un défenseur moyen de chaque catégorie, pas de duels contre de la mêlée.</p>`:""}`;
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
 const f=fsel.value, seen=new Set();
 let us=D.units.filter(u=>inScope(u,f)&&(withLH||!["lord","hero"].includes(u.role))).map(u=>({u,...score(u)}));
 us=us.filter(x=>!seen.has(x.u.id)&&seen.add(x.u.id));
 const key=$("#metric").value, ar=$("#arch").value;
 us.forEach(x=>x.score= ar==="global" ? x[key] : key==="value" ? x.arche[ar]/Math.max(1,x.cost) : x.arche[ar]);
 us.forEach(x=>{x.pct={};});
 ARCHK.forEach(k=>{const v=x=>key==="value"?x.arche[k]/Math.max(1,x.cost):x.arche[k];const s=us.slice().sort((a,b)=>v(a)-v(b));s.forEach((x,i)=>x.pct[k]=us.length>1?Math.round(i/(us.length-1)*100):100);});
 if(ar!=="global") us=us.filter(x=>x.arche[ar]>0);
 const groups={}; us.forEach(x=>(groups[$("#scope").value==="role"?x.u.role:"all"]??=[]).push(x));
 for(const g of Object.values(groups)){ g.sort((a,b)=>a.score-b.score);
  g.forEach((x,i)=>{const p=(i+.5)/g.length; x.tier=TIERS.find(t=>1-p<=t[1])[0]; });}
 return us;
}
/* Pastilles de catégories : « Nom (nombre d'unités disponibles) », grisées s'il n'y en a aucune. cnt(r) = effectif pour la catégorie r (null = toutes). */
function roleChips(list,sel,cnt){
 return `<button data-r="" class="${sel.size?"":"on"}">Toutes (${cnt(null)})</button>`+list.map(r=>{const n=cnt(r),on=sel.has(r);
  return `<button data-r="${r}" class="${on?"on":""}" ${!n&&!on?"disabled":""}>${ROLES[r]||r} (${n})</button>`;}).join("");
}
function render(){
 // Seigneurs et héros : exclus de « Toutes » sauf si la case est cochée, mais toujours accessibles (et comptés) via leurs pastilles « Seigneurs » / « Héros »
 const incl=$("#heroes").checked, LH=x=>x.u.role==="lord"||x.u.role==="hero", shown=x=>role.size?role.has(x.u.role):(incl||!LH(x));
 const wantLH=incl||role.has("lord")||role.has("hero"), q=$("#q").value.toLowerCase();
 let us=compute(wantLH);                       // classement : seigneurs/héros seulement s'ils sont affichés
 const pool=wantLH?us:compute(true);           // effectifs des pastilles : tous les seigneurs/héros comptés, même masqués
 const byName=pool.filter(x=>x.u.name.toLowerCase().includes(q));
 const cnt=r=>byName.filter(x=>(r?x.u.role===r:(incl||!LH(x)))&&[...TYPO].every(k=>canDo(x.u,k))).length; // périmètre, recherche et usages actifs
 [...role].forEach(r=>{if(!cnt(r))role.delete(r);}); // une catégorie devenue vide est retirée de la sélection
 $("#roles").innerHTML=roleChips(roles,role,cnt);
 us=us.filter(x=>x.u.name.toLowerCase().includes(q)&&shown(x));
 us=typoApply(us,x=>x.u,TYPO,$("#typo"));
 $("#tiers").hidden=view!=="tiers"; $("#table").hidden=view!=="table"; $("#matrix").hidden=view!=="matrix";
 $("#fban").innerHTML=factionBanner(fsel.value,us.length);
 const all=fsel.value===ALL||isRace(fsel.value), fn=u=>all?`<div class="f">${u.factions.length} factions</div>`:"";
 const cardInfo=x=>`${ROLES[x.u.role]||x.u.role} · ${Math.round(x.cost)} or`;
 if(view==="tiers"){
  const col={S:"--S",A:"--A",B:"--B",C:"--C",D:"--D",F:"--F"};
  $("#tiers").innerHTML=TIERS.map(([t])=>{const l=us.filter(x=>x.tier===t).sort((a,b)=>b.score-a.score);
   return `<div class="row"><div class="lab" style="background:var(${col[t]})">${t}</div><div class="cards">${l.map(x=>`<div class="card" data-id="${x.u.id}">${portrait(x.u)}<div class="ct"><b>${x.u.name}</b><small>${cardInfo(x)}</small>${fn(x.u)}</div></div>`).join("")}</div></div>`}).join("");
 } else if(view==="matrix"){
  const mk=sortKey.startsWith("m:")?sortKey.slice(2):null;
  us.sort((a,b)=>((mk?a.pct[mk]-b.pct[mk]:a.score-b.score)||0)*sortDir);
  const best=x=>ARCHK.reduce((p,k)=>x.pct[k]>x.pct[p]?k:p,ARCHK[0]);
  const cell=(x,k)=>{const p=x.pct[k];return `<td style="background:hsl(${p*1.2},55%,62%);color:#111;text-align:center" title="Valeur brute : ${Math.round(x.arche[k])}">${p}</td>`};
  const SH={inf:"Anti-infanterie",large:"Anti-gros",armour:"Anti-armure",tank:"Encaisser",ranged:"Distance",charge:"Charge",speed:"Mobilité"}; // libellés courts : la matrice tient dans la largeur
  $("#matrix").innerHTML=`<table><colgroup><col class="c-n"><col class="c-r">${ARCHK.map(()=>'<col class="c-a">').join("")}<col class="c-b"></colgroup><tr><th data-k="score">Unité</th><th>Rôle</th>${ARCHK.map(k=>`<th data-k="m:${k}" title="${ARCH[k]}" style="text-align:center">${SH[k]||ARCH[k]}</th>`).join("")}<th>Meilleur usage</th></tr>`+
   us.map(x=>`<tr data-id="${x.u.id}"><td>${x.u.name}</td><td>${ROLES[x.u.role]||x.u.role}</td>${ARCHK.map(k=>cell(x,k)).join("")}<td>${SH[best(x)]||ARCH[best(x)]}</td></tr>`).join("")+
   `</table><p style="padding:8px;color:var(--m);font-size:12px">Chaque case = percentile (0-100) de l'unité (rapporté au coût si le mode « efficacité » est choisi) parmi les unités affichées de la faction pour cet usage. 100 = la meilleure pour ça. Cliquer un en-tête trie.</p>`;
 } else {
  const cols=[["Unité",x=>x.u.name],["Tier",x=>x.tier],["Rôle",x=>ROLES[x.u.role]],["Score",x=>x.score],["Puissance",x=>x.power],["Coût eff.",x=>x.cost],["PV eff.",x=>x.ehp],["Mêlée/s",x=>x.mel],["Dist./s",x=>x.rng],["Recrut.",x=>x.rt],["Entretien",x=>x.u.upkeep]];
  const sk=cols.find(c=>c[0]===sortKey)||cols[3]; us.sort((a,b)=>{const A=sk[1](a),B=sk[1](b);return (A>B?1:A<B?-1:0)*sortDir});
  const f=v=>typeof v==="number"?(v>=100?Math.round(v):v.toFixed(2)):v;
  $("#table").innerHTML=`<table><tr>${cols.map(c=>`<th data-k="${c[0]}">${c[0]}</th>`).join("")}</tr>${us.map(x=>`<tr data-id="${x.u.id}">${cols.map(c=>`<td>${f(c[1](x))}</td>`).join("")}</tr>`).join("")}</table>`;
 }
 window._us=us; syncDetail(us);
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
};
const si=k=>`<svg class="si" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${STAT_ICON[k]||""}</svg>`;
function detail(x){const u=x.u,m=u.melee,r=u.ranged;
 $("#detail").hidden=false; $("#detail").dataset.unit=u.id; $("#detail").innerHTML=`<button class="x" id="close">✕</button><div class="dh">${portrait(u,"big")}<div><h3 title="Clé de l'unité dans les tables : ${u.id}">${u.name} — Tier ${x.tier}</h3><small>${ROLES[u.role]||u.role}</small></div></div>
 <dl><dt>${si("hp")}Hommes × PV</dt><dd>${u.men} × ${u.hp}</dd><dt>${si("armour")}Armure</dt><dd>${u.armour}</dd><dt>${si("attack")}Attaque / Défense</dt><dd>${u.ma} / ${u.md}</dd><dt>${si("charge")}Charge</dt><dd>${u.charge}</dd><dt>${si("morale")}Moral</dt><dd>${u.ld}</dd><dt>${si("speed")}Vitesse</dt><dd>${u.speed}</dd>
 <dt>${si("weapon")}Arme (dégâts / perf. / intervalle)</dt><dd>${m.dmg} / ${m.ap} / ${m.interval}s</dd><dt>${si("target")}Bonus vs grands / infanterie</dt><dd>${m.bvl} / ${m.bvi}</dd>
 ${r?`<dt>${si("bow")}Distance (dég./perf.)</dt><dd>${r.dmg} / ${r.ap}</dd><dt>${si("clock")}Portée / recharg.</dt><dd>${r.range} / ${r.reload}s</dd><dt>${si("ammo")}Projectiles par volée / munitions (volées)</dt><dd>${r.shots} / ${r.ammo}</dd><dt>${si("bow")}Dégâts de tir par 10 s, par tireur (calculé)</dt><dd>${Math.round((r.dmg+r.ap)*r.shots*10/r.reload)}</dd>`:""}
 <dt>${si("coin")}Coût / entretien</dt><dd>${u.cost} / ${u.upkeep}</dd><dt>${si("coin")}Coût MP</dt><dd>${u.mpCost}</dd><dt>${si("calendar")}Recrutement</dt><dd>${u.recruitTurns} tour(s)</dd>
 <dt>${si("target")}Profil d'usage (percentile)</dt><dd></dd>${ARCHK.map(k=>`<dt style="padding-left:8px">${ARCH[k]}</dt><dd>${x.pct[k]}</dd>`).join("")}<dt>${si("bolt")}Puissance</dt><dd>${Math.round(x.power)}</dd><dt>${si("coin")}Coût effectif</dt><dd>${Math.round(x.cost)}</dd><dt>${si("bolt")}Efficacité</dt><dd>${(x.value*1000).toFixed(1)}</dd></dl>${duelPanel(u)}`;}
render();
