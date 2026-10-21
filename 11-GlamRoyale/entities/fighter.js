/**
 * Fighter : une combattante (joueuse ou bot). Hérite de Vehicle pour le mouvement et
 * ajoute l'état de jeu : « glow » (points de vie), bouclier, munitions, arme, statistiques.
 */
class Fighter extends SteeringVehicle {
  constructor(x, y, opts = {}) {
    super(x, y, Object.assign({ maxSpeed: 3.4, maxForce: 0.16, r: 14 }, opts));
    this.id = opts.id ?? 0;
    this.name = opts.name || 'Glam';
    this.color = opts.color || '#ff8fc7';
    this.isPlayer = false;

    this.maxHp = 100;
    this.hp = this.maxHp;
    this.maxShield = 60;
    this.shield = 0;
    this.maxAmmo = 120;
    this.ammo = 40;
    this.weaponKey = 'bubble';
    this.owned = new Set(['bubble']);
    this.cooldown = 0;
    this.aimAngle = this.angle;
    this.hitFlash = 0;

    this.alive = true;
    this.killedBy = null;
    this.placement = null;
    // statistiques utilisées par la fitness et l'écran de fin
    this.kills = 0;
    this.damageDealt = 0;
    this.lootCount = 0;
    this.survivalFrames = 0;
    this.zoneFrames = 0;
  }

  get weapon() {
    return WEAPONS[this.weaponKey];
  }

  /**
   * Inflige des dégâts. Le bouclier absorbe d'abord (sauf dégâts de zone).
   * @returns {boolean} true si CET appel vient d'éliminer la combattante
   */
  takeDamage(amount, attackerId = null, ignoreShield = false) {
    if (!this.alive) return false;
    let remaining = amount;
    if (!ignoreShield && this.shield > 0) {
      const absorbed = Math.min(this.shield, remaining);
      this.shield -= absorbed;
      remaining -= absorbed;
    }
    this.hp -= remaining;
    if (amount >= 1) this.hitFlash = 8;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.killedBy = attackerId;
      return true;
    }
    return false;
  }

  heal(amount) { this.hp = Math.min(this.maxHp, this.hp + amount); }
  addShield(amount) { this.shield = Math.min(this.maxShield, this.shield + amount); }
  addAmmo(amount) { this.ammo = Math.min(this.maxAmmo, this.ammo + amount); }

  /** Équipe une arme déjà possédée. */
  equip(weaponKey) {
    if (WEAPONS[weaponKey] && this.owned.has(weaponKey)) this.weaponKey = weaponKey;
  }

  /** Ramasse une arme (sac à main) et l'équipe. */
  pickWeapon(weaponKey) {
    if (!WEAPONS[weaponKey]) return;
    this.owned.add(weaponKey);
    this.weaponKey = weaponKey;
  }

  /** Tourne la visée vers un angle, avec une vitesse de rotation maximale (rad/frame). */
  turnAim(targetAngle, maxTurn = Infinity) {
    const diff = wrapAngle(targetAngle - this.aimAngle);
    this.aimAngle = wrapAngle(this.aimAngle + clampValue(diff, -maxTurn, maxTurn));
  }

  canShoot() {
    return this.alive && this.cooldown <= 0 && this.ammo >= this.weapon.ammoCost;
  }

  /**
   * Tire avec l'arme équipée. Consomme les munitions, lance le délai de recharge et
   * renvoie la liste des projectiles à créer (la scène les ajoute au monde).
   */
  tryShoot() {
    if (!this.canShoot()) return [];
    const w = this.weapon;
    this.ammo -= w.ammoCost;
    this.cooldown = w.cooldown;
    const specs = [];
    for (let i = 0; i < w.pellets; i++) {
      const a = this.aimAngle + (this.rng() - 0.5) * 2 * w.spread;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      specs.push({
        x: this.pos.x + cos * (this.r + 4),
        y: this.pos.y + sin * (this.r + 4),
        vx: cos * w.speed,
        vy: sin * w.speed,
        speed: w.speed,
        damage: w.damage,
        life: w.life,
        r: w.r,
        kind: w.kind,
        homing: w.homing || 0,
        ownerId: this.id,
      });
    }
    return specs;
  }

  /** Mise à jour des compteurs internes (une fois par frame). */
  tick() {
    if (this.cooldown > 0) this.cooldown--;
    if (this.hitFlash > 0) this.hitFlash--;
  }

  /** Dessin (ui/render.js) ; la base Vehicle.show() attend une image, on ne l'utilise pas. */
  show(isFocus = false) {
    drawFighter(this, isFocus);
  }

  /** Dessin (délégué à ui/render.js). */
  show(isFocus = false) {
    drawFighter(this, isFocus);
  }
}
