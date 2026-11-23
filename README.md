# Tier list TW:Warhammer III
1. Dans RPFM (Warhammer 3), ouvre `data.pack` (+ packs des DLC), puis exporte en TSV les tables :
   main_units, land_units, battle_entities, melee_weapons, missile_weapons, projectiles,
   unit_armour_types, units_custom_battle_permissions, et les fichiers loc (text/db).
2. `python tools/convert_rpfm.py --inspect DOSSIER_TSV` pour vérifier les colonnes trouvées.
3. `python tools/convert_rpfm.py DOSSIER_TSV` génère `data/units.js`.
4. Ouvre `index.html` (double-clic) ou `python -m http.server`.

## Onglets
- **Tier list** : tiers S→F par efficacité ou puissance, par faction, avec une *typologie d'usage* au choix (anti-infanterie, anti-large, anti-armure, encaisser la ligne de front, tir, charge, mobilité) et une *matrice typologique* (percentiles par usage).
- **Combat d'armées** : simulation de deux armées avec entretien affiché et rendement par entretien.

Les données incluses dans `data/` sont des valeurs de démonstration, non officielles.
