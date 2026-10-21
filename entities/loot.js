/**
 * Loot : un objet à ramasser (bouclier cœur, potion glow, munitions, sac à main bonus).
 * Comme les obstacles, c'est un Vehicle IMMOBILE (AGENTS.md : toute entité du monde est un
 * Vehicle, même immobile) : sa locomotion n'est jamais appelée. Le ramassage est une règle
 * de scène (GameWorld.pickupLoot) ; les effets sont dans world/lootRules.js.
 */
const LOOT_TYPES = {
  shield: { weight: 0.28, label: 'Bouclier cœur', color: '#8fd3ff' },
  potion: { weight: 0.22, label: 'Potion glow', color: '#ff8fc7' },
  ammo: { weight: 0.30, label: 'Munitions', color: '#ffd166' },
  bag: { weight: 0.20, label: 'Sac à main', color: '#c3a6ff' },
};

class Loot extends Vehicle {
  /**
   * @param {number} x, y  position
   * @param {string} type  clé de LOOT_TYPES
   * @param {number} phase décalage de l'animation de lévitation (rendu seulement)
   */
  constructor(x, y, type, phase = 0) {
    super(x, y, null);
    this.vel.set(0, 0);
    this.maxSpeed = 0;
    this.maxForce = 0;
    this.r = 12;
    this.type = type;
    this.taken = false;
    this.phase = phase;
  }

  show(t = 0) {
    drawLoot(this, t);
  }
}
