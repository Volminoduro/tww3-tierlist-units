# Tier list TW:Warhammer III
1. Dans RPFM (Warhammer 3), ouvre `data.pack` (+ packs des DLC), puis exporte en TSV les tables :
   main_units, land_units, battle_entities, melee_weapons, missile_weapons, projectiles,
   unit_armour_types, units_custom_battle_permissions, et les fichiers loc (text/db).
2. `python tools/convert_rpfm.py --inspect DOSSIER_TSV` pour vérifier les colonnes trouvées.
3. `python tools/convert_rpfm.py DOSSIER_TSV` génère `data/units.js`.
4. Ouvre `index.html` (double-clic) ou `python -m http.server`.

## Onglets
- **Tier list** : tiers S→F par efficacité ou puissance, par faction, avec une *typologie d'usage* au choix (anti-infanterie, anti-large, anti-armure, encaisser la ligne de front, tir, charge, mobilité) et une *matrice typologique* (percentiles par usage).
- **Unités par faction** : toutes les stats de chaque unité, chacune avec son rang (« Top 8 % » / « Bottom 20 % ») comparé à la même catégorie, la faction ou tout le jeu.
- **Combat d'armées** : simulation de deux armées avec entretien affiché et rendement par entretien.

## Données
`data/units.js` est généré par `tools/convert_rpfm.py` à partir du dump de tables public **Shazbot/wh3-dump** (`db/*_tables/data__.tsv` + `text/db`), qui reflète les données du jeu à la version du dump :

```bash
git clone --depth 1 https://github.com/Shazbot/wh3-dump
python tools/convert_rpfm.py wh3-dump
```
Les **359 factions** de bataille/campagne (DLC et seigneurs légendaires compris) sont regroupées par **race** (25 cultures) : un menu en arbre unique (races puis factions, par ordre alphabétique, avec icônes) permet de choisir. Les unités d'une faction sont celles de son groupe militaire (`units_to_groupings_military_permissions`) plus les permissions explicites de bataille personnalisée. Les seigneurs et héros sont rattachés à la race entière (approximation). La vitesse est remise à l'échelle du site (×12) ; les données de jeu appartiennent à Creative Assembly / SEGA. `data/demo.json` est un petit jeu de démonstration fictif.

## Illustrations des unités
Par défaut, chaque unité affiche un **emblème de rôle** dessiné en SVG (infanterie, tireurs, cavalerie, monstres, chars, artillerie, bêtes). Pour afficher les **portraits du jeu** en local :
1. Dans RPFM, extrais `ui/units/icons` depuis les packs du jeu.
2. `python tools/copy_icons.py DOSSIER_EXTRAIT/ui/units/icons`
Les portraits sont copiés dans `img/units/` (ignoré par git : ce sont des visuels sous copyright) et remplacent automatiquement les emblèmes.

## Seigneurs, héros et emblèmes de factions
`convert_rpfm.py` inclut maintenant les **seigneurs et héros** (`--no-heroes` pour les exclure ; masqués par défaut dans le tier list, case « Inclure seigneurs & héros »). Leurs capacités et sorts ne sont pas modélisés.
`tools/copy_icons.py DOSSIER_EXTRAIT` copie aussi les **drapeaux de factions** (`ui/flags/…`) vers `img/factions/`. Les chemins exacts des images dans les packs n'ont pas été vérifiés faute d'accès aux fichiers du jeu : si une image manque, ajuste le dossier passé au script.

## Simulateur partagé et duels précalculés
`sim.js` est **le seul** simulateur : il est chargé par le navigateur (onglet Combat) et par Node (`tools/build_duels.js`), donc aucune différence possible entre le site et les duels précalculés.
`node tools/build_duels.js` joue tous les duels deux à deux **à budget équivalent** (entretien, puis coût de recrutement ; budget 2000, ≥ 1 et ≤ 20 exemplaires par camp si possible) et écrit `data/duels.json`/`duels.js` (~4 Mo, ~2 min) : taux de victoire global et par catégorie, meilleurs adversaires et pires adversaires de chaque unité.
**Seigneurs et héros inclus**, mais leurs sorts, capacités et objets ne sont pas modélisés : leurs résultats sont indicatifs (voir `notes` dans le fichier).
Le workflow `.github/workflows/build-data.yml` régénère données et duels (déclenchement manuel).

### Compositions d'armées
- **20 unités maximum par armée** (limite du jeu), appliquée dans l'onglet Combat et dans les duels (paires dont le rapport de coût dépasse 20 ignorées).
- **Protection de l'arrière** : réglage par armée (0–100 %, ou « Auto »). Tant qu'une unité de ligne est debout, la mêlée adverse n'atteint tireurs et artillerie qu'à (1 − protection). « Auto » = 80 % si au moins autant d'unités de ligne que d'unités de tir.
- **Typologie « anti-X » par résultats** : unités de mêlée = taux de victoire en duel contre la catégorie ; **unités à distance = efficacité de DPS** contre un défenseur moyen de la catégorie (un duel contre de la mêlée ne les représente pas). Visible dans la fiche d'unité, dans les colonnes « Duels » de l'onglet Unités par faction et via « Tier par résultats de duels ».

**Menu race/faction** : cliquer sur le nom d'une race choisit la **race entière** (unités de toutes ses factions) ; le chevron ▸ déplie la liste de ses factions. Entrée « Toutes les factions » en tête.

### Effets par défaut du seigneur (onglet Combat)
Chaque armée a un menu **Seigneur** : **Auto** = seigneur de départ de la faction (`frontend_faction_leaders`), « Aucun », ou un autre seigneur de la race. `tools/effects_extract.py` extrait, pour chaque seigneur, ses **effets par défaut qui modifient les stats d'unités en bataille** : effet de départ (`faction_starting_general_effects`) et compétences innées (nœuds avec `points_on_creation`, niveau 1). La portée sur les unités vient des `unit_sets`. Points (attaque, défense, armure, moral, charge) et pourcentages (force d'arme, force de tir, vitesse, PV, munitions, portée) sont distingués d'après la localisation. Ils entrent dans `sim.js` via `mods` par unité.
**Non pris en compte** : effets de campagne (entretien, recrutement, mouvement), effets conditionnels (terrain, embuscade, race adverse…), compétences à choisir, technologies, bâtiments, objets, sorts et capacités, résistances ; les effets de départ de campagne définis hors des tables du jeu sont inconnus. Les effets de faction (hors seigneur) n'ont pas de table « par défaut » exploitable : seul le trait lié au seigneur de départ est pris en compte.

### Méthode et vérification (onglet « Méthode »)
Inspiré de la page de méthode de [TW Database](https://twdatabase.com) (modèle de présentation de la provenance, valeur de référence et formules de la fiche d'unité, que nous avons réimplémentées nous-mêmes à partir des tables ; aucune de leurs pages, données ou code n'est reprise) : chaque nombre vient des tables du jeu (dump Shazbot/wh3-dump), à la **taille d'unité Ultra, rang 0, sans compétence, objet, technologie ni bonus**. Les formules de la fiche d'unité sont reprises : santé (cas général, artillerie, chars et véhicules), vitesse (course ou vol × 10, de la monture, de la machine ou du soldat), force d'arme, munitions en **volées**, dégâts de tir avec **explosions**, dégâts par 10 s. La version des données (build du jeu, commit du dump) est enregistrée dans `data/units.js` (`meta`) et affichée en pied de page ; le workflow accepte un `dump_commit` pour fixer la version. La fiche d'unité donne la **clé** de l'unité pour retrouver sa ligne dans les tables.
Corrections apportées grâce à cette méthode : arme à distance des machines (canons) lue dans `battlefield_engines`, PV des véhicules (le bonus de PV n'est plus compté pour chaque membre d'équipage), pièces d'artillerie comptées comme tireurs, vitesse à l'échelle de la carte (× 10).

## Crédits
- **[TW Database](https://twdatabase.com)** : sa page de méthode a servi de modèle à l'onglet « Méthode » et nous a permis de corriger plusieurs erreurs de notre import.
- **[Shazbot/wh3-dump](https://github.com/Shazbot/wh3-dump)** : les tables du jeu en TSV (exportées avec RPFM), source de toutes les données.
- Total War: Warhammer III et son univers appartiennent à Creative Assembly, SEGA et Games Workshop ; ce projet de fan n'est pas affilié.
