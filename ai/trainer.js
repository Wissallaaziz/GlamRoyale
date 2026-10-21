/**
 * Trainer : entraînement par neuroévolution, utilisable pas à pas (page training.html,
 * pour garder l'interface fluide) ou d'un seul coup (tools/train.js en ligne de commande).
 *
 * Une génération = `rounds` tours ; à chaque tour la population est mélangée puis découpée
 * en groupes de `groupSize` bots qui s'affrontent dans une partie. La fitness d'un génome
 * est la moyenne de ses fitness sur ses parties.
 */
class Trainer {
  /**
   * @param {object} opts size (multiple de groupSize), groupSize, rounds, maxFrames, seed,
   *                      seedGenome (génome de départ), mutationRate, mutationScale
   */
  constructor(opts = {}) {
    this.groupSize = opts.groupSize ?? 12;
    this.size = opts.size ?? this.groupSize * 3;
    if (this.size % this.groupSize !== 0) throw new Error('Trainer : size doit être un multiple de groupSize');
    this.rounds = opts.rounds ?? 2;
    this.maxFrames = opts.maxFrames ?? 7000;
    this.baseSeed = opts.seed ?? 1;
    // options passées à chaque GameWorld (ex. { pheromone: { deposit: 0 } } pour une expérience)
    this.worldOptions = opts.worldOptions || {};
    this.rng = makeRng(this.baseSeed * 977 + 13);
    this.evo = new Evolution({
      size: this.size,
      rng: this.rng,
      mutationRate: opts.mutationRate ?? 0.1,
      mutationScale: opts.mutationScale ?? 0.3,
      eliteCount: opts.eliteCount ?? 3,
      immigrants: opts.immigrants ?? 1,
    });
    if (opts.seedGenome) this.evo.seedFrom(opts.seedGenome, 0.15, 0.25);
    this.generation = 0;
    this.history = [];      // [{generation, best, average}]
    this.lastBest = null;   // {genome, fitness} de la dernière génération terminée
    this.beginGeneration();
  }

  beginGeneration() {
    this.fitSum = new Array(this.size).fill(0);
    this.fitCount = new Array(this.size).fill(0);
    this.matches = [];
    for (let r = 0; r < this.rounds; r++) {
      const order = shuffleInPlace([...Array(this.size).keys()], this.rng);
      for (let k = 0; k < this.size; k += this.groupSize) this.matches.push(order.slice(k, k + this.groupSize));
    }
    this.matchIndex = 0;
    this.startMatch();
  }

  startMatch() {
    const members = this.matches[this.matchIndex];
    const brains = members.map((i) => new Brain(this.evo.population[i].genome));
    this.world = new GameWorld(Object.assign({}, this.worldOptions, {
      withPlayer: false,
      brains,
      maxFrames: this.maxFrames,
      seed: this.baseSeed * 100000 + this.generation * 100 + this.matchIndex + 1,
    }));
  }

  /** Avance l'entraînement de `frames` frames de jeu (change de partie/génération si besoin). */
  step(frames = 1) {
    for (let i = 0; i < frames; i++) {
      this.world.step();
      if (this.world.over) this.finishMatch();
    }
  }

  finishMatch() {
    const members = this.matches[this.matchIndex];
    const total = members.length;
    this.world.fighters.forEach((f, j) => {
      const idx = members[j];
      this.fitSum[idx] += computeFitness(f, total, this.maxFrames);
      this.fitCount[idx]++;
    });
    this.matchIndex++;
    if (this.matchIndex >= this.matches.length) this.finishGeneration();
    else this.startMatch();
  }

  finishGeneration() {
    for (let i = 0; i < this.size; i++) this.evo.setFitness(i, this.fitSum[i] / Math.max(1, this.fitCount[i]));
    this.lastBest = this.evo.best();
    this.history.push({
      generation: this.generation,
      best: this.lastBest.fitness,
      average: this.evo.averageFitness(),
    });
    this.evo.nextGeneration();
    this.generation++;
    this.beginGeneration();
  }

  /** Joue des frames jusqu'à la fin de la génération courante. Renvoie sa ligne d'historique. */
  runGeneration() {
    const g = this.generation;
    while (this.generation === g) this.step(200);
    return this.history[this.history.length - 1];
  }
}
