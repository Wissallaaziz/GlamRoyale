/**
 * GameWorld : toute la logique d'une partie, SANS aucun dessin. C'est la « scène » au sens
 * de l'architecture : elle orchestre (perception, décisions, forces, locomotion, collisions,
 * butin, projectiles, zone) mais ne déplace jamais une position directement : chaque
 * combattante reçoit une force qui passe par Vehicle.applyForce / update.
 *
 * Le même code sert au jeu (sketch.js), à la page d'entraînement et aux tests Node.
 */
const GAME_DEFAULTS = {
  radius: 1500,        // rayon de l'île (carte d'environ 3000 x 3000 px)
  bots: 11,            // nombre de bots (ignoré si `brains` est fourni)
  withPlayer: true,    // une joueuse humaine en plus des bots
  obstacleCount: 70,
  lootCount: 90,
  maxFrames: 9000,     // durée maximale d'une partie (2 min 30)
  seed: 1,
  zonePhases: undefined,
  brains: null,        // tableau de Brain, un par bot
  reflexNet: null,     // réflexe explorer/fuir (ExploreFleeNet) ; null = defaultReflexNet()
  pheromone: null,     // surcharge de PHEROMONE_DEFAULTS (voir world/pheromones.js)
};

const HOMING_RANGE = 260; // portée de détection d'un projectile guidé (px)

const GLAM_NAMES = ['Luna', 'Mia', 'Zoé', 'Lola', 'Candy', 'Jade', 'Sasha', 'Nina', 'Rose', 'Coco', 'Lily', 'Bella',
  'Maya', 'Ruby', 'Emma', 'Cléo'];
const GLAM_COLORS = ['#b69cff', '#7fe3c4', '#ffb36b', '#7cc4ff', '#ff9aa2', '#d4a5ff', '#a5e887', '#ffd166',
  '#f78fb3', '#8fd3ff', '#c3a6ff', '#ffa8d5', '#9be7ff', '#ffc9a8', '#b8f2a0', '#e0a8ff'];

class GameWorld {
  /** @param {object} opts voir GAME_DEFAULTS */
  constructor(opts = {}) {
    const o = Object.assign({}, GAME_DEFAULTS, opts);
    if (!o.zonePhases) delete o.zonePhases;
    this.opts = o;
    this.seed = o.seed;
    this.rng = makeRng(o.seed);
    // Le Wander hérité de vehicle.js utilise random() de p5 : on le rend reproductible.
    if (typeof randomSeed === 'function') randomSeed(o.seed);
    this.radius = o.radius;
    this.maxFrames = o.maxFrames;
    this.obstacles = generateObstacles(this.rng, o.radius, o.obstacleCount);
    this.loot = generateLoot(this.rng, o.radius, this.obstacles, o.lootCount);
    this.zone = new Zone(o.radius, this.rng, o.zonePhases || DEFAULT_ZONE_PHASES);
    // phéromones : champ de l'environnement (pas une entité) ; réflexe 3–6–2 partagé par les bots
    this.pheromones = new PheromoneField(o.radius, o.pheromone || {});
    this.reflexNet = o.reflexNet || defaultReflexNet();
    this.fighters = [];
    this.bullets = [];
    this.events = [];    // événements de la frame (pour sons et particules)
    this.killFeed = [];  // {frame, killer, victim, byZone}
    this.frame = 0;
    this.over = false;
    this.winner = null;
    this.player = null;
    this.rankings = [];
    this.spawnFighters();
  }

  /** Place les combattantes en cercle autour de l'île, hors des obstacles. */
  spawnFighters() {
    const o = this.opts;
    const brains = o.brains || [];
    const botCount = o.brains ? o.brains.length : o.bots;
    const total = botCount + (o.withPlayer ? 1 : 0);
    const offset = this.rng() * Math.PI * 2;
    for (let i = 0; i < total; i++) {
      const ang = offset + (i / total) * Math.PI * 2 + (this.rng() - 0.5) * 0.25;
      const dist = o.radius * (0.62 + this.rng() * 0.22);
      const spot = this.freeSpot(Math.cos(ang) * dist, Math.sin(ang) * dist);
      const isPlayer = o.withPlayer && i === 0;
      const bi = i - (o.withPlayer ? 1 : 0);
      const common = {
        id: i,
        name: isPlayer ? 'Toi' : GLAM_NAMES[bi % GLAM_NAMES.length],
        color: isPlayer ? '#ff4fa3' : GLAM_COLORS[bi % GLAM_COLORS.length],
        rng: makeRng(o.seed * 7919 + i * 104729 + 1),
      };
      let f;
      if (isPlayer) {
        f = new PlayerFighter(spot.x, spot.y, common);
        this.player = f;
      } else {
        const brain = brains[bi] || new Brain(null, makeRng(o.seed + bi * 31 + 5));
        f = new Bot(spot.x, spot.y, Object.assign(common, { brain, genomeIndex: bi }));
      }
      this.fighters.push(f);
    }
  }

  /** Cherche un point libre (hors obstacle) proche de (x, y). */
  freeSpot(x, y) {
    for (let t = 0; t < 40; t++) {
      if (!pointInObstacle(x, y, this.obstacles, 40)) return { x, y };
      x += (this.rng() - 0.5) * 120;
      y += (this.rng() - 0.5) * 120;
    }
    return { x, y };
  }

  aliveFighters() { return this.fighters.filter((f) => f.alive); }
  aliveCount() { return this.fighters.reduce((n, f) => n + (f.alive ? 1 : 0), 0); }

  /**
   * Avance la partie d'une frame.
   * @param {object} input commandes de la joueuse : dx, dy, aimX, aimY, shoot, weapon
   */
  step(input = {}) {
    if (this.over) return;
    this.events.length = 0;
    this.frame++;
    this.zone.update();

    for (const f of this.fighters) {
      if (!f.alive) continue;
      f.tick();
      f.survivalFrames++;
      let force;
      let shots = [];
      if (f.isPlayer) {
        if (input.weapon) f.equip(input.weapon);
        f.updateAim(input);
        force = f.computeSteering(input);
        if (input.shoot) shots = f.tryShoot();
      } else {
        f.think(this);
        force = f.computeSteering(this);
        shots = f.combat(this);
      }
      f.applyForce(force);
      f.update(1);
      this.depositTrail(f);
      for (const s of shots) this.bullets.push(new Bullet(s));
      if (shots.length) this.events.push({ type: 'shot', x: f.pos.x, y: f.pos.y, kind: shots[0].kind, id: f.id });
    }

    this.pheromones.update(); // diffusion et évaporation des pistes
    this.resolveContacts();
    this.pickupLoot();
    this.updateBullets();
    this.applyZoneDamage();
    this.handleDeaths();
    this.checkEnd();
  }

  /**
   * Piste : la combattante dépose de la phéromone à sa position, proportionnellement à sa
   * vitesse (à l'arrêt elle n'en dépose pas). C'est une règle de scène, pas un comportement.
   */
  depositTrail(f) {
    const ratio = clampValue(f.vel.mag() / Math.max(f.maxSpeed, 1e-9), 0, 1);
    this.pheromones.deposit(f.pos.x, f.pos.y, this.pheromones.depositRate * ratio);
  }

  /** Bord de l'île, obstacles et chevauchements entre combattantes. */
  resolveContacts() {
    const fs = this.fighters;
    for (const f of fs) {
      if (!f.alive) continue;
      f.confineToCircle(0, 0, this.radius);
      for (const o of this.obstacles) f.resolveCircle(o.pos.x, o.pos.y, o.r);
    }
    for (let i = 0; i < fs.length; i++) {
      const a = fs[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < fs.length; j++) {
        const b = fs[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x;
        const dy = b.pos.y - a.pos.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.001;
        const push = (min - d) / 2;
        const nx = d < 0.002 ? 1 : dx / d;
        const ny = d < 0.002 ? 0 : dy / d;
        a.pos.sub(nx * push, ny * push);
        b.pos.add(nx * push, ny * push);
      }
    }
  }

  pickupLoot() {
    for (const f of this.fighters) {
      if (!f.alive) continue;
      for (const l of this.loot) {
        if (l.taken) continue;
        const reach = f.r + l.r + 4;
        const dx = l.pos.x - f.pos.x;
        const dy = l.pos.y - f.pos.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        if (!f.isPlayer && !lootUseful(f, l)) continue; // les bots ne gaspillent pas le butin
        l.taken = true;
        f.lootCount++;
        const text = applyLoot(f, l, this.rng);
        this.events.push({ type: 'pickup', x: l.pos.x, y: l.pos.y, id: f.id, loot: l.type, text });
      }
    }
  }

  updateBullets() {
    for (const b of this.bullets) {
      if (!b.alive) continue;
      if (b.maxForce > 0) {
        const target = this.homingTarget(b);
        if (target) b.applyForce(b.seek(target.pos)); // guidage : Seek hérité, force bornée
      }
      b.step();
      if (!b.alive) continue;
      let blocked = false;
      for (const o of this.obstacles) {
        const dx = o.pos.x - b.pos.x;
        const dy = o.pos.y - b.pos.y;
        if (dx * dx + dy * dy < (o.r + b.r) * (o.r + b.r)) { blocked = true; break; }
      }
      if (blocked) {
        b.alive = false;
        this.events.push({ type: 'pop', x: b.pos.x, y: b.pos.y, kind: b.kind });
        continue;
      }
      for (const f of this.fighters) {
        if (!f.alive || f.id === b.ownerId) continue;
        const reach = f.r + b.r;
        const dx = f.pos.x - b.pos.x;
        const dy = f.pos.y - b.pos.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        b.alive = false;
        const owner = this.fighters[b.ownerId];
        const dealt = Math.min(b.damage, f.hp + f.shield);
        const killed = f.takeDamage(b.damage, b.ownerId);
        if (owner) {
          owner.damageDealt += dealt;
          if (killed) owner.kills++;
        }
        this.events.push({ type: 'hit', x: b.pos.x, y: b.pos.y, id: f.id, by: b.ownerId, kind: b.kind });
        break;
      }
    }
    this.bullets = this.bullets.filter((b) => b.alive);
  }

  /**
   * Cible d'un projectile guidé : l'ennemie vivante la plus proche (hors tireuse) à moins de
   * HOMING_RANGE px et dans le demi-plan devant le projectile. null si aucune.
   */
  homingTarget(bullet) {
    let best = null;
    let bestD = HOMING_RANGE * HOMING_RANGE;
    for (const f of this.fighters) {
      if (!f.alive || f.id === bullet.ownerId) continue;
      const dx = f.pos.x - bullet.pos.x;
      const dy = f.pos.y - bullet.pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD && dx * bullet.vel.x + dy * bullet.vel.y > 0) { bestD = d2; best = f; }
    }
    return best;
  }

  applyZoneDamage() {
    const z = this.zone;
    for (const f of this.fighters) {
      if (!f.alive) continue;
      if (z.contains(f.pos.x, f.pos.y)) continue;
      f.zoneFrames++;
      f.takeDamage(z.damage, null, true);
      if (f.isPlayer && this.frame % 40 === 0) this.events.push({ type: 'zoneHit', x: f.pos.x, y: f.pos.y, id: f.id });
    }
  }

  /** Attribue le classement aux combattantes qui viennent de mourir. */
  handleDeaths() {
    const dead = this.fighters.filter((f) => !f.alive && f.placement === null);
    if (!dead.length) return;
    const alive = this.aliveCount();
    dead.forEach((f, i) => {
      f.placement = alive + dead.length - i;
      const killer = f.killedBy !== null && f.killedBy !== undefined ? this.fighters[f.killedBy] : null;
      this.killFeed.push({ frame: this.frame, killer: killer ? killer.name : null, victim: f.name, byZone: !killer });
      this.events.push({ type: 'kill', x: f.pos.x, y: f.pos.y, id: f.id, by: f.killedBy, color: f.color });
    });
    if (this.killFeed.length > 6) this.killFeed.splice(0, this.killFeed.length - 6);
  }

  /** Fin de partie : une seule survivante (ou aucune), ou temps écoulé. */
  checkEnd() {
    const alive = this.aliveFighters();
    const timeout = this.frame >= this.maxFrames;
    if (alive.length > 1 && !timeout) return;
    this.over = true;
    // classement des survivantes (une seule normalement ; plusieurs si temps écoulé)
    alive.sort((a, b) => b.hp + b.shield - (a.hp + a.shield));
    alive.forEach((f, i) => { f.placement = i + 1; });
    this.winner = alive[0] || null;
    this.rankings = this.fighters.slice().sort((a, b) => a.placement - b.placement);
    this.events.push({ type: 'over', winner: this.winner ? this.winner.id : null });
  }
}
