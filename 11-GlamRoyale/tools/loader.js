'use strict';
/**
 * Charge le moteur (les mêmes fichiers que le navigateur, dans le même ordre) pour les
 * tests Node et l'entraînement en ligne de commande. vehicle.js (copie conforme du dépôt)
 * est chargé tel quel : il reçoit les remplaçants de p5 définis dans p5shim.js.
 *
 * Les scripts du jeu sont des scripts classiques (classes et fonctions globales) : on les
 * concatène dans une fonction et on renvoie les symboles utiles dans un objet.
 */
const fs = require('node:fs');
const path = require('node:path');
const stubs = require('./p5shim.js');

const ROOT = path.join(__dirname, '..');

// ORDRE DE CHARGEMENT : identique à celui d'index.html (une classe doit être définie
// avant la sous-classe qui l'étend).
const ENGINE_FILES = [
  'vehicle.js',
  'core/rng.js',
  'entities/steeringVehicle.js',
  'entities/weapons.js',
  'entities/bullet.js',
  'entities/fighter.js',
  'entities/playerFighter.js',
  'ai/neuralNet.js',
  'ai/supervised.js',
  'ai/exploreFleeNet.js',
  'ai/brain.js',
  'ai/perception.js',
  'ai/genetics.js',
  'entities/bot.js',
  'entities/obstacle.js',
  'entities/loot.js',
  'world/obstacleRules.js',
  'world/zone.js',
  'world/lootRules.js',
  'world/pheromones.js',
  'core/game.js',
  'ai/trainer.js',
];

const EXPORTS = [
  'makeRng', 'gaussian', 'wrapAngle', 'clampValue', 'shuffleInPlace',
  'Vehicle', 'SteeringVehicle', 'Obstacle', 'WEAPONS', 'weaponRange', 'Bullet', 'Fighter', 'PlayerFighter', 'Bot',
  'NeuralNet', 'Brain', 'BRAIN_INPUTS', 'BRAIN_OUTPUTS', 'BRAIN_LAYERS',
  'REFLEX_LAYERS', 'REFLEX_LABELS', 'REFLEX_THRESHOLD', 'reflexDanger', 'reflexTeacher', 'makeReflexDataset',
  'splitDataset', 'bceLoss', 'computeGradient', 'backpropStep', 'evaluateClassifier', 'trainSupervised',
  'ExploreFleeNet', 'trainReflexNet', 'defaultReflexNet', 'REFLEX_EFFECT',
  'PheromoneField', 'PHEROMONE_DEFAULTS',
  'PERCEPTION', 'perceive', 'reflexInputs',
  'crossover', 'mutate', 'computeFitness', 'Evolution', 'Trainer',
  'generateObstacles', 'segmentBlocked', 'pointInObstacle',
  'Zone', 'DEFAULT_ZONE_PHASES',
  'Loot', 'LOOT_TYPES', 'generateLoot', 'lootUseful', 'applyLoot',
  'GameWorld', 'GAME_DEFAULTS',
];

/**
 * Poids pré-entraînés du réflexe : dans le navigateur ils viennent de weights/reflex.js (constante
 * PRETRAINED_REFLEX) ; ici on lit le même contenu dans weights/reflex.json. Absent : undefined, et
 * defaultReflexNet() entraîne alors le réseau à la volée.
 */
function readPretrainedReflex() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'weights', 'reflex.json'), 'utf8'));
  } catch (e) {
    return undefined;
  }
}

function loadEngine(options = {}) {
  const code = ENGINE_FILES.map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');
  const names = Object.keys(stubs);
  const pretrained = options.pretrainedReflex === undefined ? readPretrainedReflex() : options.pretrainedReflex;
  const factory = new Function(...names, 'PRETRAINED_REFLEX', code + '\n;return {' + EXPORTS.join(',') + '};');
  return factory(...names.map((n) => stubs[n]), pretrained);
}

module.exports = { loadEngine, ENGINE_FILES, ROOT };
