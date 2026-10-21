/**
 * Effet du réflexe explorer/fuir (réseau 3–6–2) sur les poids décidés par le cerveau évolutif.
 *   - mode « fuir » (et une menace visible) : Pursuit coupé, suivi de piste coupé, butin réduit
 *     (lootFactor) et poids d'Evasion relevé à au moins fleeMinWeight ;
 *   - mode « explorer » : l'Evasion décidée par le cerveau est atténuée (calmFleeFactor) pour
 *     ne pas fuir une ennemie lointaine ou qui s'éloigne.
 * La bot peut continuer à tirer en fuyant (tir et déplacement sont décidés séparément).
 */
const REFLEX_EFFECT = {
  fleeMinWeight: 0.85,
  calmFleeFactor: 0.25,
  lootFactor: 0.4,
};

/**
 * Bot : une combattante pilotée par l'IA. Les trois niveaux de Reynolds sont bien séparés :
 *
 *   1. CHOIX D'ACTION  (think)            : perception -> réflexe 3–6–2 (explorer ou fuir) puis
 *                                           cerveau évolutif -> poids des comportements +
 *                                           envie de tirer ;
 *   2. STEERING        (computeSteering)  : les forces sont calculées par les
 *                                           comportements de Vehicle, combinées par
 *                                           priorité puis somme pondérée tronquée ;
 *   3. LOCOMOTION      (Vehicle.update)   : appelée par la scène.
 *
 * Priorités (le budget de force maxForce est distribué dans cet ordre) :
 *   Obstacle Avoidance > Containment (île, puis zone) > Separation > comportements
 *   stratégiques pondérés par le réseau (butin, Pursuit, Evasion, Wander, retour en zone,
 *   suivi de piste de phéromones).
 */
class Bot extends Fighter {
  /** @param {object} opts  brain (Brain), genomeIndex, + options de Fighter */
  constructor(x, y, opts = {}) {
    super(x, y, opts);
    this.brain = opts.brain || null;
    this.genomeIndex = opts.genomeIndex ?? -1;
    this.perceived = null;
    this.decision = null;
    this.reflex = null; // dernière décision du réflexe explorer/fuir (mode, pFlee, entrées)
  }

  /** Niveau 1 : percevoir, laisser le réflexe choisir le mode, puis consulter le cerveau évolutif. */
  think(world) {
    this.perceived = perceive(this, world);
    const net = world.reflexNet || defaultReflexNet();
    this.reflex = net.decide(...this.perceived.reflexInputs);
    this.decision = this.brain
      ? this.brain.decide(this.perceived.inputs)
      : { loot: 0.5, pursue: 0.5, flee: 0.5, wander: 0.5, zone: 0.5, trail: 0.5, shoot: false, shootRaw: 0 };
    return this.decision;
  }

  /** Niveau 2 : renvoie la force de steering totale (déjà tronquée à maxForce). */
  computeSteering(world) {
    if (!this.perceived) this.think(world);
    const p = this.perceived;
    const d = this.decision;
    const zone = world.zone;

    // --- poids des comportements : cerveau évolutif, corrigés par le réflexe explorer/fuir
    const fleeing = !!(this.reflex && this.reflex.flee && p.enemy);
    const wLoot = fleeing ? d.loot * REFLEX_EFFECT.lootFactor : d.loot;
    const wPursue = fleeing ? 0 : d.pursue;
    const wTrail = fleeing ? 0 : d.trail;
    const wFlee = fleeing ? Math.max(d.flee, REFLEX_EFFECT.fleeMinWeight) : d.flee * REFLEX_EFFECT.calmFleeFactor;

    // --- comportements stratégiques, pondérés
    const strategic = createVector(0, 0);
    if (p.loot) strategic.add(this.arrive(p.loot.pos).mult(wLoot));
    if (p.enemy) {
      // Pursuit : on s'approche jusqu'à une distance de combat, pas plus près
      const keep = Math.min(weaponRange(this.weapon) * 0.5, 260);
      const closeness = clampValue((p.enemyDist - keep * 0.5) / keep, 0, 1);
      strategic.add(this.pursue(p.enemy).mult(wPursue * closeness));
      strategic.add(this.evade(p.enemy).mult(wFlee));
    }
    strategic.add(this.followTrail(p.trail).mult(wTrail));
    strategic.add(this.wander().mult(0.6 * d.wander));
    const safe = zone.safePoint(this.pos, 0.6);
    strategic.add(this.arrive(createVector(safe.x, safe.y)).mult(d.zone));
    strategic.limit(this.maxForce);

    // --- combinaison par priorité (Reynolds) : sécurité d'abord
    const total = createVector(0, 0);
    this.accumulate(total, this.avoidObstacles(world.obstacles));
    this.accumulate(total, this.contain(0, 0, world.radius, 100));
    this.accumulate(total, this.contain(zone.cx, zone.cy, zone.radius, 90));
    this.accumulate(total, this.separate(world.fighters, 45).mult(0.7));
    this.accumulate(total, strategic);
    return total;
  }

  /**
   * Visée et tir. Vise la position anticipée de l'ennemie ; ne tire que si le réseau le
   * veut, que la cible est à portée, que la ligne de tir est dégagée et que la visée est
   * alignée. Renvoie les projectiles à créer.
   */
  combat(world) {
    const p = this.perceived;
    const e = p && p.enemy;
    if (!e) {
      this.turnAim(this.angle, 0.08);
      return [];
    }
    const w = this.weapon;
    const t = Math.min(p.enemyDist / w.speed, w.life);
    const ax = e.pos.x + e.vel.x * t;
    const ay = e.pos.y + e.vel.y * t;
    const want = Math.atan2(ay - this.pos.y, ax - this.pos.x);
    this.turnAim(want, 0.1);
    const err = Math.abs(wrapAngle(want - this.aimAngle));
    const inRange = p.enemyDist < weaponRange(w) * 0.85;
    if (!this.decision.shoot || !inRange || err > 0.12) return [];
    if (segmentBlocked(this.pos, e.pos, world.obstacles)) return [];
    return this.tryShoot();
  }
}
