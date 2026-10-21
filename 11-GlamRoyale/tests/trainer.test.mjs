import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../tools/loader.js';
const E = loader.loadEngine();

test('Trainer : une génération complète s\'exécute et enregistre son historique', () => {
  const t = new E.Trainer({ size: 12, groupSize: 12, rounds: 1, maxFrames: 700, seed: 3 });
  const row = t.runGeneration();
  assert.equal(row.generation, 0);
  assert.ok(row.best >= row.average);
  assert.equal(t.generation, 1);
  assert.equal(t.history.length, 1);
  assert.equal(t.lastBest.genome.length, 295);
});

test('Trainer : size doit être un multiple de groupSize', () => {
  assert.throws(() => new E.Trainer({ size: 13, groupSize: 12 }), /multiple/);
});

test('Trainer : reproductible avec la même graine', () => {
  const run = () => new E.Trainer({ size: 12, groupSize: 12, rounds: 1, maxFrames: 500, seed: 5 }).runGeneration();
  assert.deepEqual(run(), run());
});

test('Trainer : démarre depuis un génome fourni (seedGenome)', () => {
  const g = E.NeuralNet.randomWeights(E.BRAIN_LAYERS, E.makeRng(99));
  const t = new E.Trainer({ size: 12, groupSize: 12, rounds: 1, maxFrames: 300, seed: 1, seedGenome: g });
  assert.deepEqual(t.evo.population[0].genome, g);
});

test('un génome entraîné donne un cerveau utilisable dans une vraie partie', () => {
  const t = new E.Trainer({ size: 12, groupSize: 12, rounds: 1, maxFrames: 500, seed: 2 });
  t.runGeneration();
  const brains = [new E.Brain(t.lastBest.genome), ...Array.from({ length: 5 }, () => new E.Brain(null, E.makeRng(4)))];
  const w = new E.GameWorld({ withPlayer: false, brains, seed: 8, maxFrames: 400 });
  while (!w.over) w.step();
  assert.equal(w.fighters.length, 6);
  assert.ok(w.rankings.length === 6);
});

test('Trainer : worldOptions est transmis à chaque partie (ici : phéromones désactivées)', () => {
  const t = new E.Trainer({ size: 12, groupSize: 12, rounds: 1, maxFrames: 400, seed: 2, worldOptions: { pheromone: { deposit: 0 } } });
  t.step(300);
  assert.equal(t.world.pheromones.depositRate, 0);
  assert.equal(t.world.pheromones.total(), 0, 'aucune piste ne se forme');
  const normal = new E.Trainer({ size: 12, groupSize: 12, rounds: 1, maxFrames: 400, seed: 2 });
  normal.step(300);
  assert.ok(normal.world.pheromones.total() > 0);
});
