/**
 * Bullet : projectile (bulle, cœur ou confetti). C'est un Vehicle (celui de vehicle.js) lancé
 * avec une vitesse initiale ; il avance avec la locomotion héritée (update), une fois par frame.
 *
 * Bulles et confettis volent en ligne droite (maxForce = 0 : aucun steering). Le cœur est à
 * tête chercheuse : `maxForce` vaut alors `homing` et la scène lui applique la force de Seek
 * héritée vers l'ennemie la plus proche devant lui (GameWorld.homingTarget). Les projectiles
 * ne téléportent jamais : seule update() modifie la position.
 */
class Bullet extends Vehicle {
  /** @param {object} spec  {x, y, vx, vy, speed, damage, life, r, kind, homing, ownerId} */
  constructor(spec) {
    super(spec.x, spec.y, null);
    this.vel.set(spec.vx, spec.vy);
    this.maxSpeed = spec.speed * 1.001;
    this.maxForce = spec.homing || 0;
    this.r = spec.r;
    this.pathLength = 5; // petite traînée (gérée par Vehicle.update)
    this.damage = spec.damage;
    this.life = spec.life;
    this.kind = spec.kind;
    this.ownerId = spec.ownerId;
    this.alive = true;
  }

  /** Avance d'une frame (locomotion héritée) et vieillit. */
  step() {
    this.update();
    this.life--;
    if (this.life <= 0) this.alive = false;
  }

  show() {
    drawBullet(this);
  }
}
