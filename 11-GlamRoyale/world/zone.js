/**
 * Zone : le nuage de paillettes qui rétrécit par phases, comme la zone de PUBG.
 *
 * Chaque phase a deux temps :
 *   - « waiting »   : la prochaine zone (cercle cible) est annoncée, rien ne bouge ;
 *   - « shrinking » : la zone courante se déplace/rétrécit linéairement vers la cible.
 * Hors de la zone courante, on perd du glow (dégâts par frame de la phase en cours).
 *
 * Les rayons des phases sont des fractions du rayon de l'île ; durées en frames (60/s).
 */
const DEFAULT_ZONE_PHASES = [
  { wait: 900, shrink: 700, radius: 0.62, damage: 0.03 },
  { wait: 600, shrink: 600, radius: 0.38, damage: 0.05 },
  { wait: 480, shrink: 500, radius: 0.20, damage: 0.08 },
  { wait: 360, shrink: 400, radius: 0.08, damage: 0.12 },
  { wait: 0, shrink: 360, radius: 0.02, damage: 0.20 },
];

class Zone {
  constructor(islandRadius, rng = Math.random, phases = DEFAULT_ZONE_PHASES) {
    this.islandRadius = islandRadius;
    this.rng = rng;
    this.phases = phases;
    // zone courante
    this.cx = 0;
    this.cy = 0;
    this.radius = islandRadius;
    // cercle cible (visible pendant l'attente)
    this.tx = 0;
    this.ty = 0;
    this.tr = islandRadius;
    this.phaseIndex = 0;
    this.state = 'waiting';
    this.timer = 0;
    this.finished = false;
    this.start = { x: 0, y: 0, r: islandRadius };
    this.pickTarget();
    if (this.phases[0].wait === 0) this.beginShrink();
  }

  get phase() { return this.phases[Math.min(this.phaseIndex, this.phases.length - 1)]; }

  /** Dégâts par frame hors de la zone. */
  get damage() { return this.phase.damage; }

  /** Choisit le prochain cercle, entièrement inclus dans le cercle courant. */
  pickTarget() {
    const r = this.phases[this.phaseIndex].radius * this.islandRadius;
    const maxOffset = Math.max(0, this.radius - r);
    const a = this.rng() * Math.PI * 2;
    const d = Math.sqrt(this.rng()) * maxOffset;
    this.tx = this.cx + Math.cos(a) * d;
    this.ty = this.cy + Math.sin(a) * d;
    this.tr = r;
  }

  beginShrink() {
    this.state = 'shrinking';
    this.timer = 0;
    this.start = { x: this.cx, y: this.cy, r: this.radius };
  }

  /** Avance d'une frame. */
  update() {
    if (this.finished) return;
    this.timer++;
    if (this.state === 'waiting') {
      if (this.timer >= this.phase.wait) this.beginShrink();
      return;
    }
    const t = Math.min(1, this.timer / this.phase.shrink);
    this.cx = this.start.x + (this.tx - this.start.x) * t;
    this.cy = this.start.y + (this.ty - this.start.y) * t;
    this.radius = this.start.r + (this.tr - this.start.r) * t;
    if (t >= 1) {
      this.cx = this.tx;
      this.cy = this.ty;
      this.radius = this.tr;
      if (this.phaseIndex >= this.phases.length - 1) {
        this.finished = true;
        return;
      }
      this.phaseIndex++;
      this.state = 'waiting';
      this.timer = 0;
      this.pickTarget();
      if (this.phase.wait === 0) this.beginShrink();
    }
  }

  /** Le point est-il dans la zone courante ? */
  contains(x, y) {
    return Math.hypot(x - this.cx, y - this.cy) <= this.radius;
  }

  /** Frames restantes avant le début/la fin du rétrécissement de la phase. */
  get framesLeft() {
    if (this.finished) return 0;
    const len = this.state === 'waiting' ? this.phase.wait : this.phase.shrink;
    return Math.max(0, len - this.timer);
  }

  /**
   * Point où une combattante doit se rendre : sa propre position si elle est déjà dans le
   * cœur (factor x rayon) du cercle cible, sinon le point du cœur le plus proche d'elle.
   * Les combattantes se dispersent ainsi dans la zone au lieu de toutes viser le centre.
   */
  safePoint(pos, factor = 0.6) {
    const dx = pos.x - this.tx;
    const dy = pos.y - this.ty;
    const d = Math.hypot(dx, dy);
    const lim = this.tr * factor;
    if (d <= lim) return { x: pos.x, y: pos.y };
    return { x: this.tx + (dx / d) * lim, y: this.ty + (dy / d) * lim };
  }
}
