'use strict';
/**
 * Entraînement par neuroévolution en ligne de commande (plus rapide que le navigateur).
 *
 *   node tools/train.js [--gens 60] [--size 36] [--rounds 3] [--seed 1]
 *                       [--frames 7000] [--resume weights/best.json] [--out weights]
 *
 * Après CHAQUE génération, le meilleur génome est écrit dans :
 *   weights/best.json  (format JSON, importable dans training.html)
 *   weights/best.js    (chargé par index.html avec une balise <script>, fonctionne en file://)
 *   weights/history.json (courbe de fitness)
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

function writeWeights(dir, brainJson, history) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'best.json'), JSON.stringify(brainJson));
  fs.writeFileSync(
    path.join(dir, 'best.js'),
    '/* Généré par tools/train.js : poids du meilleur cerveau (génération ' + brainJson.generation + ').\n' +
    '   Chargé par index.html AVANT sketch.js. Pour réentraîner : npm run train */\n' +
    'const PRETRAINED_BRAIN = ' + JSON.stringify(brainJson) + ';\n'
  );
  fs.writeFileSync(path.join(dir, 'history.json'), JSON.stringify(history));
}

function main() {
  const E = loadEngine();
  const args = parseArgs(process.argv.slice(2));
  const gens = Number(args.gens ?? 60);
  const outDir = path.resolve(ROOT, args.out || 'weights');
  let seedGenome = null;
  if (args.resume) {
    const saved = JSON.parse(fs.readFileSync(path.resolve(args.resume), 'utf8'));
    seedGenome = E.Brain.fromJSON(saved).weights;
    console.log('Reprise depuis', args.resume, '(génération', saved.generation, ')');
  }
  const trainer = new E.Trainer({
    size: Number(args.size ?? 36),
    rounds: Number(args.rounds ?? 3),
    maxFrames: Number(args.frames ?? 7000),
    seed: Number(args.seed ?? 1),
    seedGenome,
  });
  console.log('Entraînement : ' + gens + ' générations, population ' + trainer.size + ', ' + trainer.rounds + ' tours/génération');
  const t0 = Date.now();
  for (let g = 0; g < gens; g++) {
    const row = trainer.runGeneration();
    const brain = new E.Brain(trainer.lastBest.genome).toJSON({
      generation: row.generation + 1,
      fitness: Math.round(row.best * 10) / 10,
      trainedWith: { size: trainer.size, rounds: trainer.rounds, seed: Number(args.seed ?? 1) },
    });
    writeWeights(outDir, brain, trainer.history);
    const s = ((Date.now() - t0) / 1000).toFixed(0);
    console.log('gen ' + String(row.generation + 1).padStart(3) + '/' + gens +
      '  meilleure ' + row.best.toFixed(1).padStart(6) + '  moyenne ' + row.average.toFixed(1).padStart(6) + '  (' + s + ' s)');
  }
  console.log('Terminé. Poids écrits dans', outDir);
}

main();
