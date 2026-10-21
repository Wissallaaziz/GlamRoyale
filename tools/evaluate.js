'use strict';
/**
 * Mesure l'intérêt de l'entraînement : des bots au cerveau entraîné affrontent des bots au
 * cerveau aléatoire dans les MÊMES parties (6 contre 6). Plus le classement moyen est bas
 * (1 = gagnante), mieux c'est. Au hasard, les deux groupes auraient un classement moyen de 6.5.
 *
 *   node tools/evaluate.js [--games 40] [--weights weights/best.json] [--seed 1000]
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
const games = Number(args.games ?? 40);
const seed0 = Number(args.seed ?? 1000);
const file = path.resolve(ROOT, args.weights || 'weights/best.json');
const champion = E.Brain.fromJSON(JSON.parse(fs.readFileSync(file, 'utf8'))).weights;

const stats = { trained: { place: 0, kills: 0, wins: 0, n: 0, survival: 0 }, random: { place: 0, kills: 0, wins: 0, n: 0, survival: 0 } };
for (let g = 0; g < games; g++) {
  const brains = [];
  const kind = [];
  for (let i = 0; i < 12; i++) {
    const trained = i % 2 === 0;
    brains.push(trained ? new E.Brain(champion) : new E.Brain(null, E.makeRng(seed0 + g * 50 + i)));
    kind.push(trained ? 'trained' : 'random');
  }
  const w = new E.GameWorld({ withPlayer: false, brains, seed: seed0 + g, maxFrames: 9000 });
  while (!w.over) w.step();
  w.fighters.forEach((f, i) => {
    const s = stats[kind[i]];
    s.place += f.placement;
    s.kills += f.kills;
    s.survival += f.survivalFrames;
    s.wins += f.placement === 1 ? 1 : 0;
    s.n++;
  });
}
for (const k of ['trained', 'random']) {
  const s = stats[k];
  console.log(k.padEnd(8) + ' classement moyen ' + (s.place / s.n).toFixed(2) +
    ' | éliminations/partie ' + (s.kills / games).toFixed(2) +
    ' | survie moyenne ' + (s.survival / s.n / 60).toFixed(1) + ' s' +
    ' | victoires ' + s.wins + '/' + games);
}
