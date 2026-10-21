import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../tools/loader.js';
const E = loader.loadEngine();

test('crossover : chaque gène vient d\'un des deux parents', () => {
  const a = new Array(50).fill(0);
  const b = new Array(50).fill(1);
  const c = E.crossover(a, b, E.makeRng(1));
  assert.equal(c.length, 50);
  assert.ok(c.every((v) => v === 0 || v === 1));
  assert.ok(c.includes(0) && c.includes(1));
});

test('mutate : taux 0 ne change rien, taux 1 change presque tout', () => {
  const g = new Array(100).fill(0.5);
  assert.deepEqual(E.mutate(g, 0, 0.5, E.makeRng(1)), g);
  const m = E.mutate(g, 1, 0.5, E.makeRng(1));
  assert.ok(m.filter((v, i) => v !== g[i]).length > 90);
  assert.deepEqual(g, new Array(100).fill(0.5), 'le génome d\'origine n\'est pas modifié');
});

test('mutate : les poids restent dans la limite', () => {
  const m = E.mutate(new Array(200).fill(5.9), 1, 5, E.makeRng(2), 6);
  assert.ok(m.every((v) => v >= -6 && v <= 6));
});

test('nextGeneration : taille conservée, génération +1, élites intactes', () => {
  const evo = new E.Evolution({ size: 10, layers: [3, 2], rng: E.makeRng(1), eliteCount: 2, immigrants: 0 });
  evo.population.forEach((ind, i) => { ind.fitness = i; });
  const bestGenome = evo.population[9].genome.slice();
  const secondGenome = evo.population[8].genome.slice();
  evo.nextGeneration();
  assert.equal(evo.population.length, 10);
  assert.equal(evo.generation, 1);
  assert.deepEqual(evo.population[0].genome, bestGenome);
  assert.deepEqual(evo.population[1].genome, secondGenome);
  assert.ok(evo.population.every((i) => i.fitness === 0), 'fitness remise à zéro');
});

test('l\'évolution améliore une fitness simple (somme des poids)', () => {
  const evo = new E.Evolution({ size: 30, layers: [4, 3], rng: E.makeRng(11), mutationRate: 0.15, mutationScale: 0.3 });
  const score = (g) => g.reduce((s, v) => s + v, 0);
  const evaluate = () => evo.population.forEach((ind, i) => evo.setFitness(i, score(ind.genome)));
  evaluate();
  const first = evo.best().fitness;
  for (let g = 0; g < 40; g++) { evaluate(); evo.nextGeneration(); }
  evaluate();
  assert.ok(evo.best().fitness > first + 3, 'meilleure fitness : ' + first + ' -> ' + evo.best().fitness);
});

test('seedFrom : le n°0 est exactement le génome donné, les autres en sont des variantes', () => {
  const evo = new E.Evolution({ size: 6, layers: [3, 2], rng: E.makeRng(1) });
  const g = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8];
  evo.seedFrom(g.slice(0, 8), 1, 0.01);
  assert.deepEqual(evo.population[0].genome, g);
  assert.notDeepEqual(evo.population[1].genome, g);
});

test('computeFitness : gagnante > éliminée ; la zone pénalise ; jamais négative', () => {
  const base = { survivalFrames: 3000, kills: 0, damageDealt: 0, lootCount: 0, zoneFrames: 0 };
  const win = E.computeFitness({ ...base, placement: 1, kills: 3 }, 12, 9000);
  const out = E.computeFitness({ ...base, survivalFrames: 200, placement: 12 }, 12, 9000);
  assert.ok(win > out);
  const noZone = E.computeFitness({ ...base, placement: 5 }, 12, 9000);
  const zone = E.computeFitness({ ...base, placement: 5, zoneFrames: 500 }, 12, 9000);
  assert.ok(zone < noZone);
  assert.equal(E.computeFitness({ ...base, survivalFrames: 0, placement: 12, zoneFrames: 100000 }, 12, 9000), 0);
});
