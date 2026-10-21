/**
 * PlayerFighter : l'avatar contrôlé par la joueuse.
 *
 * Elle n'est PAS déplacée directement : les touches produisent une cible relative
 * (position + direction x distance) vers laquelle on fait un Seek ; la force obtenue
 * passe ensuite par la locomotion normale (applyForce / update) comme pour un bot.
 * Sans touche, la cible est la position actuelle : le Seek devient un freinage.
 */
class PlayerFighter extends Fighter {
  constructor(x, y, opts = {}) {
    super(x, y, Object.assign({ maxForce: 0.3 }, opts));
    this.isPlayer = true;
  }

  /** @param {{dx:number, dy:number}} input direction souhaitée (-1, 0 ou 1 sur chaque axe) */
  computeSteering(input = {}) {
    const dir = createVector(input.dx || 0, input.dy || 0);
    if (dir.magSq() === 0) {
      // aucune touche : on freine (la vitesse désirée est nulle)
      return this.steerTo(createVector(0, 0));
    }
    dir.setMag(100);
    return this.seek(p5.Vector.add(this.pos, dir));
  }

  /** La visée suit la souris (coordonnées monde). */
  updateAim(input = {}) {
    if (input.aimX === undefined || input.aimY === undefined) return;
    this.aimAngle = Math.atan2(input.aimY - this.pos.y, input.aimX - this.pos.x);
  }
}
