# TODO

Chantiers décidés, pas encore commencés. Les notes ci-dessous viennent de l'exploration faite dans la conversation de conception.

## 1. Niveau et compétences des seigneurs / héros (onglet Combat)

**Décision** : curseur automatique (pas de choix compétence par compétence).

**Idée** : réglage « Niveau du seigneur » (1 à 40) par armée. Le budget de points = niveau − 1 + points de départ. Le site dépense ces points automatiquement dans les bonus d'armée, en priorisant le gain par point. Bouton « Tout au max » = meilleur cas. Les duels précalculés restent au niveau et aux compétences par défaut. Même mécanisme pour les héros (leurs arbres sont dans le dump).

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

## Autres pistes déjà évoquées

- Noms français des unités et factions : en attente de l'export de localisation française (`local_fr.pack`, voir « Langue » dans le `README.md`).
- Onglet « Combat d'armées » : retravailler la hiérarchie d'affichage comme pour le tier list.
- Calibrer `FRONT_K` et `ENGAGE` (`sim.js`) si des observations en jeu sont disponibles.
- Vérifier le plafond de 90 % des résistances et l'ordre avec l'armure (voir « Types de dégâts et résistances » dans le `README.md`).
- Workflow GitHub Actions (`.github/workflows/build-data.yml`) : jamais exécuté.
