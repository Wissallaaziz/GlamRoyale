/**
 * NeuralNet : perceptron multicouche écrit à la main (aucune bibliothèque).
 *
 * Couches cachées : tanh. Couche de sortie : sigmoïde (sorties dans [0, 1]).
 *
 * Les poids sont stockés dans UN SEUL tableau plat (le « génome »), ce qui rend le
 * croisement, la mutation, l'export JSON et les tests très simples. Disposition :
 * pour chaque couche l = 1..L-1, pour chaque neurone j de la couche :
 *   [ w(j,0) ... w(j,nIn-1), biais(j) ]
 */
class NeuralNet {
  /**
   * @param {number[]} layers   tailles des couches, ex. [15, 12, 6]
   * @param {number[]|null} weights  génome ; si absent, initialisation aléatoire (Xavier)
   * @param {function} rng      générateur aléatoire [0,1)
   */
  constructor(layers, weights = null, rng = Math.random) {
    if (!Array.isArray(layers) || layers.length < 2) {
      throw new Error('NeuralNet : il faut au moins une couche d\'entrée et une de sortie');
    }
    this.layers = layers.slice();
    const n = NeuralNet.weightCount(this.layers);
    if (weights) {
      if (weights.length !== n) {
        throw new Error('NeuralNet : ' + n + ' poids attendus, ' + weights.length + ' reçus');
      }
      this.weights = Array.from(weights);
    } else {
      this.weights = NeuralNet.randomWeights(this.layers, rng);
    }
    this.lastActivations = []; // pour l'affichage (panneau « cerveau » du HUD)
  }

  /** Nombre total de poids et de biais pour une architecture donnée. */
  static weightCount(layers) {
    let n = 0;
    for (let l = 1; l < layers.length; l++) n += layers[l] * (layers[l - 1] + 1);
    return n;
  }

  /** Génome aléatoire : poids ~ N(0, 1/nIn), biais nuls. */
  static randomWeights(layers, rng = Math.random) {
    const w = [];
    for (let l = 1; l < layers.length; l++) {
      const nIn = layers[l - 1];
      const scale = Math.sqrt(1 / nIn);
      for (let j = 0; j < layers[l]; j++) {
        for (let i = 0; i < nIn; i++) w.push(gaussian(rng) * scale);
        w.push(0);
      }
    }
    return w;
  }

  /** Calcule les sorties pour un vecteur d'entrées. */
  forward(inputs) {
    if (inputs.length !== this.layers[0]) {
      throw new Error('NeuralNet : ' + this.layers[0] + ' entrées attendues, ' + inputs.length + ' reçues');
    }
    let act = Array.from(inputs);
    const all = [act];
    let k = 0;
    const lastLayer = this.layers.length - 1;
    for (let l = 1; l <= lastLayer; l++) {
      const nIn = this.layers[l - 1];
      const nOut = this.layers[l];
      const out = new Array(nOut);
      for (let j = 0; j < nOut; j++) {
        let s = 0;
        for (let i = 0; i < nIn; i++) s += this.weights[k++] * act[i];
        s += this.weights[k++];
        out[j] = l === lastLayer ? 1 / (1 + Math.exp(-s)) : Math.tanh(s);
      }
      act = out;
      all.push(out);
    }
    this.lastActivations = all;
    return act;
  }

  getWeights() { return this.weights.slice(); }

  setWeights(w) {
    if (w.length !== this.weights.length) throw new Error('NeuralNet : mauvaise taille de génome');
    this.weights = Array.from(w);
  }
}
