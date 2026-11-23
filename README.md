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
Les unités sont celles de la bataille personnalisée (27 factions-cultures, DLC compris), hors seigneurs et héros. La vitesse est remise à l'échelle du site (×12) ; les données de jeu appartiennent à Creative Assembly / SEGA. `data/demo.json` est un petit jeu de démonstration fictif.

## Illustrations des unités
Par défaut, chaque unité affiche un **emblème de rôle** dessiné en SVG (infanterie, tireurs, cavalerie, monstres, chars, artillerie, bêtes). Pour afficher les **portraits du jeu** en local :
1. Dans RPFM, extrais `ui/units/icons` depuis les packs du jeu.
2. `python tools/copy_icons.py DOSSIER_EXTRAIT/ui/units/icons`
Les portraits sont copiés dans `img/units/` (ignoré par git : ce sont des visuels sous copyright) et remplacent automatiquement les emblèmes.
