# Calibrage de l'impact de charge : tableau de mesures en jeu

But : caler `IMPACT_E` et `IMPACT_PEN` (`sim.js`) sur ce que fait vraiment le jeu. Les deux colonnes « observé » sont à remplir ; la colonne « site » est la prédiction actuelle du simulateur.

## Protocole (à suivre pour chaque ligne)
1. **Bataille personnalisée**, carte plate sans relief ni obstacle, météo par défaut.
2. **Armées** : une seule unité de chaque côté, **sans seigneur, sans rang, sans objet, sans compétence ni technologie** (aucun bonus), taille d'unité **Ultra** (les effectifs du tableau).
3. **Défenseur immobile** : ne lui donne aucun ordre (il reste sur place, face à l'attaquant, comme en défense normale). Ne le mets pas en formation spéciale.
4. **Attaquant** : place-le à **environ 150 à 200 m** du défenseur, de face, et donne l'ordre d'**attaquer** (clic droit sur le défenseur : il charge en courant, atteint sa vitesse de charge).
5. **Mesure** : ralentis le jeu (ou mets en pause au contact) et note le **nombre d'hommes restants** de chaque unité (carte d'unité) :
   - juste **avant** le contact (effectif de départ) ;
   - **5 secondes** après le contact (compte à partir du premier choc).
   - Optionnel : à **+1 s** (dégâts de l'impact seul, avant que la mêlée s'installe).
6. Répète **2 fois** si possible et note la moyenne ; indique si une charge a été interrompue (l'attaquant ralentit avant le contact, charge en biais, etc.).
7. Renseigne les colonnes vides ci-dessous (pertes = effectif de départ − effectif restant).

## Tableau

| # | Scénario | Attaquant (hommes, masse) | Défenseur immobile (hommes, armure) | Site : pertes défenseur à +5 s (dont impact seul à +1 s) | Site : pertes attaquant à +5 s | **Observé : pertes défenseur à +5 s** | **Observé : pertes défenseur à +1 s** | **Observé : pertes attaquant à +5 s** | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Cavalerie lourde contre infanterie légère | Reiksguard (60, 1000) | Swordsmen (120, 30) | 29 (10) | 4 |  |  |  |  |
| 2 | Cavalerie lourde (moins chère) contre infanterie légère | Empire Knights (60, 1000) | Swordsmen (120, 30) | 21 (10) | 4 |  |  |  |  |
| 3 | Cavalerie légère contre infanterie légère | Dark Riders (60, 600) | Swordsmen (120, 30) | 16 (7) | 9 |  |  |  |  |
| 4 | Cavalerie très légère contre infanterie légère | Goblin Wolf Riders (80, 350) | Swordsmen (120, 30) | 11 (4) | 14 |  |  |  |  |
| 5 | Cavalerie monstrueuse contre infanterie légère | Demigryph Knights (32, 1500) | Swordsmen (120, 30) | 27 (9) | 2 |  |  |  |  |
| 6 | Monstre (très lourd) contre infanterie légère | Giant (1, 6500) | Swordsmen (120, 30) | 16 (3) | 0 |  |  |  |  |
| 7 | Monstre (lourd) contre infanterie légère | Feral Stegadon (1, 4000) | Swordsmen (120, 30) | 12 (3) | 0 |  |  |  |  |
| 8 | Char (très lourd) contre infanterie légère | Steam Tank (3, 5000) | Swordsmen (120, 30) | 29 (13) | 0 |  |  |  |  |
| 9 | Cavalerie lourde contre infanterie lourde blindée | Reiksguard (60, 1000) | Hammerers (100, 100) | 14 (5) | 14 |  |  |  |  |
| 10 | Cavalerie lourde contre lanciers (masse accrue en position de défense) | Reiksguard (60, 1000) | Spearmen (120, 30) | 16 (10) | 5 |  |  |  |  |
| 11 | Infanterie contre infanterie (impact attendu très faible) | Swordsmen (120, 100) | Swordsmen (120, 30) | 14 (0) | 10 |  |  |  |  |

## Comment je m'en sers
- **Cas 1 à 4 (cavalerie, de la plus lourde à la plus légère)** : ils fixent l'échelle de l'impact et la façon dont il baisse avec la masse.
- **Cas 5 à 8 (monstres et char)** : ils fixent le plafond des dégâts par modèle et la pénétration des rangs pour les très grandes masses.
- **Cas 9 (infanterie lourde)** : montre l'effet de l'armure (70 % des dégâts d'impact sont perforants).
- **Cas 10 (lanciers)** : montre l'effet de la masse accrue en position de défense (bracing).
- **Cas 11 (infanterie contre infanterie)** : doit donner un impact très faible ; sert de contrôle.

Comparer ensuite aux colonnes « Site » ; si l'observé est systématiquement plus haut ou plus bas, j'ajuste `IMPACT_E` (échelle des dégâts) et `IMPACT_PEN` (nombre de rangs traversés).
