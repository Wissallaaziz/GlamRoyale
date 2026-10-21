import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import loader from '../tools/loader.js';

const E = loader.loadEngine();
const here = path.dirname(fileURLToPath(import.meta.url));

// ------------------------------------------------------------- règle enseignante

test('teacher : aucune menace -> explorer, menace au contact qui fonce vers moi -> fuir', () => {
  assert.equal(E.reflexTeacher(0, 0, 1), 'explore');
  assert.equal(E.reflexTeacher(0, 0, 0), 'explore');
  assert.equal(E.reflexTeacher(1, 1, 1), 'flee');
  assert.equal(E.reflexTeacher(0.9, 0.8, 0.5), 'flee');
});

test('teacher : une menace lointaine ou qui s\'éloigne ne déclenche pas la fuite', () => {
  assert.equal(E.reflexTeacher(0.2, 1, 1), 'explore', 'lointaine même si elle fonce');
  assert.equal(E.reflexTeacher(0.9, -1, 1), 'explore', 'proche mais qui s\'éloigne vite');
});

test('teacher : le danger augmente avec la proximité, le rapprochement et la vitesse', () => {
  for (let k = 0; k < 10; k++) {
    const a = k / 10;
    const b = (k + 1) / 10;
    assert.ok(E.reflexDanger(b, 0.3, 0.5) >= E.reflexDanger(a, 0.3, 0.5), 'proximité');
    assert.ok(E.reflexDanger(0.7, b * 2 - 1, 0.5) >= E.reflexDanger(0.7, a * 2 - 1, 0.5), 'rapprochement');
    assert.ok(E.reflexDanger(0.7, 0.3, b) >= E.reflexDanger(0.7, 0.3, a), 'vitesse');
  }
});

test('teacher : danger toujours entre 0 et 1, même pour des entrées hors bornes', () => {
  for (const [p, c, s] of [[-5, -5, -5], [5, 5, 5], [0.5, 9, 0.5], [1, 1, 1], [0, 0, 0]]) {
    const d = E.reflexDanger(p, c, s);
    assert.ok(d >= 0 && d <= 1 && Number.isFinite(d), [p, c, s].join());
  }
});

// ------------------------------------------------------------------ jeu de données

test('dataset : reproductible, bien formé, étiquettes = règle enseignante, deux classes présentes', () => {
  const a = E.makeReflexDataset(500, E.makeRng(3));
  const b = E.makeReflexDataset(500, E.makeRng(3));
  const c = E.makeReflexDataset(500, E.makeRng(4));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  for (const s of a) {
    assert.equal(s.input.length, 3);
    assert.deepEqual(s.target, s.label === 'flee' ? [0, 1] : [1, 0]);
    assert.equal(s.label, E.reflexTeacher(...s.input));
    assert.ok(s.input[0] >= 0 && s.input[0] <= 1 && s.input[1] >= -1 && s.input[1] <= 1 && s.input[2] >= 0 && s.input[2] <= 1);
  }
  const flee = a.filter((s) => s.label === 'flee').length;
  assert.ok(flee > 40 && flee < 460, 'les deux classes sont représentées : ' + flee + ' « fuir » sur 500');
  const noThreat = a.filter((s) => s.input[0] === 0 && s.input[1] === 0).length;
  assert.ok(noThreat > 80 && noThreat < 180, 'environ 25 % d\'exemples sans menace : ' + noThreat);
});

test('splitDataset : 80 / 20 sans perte ni doublon', () => {
  const data = E.makeReflexDataset(100, E.makeRng(1));
  const { train, validation } = E.splitDataset(data, 0.8);
  assert.equal(train.length, 80);
  assert.equal(validation.length, 20);
  assert.equal(train[0], data[0]);
  assert.equal(validation[0], data[80]);
});

// --------------------------------------------------------------- rétropropagation

test('computeGradient : identique au gradient numérique (différences finies)', () => {
  for (const seed of [1, 2, 3]) {
    const net = new E.NeuralNet(E.REFLEX_LAYERS, null, E.makeRng(seed));
    // des biais non nuls pour tester aussi leurs gradients
    net.setWeights(net.getWeights().map((w, i) => w + 0.05 * Math.sin(i + seed)));
    const input = [0.7, -0.4, 0.9];
    const target = [0, 1];
    const analytic = E.computeGradient(net, input, target);
    const h = 1e-6;
    assert.equal(analytic.length, net.weights.length);
    for (let i = 0; i < net.weights.length; i++) {
      const w = net.weights[i];
      net.weights[i] = w + h;
      const up = E.bceLoss(net.forward(input), target);
      net.weights[i] = w - h;
      const down = E.bceLoss(net.forward(input), target);
      net.weights[i] = w;
      const numeric = (up - down) / (2 * h);
      assert.ok(Math.abs(numeric - analytic[i]) < 1e-6, 'poids ' + i + ' : ' + numeric + ' vs ' + analytic[i]);
    }
  }
});

test('computeGradient : ne modifie pas les poids et fonctionne sur une autre architecture', () => {
  const net = new E.NeuralNet([4, 5, 3, 2], null, E.makeRng(8));
  const before = net.getWeights();
  const g = E.computeGradient(net, [0.1, 0.2, 0.3, 0.4], [1, 0]);
  assert.deepEqual(net.getWeights(), before);
  assert.equal(g.length, E.NeuralNet.weightCount([4, 5, 3, 2]));
  assert.ok(g.every(Number.isFinite));
});

test('backpropStep : une petite étape réduit la perte sur l\'exemple appris', () => {
  const net = new E.NeuralNet(E.REFLEX_LAYERS, null, E.makeRng(5));
  const input = [0.9, 0.8, 0.7];
  const target = [0, 1];
  const before = E.bceLoss(net.forward(input), target);
  const reported = E.backpropStep(net, input, target, 0.1);
  const after = E.bceLoss(net.forward(input), target);
  assert.ok(Math.abs(reported - before) < 1e-12, 'renvoie la perte avant la mise à jour');
  assert.ok(after < before);
});

test('bceLoss : nulle pour une sortie parfaite, grande pour une sortie fausse, jamais infinie', () => {
  assert.ok(E.bceLoss([1, 0], [1, 0]) < 1e-9);
  assert.ok(E.bceLoss([0, 1], [1, 0]) > 20);
  assert.ok(Number.isFinite(E.bceLoss([0, 1], [1, 0])));
});

test('la couche cachée sert : le même code apprend XOR (non linéairement séparable)', () => {
  const xor = [[0, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 0]].map(([a, b, y]) => (
    { input: [a, b], target: y ? [0, 1] : [1, 0], label: y ? 'flee' : 'explore' }));
  const net = new E.NeuralNet([2, 4, 2], null, E.makeRng(1));
  E.trainSupervised(net, xor, { epochs: 1500, learningRate: 0.5, decay: 0.001, rng: E.makeRng(11) });
  assert.equal(E.evaluateClassifier(net, xor).accuracy, 1);
});

test('evaluateClassifier : précision et matrice de confusion exactes sur un réseau connu', () => {
  // sortie « fuir » active quand l'entrée est grande (poids 10, biais -5), « explorer » sinon
  const net = new E.NeuralNet([1, 2], [-10, 5, 10, -5]);
  const mk = (x, flee) => ({ input: [x], target: flee ? [0, 1] : [1, 0], label: flee ? 'flee' : 'explore' });
  const samples = [mk(1, true), mk(1, true), mk(0, false), mk(0, false), mk(0, false), mk(1, false), mk(0, true)];
  const r = E.evaluateClassifier(net, samples);
  assert.deepEqual(r.confusion, { tp: 2, fp: 1, fn: 1, tn: 3 });
  assert.equal(r.count, 7);
  assert.ok(Math.abs(r.accuracy - 5 / 7) < 1e-12);
  assert.ok(r.loss > 0);
});

// -------------------------------------------------------------------- entraînement

test('trainSupervised : la perte baisse, résultat reproductible avec la même graine', () => {
  const data = E.makeReflexDataset(400, E.makeRng(2));
  const run = () => {
    const net = new E.NeuralNet(E.REFLEX_LAYERS, null, E.makeRng(3));
    const history = E.trainSupervised(net, data, { epochs: 30, rng: E.makeRng(4), validation: data });
    return { weights: net.getWeights(), history };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a.weights, b.weights);
  assert.equal(a.history.length, 30);
  assert.ok(a.history[29].loss < a.history[0].loss * 0.5, 'perte : ' + a.history[0].loss + ' -> ' + a.history[29].loss);
  assert.ok(a.history[29].valAccuracy >= a.history[0].valAccuracy);
});

test('trainReflexNet : > 97 % sur des exemples de validation jamais vus, bien au-dessus de « toujours explorer »', () => {
  const { model, history, report } = E.trainReflexNet({ seed: 7 });
  assert.equal(model.weights.length, 38);
  assert.equal(history.length, 150);
  assert.equal(report.trainCount + report.validationCount, 2400);
  assert.ok(report.validationAccuracy > 0.97, 'validation : ' + report.validationAccuracy);
  const fresh = E.makeReflexDataset(3000, E.makeRng(12345));
  const majority = fresh.filter((s) => s.label === 'explore').length / fresh.length;
  const acc = E.evaluateClassifier(model.net, fresh).accuracy;
  assert.ok(acc > 0.97 && acc > majority + 0.1, 'nouveaux exemples : ' + acc + ' (référence ' + majority + ')');
});

// ------------------------------------------------------------------ ExploreFleeNet

test('ExploreFleeNet.decide : mode cohérent avec les sorties, pFlee dans [0, 1], entrées bornées', () => {
  const net = E.defaultReflexNet();
  for (const args of [[0, 0, 0], [1, 1, 1], [0.5, -0.5, 0.2], [9, -9, 9], [-3, 3, -3]]) {
    const d = net.decide(...args);
    assert.equal(d.flee, d.outputs[1] > d.outputs[0]);
    assert.equal(d.mode, d.flee ? 'flee' : 'explore');
    assert.ok(d.pFlee >= 0 && d.pFlee <= 1);
    assert.ok(d.inputs[0] >= 0 && d.inputs[0] <= 1 && d.inputs[1] >= -1 && d.inputs[1] <= 1 && d.inputs[2] >= 0 && d.inputs[2] <= 1);
  }
});

test('le réflexe pré-entraîné donne les bonnes réponses sur les cas évidents', () => {
  const net = E.defaultReflexNet();
  assert.equal(net.decide(0, 0, 0.5).mode, 'explore', 'aucune menace');
  assert.equal(net.decide(0.95, 0.9, 1).mode, 'flee', 'menace au contact qui fonce');
  assert.equal(net.decide(0.15, 0.9, 1).mode, 'explore', 'menace lointaine');
  assert.equal(net.decide(0.9, -0.9, 0.2).mode, 'explore', 'menace proche mais qui s\'éloigne');
});

test('ExploreFleeNet : export / import JSON identique, architecture vérifiée', () => {
  const m = new E.ExploreFleeNet(null, E.makeRng(4));
  const copy = E.ExploreFleeNet.fromJSON(JSON.parse(JSON.stringify(m.toJSON({ note: 'test' }))));
  assert.deepEqual(copy.decide(0.6, 0.4, 0.8), m.decide(0.6, 0.4, 0.8));
  assert.deepEqual(m.toJSON().layers, [3, 6, 2]);
  assert.throws(() => E.ExploreFleeNet.fromJSON({ layers: [15, 12, 6], weights: [1] }), /architecture/);
  assert.throws(() => E.ExploreFleeNet.fromJSON(null), /invalide/);
  assert.throws(() => new E.ExploreFleeNet([1, 2, 3]), /poids attendus/);
});

test('weights/reflex.json : poids fournis valides, précision annoncée vérifiée sur de nouveaux exemples', () => {
  const saved = JSON.parse(fs.readFileSync(path.join(here, '..', 'weights', 'reflex.json'), 'utf8'));
  const net = E.ExploreFleeNet.fromJSON(saved);
  assert.match(saved.trainedWith, /supervis/);
  const fresh = E.makeReflexDataset(3000, E.makeRng(777));
  const acc = E.evaluateClassifier(net.net, fresh).accuracy;
  assert.ok(acc > 0.97, 'précision mesurée : ' + acc);
  assert.ok(Math.abs(acc - saved.newExamplesAccuracy) < 0.02, 'annoncée : ' + saved.newExamplesAccuracy);
  const js = fs.readFileSync(path.join(here, '..', 'weights', 'reflex.js'), 'utf8');
  assert.match(js, /^[\s\S]*const PRETRAINED_REFLEX = \{/);
  assert.deepEqual(new Function(js + '\nreturn PRETRAINED_REFLEX;')().weights, saved.weights, 'reflex.js = reflex.json');
});

test('defaultReflexNet : même instance à chaque appel ; sans poids fournis, il s\'entraîne à la volée', () => {
  assert.equal(E.defaultReflexNet(), E.defaultReflexNet());
  const E2 = loader.loadEngine({ pretrainedReflex: null });
  const net = E2.defaultReflexNet();
  const fresh = E2.makeReflexDataset(2000, E2.makeRng(55));
  assert.ok(E2.evaluateClassifier(net.net, fresh).accuracy > 0.97);
});

test('defaultReflexNet : des poids invalides sont ignorés (avertissement) puis le réseau est entraîné', () => {
  const warn = console.warn;
  const messages = [];
  console.warn = (...a) => messages.push(a.join(' '));
  try {
    const E3 = loader.loadEngine({ pretrainedReflex: { layers: [2, 2], weights: [1] } });
    const net = E3.defaultReflexNet();
    assert.equal(net.weights.length, 38);
    assert.equal(messages.length, 1);
    assert.match(messages[0], /ignorés/);
  } finally {
    console.warn = warn;
  }
});
