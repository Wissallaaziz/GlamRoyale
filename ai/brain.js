/**
 * Brain : le « cerveau » d'une bot. Il enveloppe un NeuralNet et traduit ses sorties.
 *
 * C'est le niveau « CHOIX D'ACTION » de Reynolds : le réseau ne calcule AUCUNE force.
 * Il décide dans quelle proportion chaque comportement de steering est utilisé
 * (poids entre 0 et 1) ; les forces elles-mêmes restent calculées par la classe Vehicle.
 * Ses poids évoluent par NEUROÉVOLUTION (genetics.js). Le réflexe explorer/fuir, lui, est un
 * petit réseau 3–6–2 appris par apprentissage SUPERVISÉ (exploreFleeNet.js).
 *
 * Entrées (BRAIN_INPUTS = 16, voir perception.js) :
 *   0 proximité ennemie   1-2 sin/cos de l'angle vers l'ennemie
 *   3 proximité du butin  4-5 sin/cos de l'angle vers le butin
 *   6 marge par rapport à la prochaine zone   7-8 sin/cos de l'angle vers le centre de la zone
 *   9 glow (vie)  10 munitions  11 danger d'obstacle devant  12 foule autour  13 bouclier
 *   14 glow de l'ennemie
 *   15 intensité de la piste de phéromones détectée devant (0 = aucune, 1 = très forte)
 * Sorties (BRAIN_OUTPUTS = 7) :
 *   0 poids Seek/Arrival vers le butin    1 poids Pursuit      2 poids Evasion
 *   3 poids Wander                        4 poids retour vers la zone
 *   5 poids Trail following (suivre une piste de phéromones)
 *   6 envie de tirer (> 0.5 : tire)
 */
const BRAIN_INPUTS = 16;
const BRAIN_HIDDEN = 12;
const BRAIN_OUTPUTS = 7;
const BRAIN_LAYERS = [BRAIN_INPUTS, BRAIN_HIDDEN, BRAIN_OUTPUTS];

class Brain {
  /** @param {number[]|null} weights génome (null = aléatoire)   @param {function} rng */
  constructor(weights = null, rng = Math.random) {
    this.net = new NeuralNet(BRAIN_LAYERS, weights, rng);
    this.lastDecision = null;
  }

  /** Transforme les entrées en décision {loot, pursue, flee, wander, zone, trail, shoot, shootRaw}. */
  decide(inputs) {
    const o = this.net.forward(inputs);
    this.lastDecision = {
      loot: o[0], pursue: o[1], flee: o[2], wander: o[3], zone: o[4], trail: o[5],
      shoot: o[6] > 0.5, shootRaw: o[6],
    };
    return this.lastDecision;
  }

  get weights() { return this.net.getWeights(); }

  /** Export JSON (poids + méta-données). La version change quand l'architecture change. */
  toJSON(meta = {}) {
    return Object.assign({ version: 2, layers: BRAIN_LAYERS.slice(), weights: this.weights }, meta);
  }

  /** Recrée un Brain depuis un objet exporté ; vérifie l'architecture. */
  static fromJSON(obj) {
    if (!obj || !Array.isArray(obj.weights)) throw new Error('Brain.fromJSON : objet invalide');
    if (obj.layers && obj.layers.join(',') !== BRAIN_LAYERS.join(',')) {
      throw new Error('Brain.fromJSON : architecture différente (' + obj.layers.join('-') + ')');
    }
    return new Brain(obj.weights);
  }
}
