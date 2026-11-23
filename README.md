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
