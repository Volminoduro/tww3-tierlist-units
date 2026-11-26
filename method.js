"use strict";
/* Onglet « Méthode » : provenance des données, valeurs de référence, formules (reprises de la fiche d'unité du jeu) et limites.
   Les numéros de commit / de build viennent de data/units.js (meta), écrits par tools/convert_rpfm.py. */
(() => {
  const m = D.meta || {}, src = m.sourceUrl || "https://github.com/Shazbot/wh3-dump", short = (m.commit || "").slice(0, 8);
  const commit = m.commit ? `<a href="${src}/commit/${m.commit}" target="_blank" rel="noopener"><code>${short}</code></a>` : "<em>inconnu</em>";
  const tbl = t => `<a href="${src}/blob/${m.commit || "master"}/db/${t}_tables/data__.tsv" target="_blank" rel="noopener"><code>${t}</code></a>`;
  const card = (t, b) => `<div class="mcard"><b>${t}</b><p>${b}</p></div>`;
  const d = m.commitDate ? new Date(m.commitDate).toLocaleDateString("fr-FR") : "";
  $("#method").innerHTML = `
  <h2>D'où viennent les chiffres</h2>
  <p>Chaque nombre vient des tables de base de données du jeu, telles que publiées en TSV (export RPFM) par le dépôt public
  <a href="${src}" target="_blank" rel="noopener">Shazbot/wh3-dump</a>. Ce site ne mesure rien en jeu : il lit ces tables, en tire les stats de la fiche d'unité et fait des calculs dessus.</p>
  <div class="mcard"><b>Version des données</b><p>
    Jeu : <b>${m.patch || "inconnu"}</b>${m.build ? `, build ${m.build}` : ""}${m.buildDate ? ` (${m.buildDate})` : ""}<br>
    Dump : commit ${commit}${d ? `, du ${d}` : ""}${m.commitSubject ? ` — « ${m.commitSubject} »` : ""}<br>
    ${m.units || D.units.length} unités importées. <small>Le workflow de génération (<code>.github/workflows/build-data.yml</code>) part d'un seul commit du dump et l'enregistre ici : une page ne mélange jamais deux versions.</small><br>
    <small>Attention : ce dump peut ne pas contenir les derniers correctifs (hotfixes) du jeu. En cas de doute, les tables ci-dessous permettent de retrouver chaque ligne (la clé technique d'une unité s'affiche en infobulle sur le titre de sa fiche).</small></p></div>

  <h2>Valeurs de référence</h2>
  <p>Les valeurs sont celles de la fiche d'unité du jeu à la <b>taille d'unité « Ultra »</b> (nombre d'hommes de la table), <b>rang 0, sans compétence, objet, technologie ni bonus</b>.
  Seuls les curseurs de bonus et le menu « Seigneur » de l'onglet Combat les modifient, et uniquement dans le simulateur.</p>

  <h2>Formules reprises de la fiche d'unité</h2>
  <p>Ces formules sont celles que décrit la page de méthode de <a href="https://twdatabase.com" target="_blank" rel="noopener">TW Database</a> (voir « Crédits » plus bas) ; nous les avons réimplémentées nous-mêmes à partir des tables du jeu.
  Certaines valeurs sont des cellules de table telles quelles (attaque, défense, moral, bonus de charge, coût, entretien) ; d'autres combinent plusieurs tables :</p>
  <div class="mgrid">
  ${card("Santé", "(PV du soldat + PV de la monture + bonus de PV) × modèles. Le simulateur utilise la valeur totale, répartie par modèle combattant.")}
  ${card("Santé de l'artillerie", "(équipage + pièces) × bonus + équipage × PV du soldat + pièces × PV de la pièce, avec équipage = hommes − pièces. La fiche compte les pièces.")}
  ${card("Santé des chars et véhicules", "(équipage + machines tractées) × PV du soldat + machines × (PV de la machine + bonus) + bêtes de trait × PV d'une bête. Les machines sont « tractées » quand il y a des bêtes de trait.")}
  ${card("Vitesse", "Vitesse de course (ou de vol si elle est plus élevée) de la monture, de la machine ou du soldat, × 10. Le simulateur la convertit en mètres par seconde (× 0,24) : cette conversion est une approximation.")}
  ${card("Force d'arme", "Dégâts de base + dégâts perforants de l'arme de mêlée principale ; les bonus contre l'infanterie et contre les grands sont indiqués à part.")}
  ${card("Munitions", "Munitions ÷ tirs par volée : la fiche compte des volées.")}
  ${card("Dégâts de tir", "Base + perforants par projectile, plus les dégâts d'explosion là où le projectile explose (table des explosions). Les dégâts de zone sur plusieurs cibles ne sont pas modélisés.")}
  ${card("Dégâts par 10 s (calculé)", "Dégâts par projectile × (projectiles × tirs par volée × rafale) × 10 ÷ temps de rechargement. Ce n'est pas un nombre affiché par le jeu. Si la table n'a pas de temps de rechargement, l'arme à distance n'est pas modélisée plutôt qu'inventée.")}
  </div>

  <h2>Où vérifier chaque stat</h2>
  <p>Dans le dump : ${tbl("main_units")} (hommes, coût, entretien, temps de recrutement = <code>create_time</code>, caste), ${tbl("land_units")} (attaque, défense, moral, charge, armure, bonus de PV, munitions, arme),
  ${tbl("battle_entities")} (PV et vitesses), ${tbl("unit_armour_types")} (valeur d'armure), ${tbl("melee_weapons")} (dégâts de mêlée),
  ${tbl("missile_weapons")} et ${tbl("projectiles")} (tir), ${tbl("projectiles_explosions")} (explosions), ${tbl("battlefield_engines")} (artillerie et véhicules).
  Les groupes de recrutement viennent de ${tbl("units_to_groupings_military_permissions")} et les factions de ${tbl("custom_battle_factions")}.</p>

  <h2>Ce que le site ajoute (calculs propres, pas des nombres du jeu)</h2>
  <ul>
    <li><b>Puissance, tiers et typologies d'usage</b> : formules simplifiées (voir « Comment c'est calculé ? » dans l'onglet Tier list), réglables.</li>
    <li><b>Simulateur de combat et duels précalculés</b> (à coût de recrutement équivalent) : un même fichier (<code>sim.js</code>) pour le site et pour les calculs de duels. Modèle approximatif : pas de ciblage ni de flanquement, moral simplifié, précision des tirs fixe.</li>
    <li><b>Effets par défaut du seigneur</b> : seuls les effets de stats d'unités, non conditionnels, de l'effet de départ et des compétences innées.</li>
  </ul>

  <h2>Crédits</h2>
  <ul>
    <li><b><a href="https://twdatabase.com" target="_blank" rel="noopener">TW Database</a></b> : la page de méthode de ce site nous a servi de modèle. Nous leur devons l'idée de présenter la provenance des chiffres, la valeur de référence (taille Ultra, rang 0, sans compétence, objet, technologie ni bonus),
    la liste des formules de la fiche d'unité (santé des unités, de l'artillerie et des véhicules, vitesse, munitions en volées, dégâts de tir avec explosions, dégâts par 10 s) et le principe de ne jamais mélanger deux versions du jeu.
    Cette méthode nous a aussi permis de repérer et corriger des erreurs dans notre import. Nous ne reprenons ni leurs pages, ni leurs données, ni leur code : tout est recalculé ici à partir des tables ci-dessous.</li>
    <li><b><a href="${src}" target="_blank" rel="noopener">Shazbot/wh3-dump</a></b> : les tables du jeu en TSV, sans lesquelles ce site n'existerait pas. Elles sont exportées avec <b>RPFM</b>, l'outil de la communauté pour les fichiers du jeu.</li>
    <li><b>Creative Assembly / SEGA / Games Workshop</b> : le jeu <i>Total War: Warhammer III</i> et son univers, dont ce projet de fan n'est pas affilié.</li>
  </ul>

  <h2>Limites connues</h2>
  <ul>
    <li>Pas de sorts, capacités, compétences à choisir, technologies, bâtiments, objets ni effets de faction hors seigneur de départ.</li>
    <li>Monstres portant un équipage : le bonus de PV va au monstre une seule fois et l'équipage est ajouté aux PV (formule de la fiche) ; seul le monstre combat dans le simulateur, les armes de l'équipage ne sont pas modélisées. Rangs et expérience : ignorés.</li>
    <li>Toutes les comparaisons de coût (duels, rendement et équilibrage des armées du Combat) se font sur le <b>coût de recrutement</b>, pour traiter toutes les unités de la même façon : certaines factions (Rois des Tombes, Hommes-Bêtes…) n'ont pas d'entretien dans les tables. L'entretien reste affiché à titre d'information.</li>
    <li>Ce site est généré par une IA : une erreur est possible, merci de recouper avec le jeu.</li>
  </ul>`;
  const f = $("#foot-meta");
  if (f && m.patch) f.innerHTML = `Données : ${m.patch}${m.build ? " build " + m.build : ""}, dump <a href="${src}" target="_blank" rel="noopener">wh3-dump</a>${short ? " commit " + short : ""}. Méthode inspirée de <a href="https://twdatabase.com" target="_blank" rel="noopener">TW Database</a> — <a href="#" data-goto="method">détails et crédits</a>`;
  document.addEventListener("click", e => { const g = e.target.closest("[data-goto]"); if (g) { e.preventDefault(); document.querySelector(`#nav [data-tab=${g.dataset.goto}]`).click(); scrollTo(0, 0); } });
})();
