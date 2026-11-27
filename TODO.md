# TODO

Chantiers décidés, pas encore commencés. Les notes ci-dessous viennent de l'exploration faite dans la conversation de conception.

## 0. Profil de campagne GLOBAL (cadre commun des points 1, 3 et 4)

**Décision** : le niveau du seigneur, ses compétences, les technologies de la faction et les autres bonus de faction ne sont **pas** un réglage de l'onglet Combat : c'est un **profil de campagne global**, appliqué à **tout** le site (tier list, matrice, unités par faction, fiche d'unité, combat). Exemple d'usage : dans une campagne Légion des Tertres, le tier list dit que le lancier et le squelette sont S ; avec les technologies et le seigneur de la campagne boosté, le classement peut changer (le Spectre de Cain peut devenir meilleur).

**Principe technique** : un profil = faction (ou seigneur choisi) + niveau + compétences + technologies. Il produit des modificateurs **par unité** (`mods` : ma, md, arm, ld, charge, ws, ms, spd, hp, ammo, range — déjà gérés par `sim.js` pour les effets de seigneur par défaut). Le tier list (`app.js`, `score()` et usages), les stats de la fiche (`browse.js`) et le combat appliquent ces `mods` aux stats avant de calculer ; les rangs « Top / Bottom % » se recalculent sur les stats modifiées. Les duels précalculés restent à profil par défaut (indiqué dans la page) ; à terme, calcul à la volée pour le profil actif.
**À décider** : où règle-t-on le profil (barre latérale, réglage « Ma campagne » mémorisé dans `localStorage`), et comment l'afficher pour qu'on sache toujours qu'il est actif.

## 1. Niveau et compétences des seigneurs / héros (profil global, voir point 0)

**Décision** : curseur automatique (pas de choix compétence par compétence).

**Idée** : réglage « Niveau du seigneur » (1 à 40), dans le profil global (et non plus seulement par armée du Combat). Le budget de points = niveau − 1 + points de départ. Le site dépense ces points automatiquement dans les bonus d'armée, en priorisant le gain par point. Bouton « Tout au max » = meilleur cas. Les duels précalculés restent au niveau et aux compétences par défaut. Même mécanisme pour les héros (leurs arbres sont dans le dump).

**Ce que contiennent les tables** (dump Shazbot/wh3-dump) :
- `character_skill_node_sets` (594 arbres, par `agent_subtype_key`) → `character_skill_node_set_items` → `character_skill_nodes` (`tier`, `indent`, `points_on_creation`) → `character_skills` (`unlocked_at_rank`) ;
- `character_skill_level_to_effects_junctions` : effet, `level` (1 à 3, rarement 4), `effect_scope` (`to_force_own` = armée, `character_own` = seigneur seul, ennemi…), `value` ;
- `character_skill_node_links` (prérequis entre nœuds) ;
- la portée sur les unités vient déjà de `effect_bonus_value_ids_unit_sets` (voir `tools/effects_extract.py`).

**Ordre de grandeur** : Karl Franz a 11 compétences d'armée à effet de stat = 21 points pour tout prendre au max (≈ +25 attaque, +20 armure, +20 % vitesse, +60 % munitions, +40 % force de tir en sommant sans tenir compte des unités ciblées).

**À vérifier d'abord** (risque principal) :
- la valeur d'un niveau est-elle le **total à ce niveau** ou un **supplément** ajouté aux niveaux précédents ? Les exemples lus sont ambigus ; vérifier avec les textes de localisation (`effects_description_*`) ;
- le lien entre `unlocked_at_rank`, `tier` du nœud et niveau du seigneur (la majorité des compétences sont à rang 0) ;
- prérequis (`character_skill_node_links`, `required_num_parents`) à respecter dans l'allocation automatique.

**Hors périmètre** : effets conditionnels (terrain, embuscade, race adverse), sorts, objets, capacités spéciales du seigneur.

**Fichiers concernés** : `tools/effects_extract.py` (extraction des niveaux), `data/effects.js`, `sim.js` (`mods` par unité, déjà en place), `battle.js` (UI).

## 2. Tier list des duels de compositions (par coût ou non)

**But** : classer des **compositions d'armée** (≤ 20 unités, protection de l'arrière, budget de recrutement ou sans budget), pas seulement des unités. À faire après le point 1 si la composition inclut un seigneur à un niveau donné.

**Contrainte centrale** : ne pas énumérer toutes les compositions faisables (explosion combinatoire, et poids des données). Pistes à étudier :
- **Réduire l'espace** : par faction, ne garder que les unités non dominées (front de Pareto coût / puissance / usage) à partir des duels d'unités déjà calculés ;
- **Gabarits de composition** : paramétrer par rôles (ligne de front, anti-large, tir, cavalerie…) et proportions, plutôt que par unité ;
- **Recherche guidée** plutôt qu'exhaustive : montée de colline, recuit simulé, algorithme évolutionnaire ou MAP-Elites (une meilleure composition par « style »), avec évaluation en tournoi contre un panel d'adversaires qui évolue (co-évolution / « hall of fame ») ;
- **Stockage minimal** : seulement les K meilleures compositions par faction et par budget, sous forme de listes `[id, nombre]` (quelques centaines d'octets chacune).

**Ordre de grandeur du coût de calcul** : les 2,7 millions de duels d'unités tournent en ≈ 4–5 min, soit ≈ 0,1 ms par simulation. Une recherche par faction de ≈ 600 000 simulations coûterait donc ≈ 1 min ; à répéter par pool d'unités distinct (moins de 359, beaucoup de factions partagent les mêmes unités).

**Questions ouvertes** :
- adversaires de référence : autres compositions de la recherche, compositions « types » écrites à la main, ou les deux ?
- mode « sans budget » : seul le plafond de 20 unités limite, donc seulement les meilleures unités ; utile surtout comme classement de styles ;
- la limite du modèle de combat (pas de flanquement, ciblage ni terrain) pèse davantage sur des compositions que sur des duels d'unités : l'afficher clairement dans la page.

**Fichiers concernés** (à créer) : `tools/build_comps.js`, `data/comps.js`, un onglet ou une vue dédiée ; `sim.js` reste le seul simulateur.

## 3. Arbre technologique et bonus de faction (à étudier ; profil global, voir point 0)

**Question** : peut-on tenir compte de l'arbre technologique propre à la faction, et des autres bonus de faction qui touchent les unités ? **Faisable**, comme les compétences de seigneur (point 1) ; l'exploration du dump donne :
- **Technologies** : `technology_node_sets` (36 arbres, par culture, sous-culture ou faction, parfois plusieurs par faction : ex. `chs_mil`, `chs_mil_azazel`, `chs_mil_belakor`) → `technology_nodes` (2 001 nœuds : `tier`, `research_points_required`, `cost_per_round`, `technology_node_set`) → `technologies` (2 098) → `technology_effects_junction` (4 079 effets : `effect`, `effect_scope`, `value`), prérequis dans `technology_node_links` (1 932 liens).
- **Effets utiles** : 733 lignes ont une stat de bataille (attaque, défense, armure, moral, charge, force d'arme, force de tir, vitesse, PV, munitions, portée), presque toutes en portée `faction_to_force_own_unseen` (706) ; médiane ≈ 15 technologies utiles par arbre (Bretonnie 27 sur 75, Nains du Chaos 13 sur 78). Certaines sont ciblées (« contre les Rois des Tombes », une unité précise : `effect_bonus_value_ids_unit_sets`, déjà utilisé pour les seigneurs).
- **Autres bonus de faction qui touchent les unités** : `faction_set_effect_bundles` (365 lots d'effets par ensemble de factions), `campaign_group_pooled_resource_effects` (736 : ressources propres aux factions, ex. corruption, nourriture, Waaagh), les bâtiments (`building_effects_junction` : 523 effets de stats de bataille sur 23 819), les rituels (`ritual…`, `effect_bonus_value_ritual_junctions`) et les traits de faction (`faction_starting_general_effects`, déjà pris en compte pour le seigneur de départ).

**Piste d'interface** : réglage « Technologies » du profil global (aucune / jusqu'au tier N / tout) avec dépense automatique des points dans les technologies qui touchent les unités ; mêmes `mods` par unité que les effets de seigneur. Il agit sur le tier list, la matrice, la fiche et le combat, pas seulement sur le Combat.

**À vérifier / décider** :
- l'arbre exact de chaque faction (clés `faction_key`, `culture`, `subculture` des `technology_node_sets` ; plusieurs arbres pour une faction à seigneurs multiples) ;
- le lien entre technologie et bâtiment (`technologies.building_level`) : certaines technologies exigent un bâtiment ;
- l'effet des technologies cumulées (valeurs additives ou non, plafonds) ;
- les bonus de ressources (corruption…) dépendent de l'état de la campagne : à ne pas appliquer par défaut ;
- les technologies conditionnelles (contre une race, terrain) : même règle que pour les seigneurs (non appliquées).

**Remplace en partie** les curseurs génériques « Technologies / bonus débloqués » du site (bonus de défense, de dégâts, de PV…) par des valeurs lues dans les tables, par faction.

## 4. Seigneur d'armée « full niveau » avec tous ses perks (duels avec le seigneur comme unité)

**But** : choisir un seigneur au **niveau maximum**, le mettre comme **seigneur d'armée** pour renforcer une unité (ou une composition), et voir le résultat dans les duels et le tier list : par exemple, avec le seigneur de ma campagne entièrement monté, le Spectre de Cain devient-il meilleur ?
- **Un emplacement de moins** : le seigneur occupe 1 des 20 emplacements de l'armée (19 autres unités au plus) et son **coût de recrutement** entre dans le budget des duels à coût égal (donc parfois moins de 19 unités). **Deux usages distincts** :
  - **Tier list / matrice / fiche d'unité** : seuls ses **perks d'armée** s'appliquent aux unités (`mods`) ; il **ne combat pas** dans le calcul (on classe les unités, pas le seigneur).
  - **Duels d'armée contre armée** (onglet Combat, futurs duels de compositions) : il **combat** (ses PV, ses dégâts, ses compétences de personnage) en plus de ses bonus d'armée, et son emplacement et son coût comptent.
- **Tous ses perks** : toutes les compétences d'armée à effet de stat, sauf les **choix exclusifs** (deux options dont on ne peut prendre qu'une) : l'utilisateur choisit alors l'option. Données utiles : `character_skill_node_links` (types `REQUIRED` / `SUBSET_REQUIRED`, `required_num_parents`), `character_skill_nodes_skill_locks` (2 694 lignes : verrous, à interpréter), `character_experience_skill_tiers` (points de compétence par rang), `character_skill_level_details` (rang requis par niveau de compétence).
- **À identifier** : comment les choix exclusifs sont représentés dans les tables (nœuds frères sous un même parent, verrous…) ; l'interface les listerait pour que l'on tranche.
- **Dépend du point 1** (extraction des niveaux) et de la **tier list de compositions** (point 2) pour classer des compositions avec seigneur.

## 5. Charge réaliste dans le simulateur (`sim.js`)

**État actuel** : pendant 6 s après le contact, **toutes** les unités de mêlée des deux camps reçoivent leur bonus de charge en entier (touche + `1 + charge/200` sur les dégâts), même un camp immobile ; pas de défense contre la charge, pas de masse.

**Ce que disent les données du jeu** (`_kv_rules`, `unit_attributes`, loc) :
- **Bonus de charge** : « augmente l'attaque et les dégâts de mêlée en chargeant » ; il **décroît sur `charge_decay_duration` = 13 s** (probablement linéaire) ; l'aire sous la courbe ≈ 6,5 s de bonus plein, proche des 6 s fixes actuels, mais la forme diffère.
- **Charge Defence (`charge_defense`)** : « quand l'unité **est en position de défense (bracing)**, elle **annule le bonus de charge de tout attaquant** » ; **`charge_defense_vs_large`** : annule celui des **grands** attaquants seulement (lanciers contre cavalerie et monstres). **Ogre Charge** (`ogre_charge`, `ogre_charge_upgraded`) : face à un défenseur en bracing, l'unité ne perd que la moitié (`ogre_charge_factor` 0,5) ou le quart (0,25) de son bonus.
- **Charge Reflection (`charge_reflection`)** : en bracing, dégâts supplémentaires aux ennemis qui chargent (`charge_reflect_damage_multiplier` 2,0, seuil `charge_reflect_min_charge_factor_threshold` 0,7 = tant que le bonus restant dépasse 70 %).
- **Masse** : elle n'entre pas dans le bonus de charge mais dans les **dégâts d'impact / de collision** (vitesse × masse) : constantes `collision_damage_modifier` 0,6, `collision_damage_normaliser` 0,8, `collision_damage_maximum` 70, `collision_damage_armour_penetration_ratio` 0,7, seuils de renversement (`collision_speed_delta_threshold_*`) ; la formule exacte n'est pas dans les tables. La masse est dans `battle_entities.mass` (Hallebardier 100, Reiksguard 1 000, Stégadon 4 000). Selon la communauté, le bonus de charge ne compte plus dans les dégâts de collision depuis Warhammer II (source non officielle).
- **Bracing** : constantes `bracing_*` (`bracing_calibration_ranks` 8, `bracing_calibration_ranks_multiplier` 4, `bracing_max_multiplier_clamp` 10, `unit_braced_status_threshold` 0,75 : on est « en bracing » au-delà de 75 % de la valeur de référence, qui dépend du nombre de rangs et de l'immobilité).
- **Flanc / dos** : `devastating_flanker_charge_multiplier` 2,0, `melee_defence_direction_penalty_coefficient_flank` 0,6 et `_rear` 0,3 (non modélisés).

**À faire** :
1. ~~Seul le camp qui **avance** reçoit le bonus de charge~~ **fait** (`sim.js`, option `hold` par armée).
2. ~~Décroissance linéaire du bonus sur 13 s~~ **fait**.
3. ~~Extraire les attributs d'unité~~ **fait** (champ `at`) :  (`land_units.attribute_group` → `unit_attributes_groups`/`…_to_groups_junctions`) : `charge_defense`, `charge_defense_vs_large`, `charge_reflection`, `ogre_charge*` ; annuler le bonus de charge des attaquants (tous, ou grands seulement) quand l'unité est en bracing.
4. ~~Qui est en bracing~~ **décidé** : réglage par armée « Charge / Tient sa position » dans le Combat (**fait**) ; **fait** : choix automatique de l'option la plus rentable pour chaque camp (`resolve` dans `sim.js`), aussi dans les duels précalculés.
5. Masse : dégâts d'impact (cavalerie, monstres) selon masse × vitesse avec les constantes ci-dessus ; formule à calibrer (non fournie par les tables).
6. Heure d'arrivée **par unité** (selon sa vitesse) au lieu d'une heure commune pour toute l'armée.
7. Documenter ces limites dans l'onglet Méthode tant que ce n'est pas fait.
8. **Charge à travers plusieurs rangs** : une charge de cavalerie ou de monstre ne se limite pas au premier rang (elle renverse et traverse des modèles, les rangs arrière subissent l'impact). Non modélisé : seule la largeur du front limite aujourd'hui le contact ; à lier aux dégâts d'impact (point 5) et aux rangs (`rank_depth`).

## Autres pistes déjà évoquées

- Noms français des unités et factions : en attente de l'export de localisation française (`local_fr.pack`, voir « Langue » dans le `README.md`).
- Onglet « Combat d'armées » : retravailler la hiérarchie d'affichage comme pour le tier list.
- Calibrer `FRONT_K` et `ENGAGE` (`sim.js`) si des observations en jeu sont disponibles.
- Vérifier le plafond de 90 % des résistances et l'ordre avec l'armure (voir « Types de dégâts et résistances » dans le `README.md`).
- Workflow GitHub Actions (`.github/workflows/build-data.yml`) : jamais exécuté.
