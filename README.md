# Glam Royale

Un battle royale **girly** vu de dessus, en JavaScript et p5.js. Tu affrontes 11 bots sur une île pastel pendant qu'un nuage de paillettes rétrécit. Les bots sont pilotés par les **steering behaviors de Craig W. Reynolds** (*Steering Behaviors For Autonomous Characters*, GDC 1999), et **deux réseaux de neurones** les pilotent : un **réflexe 3-6-2 appris par apprentissage supervisé** (explorer ou fuir) et un **cerveau 16-12-7 évolutif** qui décide dans quelle proportion chaque comportement est utilisé. Les bots communiquent aussi par des **phéromones artificielles** (traînées de paillettes).

## Lancer le jeu

1. Ouvrir `index.html` dans un navigateur (ou le servir avec Live Server / `npx serve`). Aucune installation : p5.js 1.9.4 est fourni dans `libraries/`.
2. Entrée ou clic pour jouer, `W` pour regarder les bots seuls, `T` pour entraîner les réseaux.

| Touche | Action |
|---|---|
| flèches, ou Z Q S + E (AZERTY), ou W A S + E (QWERTY) | se déplacer (la droite est sur **E** : D est réservée au debug) |
| **D** | **mode debug** (comme dans les exercices du cours) : Wander + capteurs de piste |
| **F** | afficher/masquer les phéromones (traînées de paillettes) |
| souris | viser |
| clic gauche ou Espace | tirer |
| 1 2 3 | changer d'arme (si elle est possédée) |
| N | afficher/masquer le « cerveau » du bot le plus proche |
| M / P | son / pause |
| Espace (une fois éliminée) | accélérer le spectateur |
| R ou Entrée (fin de partie, ou une fois éliminée) / Échap | rejouer / menu |

**Règles.** Dernière en jeu = gagnante. Hors de la zone rose on perd du *glow* (vie), de plus en plus vite par phase. Le butin (bouclier cœur, potion glow, munitions, sac à main avec une arme) est ramassé en passant dessus. Armes : pistolet à bulles, lance-cœurs (tir légèrement guidé : le cœur applique le Seek hérité vers l'ennemie la plus proche devant lui), éventail à confettis. Les obstacles arrêtent les tirs (couvert).

## Mode debug (touche D)

Appuie sur **D** (menu, partie, observation ou spectatrice) pour voir le Wander des bots, comme dans les exercices du cours :

- **cercle blanc/violet** : le cercle de Wander, centré à `distanceCercle` devant la bot ;
- **point rouge** : le centre du cercle, relié à la bot par une ligne pointillée ;
- **point vert** : la cible sur le cercle (angle `wanderTheta` + cap de la bot), c'est le point que Wander vise ;
- **ligne orange** : de la bot vers ce point vert (direction de la force de Wander) ;
- **points violets** : les 3 capteurs de piste (gauche, centre, droite) qui sentent les phéromones.

Une légende s'affiche dans le HUD tant que le debug est actif. La géométrie vient de `SteeringVehicle.wanderDebug()`, qui **lit** l'état du Wander hérité de `Vehicle` sans recalculer de force. On n'active pas `Vehicle.debug` : la base dessine pendant le calcul de la force, hors du moment du rendu et sans la caméra, ce qui ne s'afficherait pas correctement dans ce jeu.

## Respect de l'article de Reynolds

Trois niveaux, séparés dans le code :

| Niveau | Où | Rôle |
|---|---|---|
| **Choix d'action** | `entities/bot.js` (`think`), `ai/` | perception, puis réseau de neurones : poids des comportements |
| **Steering** | `entities/steeringVehicle.js`, `entities/bot.js` (`computeSteering`) | calcul des forces |
| **Locomotion** | `vehicle.js` (`applyForce`, `update`) | intégration du mouvement |

| Besoin du jeu | Comportement de Reynolds |
|---|---|
| explorer | **Wander** (hérité de `Vehicle`) |
| aller au butin, retourner en zone | **Seek / Arrival** |
| attaquer | **Pursuit** (position future), arrêt à distance de combat |
| fuir | **Evasion / Flee** |
| contourner arbres et rochers | **Obstacle Avoidance** |
| rester sur l'île et dans la zone | **Containment** |
| ne pas se superposer | **Separation** |
| suivre une piste | **Trail following** (3 capteurs, puis Seek hérité vers la case la plus forte) |

**Combinaison** (§ « combining behaviors ») : par **priorité avec budget de force** (`accumulate`) : Obstacle Avoidance, puis Containment, puis Separation, puis la somme pondérée des comportements stratégiques. La force finale est toujours tronquée à `maxForce`. La vitesse est bornée par `maxSpeed`.

## Réseaux de neurones (deux, de natures différentes)

Dans les deux cas, le réseau ne calcule **aucune force** : il choisit, les forces viennent de Reynolds.

### 1. Réflexe « explorer ou fuir » : 3 → 6 → 2, apprentissage SUPERVISÉ

- **Entrées (3)** : proximité de la menace, vitesse d'approche (rapprochement), vitesse propre de la bot.
- **Sorties (2)** : probabilités « explorer » / « fuir » (sigmoïde) ; couche cachée tanh.
- **Apprentissage** (`ai/supervised.js`) : rétropropagation écrite à la main, descente de gradient stochastique, perte d'entropie croisée binaire, taux d'apprentissage décroissant. Les exemples étiquetés viennent d'une règle « professeur » (danger pondéré par la menace, l'approche et la vitesse, seuil 0,38). Le gradient a été vérifié par différences finies et le code par un test XOR.
- **Mesuré** (`npm run train:reflex`, 150 époques) : exactitude 99,8 % à l'entraînement, **99,6 % en validation**, 99,6 % sur de nouveaux exemples ; une bot qui explore toujours aurait 78,9 %.
- **Effet dans le jeu** (`REFLEX_EFFECT` dans `entities/bot.js`) : quand le réflexe dit « fuir », le poids d'Evasion monte à 0,85 au moins, Pursuit et suivi de piste sont coupés ; sinon l'Evasion est atténuée.

### 2. Cerveau évolutif : 16 → 12 → 7, NEUROÉVOLUTION

- **Architecture** : perceptron multicouche écrit à la main (tanh puis sigmoïde), **295 poids** dans un tableau plat (le génome).
- **Entrées (16)** : proximité et angle (sin/cos) de l'ennemie et du butin les plus proches, marge et angle par rapport à la prochaine zone, glow, munitions, bouclier, danger d'obstacle, foule, glow de l'ennemie, **intensité de la piste de phéromones devant**.
- **Sorties (7)** : poids Seek-butin, Pursuit, Evasion, Wander, retour en zone, **suivi de piste**, envie de tirer (> 0,5).
- **Neuroévolution** (`ai/genetics.js`) : sélection par tournoi, croisement uniforme, mutation gaussienne, élitisme. Fitness : survie, classement, victoire, éliminations, dégâts, butin, moins le temps hors zone.

### Phéromones artificielles (`world/pheromones.js`)

Une grille de cases de 60 px. Chaque combattante **dépose** de la substance en bougeant (répartie bilinéairement) ; elle **se diffuse** vers les 4 cases voisines (20 %, total conservé, bords sans fuite) puis **s'évapore** (0,6 % par mise à jour, une mise à jour toutes les 3 frames, demi-vie ≈ 6 s) ; plafond 6 par case. `SteeringVehicle.trailSensors` échantillonne 3 capteurs devant la bot et `followTrail` en déduit une cible que le Seek hérité de `Vehicle` suit. Les bots s'orientent ainsi collectivement sans communiquer directement (stigmergie). Les traînées s'affichent avec **F**.

### Apprentissage : les deux modes

1. **Entraînement accéléré** : page `training.html` (vue en direct, courbe de fitness, vitesse réglable, export `best.json` / `best.js`, bouton « Utiliser dans le jeu ») ou `npm run train` (60 générations, population 36). Le réflexe se ré-entraîne avec `npm run train:reflex`.
2. **Évolution en jeu** : les poids de `weights/best.js` (génération 60) sont chargés au lancement, puis la population des 11 bots **continue d'évoluer entre deux parties**.

**Résultat mesuré** (`npm run evaluate`, 40 parties, 6 bots entraînés contre 6 bots aléatoires dans les mêmes parties) :

| | classement moyen | éliminations/partie (groupe) | survie moyenne | victoires |
|---|---|---|---|---|
| entraînés | **4,54** | 8,53 | 39 s | 38 / 40 |
| aléatoires | 8,46 | 2,38 | 19 s | 2 / 40 |

(Au hasard, les deux groupes auraient 6,5.)

**Ablation honnête** (2 graines × 60 parties, entraînement de 60 générations pour chaque variante, classement moyen du groupe entraîné contre aléatoire, graines 1 / 2) :

| variante | classement | victoires |
|---|---|---|
| réflexe + phéromones | 4,65 / 4,67 | 54 / 55 sur 60 |
| sans réflexe | 4,42 / 4,63 | 57 / 58 |
| sans phéromones | 4,85 / 4,64 | 55 / 57 |
| ni l'un ni l'autre | 4,69 / 4,50 | 55 / 57 |

Les écarts sont de l'ordre du bruit entre deux graines : **contre des adversaires aléatoires, ni le réflexe ni les phéromones n'améliorent mesurablement le classement.** Ce test est trop facile pour les départager (le cerveau évolué bat déjà presque toujours des bots aléatoires). Leur intérêt est ici d'ordre comportemental et pédagogique (fuite visible, traînées, orientation collective) ; une vraie mesure demanderait des adversaires plus forts et davantage de graines.

## Le fichier `vehicle.js`

`vehicle.js` est une **copie conforme, non modifiée**, de `4-Wander/vehicle.js` du dépôt du cours. Tout ce qui manque (steerTo, flee « vitesse désirée », pursue/evade avec horizon borné, separate, avoidObstacles, contain, accumulate) est ajouté dans la **sous-classe** `SteeringVehicle` (`entities/steeringVehicle.js`), qui réutilise `seek`, `arrive`, `wander`, `applyForce` et `update` par héritage. Aucun monkey patch du prototype.

Toutes les entités mobiles sont des `Vehicle` : `Fighter` (donc `Bot`, `PlayerFighter`) et `Bullet`. Les obstacles et le butin (immobiles) étendent aussi `Vehicle`. La joueuse n'est pas téléportée : ses touches produisent une cible relative puis une force de Seek.

## Structure

```
index.html  sketch.js  style.css  vehicle.js (base, non modifiée)
core/      rng.js, game.js (GameWorld : toute la logique, sans dessin)
entities/  steeringVehicle, fighter, bot, playerFighter, bullet, weapons, obstacle, loot
world/     zone.js (zone qui rétrécit), pheromones.js, obstacleRules.js, lootRules.js
ai/        neuralNet, brain, perception, genetics, trainer, supervised, exploreFleeNet
ui/        palette, render, hud, particles, sound (Web Audio), training
weights/   best.js (chargé par le jeu), best.json, history.json, reflex.js/json (réflexe 3-6-2)
tools/     loader.js, p5shim.js, train.js, train_supervised.js, evaluate.js
tests/     *.test.mjs (node:test)
training.html, training.css
```

Ordre de chargement (`index.html`) : p5, `vehicle.js`, sous-classes, IA, monde, `weights/best.js`, `weights/reflex.js`, interface, `sketch.js`.

## Paramètres principaux

- **Île** : rayon 1500 px (carte d'environ 3000 × 3000), 70 obstacles, 90 butins, 12 combattantes, 9000 frames maximum (2 min 30 à 60 i/s).
- **Combattante** : `maxSpeed` 3,4 px/frame, `maxForce` 0,16 (joueuse 0,3), rayon 14, glow 100, bouclier max 60, munitions 40 au départ (max 120).
- **Zone** (frames à 60/s, rayons en fraction de l'île) : 5 phases `{attente, rétrécissement, rayon, dégâts/frame}` = 900/700/0,62/0,03 · 600/600/0,38/0,05 · 480/500/0,20/0,08 · 360/400/0,08/0,12 · 0/360/0,02/0,20.
- **Perception** : ennemie vue à 700 px, butin à 800 px, foule comptée à 320 px.
- **Armes** (dégâts / vitesse / portée) : bulles 8 / 9 / 495 px, cœurs 15 / 7,5 / 525 px, confettis 5 × 5 plombs / 8 / 208 px.

## Tests

```
npm test            (ou : node --test)
```

**170 tests `node:test`, tous réussis** : steering (direction et grandeur des forces, bornes `maxForce` / `maxSpeed`, priorités, vitesse nulle, cible confondue), réseau (dimensions, déterminisme, export JSON), génétique (croisement, mutation, élitisme, amélioration sur une fitness simple), perception (dont la piste), apprentissage supervisé (gradient par différences finies, XOR, exactitude), phéromones (conservation, diffusion, évaporation, capteurs), réflexe en jeu, zone, partie complète (reproductibilité, pas de sortie de l'île, classement 1..N), entraîneur, son.

Hors navigateur, les tests utilisent `tools/p5shim.js`, un adaptateur minimal de `p5.Vector` : il ne prouve pas la compatibilité avec p5 réel. Le jeu a donc aussi été validé dans un vrai navigateur (Chromium) : déplacement, tir, pause, élimination et spectateur, fin de partie et évolution d'une génération, entraînement puis « Utiliser dans le jeu », aucune erreur console.

## Limites

- L'évolution en jeu n'est pas sauvegardée d'une session à l'autre : pour garder des poids, utiliser l'export de `training.html` et remplacer `weights/best.js`.
- Les bots ne perçoivent pas à travers la ligne de vue : ils « voient » à 700 px, mais ne tirent que si la ligne de tir est dégagée.
- La musique n'existe pas : seuls des effets sonores synthétisés sont joués.
