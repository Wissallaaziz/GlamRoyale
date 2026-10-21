/**
 * Armes de Glam Royale. Rien de violent : des bulles, des cœurs et des confettis.
 * Chaque tir coûte `ammoCost` munitions. Toutes les distances sont en pixels, les durées
 * en frames (60 par seconde).
 */
const WEAPONS = {
  bubble: {
    key: 'bubble', name: 'Pistolet à bulles', kind: 'bubble',
    damage: 8, speed: 9, life: 55, cooldown: 14, pellets: 1, spread: 0.03, r: 5, ammoCost: 1,
  },
  heart: {
    key: 'heart', name: 'Lance-cœurs', kind: 'heart',
    // homing : force de guidage maximale (Seek vers l'ennemie la plus proche devant le cœur)
    damage: 15, speed: 7.5, life: 70, cooldown: 32, pellets: 1, spread: 0.015, r: 7, ammoCost: 2, homing: 0.18,
  },
  confetti: {
    key: 'confetti', name: 'Éventail à confettis', kind: 'confetti',
    damage: 5, speed: 8, life: 26, cooldown: 42, pellets: 5, spread: 0.22, r: 4, ammoCost: 3,
  },
};

/** Portée d'une arme : vitesse du projectile x durée de vie. */
function weaponRange(weapon) {
  return weapon.speed * weapon.life;
}
