/**
 * Apprentissage SUPERVISÉ du réflexe « explorer ou fuir » (réseau 3–6–2).
 *
 * Contrairement au cerveau évolutif (neuroévolution, sans exemples), ce réseau apprend à
 * partir d'EXEMPLES ÉTIQUETÉS : (proximité de la menace, vitesse de rapprochement, vitesse de
 * la combattante) -> « explorer » ou « fuir ». L'étiquette vient d'une règle « enseignante »
 * (reflexTeacher) ; le réseau apprend à reproduire cette règle par RÉTROPROPAGATION du
 * gradient (descente de gradient stochastique), puis il est évalué sur des exemples qu'il n'a
 * jamais vus (jeu de validation).
 *
 * Architecture : 3 entrées -> 6 neurones cachés (tanh) -> 2 sorties (sigmoïde),
 * c'est-à-dire un NeuralNet de layers [3, 6, 2] (même format de poids plat que le cerveau).
 * Sorties : [explorer, fuir]. Perte : entropie croisée binaire sur chaque sortie ; avec une
 * sortie sigmoïde, le gradient de la perte par rapport à la pré-activation vaut (sortie - cible).
 *
 * Entrées (toutes normalisées, voir reflexInputs() dans perception.js) :
 *   0 proximité de la menace   0 (aucune menace) .. 1 (au contact)
 *   1 vitesse de rapprochement -1 (la menace s'éloigne) .. +1 (elle fonce vers moi)
 *   2 vitesse de la combattante 0 (à l'arrêt) .. 1 (à maxSpeed)
 */
const REFLEX_LAYERS = [3, 6, 2];
const REFLEX_LABELS = ['explore', 'flee'];     // index 0 = explorer, 1 = fuir
const REFLEX_THRESHOLD = 0.38;                 // seuil de danger de la règle enseignante

/**
 * Danger perçu d'une menace, entre 0 et 1.
 *   - proportionnel à la proximité (menace lointaine = danger faible),
 *   - amplifié quand la menace se rapproche (0,3 si elle s'éloigne vite, 1 si elle fonce),
 *   - légèrement amplifié par la vitesse de la combattante (0,7 à l'arrêt, 1 à pleine vitesse) :
 *     une combattante rapide peut réellement s'échapper, donc fuir est une bonne option.
 */
function reflexDanger(proximity, closing, speed) {
  const approach = (clampValue(closing, -1, 1) + 1) / 2;
  return clampValue(proximity, 0, 1) * (0.3 + 0.7 * approach) * (0.7 + 0.3 * clampValue(speed, 0, 1));
}

/** Règle enseignante : 'flee' si le danger dépasse le seuil, sinon 'explore'. */
function reflexTeacher(proximity, closing, speed) {
  return reflexDanger(proximity, closing, speed) > REFLEX_THRESHOLD ? 'flee' : 'explore';
}

/**
 * Jeu de données étiqueté. 25 % des exemples n'ont aucune menace (proximité 0, rapprochement 0,
 * comme dans le jeu quand aucune ennemie n'est visible), les autres tirent proximité,
 * rapprochement et vitesse uniformément.
 * @returns {{input:number[], target:number[], label:string}[]}
 */
function makeReflexDataset(count, rng) {
  const samples = [];
  for (let i = 0; i < count; i++) {
    const threat = rng() < 0.75;
    const proximity = threat ? rng() : 0;
    const closing = threat ? rng() * 2 - 1 : 0;
    const speed = rng();
    const label = reflexTeacher(proximity, closing, speed);
    samples.push({
      input: [proximity, closing, speed],
      target: label === 'flee' ? [0, 1] : [1, 0],
      label,
    });
  }
  return samples;
}

/** Sépare un jeu de données en apprentissage / validation (les exemples sont déjà aléatoires). */
function splitDataset(samples, trainRatio = 0.8) {
  const cut = Math.round(samples.length * trainRatio);
  return { train: samples.slice(0, cut), validation: samples.slice(cut) };
}

/** Entropie croisée binaire, sommée sur les sorties (les sorties sont bornées pour éviter log 0). */
function bceLoss(output, target) {
  let loss = 0;
  for (let j = 0; j < output.length; j++) {
    const o = clampValue(output[j], 1e-12, 1 - 1e-12);
    loss -= target[j] * Math.log(o) + (1 - target[j]) * Math.log(1 - o);
  }
  return loss;
}

/**
 * Rétropropagation : gradient de la perte par rapport à CHAQUE poids du réseau, rangé dans un
 * tableau de même disposition que net.weights (par neurone : poids puis biais). Ne modifie pas
 * le réseau (testable par différences finies).
 */
function computeGradient(net, input, target) {
  const out = net.forward(input);
  const acts = net.lastActivations;             // [entrée, cachée 1, ..., sortie]
  const last = net.layers.length - 1;
  const grad = new Array(net.weights.length).fill(0);
  const base = [];
  let offset = 0;
  for (let l = 1; l <= last; l++) {
    base[l] = offset;
    offset += net.layers[l] * (net.layers[l - 1] + 1);
  }
  // sortie sigmoïde + entropie croisée : dPerte/dPré-activation = sortie - cible
  let delta = out.map((o, j) => o - target[j]);
  for (let l = last; l >= 1; l--) {
    const nIn = net.layers[l - 1];
    const nOut = net.layers[l];
    const stride = nIn + 1;
    const prev = acts[l - 1];
    let prevDelta = null;
    if (l > 1) {
      // erreur renvoyée vers la couche précédente, multipliée par la dérivée de tanh (1 - a²)
      prevDelta = new Array(nIn).fill(0);
      for (let j = 0; j < nOut; j++) {
        for (let i = 0; i < nIn; i++) prevDelta[i] += net.weights[base[l] + j * stride + i] * delta[j];
      }
      for (let i = 0; i < nIn; i++) prevDelta[i] *= 1 - prev[i] * prev[i];
    }
    for (let j = 0; j < nOut; j++) {
      for (let i = 0; i < nIn; i++) grad[base[l] + j * stride + i] = delta[j] * prev[i];
      grad[base[l] + j * stride + nIn] = delta[j];
    }
    delta = prevDelta;
  }
  return grad;
}

/** Une étape de descente de gradient sur un exemple. Renvoie la perte AVANT la mise à jour. */
function backpropStep(net, input, target, learningRate) {
  const grad = computeGradient(net, input, target);
  const loss = bceLoss(net.lastActivations[net.layers.length - 1], target);
  for (let i = 0; i < grad.length; i++) net.weights[i] -= learningRate * grad[i];
  return loss;
}

/** Précision, perte moyenne et matrice de confusion (positif = « fuir »). */
function evaluateClassifier(net, samples) {
  let correct = 0;
  let loss = 0;
  const confusion = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const s of samples) {
    const out = net.forward(s.input);
    loss += bceLoss(out, s.target);
    const predictedFlee = out[1] > out[0];
    const actualFlee = s.target[1] > s.target[0];
    if (predictedFlee === actualFlee) correct++;
    if (predictedFlee && actualFlee) confusion.tp++;
    else if (predictedFlee && !actualFlee) confusion.fp++;
    else if (!predictedFlee && actualFlee) confusion.fn++;
    else confusion.tn++;
  }
  const n = Math.max(1, samples.length);
  return { accuracy: correct / n, loss: loss / n, confusion, count: samples.length };
}

/**
 * Entraîne le réseau par descente de gradient stochastique : à chaque époque les exemples sont
 * mélangés (RNG injecté : résultat reproductible), le taux d'apprentissage décroît.
 * @param {NeuralNet} net
 * @param {{input:number[], target:number[]}[]} samples  exemples d'apprentissage
 * @param {object} opts  epochs (150), learningRate (0.25), decay (0.02), rng, validation (exemples)
 * @returns {{epoch:number, loss:number, accuracy:number, valAccuracy:number|null}[]} historique
 */
function trainSupervised(net, samples, opts = {}) {
  const epochs = opts.epochs ?? 150;
  const lr0 = opts.learningRate ?? 0.25;
  const decay = opts.decay ?? 0.02;
  const rng = opts.rng || Math.random;
  const order = samples.map((_, i) => i);
  const history = [];
  for (let e = 0; e < epochs; e++) {
    shuffleInPlace(order, rng);
    const lr = lr0 / (1 + decay * e);
    let total = 0;
    for (const idx of order) total += backpropStep(net, samples[idx].input, samples[idx].target, lr);
    const row = { epoch: e + 1, loss: total / Math.max(1, samples.length) };
    row.accuracy = evaluateClassifier(net, samples).accuracy;
    row.valAccuracy = opts.validation ? evaluateClassifier(net, opts.validation).accuracy : null;
    history.push(row);
  }
  return history;
}
