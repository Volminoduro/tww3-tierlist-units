# Calibrage de l'impact de charge : tableau de mesures en jeu

But : caler `IMPACT_E` et `IMPACT_PEN` (`sim.js`) sur ce que fait vraiment le jeu. Les colonnes « Observé » sont à remplir ; les colonnes « Site » sont les prédictions actuelles du simulateur.

## Ce que « perdre » veut dire
- **Dans le simulateur** : *morts*, pas renversés. Il compte les **points de vie perdus** du défenseur et les convertit en soldats équivalents (PV perdus ÷ PV d'un soldat). Le **renversement et le recul ne sont pas modélisés** : un soldat renversé est vivant, il n'est pas compté.
- **Dans le jeu**, à mesurer sur la **carte d'unité** (ou en survolant l'unité) :
  1. **Soldats restants** (le nombre de soldats vivants, par ex. 96 / 120) : ce sont les morts. Les soldats renversés ou projetés qui se relèvent **ne comptent pas comme perdus**.
  2. **Barre de santé** de l'unité (en %), ou ses PV totaux si le jeu les affiche : plus proche de ce que calcule le simulateur, car des soldats blessés restent vivants. L'équivalent en « soldats perdus » est `(100 % − barre) × effectif`.
  3. *(Optionnel)* **combien de soldats sont à terre ou projetés** à +1 s (estimation à l'œil) : ça me servira pour modéliser le renversement plus tard.
- Note les **deux** valeurs (soldats restants et barre de santé) : je prendrai celle qui colle le mieux au simulateur.

## Protocole (à suivre pour chaque ligne)
1. **Bataille personnalisée**, carte plate sans relief ni obstacle, météo par défaut.
2. **Armées** : une seule unité de chaque côté, **sans seigneur, sans rang, sans objet, sans compétence ni technologie** (aucun bonus), taille d'unité **Ultra** (les effectifs du tableau).
3. **Défenseur immobile** : ne lui donne aucun ordre (il reste sur place, face à l'attaquant, comme en défense normale). Pas de formation spéciale.
4. **Attaquant** : à **150 à 200 m** du défenseur, de face, ordre d'**attaquer** (clic droit sur le défenseur : il charge en courant).
5. **Mesure** : ralentis le jeu (ou pause au contact) et relève soldats restants **et** barre de santé du défenseur et de l'attaquant :
   - juste **avant** le contact ;
   - **+1 s** après le premier choc (impact presque seul) ;
   - **+5 s** après.
6. Répète **2 fois** si possible (moyenne) ; note si la charge a été interrompue (ralentissement, charge en biais).

## Tableau

Colonnes « Site » : **soldats du défenseur perdus** (équivalent) à +5 s, dont à +1 s (impact quasi seul) ; soldats de l'attaquant perdus à +5 s.

| # | Scénario | Attaquant (soldats, masse) | Défenseur immobile (soldats, armure) | Site : défenseur perd à +5 s (à +1 s) | Site : attaquant perd à +5 s | **Observé : défenseur, soldats restants à +5 s** | **Observé : défenseur, barre de santé à +5 s (%)** | **Observé : défenseur, soldats restants à +1 s** | **Observé : attaquant, soldats restants à +5 s** | **Observé : soldats à terre à +1 s (estimation)** | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Cavalerie lourde contre infanterie légère | Reiksguard (60, 1000) | Bretteurs (120, 30) | 29 (10) | 4 |  |  |  |  |  |  |
| 2 | Cavalerie lourde (moins chère) contre infanterie légère | Chevaliers de l'Empire (60, 1000) | Bretteurs (120, 30) | 21 (10) | 4 |  |  |  |  |  |  |
| 3 | Cavalerie légère contre infanterie légère | Cavaliers Noirs (60, 600) | Bretteurs (120, 30) | 16 (7) | 9 |  |  |  |  |  |  |
| 4 | Cavalerie très légère contre infanterie légère | Gobelins chevaucheurs de loup (80, 350) | Bretteurs (120, 30) | 11 (4) | 14 |  |  |  |  |  |  |
| 5 | Cavalerie monstrueuse contre infanterie légère | Chevaliers Demigriffons (32, 1500) | Bretteurs (120, 30) | 27 (9) | 2 |  |  |  |  |  |  |
| 6 | Monstre (très lourd) contre infanterie légère | Géant (1, 6500) | Bretteurs (120, 30) | 16 (3) | 0 |  |  |  |  |  |  |
| 7 | Monstre (lourd) contre infanterie légère | Stégadon sauvage (1, 4000) | Bretteurs (120, 30) | 12 (3) | 0 |  |  |  |  |  |  |
| 8 | Char (très lourd) contre infanterie légère | Tank à vapeur (3, 5000) | Bretteurs (120, 30) | 29 (13) | 0 |  |  |  |  |  |  |
| 9 | Cavalerie lourde contre infanterie lourde blindée | Reiksguard (60, 1000) | Marteliers (100, 100) | 14 (5) | 14 |  |  |  |  |  |  |
| 10 | Cavalerie lourde contre lanciers (masse accrue en position de défense) | Reiksguard (60, 1000) | Lanciers (120, 30) | 16 (10) | 5 |  |  |  |  |  |  |
| 11 | Infanterie contre infanterie (impact attendu très faible) | Bretteurs (120, 100) | Bretteurs (120, 30) | 14 (0) | 10 |  |  |  |  |  |  |

## Comment je m'en sers
- **Cas 1 à 4 (cavalerie, de la plus lourde à la plus légère)** : échelle de l'impact et baisse avec la masse.
- **Cas 5 à 8 (monstres et char)** : plafond des dégâts par modèle et pénétration des rangs pour les grandes masses.
- **Cas 9 (infanterie lourde)** : effet de l'armure (70 % des dégâts d'impact sont perforants).
- **Cas 10 (lanciers)** : effet de la masse accrue en position de défense (bracing).
- **Cas 11 (infanterie contre infanterie)** : contrôle, l'impact doit être très faible.

Si l'observé est systématiquement plus haut ou plus bas que le site, j'ajuste `IMPACT_E` (échelle des dégâts) et `IMPACT_PEN` (nombre de rangs traversés). La colonne « à terre » servira à modéliser le renversement.
