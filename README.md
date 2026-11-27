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
Les portraits sont copiés dans `img/units/` et remplacent automatiquement les emblèmes. Ils sont **versionnés** avec le dépôt (projet de fan non commercial ; les visuels restent la propriété de Creative Assembly / SEGA, et le choix de les publier est celui du propriétaire du dépôt) : après `copy_icons.py`, `git add img data/icons.js`, commit et push.

## Seigneurs, héros et emblèmes de factions
`convert_rpfm.py` inclut maintenant les **seigneurs et héros** (`--no-heroes` pour les exclure ; masqués par défaut dans le tier list, case « Inclure seigneurs & héros »). Leurs capacités et sorts ne sont pas modélisés.
`tools/copy_icons.py DOSSIER_EXTRAIT` copie aussi les **drapeaux de factions** (`ui/flags/…`) vers `img/factions/`. Les chemins exacts des images dans les packs n'ont pas été vérifiés faute d'accès aux fichiers du jeu : si une image manque, ajuste le dossier passé au script.

## Simulateur partagé et duels précalculés
`sim.js` est **le seul** simulateur : il est chargé par le navigateur (onglet Combat) et par Node (`tools/build_duels.js`), donc aucune différence possible entre le site et les duels précalculés.
`node tools/build_duels.js` joue tous les duels deux à deux **à budget équivalent** (entretien, puis coût de recrutement ; budget 2000, ≥ 1 et ≤ 20 exemplaires par camp si possible) et écrit `data/duels.json`/`duels.js` (~4 Mo, ~2 min) : taux de victoire global et par catégorie, meilleurs adversaires et pires adversaires de chaque unité.
**Seigneurs et héros inclus**, mais leurs sorts, capacités et objets ne sont pas modélisés : leurs résultats sont indicatifs (voir `notes` dans le fichier).
Le workflow `.github/workflows/build-data.yml` régénère données et duels (déclenchement manuel).

### Charge (règles du jeu)
`sim.js` reprend les règles de charge du jeu (constantes de `_kv_rules`, textes des attributs) : seul le camp qui **avance** reçoit le bonus de charge (attaque et dégâts), qui **décroît linéairement sur 13 s** (`charge_decay_duration`). Un camp réglé **« Tient sa position »** (par armée, dans le Combat) ne charge pas et peut être en **bracing** : ses unités **`charge_defense`** annulent le bonus de charge de tout attaquant, **`charge_defense_vs_large`** celui des grands attaquants (lanciers contre cavalerie et monstres), **`ogre_charge`** n'en perd que la moitié ; **`charge_reflection`** double les dégâts infligés aux ennemis qui chargent tant que leur bonus restant dépasse 70 %. Attributs extraits par `convert_rpfm.py` (`at` : 60 + 125 + 119 + 32 unités). **Choix « charger ou tenir sa position »** : chaque armée du Combat a le réglage **Auto (meilleur choix)** (défaut), **Charge** ou **Tient sa position**. En Auto, `TWW3Sim.resolve` part de « les deux chargent » puis chaque camp qui compte des unités à défense contre la charge ou à réflexion bascule vers « tient sa position » s'il améliore sa propre marge (survie en coût rapportée au coût de départ, moins celle de l'adversaire), jusqu'à stabilité (4 tours au plus) ; les deux camps ne peuvent pas tenir en même temps. Les **duels précalculés** utilisent le même choix automatique : chaque unité ciblée par une charge prend l'option la plus rentable pour elle. Deux charges qui se rencontrent : chacun reçoit son propre bonus (lecture de la communauté ; les tables ne donnent pas de règle). **Non modélisés** : masse et dégâts d'impact, heure d'arrivée par unité, flanc et dos.

### Compositions d'armées
- **20 unités maximum par armée** (limite du jeu), appliquée dans l'onglet Combat et dans les duels (paires dont le rapport de coût dépasse 20 ignorées).
- **Protection de l'arrière** : réglage par armée (0–100 %, ou « Auto »). Tant qu'une unité de ligne est debout, la mêlée adverse n'atteint tireurs et artillerie qu'à (1 − protection). « Auto » = 80 % si au moins autant d'unités de ligne que d'unités de tir.
- **Typologie « anti-X » par résultats** : unités de mêlée = taux de victoire en duel contre la catégorie ; **unités à distance = efficacité de DPS** contre un défenseur moyen de la catégorie (un duel contre de la mêlée ne les représente pas). Visible dans la fiche d'unité, dans les colonnes « Duels » de l'onglet Unités par faction et via « Tier par résultats de duels ».

**Menu race/faction** : cliquer sur une race la **déplie** ; le bouton **Tout** de sa ligne, ou la ligne « Toute la race » en tête de ses factions, choisit la **race entière** (unités de toutes ses factions) ; cliquer une faction la choisit. Entrée « Toutes les factions » en tête.

### Effets par défaut du seigneur (onglet Combat)
Chaque armée a un menu **Seigneur** : **Auto** = seigneur de départ de la faction (`frontend_faction_leaders`), « Aucun », ou un autre seigneur de la race. `tools/effects_extract.py` extrait, pour chaque seigneur, ses **effets par défaut qui modifient les stats d'unités en bataille** : effet de départ (`faction_starting_general_effects`) et compétences innées (nœuds avec `points_on_creation`, niveau 1). La portée sur les unités vient des `unit_sets`. Points (attaque, défense, armure, moral, charge) et pourcentages (force d'arme, force de tir, vitesse, PV, munitions, portée) sont distingués d'après la localisation. Ils entrent dans `sim.js` via `mods` par unité.
**Non pris en compte** : effets de campagne (entretien, recrutement, mouvement), effets conditionnels (terrain, embuscade, race adverse…), compétences à choisir, technologies, bâtiments, objets, sorts et capacités, résistances ; les effets de départ de campagne définis hors des tables du jeu sont inconnus. Les effets de faction (hors seigneur) n'ont pas de table « par défaut » exploitable : seul le trait lié au seigneur de départ est pris en compte.

### Méthode et vérification (onglet « Méthode »)
Inspiré de la page de méthode de [TW Database](https://twdatabase.com) (modèle de présentation de la provenance, valeur de référence et formules de la fiche d'unité, que nous avons réimplémentées nous-mêmes à partir des tables ; aucune de leurs pages, données ou code n'est reprise) : chaque nombre vient des tables du jeu (dump Shazbot/wh3-dump), à la **taille d'unité Ultra, rang 0, sans compétence, objet, technologie ni bonus**. Les formules de la fiche d'unité sont reprises : santé (cas général, artillerie, chars et véhicules), vitesse (course ou vol × 10, de la monture, de la machine ou du soldat), force d'arme, munitions en **volées**, dégâts de tir avec **explosions**, dégâts par 10 s. La version des données (build du jeu, commit du dump) est enregistrée dans `data/units.js` (`meta`) et affichée en pied de page ; le workflow accepte un `dump_commit` pour fixer la version. La clé technique de l'unité s'affiche en infobulle sur le titre de sa fiche pour retrouver sa ligne dans les tables.
Corrections apportées grâce à cette méthode : arme à distance des machines (canons) lue dans `battlefield_engines`, PV des véhicules (le bonus de PV n'est plus compté pour chaque membre d'équipage), pièces d'artillerie comptées comme tireurs, vitesse à l'échelle de la carte (× 10).

## Crédits
- **[TW Database](https://twdatabase.com)** : sa page de méthode a servi de modèle à l'onglet « Méthode » et nous a permis de corriger plusieurs erreurs de notre import.
- **[Shazbot/wh3-dump](https://github.com/Shazbot/wh3-dump)** : les tables du jeu en TSV (exportées avec RPFM), source de toutes les données.
- Total War: Warhammer III et son univers appartiennent à Creative Assembly, SEGA et Games Workshop ; ce projet de fan n'est pas affilié.

### Lisibilité (dernières évolutions)
- **Seigneurs et héros** : les pastilles « Seigneurs » / « Héros » donnent toujours accès à ces unités (avec leur effectif réel) ; la case ne sert qu'à les inclure dans « Toutes ». 39 seigneurs/héros sans permission de faction sont rattachés à leur race par le préfixe de leur clé.
- **Matrice typologique et tableaux** : libellés courts, colonnes à largeur fixe, aucune barre de défilement horizontale à 1400 px ; l'onglet « Unités par faction » affiche par défaut les colonnes essentielles (choix « Toutes les colonnes » possible) et masque les colonnes sans aucune valeur.
- **Fiche d'unité** : icônes par type de stat ; le texte de la fiche peut être sélectionné et copié.

### Coût de recrutement comme base de comparaison
Duels, rendement et équilibrage des armées se calculent sur le **coût de recrutement** pour toutes les unités (certaines factions n'ont pas d'entretien dans les tables). Dans le tier list, le coût effectif de campagne = recrutement + tours d'attente ; l'entretien n'y entre que si tu règles « Entretien pris en compte (tours) » au-dessus de 0.
La **fiche d'unité** donne pour chaque stat son rang (« Top X % » / « Bottom X % ») et une barre remplie à valeur ÷ maximum du groupe de comparaison (même catégorie du jeu par défaut ; réglable).

## Langue (FR / EN)
Bouton **FR | EN** en haut à droite ; le choix est mémorisé et peut être forcé par `?lang=en` / `?lang=fr` (changer de langue recharge la page). Le français est la langue source ; `i18n.js` traduit l'affichage en anglais d'après le dictionnaire `i18n_en.js` (clés = texte français, `#` = nombre, `{}` = texte quelconque, par exemple un nom d'unité, qui reste tel quel). Les noms de races existent dans les deux langues (`culturesEn`).
**Noms d'unités et de factions** : le dump ne contient que les textes **anglais** du jeu. Les noms français officiels viennent de la localisation française du jeu, à exporter avec RPFM :
1. ouvrir `local_fr.pack` (dossier `data` du jeu, installation en français) ;
2. extraire `text/db/land_units__.loc.tsv` et `text/db/factions__.loc.tsv` en TSV dans un dossier ;
3. `python tools/convert_rpfm.py wh3-dump --loc-fr DOSSIER_FR` génère `data/names_fr.js` (à commiter). `local_fr.pack` contient un seul gros fichier `text/localisation__.loc` (toutes les clés de texte, pas un fichier par table) : extrais-le (clic droit, *Extract*) dans le dossier ; les clés (`land_units_onscreen_name_…`, `factions_screen_name_…`) suffisent à retrouver les noms. Les variantes d'une même unité (monture, etc.) reçoivent en français le même suffixe qu'en anglais. Le dossier peut contenir soit les exports TSV de RPFM, soit directement les fichiers **`.loc` binaires** extraits du pack (`land_units__.loc`, `factions__.loc`) : `read_loc_binary` les lit sans conversion (format écrit de mémoire : relu sur un fichier de test fabriqué, pas encore sur un vrai fichier du jeu). Sans ce fichier, le site affiche les noms officiels anglais dans les deux langues.

## Front de combat
Le simulateur plafonne le nombre d'attaquants qui peuvent engager une unité en même temps (`sim.js`) :
- **Largeur du front** d'une unité = hommes ÷ nombre de rangs (`rank_depth` de la table `land_units`), par exemple 120 hommes sur 6 rangs = 20 de large. Cette largeur est **conservée tant qu'il reste assez de survivants** (les rangs arrière comblent les trous : la profondeur baisse, pas la largeur), puis égale au nombre de survivants. Même principe que le modèle de front de [Chalkdust](https://chalkdustmagazine.com/blog/modelling-warfare/) (front = troupes ÷ profondeur).
- **Capacité de contact** = `FRONT_K` (4 attaquants par modèle du front) × largeur. **Grands modèles (6 ou moins)** : surface géométrique = périmètre du corps du défenseur ÷ (2 × demi-largeur de l'attaquant moyen) + π (formule de Steiner pour un anneau d'attaquants autour d'un corps convexe). Le corps vient de `battle_entities` (`radius`, `shape`, `radii_ratio` : cercle = rayon ; capsule/ellipse = demi-longueur `radius`, demi-largeur `radius × radii_ratio`). Elle dépend donc de la taille des deux camps (ex. géant : ≈ 15 hallebardiers, ≈ 6 géants). `FRONT_LARGE` = 10 ne sert plus que de repli si une taille manque.
- Les attaquants qui cherchent à engager l'unité (`ENGAGE` = 60 % des hommes de chaque unité attaquante) sont comparés à cette capacité : la mêlée subie est multipliée par capacité ÷ attaquants si elle est dépassée. Le tir n'est pas limité.
`FRONT_K` et `ENGAGE` sont des choix non calibrés sur le jeu (aucune source trouvée) ; les combats équilibrés ne changent pas, les écrasements par le nombre disparaissent.

## Régénération
`tools/convert_rpfm.py` lit les capacités passives de régénération (`wh_main_unit_passive_regeneration`, `wh2_dlc15_unit_passive_regeneration_map`, `wh2_dlc17_unit_passive_horrible_regeneration`) via `land_units_to_unit_abilites_junctions` → `special_ability_to_special_ability_phase_junctions` → `special_ability_phases` (`heal_amount` ÷ `hp_change_frequency`, durée illimitée) et écrit `regen` (fraction des PV max par seconde, 0,001 pour les 86 unités concernées). `sim.js` soigne chaque seconde `regen × (PV max des modèles vivants)` ; **le soin ne ressuscite pas** (les modèles morts, comptés au pire moment, sont perdus), donc un monstre à un seul modèle récupère jusqu'à son maximum et une unité nombreuse seulement ses blessés.
**Hypothèses** : nous lisons `heal_amount` comme une fraction des PV max (non vérifié en jeu) ; pas de brûlure dans le temps, ni d'arrêt du soin quand l'unité brûle (rien dans les tables), ni autres soins passifs (conditionnels, temporaires, objets, sorts).

### Types de dégâts et résistances
Chaque attaque est **physique** ou **magique** (`is_magical` de l'arme de mêlée, du projectile ou de son explosion : 575 armes de mêlée, 124 de tir), éventuellement **enflammée** (`ignition_amount` > 0 : 171 / 129) et **missile** si c'est un tir. Chaque unité porte des résistances en % lues dans `land_units` : `damage_mod_physical`, `damage_mod_magic`, `damage_mod_flame`, `damage_mod_missile` et `damage_mod_all` (parade) ; négatif = vulnérabilité. Le convertisseur y ajoute les `stat_resistance_flame` / `stat_weakness_flame` des capacités passives permanentes (la régénération apporte −20 au feu, « une bénédiction freinée par le feu »). Dans `sim.js` (`resMul`), pour chaque attaque on **additionne** : parade + (résistance magique si l'attaque est magique, sinon physique) + (feu si enflammée) + (missile si tir), puis les dégâts, après l'armure, sont multipliés par `1 − total/100` (total plafonné à `RES_CAP` = 90 %).
**Source et limites** : le principe (addition ; physique ignorée pour la magie ; parade toujours ; missile y compris pour la magie missile) vient de l'explication des développeurs relayée par la communauté (les pages d'origine étaient inaccessibles à notre robot). Non vérifiés : le plafond de 90 %, le cas des armes à la fois enflammées et physiques (traitées comme physiques + feu), et l'ordre exact par rapport à l'armure. Non modélisés : sorts, brûlure dans le temps, arrêt du soin quand l'unité brûle.

## Tier du jeu (indicatif)
Chaque unité affiche un badge **« Tier jeu N »** (1 à 5), lu dans la colonne `tier` de `main_units`, à côté de son nom : cartes du tier list, fiche d'unité, tableau « Unités par faction » et armées du Combat (« T3 » dans la liste). Il est **indicatif et distinct du tier S→F calculé par le site**. Les seigneurs, héros et unités sans tier (valeur 0) n'affichent rien.

**Mobilité = vitesse seule** : dans le mode « efficacité », les autres usages sont divisés par le coût, mais pas la mobilité (diviser une vitesse par un prix classait en tête des unités lentes et bon marché comme les zombies). La fiche d'unité a un contour de la couleur de son tier S→F.

## Interrupteur « Tenir compte du coût » (en-tête)
En tête de la section **Mode** de la barre latérale, un sélecteur à deux grands boutons (« Avec coût » / « Sans coût ») choisit si le **tier list** (tiers, matrice et usages) est rapporté au coût. **Avec coût** (défaut) = efficacité par or ; **Sans coût** = puissance brute, pour prendre la meilleure unité de chaque usage même plus chère et moins rentable (une armée est limitée à 20 unités : l'argent n'est pas le seul facteur limitant). Il pilote le menu « Tier par… » (efficacité ↔ puissance brute) et reste synchronisé avec lui ; le choix est mémorisé. Il est grisé pour « Tier par résultats de duels », déjà calculé à coût égal. Il ne change ni l'onglet Combat ni les duels précalculés, qui restent à coût égal.

## Cache et publication
`python tools/cache_bust.py` ajoute `?v=<empreinte>` aux scripts et styles de `index.html` : sans cela, un navigateur peut garder un ancien `app.js` avec un `index.html` neuf (ou l'inverse) et la page plante. À lancer avant chaque commit qui touche un `.js`, un `.css` ou `data/*.js`.

## Filtres communs et noms de variantes
- **Filtres partagés** : « Tier list » et « Unités par faction » utilisent les mêmes filtres (faction/race, recherche, catégories, usages, case « seigneurs & héros dans Toutes ») : un filtre posé dans un onglet se retrouve dans l'autre. Les colonnes et le groupe de comparaison sont repliés sous « Colonnes et groupe de comparaison ».
- **Doublons** : `tools/convert_rpfm.py` fusionne les unités strictement identiques (par exemple les copies `_mp` de la bataille multijoueur : 75 unités) et renomme les variantes réellement différentes d'une même faction avec la monture ou la variante, par exemple « Neferata (Hellsteed) », « Neferata (Coven Throne) », « Arkhan the Black (Dread Abyssal) » ; le suffixe « (#N) » n'est utilisé qu'en dernier recours.

## Icônes d'usage
Les usages (anti-infanterie, anti-gros, anti-armure, encaisser, distance, charge, mobilité) ont chacun une icône (`u_*` dans `STAT_ICON`, `app.js`) : puces de filtre (icône + libellé court + effectif), en-têtes de la matrice typologique (icône seule, libellé en infobulle), colonne « Meilleur usage » et « Pour quoi l'utiliser » de la fiche d'unité.

## Suite prévue
Les chantiers à venir (niveau et compétences des seigneurs, tier list de compositions, etc.) sont décrits dans [`TODO.md`](TODO.md).

## Bataillons de renom
Les **bataillons de renom** (Regiments of Renown : 262 unités) sont repérés dans `tools/convert_rpfm.py` par le drapeau `is_renown` de `main_units` ou une clé en `_ror` (hors seigneurs, héros, unités « boss » et montures d'Imrik / barge de Grungni), et marqués `ror: 1`. Ils sont mis en valeur : carte au cadre doré, portrait doré, bandeau « Bataillon de renom » avec un laurier, étoile ★ dans les menus de l'onglet Combat. La case **« Exclure les bataillons de renom »** (tier list et unités par faction, mémorisée) les retire des listes, des classements et des choix du Combat ; les duels précalculés les incluent toujours.
Le style est inspiré de la mise en valeur de ces unités dans le jeu (or et laurier) ; je n'ai pas pu consulter les visuels du jeu pour le reproduire à l'identique.

## Mes DLC
Le dump contient la propriété de chaque contenu : `main_unit_ownership_content_pack_junctions` (unité → paquets de contenu) → `ownership_content_pack_requirements` et `ownership_content_pack_required_products` (paquet → ensembles de produits requis) → `ownership_products` (68 jeux et DLC, noms dans la localisation). `tools/convert_rpfm.py` en tire `D.dlc` (produits et paquets) et un champ `pk` par unité.
**Règle du jeu** : un paquet est disponible si **tous** les produits d'**au moins un** de ses ensembles d'exigences sont possédés ; une unité est disponible si **au moins un** de ses paquets l'est (une même unité peut venir de plusieurs DLC) ; sans paquet elle est toujours disponible. Les contenus gratuits (`is_flc`) comptent toujours comme possédés.
**Interface** : « Choisir mes DLC… » ouvre une fenêtre (`dlc.js`) avec les 68 produits groupés par jeu (Warhammer III, II, I), le nombre d'unités qui en dépendent, et des raccourcis « Tout cocher / Tout décocher / Gratuits seulement ». La case « Masquer les DLC que je n'ai pas » (tier list, unités par faction et combat, toutes synchronisées) applique le filtre partout via `inScope()` ; par défaut tout est possédé, donc le filtre ne change rien tant qu'on ne décoche rien. Les choix sont mémorisés.
**Limites** : seules les unités sont filtrées (pas les factions, seigneurs de départ ni compétences) ; un produit gratuit non réclamé est compté comme possédé ; les duels précalculés incluent toutes les unités.

## Mémorisation (localStorage) et partage des DLC
- **Préférences mémorisées** dans le navigateur (clés `tww3.*`, via `PREF` dans `prep.js`, toujours sous `try/catch`) : faction ou race, catégories, usages, recherche, case « seigneurs & héros », mode, métrique, rang, typologie, vue, curseurs de poids et de coût, groupe de comparaison (`tww3.ui`) ; colonnes, groupe de comparaison et tri de « Unités par faction » (`tww3.browse`) ; armées du combat avec leurs factions et seigneurs (`tww3.army`) ; onglet actif (`tww3.tab`) ; ainsi que la langue (`lang`), l'exclusion des bataillons de renom (`noRor`), le filtre DLC et les produits possédés (`dlcOn`, `dlcOwn`) et l'interrupteur de coût (`costOn`). Les valeurs invalides ou périmées (faction disparue, unité retirée) sont ignorées.
- **Factions grisées** : dans le menu race/faction, les races et factions sans aucune unité disponible avec les filtres actuels (bataillons de renom exclus, DLC non possédés) sont grisées et non sélectionnables.
- **Savoir quels DLC possède quelqu'un** : un site ne peut pas lire les DLC d'un compte Steam sans que la personne se connecte (les vérifications de propriété de DLC de l'API Steam sont réservées aux éditeurs). À la place, la fenêtre « Mes DLC » propose un **code de partage** (`dlc.js`) : chacun copie son code ou son lien (`?dlc=…`), l'autre le colle dans « Importer » (ou ouvre le lien) et retrouve la même liste. Le code contient l'empreinte de la liste des 68 produits : un code issu d'une autre version des données est refusé.

## Tuiles colorisées et import depuis Steam
- **Tuiles par tier** : chaque carte du tier list prend la couleur de son tier (S doré, A rouge, B violet, C bleu, D vert, F gris) en liseré et en teinte (`data-t`, variables `--S`…`--F`). Les bataillons de renom ont double cadre, laurier et bandeau « Bataillon de renom » dans la couleur de leur tier (plus en or, qui se confondait avec le tier S).
- **Retrouver ses DLC depuis Steam** : dans « Mes DLC », le volet « Retrouver mes DLC depuis Steam » demande de copier le texte de la page `store.steampowered.com/account/licenses/` et de le coller ; `dlc.js` y cherche le nom de chaque produit (texte normalisé, noms les plus longs d'abord, ce qui est reconnu est retiré pour ne pas confondre « Shadows of Change » et « Shadows of Change - Kislev ») et coche les produits reconnus. La liste de Steam est **paginée** (plusieurs pages) : chaque collage dans le champ s'**ajoute** aux précédents et l'analyse est refaite sur l'ensemble (« Vider » recommence) ; les pages sans contenu Total War peuvent être sautées. Tout se passe dans le navigateur ; chaque produit a un lien vers sa page Steam (`steam_store_id` de `ownership_products`). Testé sur un texte d'exemple, pas sur un vrai compte : un nom de DLC différent sur Steam peut ne pas être reconnu, il suffit alors de cocher à la main.
