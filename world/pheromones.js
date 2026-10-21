/**
 * PheromoneField : phéromones artificielles (les « traînées de paillettes » du jeu).
 *
 * Principe (stigmergie) : les combattantes DÉPOSENT une substance sur leur passage ; la
 * substance se DIFFUSE dans les cases voisines puis S'ÉVAPORE. Les autres peuvent la SENTIR
 * (capteurs devant elles, voir SteeringVehicle.trailSensors / followTrail) et suivre la piste,
 * sans communication directe : l'environnement sert de mémoire collective.
 *
 * Ce n'est PAS une entité mobile : c'est un champ scalaire sur une grille (une donnée de
 * l'environnement, comme la zone ou le décor), donc il n'hérite pas de Vehicle. Seules les
 * combattantes bougent, et elles le font par des forces de steering.
 *
 * Paramètres (unités : px et frames à 60 images/s) :
 *   cellSize     taille d'une case (60 px)
 *   updateEvery  la diffusion et l'évaporation ont lieu toutes les N frames (3), pour garder
 *                un coût de calcul faible ; le dépôt, lui, a lieu à chaque frame
 *   diffusion    part d'une case répartie à parts égales sur ses 4 voisines à chaque mise à
 *                jour (0,2). Le total est conservé (une voisine absente au bord garde sa part)
 *   evaporation  part perdue à chaque mise à jour (0,006 : demi-vie d'environ 115 mises à
 *                jour, soit 345 frames, 5,8 s)
 *   maxValue     plafond d'une case (6), pour qu'une piste très fréquentée ne sature pas à l'infini
 *   deposit      quantité déposée par frame à pleine vitesse (0,25)
 *   saturation   valeur à partir de laquelle un signal compte comme « maximal » (2) : sert à
 *                normaliser l'entrée du réseau de neurones et l'intensité de la force de suivi
 *   epsilon      en dessous, une case est remise à 0 (évite les valeurs infimes éternelles)
 */
const PHEROMONE_DEFAULTS = {
  cellSize: 60,
  updateEvery: 3,
  diffusion: 0.2,
  evaporation: 0.006,
  maxValue: 6,
  deposit: 0.25,
  saturation: 2,
  epsilon: 1e-4,
};

class PheromoneField {
  /**
   * @param {number} islandRadius rayon de l'île : la grille couvre [-R - cellSize, R + cellSize]²
   * @param {object} opts  surcharge de PHEROMONE_DEFAULTS
   */
  constructor(islandRadius, opts = {}) {
    const o = Object.assign({}, PHEROMONE_DEFAULTS, opts);
    if (!(o.cellSize > 0)) throw new Error('PheromoneField : cellSize doit être > 0');
    if (!(o.diffusion >= 0 && o.diffusion <= 1)) throw new Error('PheromoneField : diffusion doit être dans [0, 1]');
    if (!(o.evaporation >= 0 && o.evaporation < 1)) throw new Error('PheromoneField : evaporation doit être dans [0, 1[');
    if (!(o.updateEvery >= 1)) throw new Error('PheromoneField : updateEvery doit être >= 1');
    this.cellSize = o.cellSize;
    this.updateEvery = Math.floor(o.updateEvery);
    this.diffusion = o.diffusion;
    this.evaporation = o.evaporation;
    this.maxValue = o.maxValue;
    this.depositRate = o.deposit;
    this.saturation = o.saturation;
    this.epsilon = o.epsilon;
    this.half = islandRadius + o.cellSize;
    this.size = Math.ceil((2 * this.half) / this.cellSize);
    this.cells = new Float64Array(this.size * this.size);
    this.buffer = new Float64Array(this.size * this.size);
    this.counter = 0;
  }

  // ------------------------------------------------------------------ géométrie

  /** Indice de colonne ou de ligne ramené dans la grille. */
  clampIndex(i) {
    return i < 0 ? 0 : i >= this.size ? this.size - 1 : i;
  }

  /** Centre de la case (i, j) en coordonnées monde. */
  cellCenter(i, j) {
    return { x: -this.half + (i + 0.5) * this.cellSize, y: -this.half + (j + 0.5) * this.cellSize };
  }

  /** Indices (inclus) des cases qui recouvrent un rectangle monde, pour le rendu. */
  cellRange(x0, y0, x1, y1) {
    return {
      i0: this.clampIndex(Math.floor((x0 + this.half) / this.cellSize)),
      i1: this.clampIndex(Math.floor((x1 + this.half) / this.cellSize)),
      j0: this.clampIndex(Math.floor((y0 + this.half) / this.cellSize)),
      j1: this.clampIndex(Math.floor((y1 + this.half) / this.cellSize)),
    };
  }

  /** Valeur de la case (i, j) (indices ramenés dans la grille). */
  cell(i, j) {
    return this.cells[this.clampIndex(j) * this.size + this.clampIndex(i)];
  }

  /** Les quatre cases qui encadrent (x, y) et leurs poids bilinéaires. */
  locate(x, y) {
    const fx = (x + this.half) / this.cellSize - 0.5;
    const fy = (y + this.half) / this.cellSize - 0.5;
    const i0 = Math.floor(fx);
    const j0 = Math.floor(fy);
    return { i0, j0, tx: fx - i0, ty: fy - j0 };
  }

  // ---------------------------------------------------------------- lecture/écriture

  /**
   * Dépose `amount` autour de (x, y), réparti sur les 4 cases voisines (poids bilinéaires).
   * Une quantité négative, nulle ou non finie est ignorée. Chaque case est plafonnée à maxValue.
   */
  deposit(x, y, amount) {
    if (!(amount > 0) || !Number.isFinite(amount) || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const { i0, j0, tx, ty } = this.locate(x, y);
    this.add(i0, j0, amount * (1 - tx) * (1 - ty));
    this.add(i0 + 1, j0, amount * tx * (1 - ty));
    this.add(i0, j0 + 1, amount * (1 - tx) * ty);
    this.add(i0 + 1, j0 + 1, amount * tx * ty);
  }

  add(i, j, amount) {
    const idx = this.clampIndex(j) * this.size + this.clampIndex(i);
    this.cells[idx] = Math.min(this.maxValue, this.cells[idx] + amount);
  }

  /** Concentration en (x, y) : interpolation bilinéaire entre les 4 cases voisines. */
  sample(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    const { i0, j0, tx, ty } = this.locate(x, y);
    const a = this.cell(i0, j0);
    const b = this.cell(i0 + 1, j0);
    const c = this.cell(i0, j0 + 1);
    const d = this.cell(i0 + 1, j0 + 1);
    return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
  }

  // ------------------------------------------------------------------ dynamique

  /** À appeler une fois par frame : diffuse et évapore toutes les `updateEvery` frames. */
  update() {
    this.counter++;
    if (this.counter % this.updateEvery === 0) this.diffuseAndEvaporate();
  }

  /**
   * Une étape de diffusion puis d'évaporation. Diffusion conservative : chaque case garde
   * (1 - diffusion) de sa valeur et envoie diffusion/4 à chacune de ses 4 voisines ; si la
   * voisine n'existe pas (bord de la grille), cette part reste dans la case.
   */
  diffuseAndEvaporate() {
    const n = this.size;
    const src = this.cells;
    const dst = this.buffer;
    const keep = 1 - this.diffusion;
    const share = this.diffusion / 4;
    dst.fill(0);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const idx = j * n + i;
        const v = src[idx];
        if (v === 0) continue;
        dst[idx] += v * keep;
        const s = v * share;
        if (i > 0) dst[idx - 1] += s; else dst[idx] += s;
        if (i < n - 1) dst[idx + 1] += s; else dst[idx] += s;
        if (j > 0) dst[idx - n] += s; else dst[idx] += s;
        if (j < n - 1) dst[idx + n] += s; else dst[idx] += s;
      }
    }
    const remain = 1 - this.evaporation;
    for (let k = 0; k < dst.length; k++) {
      const v = dst[k] * remain;
      dst[k] = v < this.epsilon ? 0 : v;
    }
    this.cells = dst;
    this.buffer = src;
  }

  // ------------------------------------------------------------------- utilitaires

  /** Somme de toutes les cases (pour les tests et le debug). */
  total() {
    let s = 0;
    for (let k = 0; k < this.cells.length; k++) s += this.cells[k];
    return s;
  }

  /** Plus grande valeur de la grille. */
  maxCell() {
    let m = 0;
    for (let k = 0; k < this.cells.length; k++) if (this.cells[k] > m) m = this.cells[k];
    return m;
  }

  clear() {
    this.cells.fill(0);
    this.buffer.fill(0);
    this.counter = 0;
  }
}
