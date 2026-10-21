/**
 * Neuroévolution : un algorithme génétique dont le génome est le tableau de poids du
 * réseau (comme dans les exercices 8, 9 et 10 où l'ADN pilotait un steering).
 *
 *   sélection par tournoi  ->  croisement uniforme  ->  mutation gaussienne
 *   + élitisme (les meilleures passent telles quelles à la génération suivante).
 */

/** Croisement uniforme : chaque poids vient du parent A ou du parent B (50 %). */
function crossover(a, b, rng = Math.random) {
  const child = new Array(a.length);
  for (let i = 0; i < a.length; i++) child[i] = rng() < 0.5 ? a[i] : b[i];
  return child;
}

/** Mutation : chaque poids a `rate` chance de recevoir un bruit gaussien d'écart `scale`. */
function mutate(genome, rate, scale, rng = Math.random, limit = 6) {
  const out = genome.slice();
  for (let i = 0; i < out.length; i++) {
    if (rng() < rate) out[i] = clampValue(out[i] + gaussian(rng) * scale, -limit, limit);
  }
  return out;
}

/**
 * Fitness d'une combattante à la fin d'une partie. Récompense : survivre, bien se classer,
 * gagner, éliminer, toucher, ramasser du butin. Pénalise le temps passé hors de la zone.
 */
function computeFitness(f, total, maxFrames) {
  const survive = (f.survivalFrames / maxFrames) * 100;
  const place = total > 1 ? ((total - f.placement) / (total - 1)) * 150 : 0;
  const win = f.placement === 1 ? 100 : 0;
  const raw = survive + place + win + f.kills * 70 + f.damageDealt * 0.4 + f.lootCount * 6 - f.zoneFrames * 0.05;
  return Math.max(0, raw);
}

class Evolution {
  /**
   * @param {object} opts size, layers, rng, mutationRate, mutationScale, eliteCount,
   *                      tournamentSize, immigrants (génomes aléatoires par génération)
   */
  constructor(opts = {}) {
    this.size = opts.size ?? 24;
    this.layers = opts.layers ?? BRAIN_LAYERS;
    this.rng = opts.rng || Math.random;
    this.mutationRate = opts.mutationRate ?? 0.1;
    this.mutationScale = opts.mutationScale ?? 0.3;
    this.eliteCount = opts.eliteCount ?? 2;
    this.tournamentSize = opts.tournamentSize ?? 3;
    this.immigrants = opts.immigrants ?? 0;
    this.generation = 0;
    this.population = [];
    for (let i = 0; i < this.size; i++) {
      this.population.push({ genome: NeuralNet.randomWeights(this.layers, this.rng), fitness: 0 });
    }
  }

  /** Remplace la population par des variantes d'un génome connu (le n°0 reste intact). */
  seedFrom(genome, rate = 0.15, scale = 0.2) {
    this.population.forEach((ind, i) => {
      ind.genome = i === 0 ? genome.slice() : mutate(genome, rate, scale, this.rng);
      ind.fitness = 0;
    });
  }

  setFitness(i, value) { this.population[i].fitness = value; }

  /** Meilleur individu courant (copie). */
  best() {
    let b = this.population[0];
    for (const ind of this.population) if (ind.fitness > b.fitness) b = ind;
    return { genome: b.genome.slice(), fitness: b.fitness };
  }

  averageFitness() {
    return this.population.reduce((s, i) => s + i.fitness, 0) / this.population.length;
  }

  tournament() {
    let best = null;
    for (let k = 0; k < this.tournamentSize; k++) {
      const c = this.population[Math.floor(this.rng() * this.population.length)];
      if (!best || c.fitness > best.fitness) best = c;
    }
    return best;
  }

  /** Construit la génération suivante à partir des fitness enregistrées. */
  nextGeneration() {
    const sorted = this.population.slice().sort((a, b) => b.fitness - a.fitness);
    const next = [];
    for (let i = 0; i < Math.min(this.eliteCount, this.size); i++) {
      next.push({ genome: sorted[i].genome.slice(), fitness: 0 });
    }
    for (let i = 0; i < this.immigrants && next.length < this.size; i++) {
      next.push({ genome: NeuralNet.randomWeights(this.layers, this.rng), fitness: 0 });
    }
    while (next.length < this.size) {
      const a = this.tournament();
      const b = this.tournament();
      const child = mutate(crossover(a.genome, b.genome, this.rng), this.mutationRate, this.mutationScale, this.rng);
      next.push({ genome: child, fitness: 0 });
    }
    this.population = next;
    this.generation++;
  }
}
