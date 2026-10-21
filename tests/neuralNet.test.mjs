import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../tools/loader.js';
const E = loader.loadEngine();

test('weightCount : le cerveau 16-12-7 a 295 poids, le réflexe 3-6-2 en a 38', () => {
  assert.deepEqual(E.BRAIN_LAYERS, [16, 12, 7]);
  assert.equal(E.NeuralNet.weightCount([16, 12, 7]), 16 * 12 + 12 + 12 * 7 + 7);
  assert.equal(E.NeuralNet.weightCount(E.BRAIN_LAYERS), 295);
  assert.equal(E.NeuralNet.weightCount(E.REFLEX_LAYERS), 3 * 6 + 6 + 6 * 2 + 2);
});

test('forward : bonnes dimensions et sorties dans [0, 1]', () => {
  const net = new E.NeuralNet(E.BRAIN_LAYERS, null, E.makeRng(1));
  const out = net.forward(new Array(E.BRAIN_INPUTS).fill(0.5));
  assert.equal(out.length, E.BRAIN_OUTPUTS);
  for (const v of out) assert.ok(v >= 0 && v <= 1);
});

test('forward : déterministe pour un même génome et les mêmes entrées', () => {
  const g = E.NeuralNet.randomWeights(E.BRAIN_LAYERS, E.makeRng(7));
  const a = new E.NeuralNet(E.BRAIN_LAYERS, g);
  const b = new E.NeuralNet(E.BRAIN_LAYERS, g);
  const x = Array.from({ length: E.BRAIN_INPUTS }, (_, i) => Math.sin(i));
  assert.deepEqual(a.forward(x), b.forward(x));
});

test('même graine -> même génome ; graines différentes -> génomes différents', () => {
  const g1 = E.NeuralNet.randomWeights(E.BRAIN_LAYERS, E.makeRng(5));
  const g2 = E.NeuralNet.randomWeights(E.BRAIN_LAYERS, E.makeRng(5));
  const g3 = E.NeuralNet.randomWeights(E.BRAIN_LAYERS, E.makeRng(6));
  assert.deepEqual(g1, g2);
  assert.notDeepEqual(g1, g3);
});

test('réseau minimal calculé à la main : 1 entrée -> 1 sortie sigmoïde', () => {
  const net = new E.NeuralNet([1, 1], [2, 0.5]); // sigmoid(2 * x + 0.5)
  const out = net.forward([1]);
  assert.ok(Math.abs(out[0] - 1 / (1 + Math.exp(-2.5))) < 1e-12);
});

test('mauvaise taille d\'entrée ou de génome : erreur explicite', () => {
  const net = new E.NeuralNet(E.BRAIN_LAYERS, null, E.makeRng(1));
  assert.throws(() => net.forward([1, 2, 3]), /entrées attendues/);
  assert.throws(() => new E.NeuralNet(E.BRAIN_LAYERS, [1, 2, 3]), /poids attendus/);
  assert.throws(() => new E.NeuralNet([5]), /au moins/);
});

test('setWeights / getWeights : aller-retour', () => {
  const net = new E.NeuralNet(E.BRAIN_LAYERS, null, E.makeRng(2));
  const g = E.NeuralNet.randomWeights(E.BRAIN_LAYERS, E.makeRng(3));
  net.setWeights(g);
  assert.deepEqual(net.getWeights(), g);
});

test('Brain.decide : renvoie les 6 poids de comportements (dont la piste de phéromones) et le tir', () => {
  const brain = new E.Brain(null, E.makeRng(4));
  const d = brain.decide(new Array(E.BRAIN_INPUTS).fill(0));
  for (const k of ['loot', 'pursue', 'flee', 'wander', 'zone', 'trail', 'shootRaw']) {
    assert.ok(d[k] >= 0 && d[k] <= 1, k);
  }
  assert.equal(typeof d.shoot, 'boolean');
});

test('Brain JSON : export puis import redonne les mêmes décisions', () => {
  const brain = new E.Brain(null, E.makeRng(9));
  const copy = E.Brain.fromJSON(JSON.parse(JSON.stringify(brain.toJSON({ generation: 3 }))));
  const x = Array.from({ length: E.BRAIN_INPUTS }, (_, i) => (i % 3) / 3);
  assert.deepEqual(copy.decide(x), brain.decide(x));
  assert.throws(() => E.Brain.fromJSON({ layers: [2, 2], weights: [1] }), /architecture/);
});
