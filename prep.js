"use strict";
const D = window.TWW3_DATA;
/* Prépare la hiérarchie race -> faction : calcule u.factions (clés des factions où l'unité est disponible).
   Unités : groupe militaire de la faction (recrutement) ou permission explicite ; seigneurs/héros : par race. */
(() => {
  const byGroup = {}, byCulture = {};
  for (const [f, i] of Object.entries(D.facInfo || {})) { (byGroup[i.group] ??= []).push(f); (byCulture[i.culture] ??= []).push(f); }
  for (const u of D.units) {
    const s = new Set(u.facs || []);
    (u.groups || []).forEach(g => (byGroup[g] || []).forEach(f => s.add(f)));
    (u.cultures || []).forEach(c => (byCulture[c] || []).forEach(f => s.add(f)));
    u.factions = [...s];
  }
})();
function facsOfCulture(c) {
  return Object.keys(D.facInfo).filter(f => D.facInfo[f].culture === c)
    .sort((a, b) => D.facInfo[a].sort - D.facInfo[b].sort || D.factions[a].localeCompare(D.factions[b]));
}
/* Sélecteur hiérarchique : race puis faction. facEl.value reste la clé de la faction. */
function initPicker(raceEl, facEl, defaultCulture) {
  D.cultureOrder.forEach(c => raceEl.add(new Option(D.cultures[c], c)));
  const fill = () => { facEl.innerHTML = ""; facsOfCulture(raceEl.value).forEach(f => facEl.add(new Option(D.factions[f], f))); };
  raceEl.addEventListener("change", () => { fill(); ["input", "change"].forEach(t => facEl.dispatchEvent(new Event(t, {bubbles: true}))); });
  if (defaultCulture && D.cultures[defaultCulture]) raceEl.value = defaultCulture;
  fill();
}
