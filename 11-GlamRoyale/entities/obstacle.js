/**
 * Obstacle : arbre-bonbon, rocher ou cristal. Conformément à AGENTS.md, c'est un Vehicle
 * IMMOBILE : il garde `pos` et `r` de la base, mais sa locomotion (update) n'est jamais
 * appelée (maxSpeed = 0). Il bloque les combattantes et les projectiles : ces collisions
 * sont des règles de scène appliquées par GameWorld.
 */
class Obstacle extends Vehicle {
  /**
   * @param {number} x, y   centre
   * @param {number} r      rayon de collision (px)
   * @param {string} kind   'tree' | 'rock' | 'crystal' (seul le dessin change)
   * @param {number} seed   valeur dans [0, 1[ qui varie le dessin sans toucher à la logique
   */
  constructor(x, y, r, kind = 'tree', seed = 0) {
    super(x, y, null);
    this.vel.set(0, 0);
    this.maxSpeed = 0;
    this.maxForce = 0;
    this.r = r;
    this.kind = kind;
    this.seed = seed;
  }

  show() {
    drawObstacle(this);
  }
}
