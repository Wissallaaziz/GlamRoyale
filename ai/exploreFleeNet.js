/**
 * ExploreFleeNet : le réflexe « explorer ou fuir » (réseau 3–6–2, appris par apprentissage
 * supervisé, voir supervised.js).
 *
 * C'est une couche de CHOIX D'ACTION (premier niveau de Reynolds) placée AVANT le cerveau
 * évolutif : elle décide seulement du mode (explorer / fuir). Elle ne calcule aucune force ;
 * les forces restent celles des steering behaviors de Vehicle (voir Bot.computeSteering).
 *
 * Contrairement au cerveau évolutif, ses poids ne changent pas pendant le jeu : ils sont
 * appris une fois (tools/train_supervised.js) et chargés depuis weights/reflex.js.
 */
class ExploreFleeNet {
  /** @param {number[]|null} weights 6*(3+1) + 2*(6+1) = 38 poids ; null = aléatoire */
  constructor(weights = null, rng = Math.random) {
    this.net = new NeuralNet(REFLEX_LAYERS, weights, rng);
  }

  /**
   * @param {number} proximity 0..1   @param {number} closing -1..1   @param {number} speed 0..1
   * @returns {{mode:'explore'|'flee', flee:boolean, pFlee:number, inputs:number[], outputs:number[]}}
   *   pFlee = sortie « fuir » / (sortie « explorer » + sortie « fuir »), entre 0 et 1.
   */
  decide(proximity, closing, speed) {
    const inputs = [clampValue(proximity, 0, 1), clampValue(closing, -1, 1), clampValue(speed, 0, 1)];
    const out = this.net.forward(inputs);
    const flee = out[1] > out[0];
    const sum = out[0] + out[1];
    return {
      mode: flee ? 'flee' : 'explore',
      flee,
      pFlee: sum > 0 ? out[1] / sum : 0.5,
      inputs,
      outputs: out.slice(),
    };
  }

  get weights() { return this.net.getWeights(); }

  /** Export JSON : poids + méta-données (précision mesurée, graine...). */
  toJSON(meta = {}) {
    return Object.assign({ version: 1, layers: REFLEX_LAYERS.slice(), weights: this.weights }, meta);
  }

  static fromJSON(obj) {
    if (!obj || !Array.isArray(obj.weights)) throw new Error('ExploreFleeNet.fromJSON : objet invalide');
    if (obj.layers && obj.layers.join(',') !== REFLEX_LAYERS.join(',')) {
      throw new Error('ExploreFleeNet.fromJSON : architecture différente (' + obj.layers.join('-') + ')');
    }
    return new ExploreFleeNet(obj.weights);
  }
}

/**
 * Entraîne un ExploreFleeNet de bout en bout : génère les exemples étiquetés, les sépare en
 * apprentissage / validation, rétropropage, puis mesure la précision sur la validation.
 * @param {object} opts seed (7), samples (2400), epochs (150), learningRate, decay
 * @returns {{model: ExploreFleeNet, history: object[], report: object}}
 */
function trainReflexNet(opts = {}) {
  const seed = opts.seed ?? 7;
  const rng = makeRng(seed);
  const data = splitDataset(makeReflexDataset(opts.samples ?? 2400, rng), 0.8);
  const model = new ExploreFleeNet(null, makeRng(seed + 1));
  const history = trainSupervised(model.net, data.train, {
    epochs: opts.epochs ?? 150,
    learningRate: opts.learningRate,
    decay: opts.decay,
    rng: makeRng(seed + 2),
    validation: data.validation,
  });
  const train = evaluateClassifier(model.net, data.train);
  const validation = evaluateClassifier(model.net, data.validation);
  const report = {
    seed,
    epochs: history.length,
    trainCount: data.train.length,
    validationCount: data.validation.length,
    trainAccuracy: train.accuracy,
    validationAccuracy: validation.accuracy,
    validationLoss: validation.loss,
    confusion: validation.confusion,
    threshold: REFLEX_THRESHOLD,
  };
  return { model, history, report };
}

let defaultReflexNetCache = null;

/**
 * Réflexe utilisé par défaut par GameWorld : les poids pré-entraînés de weights/reflex.js
 * (constante PRETRAINED_REFLEX) s'ils existent et sont valides, sinon un entraînement
 * immédiat avec la graine par défaut (quelques dizaines de millisecondes).
 */
function defaultReflexNet() {
  if (defaultReflexNetCache) return defaultReflexNetCache;
  if (typeof PRETRAINED_REFLEX !== 'undefined' && PRETRAINED_REFLEX) {
    try {
      defaultReflexNetCache = ExploreFleeNet.fromJSON(PRETRAINED_REFLEX);
      return defaultReflexNetCache;
    } catch (e) {
      console.warn('Poids du réflexe ignorés :', e.message);
    }
  }
  defaultReflexNetCache = trainReflexNet().model;
  return defaultReflexNetCache;
}
