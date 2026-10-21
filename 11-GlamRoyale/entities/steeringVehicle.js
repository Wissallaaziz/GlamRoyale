/**
 * SteeringVehicle : sous-classe de Vehicle (vehicle.js, copie conforme de l'exercice 4,
 * NON modifiée) qui ajoute les comportements de Reynolds dont Glam Royale a besoin et que
 * la classe de base n'a pas. Rien n'est redéfini dans vehicle.js, tout est ici.
 *
 * Réutilisé tel quel depuis Vehicle (hérité) :
 *   seek, flee, arrive (rayon de freinage 100 px), wander, applyForce, update.
 *
 * Ajouté ici :
 *   steerTo        force = vitesse désirée - vitesse actuelle, tronquée à maxForce
 *   flee           surcharge : vitesse désirée orientée à l'opposé de la cible, puis
 *                  force = désirée - vitesse (la base se contente d'inverser seek)
 *   pursue/evade   surcharges : la base dessine un point vert à chaque appel et utilise un
 *                  horizon fixe ; ici l'horizon dépend de la distance (borné, sans division
 *                  par zéro), pursue réutilise seek() hérité et evade fuit la position future
 *                  avec flee()
 *   separate       Separation (la base n'en a pas ; testée, voisins superposés gérés)
 *   avoidObstacles Obstacle Avoidance pour des Obstacle (entities/obstacle.js)
 *   contain        Containment : ramène vers le centre d'un cercle près de son bord
 *   trailSensors / followTrail  suivi de piste de phéromones : 3 capteurs devant, puis Seek
 *                  (hérité) vers le plus fort (world/pheromones.js)
 *   accumulate     combinaison par priorité avec budget de force (Reynolds, §4)
 *   confineToCircle / resolveCircle : règles de contact appliquées par la scène
 *
 * update() est surchargée UNE fois : elle appelle super.update() (locomotion de la base)
 * puis mémorise l'orientation `angle` alignée sur la vitesse.
 */
class SteeringVehicle extends Vehicle {
  /**
   * @param {number} x, y
   * @param {object} opts maxSpeed (px/frame), maxForce, r (rayon), rng (aléa injecté),
   *   wanderDistance / wanderRadius / wanderChange (paramètres du Wander hérité),
   *   avoidLookAhead (distance d'anticipation de base de l'évitement), pathLength (traînée)
   */
  constructor(x, y, opts = {}) {
    super(x, y, null);
    this.vel.set(0, 0);
    this.maxSpeed = opts.maxSpeed ?? 3.5;
    this.maxForce = opts.maxForce ?? 0.15;
    this.r = opts.r ?? 14;
    this.rng = opts.rng || Math.random;
    this.angle = this.rng() * Math.PI * 2 - Math.PI;
    this.avoidLookAhead = opts.avoidLookAhead ?? 40;
    // paramètres du Wander hérité de Vehicle
    this.distanceCercle = opts.wanderDistance ?? 60;
    this.wanderRadius = opts.wanderRadius ?? 30;
    this.displaceRange = opts.wanderChange ?? 0.35;
    // longueur de la traînée de Vehicle (points mémorisés)
    this.pathLength = opts.pathLength ?? 8;
  }

  // ---------------------------------------------------------------- locomotion

  /** Locomotion de la base (une seule fois), puis orientation sur la vitesse. */
  update() {
    super.update();
    if (this.vel.magSq() > 0.0025) this.angle = this.vel.heading();
  }

  // ------------------------------------------------------------------ steering

  /** Force = (vitesse désirée - vitesse actuelle), tronquée à maxForce. */
  steerTo(desired) {
    return desired.copy().sub(this.vel).limit(this.maxForce);
  }

  /** Position future estimée d'un autre véhicule : horizon = distance / maxSpeed (max 40 frames). */
  predictPosition(other, maxPredict = 40) {
    const d = p5.Vector.dist(other.pos, this.pos);
    const t = Math.min(d / Math.max(this.maxSpeed, 0.001), maxPredict);
    return p5.Vector.add(other.pos, p5.Vector.mult(other.vel, t));
  }

  /**
   * Flee : vitesse désirée à l'opposé de la cible (maxSpeed), force = désirée - vitesse,
   * tronquée à maxForce. `target` est un p5.Vector (position) ; cible confondue avec le
   * véhicule : force nulle (direction indéfinie).
   */
  flee(target) {
    const desired = p5.Vector.sub(this.pos, target);
    if (desired.magSq() === 0) return createVector(0, 0);
    desired.setMag(this.maxSpeed);
    return this.steerTo(desired);
  }

  /** Pursuit : Seek (hérité) vers la position future de la cible. */
  pursue(other, maxPredict = 40) {
    return this.seek(this.predictPosition(other, maxPredict));
  }

  /** Evasion : Flee depuis la position future de la menace (pas l'inverse de pursue). */
  evade(other, maxPredict = 40) {
    return this.flee(this.predictPosition(other, maxPredict));
  }

  /** Separation : s'éloigne des voisins trop proches (poids 1/distance). */
  separate(others, desiredSeparation = 50) {
    const sum = createVector(0, 0);
    let count = 0;
    for (const o of others) {
      if (o === this || o.alive === false) continue;
      const d = p5.Vector.dist(this.pos, o.pos);
      if (d > 0 && d < desiredSeparation) {
        sum.add(p5.Vector.sub(this.pos, o.pos).setMag(1 / d));
        count++;
      }
    }
    if (count === 0) return createVector(0, 0);
    sum.setMag(this.maxSpeed);
    return this.steerTo(sum);
  }

  /** Cherche l'obstacle (Obstacle : pos, r) le plus menaçant dans le couloir devant le véhicule. */
  findThreat(obstacles) {
    const speed = this.vel.mag();
    const fwd = speed > 0.05 ? this.vel.copy().div(speed) : p5.Vector.fromAngle(this.angle, 1);
    const look = this.avoidLookAhead + speed * 16;
    let best = null;
    for (const o of obstacles) {
      const dx = o.pos.x - this.pos.x;
      const dy = o.pos.y - this.pos.y;
      if (dx * dx + dy * dy > (look + o.r + this.r) * (look + o.r + this.r)) continue;
      const proj = dx * fwd.x + dy * fwd.y;
      if (proj < 0 || proj > look + o.r) continue;
      const lateral = createVector(dx - fwd.x * proj, dy - fwd.y * proj);
      if (lateral.mag() > o.r + this.r + 4) continue;
      if (!best || proj < best.proj) best = { obstacle: o, proj, lateral, look, fwd };
    }
    return best;
  }

  /** Niveau de menace 0..1 d'un obstacle devant (0 = rien, 1 = collision imminente). */
  obstacleThreat(obstacles) {
    const t = this.findThreat(obstacles);
    if (!t) return 0;
    const dist = Math.max(0, t.proj - t.obstacle.r);
    return clampValue(1 - dist / t.look, 0, 1);
  }

  /** Obstacle Avoidance : force latérale qui contourne l'obstacle, plus un léger freinage. */
  avoidObstacles(obstacles) {
    const t = this.findThreat(obstacles);
    if (!t) return createVector(0, 0);
    const closeness = this.obstacleThreat(obstacles);
    const away = t.lateral.copy().mult(-1);
    if (away.mag() < 1e-3) away.set(-t.fwd.y, t.fwd.x);
    const steer = away.setMag(this.maxForce * (0.5 + 0.5 * closeness));
    const brake = t.fwd.copy().mult(-this.maxForce * 0.4 * closeness);
    return steer.add(brake).limit(this.maxForce);
  }

  /**
   * Containment : renvoie vers le centre quand le véhicule approche du bord d'un cercle
   * (à moins de `margin` px) ; la force augmente avec la profondeur de pénétration.
   */
  contain(cx, cy, radius, margin = 60) {
    const d = Math.hypot(this.pos.x - cx, this.pos.y - cy);
    const start = radius - margin;
    if (d <= start) return createVector(0, 0);
    const depth = clampValue((d - start) / Math.max(margin, 1), 0, 1);
    const desired = createVector(cx - this.pos.x, cy - this.pos.y).setMag(this.maxSpeed);
    return this.steerTo(desired).mult(depth);
  }

  // ---------------------------------------------- combinaison (Reynolds, §4)

  /**
   * Somme tronquée avec priorité : ajoute `force` à `total` tant qu'il reste du « budget »
   * de force (maxForce). Les comportements prioritaires doivent donc être ajoutés en premier.
   * Renvoie false quand le budget est épuisé.
   */
  accumulate(total, force) {
    const remaining = this.maxForce - total.mag();
    if (remaining <= 1e-9) return false;
    const m = force.mag();
    if (m === 0) return true;
    if (m <= remaining) total.add(force);
    else total.add(force.copy().setMag(remaining));
    return true;
  }

  // ------------------------------------- règles de contact (appelées par la scène)

  /** Garde le véhicule dans un cercle (bord de l'île) et annule la vitesse sortante. */
  confineToCircle(cx, cy, radius) {
    const dx = this.pos.x - cx;
    const dy = this.pos.y - cy;
    const d = Math.hypot(dx, dy);
    const limit = radius - this.r;
    if (d > limit && d > 0) {
      const nx = dx / d;
      const ny = dy / d;
      this.pos.set(cx + nx * limit, cy + ny * limit);
      const vn = this.vel.x * nx + this.vel.y * ny;
      if (vn > 0) this.vel.sub(nx * vn, ny * vn);
    }
  }

  /** Repousse le véhicule hors d'un obstacle circulaire et annule la vitesse qui y entre. */
  resolveCircle(cx, cy, cr) {
    const dx = this.pos.x - cx;
    const dy = this.pos.y - cy;
    const min = cr + this.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) return false;
    const d = Math.sqrt(d2);
    const nx = d < 1e-6 ? 1 : dx / d;
    const ny = d < 1e-6 ? 0 : dy / d;
    this.pos.set(cx + nx * min, cy + ny * min);
    const vn = this.vel.x * nx + this.vel.y * ny;
    if (vn < 0) this.vel.sub(nx * vn, ny * vn);
    return true;
  }

  // ------------------------------------------------------- phéromones (suivi de piste)

  /**
   * Perception d'une piste : trois capteurs devant le véhicule, comme les antennes d'une
   * fourmi (à gauche, au centre et à droite du cap), qui lisent la concentration de
   * phéromone. Aucune force ici : c'est de la perception (niveau « choix d'action »).
   * Le cap est celui de la vitesse (ou `angle` à l'arrêt). Les capteurs sont placés à
   * `sensorDistance` px, plus loin que la case de dépôt, pour ne pas sentir sa propre traînée.
   * @param {PheromoneField} field
   * @param {object} opts sensorDistance (90 px), sensorAngle (0,7 rad d'écart avec le cap)
   * @returns {{points: p5.Vector[], values: number[], best: number, bestValue: number, strength: number}}
   *   best = indice du capteur le plus fort (0 gauche, 1 centre, 2 droite ; le centre l'emporte
   *   à égalité), strength = bestValue / saturation, borné à [0, 1].
   */
  trailSensors(field, opts = {}) {
    const distance = opts.sensorDistance ?? 90;
    const spread = opts.sensorAngle ?? 0.7;
    const heading = this.vel.magSq() > 0.0025 ? this.vel.heading() : this.angle;
    const points = [-spread, 0, spread].map((a) => createVector(
      this.pos.x + Math.cos(heading + a) * distance,
      this.pos.y + Math.sin(heading + a) * distance
    ));
    const values = points.map((p) => field.sample(p.x, p.y));
    let best = 1;
    for (const i of [0, 2]) if (values[i] > values[best]) best = i;
    const bestValue = values[best];
    return { points, values, best, bestValue, strength: clampValue(bestValue / field.saturation, 0, 1) };
  }

  /**
   * Trail following : Seek (hérité de Vehicle) vers le capteur qui sent le plus de phéromone,
   * avec une intensité proportionnelle à la force du signal (piste faible = force faible).
   * Force nulle si aucun capteur ne dépasse `minSignal` (rien à suivre : un autre comportement,
   * comme Wander, prend le relais).
   * @param {object} sensors résultat de trailSensors()
   * @param {number} minSignal concentration minimale pour qu'une piste compte (0,05)
   * @returns {p5.Vector} force, de norme <= maxForce
   */
  followTrail(sensors, minSignal = 0.05) {
    if (!sensors || !(sensors.bestValue >= minSignal)) return createVector(0, 0);
    return this.seek(sensors.points[sensors.best]).mult(sensors.strength);
  }

  // ---------------------------------------------------------------------- debug

  /**
   * Géométrie du Wander pour le mode debug (touche D). LIT l'état du Wander hérité de
   * Vehicle (vitesse, distanceCercle, wanderRadius, wanderTheta) avec exactement la même
   * construction que Vehicle.wander() : centre du cercle devant le véhicule, puis point cible
   * sur le cercle à l'angle wanderTheta + cap. Aucune force n'est recalculée, rien n'est
   * modifié : c'est le point que le prochain appel à wander() va viser.
   * @returns {{center: p5.Vector, radius: number, target: p5.Vector}}
   */
  wanderDebug() {
    const center = this.vel.copy();
    center.setMag(this.distanceCercle);
    center.add(this.pos);
    const theta = this.wanderTheta + this.vel.heading();
    const target = createVector(
      center.x + this.wanderRadius * Math.cos(theta),
      center.y + this.wanderRadius * Math.sin(theta)
    );
    return { center, radius: this.wanderRadius, target };
  }
}
