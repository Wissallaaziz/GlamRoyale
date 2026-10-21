'use strict';
/**
 * Entraîne le réflexe « explorer ou fuir » (réseau 3–6–2) par APPRENTISSAGE SUPERVISÉ.
 *
 *   node tools/train_supervised.js [--seed 7] [--samples 2400] [--epochs 150] [--out weights]
 *
 * Écrit dans weights/ :
 *   reflex.json          poids + précision mesurée (relu par les tests)
 *   reflex.js            constante PRETRAINED_REFLEX chargée par index.html et training.html
 *   reflex_history.json  perte et précision par époque
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadEngine, ROOT } = require('./loader.js');

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return out;
}

const E = loadEngine();
const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(ROOT, args.out || 'weights');
const { model, history, report } = E.trainReflexNet({
  seed: Number(args.seed ?? 7),
  samples: Number(args.samples ?? 2400),
  epochs: Number(args.epochs ?? 150),
});

// Référence : un « réseau » qui répondrait toujours « explorer » (classe majoritaire).
const check = E.makeReflexDataset(5000, E.makeRng(99));
const baseline = check.filter((s) => s.label === 'explore').length / check.length;
const fresh = E.evaluateClassifier(model.net, check);

console.log('Apprentissage supervisé 3-6-2 : ' + report.trainCount + ' exemples d\'apprentissage, ' + report.validationCount + ' de validation, ' + report.epochs + ' époques');
console.log('perte (époque 1 -> ' + report.epochs + ') : ' + history[0].loss.toFixed(3) + ' -> ' + history[history.length - 1].loss.toFixed(3));
console.log('précision apprentissage : ' + (report.trainAccuracy * 100).toFixed(1) + ' %');
console.log('précision validation    : ' + (report.validationAccuracy * 100).toFixed(1) + ' %  (matrice ' + JSON.stringify(report.confusion) + ')');
console.log('précision sur 5000 nouveaux exemples : ' + (fresh.accuracy * 100).toFixed(1) + ' %  (toujours « explorer » : ' + (baseline * 100).toFixed(1) + ' %)');

const meta = {
  trainedWith: 'apprentissage supervisé (rétropropagation, descente de gradient stochastique)',
  seed: report.seed,
  epochs: report.epochs,
  trainAccuracy: Math.round(report.trainAccuracy * 1e4) / 1e4,
  validationAccuracy: Math.round(report.validationAccuracy * 1e4) / 1e4,
  newExamplesAccuracy: Math.round(fresh.accuracy * 1e4) / 1e4,
  baselineAlwaysExplore: Math.round(baseline * 1e4) / 1e4,
  threshold: report.threshold,
};
const json = model.toJSON(meta);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'reflex.json'), JSON.stringify(json));
fs.writeFileSync(
  path.join(outDir, 'reflex.js'),
  '/* Généré par tools/train_supervised.js : poids du réflexe explorer/fuir (réseau 3-6-2, apprentissage supervisé).\n' +
  '   Chargé par index.html et training.html. Pour réentraîner : npm run train:reflex */\n' +
  'const PRETRAINED_REFLEX = ' + JSON.stringify(json) + ';\n'
);
fs.writeFileSync(path.join(outDir, 'reflex_history.json'), JSON.stringify(history));
console.log('Poids écrits dans', outDir);
