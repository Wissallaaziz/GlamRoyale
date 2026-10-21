/**
 * Contrôles clavier, sans dépendance à p5 pour rester testable avec node:test.
 *
 * La touche D est réservée au MODE DEBUG du Wander, comme dans les exercices du cours
 * (touche d = Vehicle.debug). Elle ne sert donc plus à aller à droite : la droite se prend
 * avec la flèche droite ou E.
 */
const MOVE_KEYS = {
  left: [37, 65, 81],  // flèche gauche, A, Q
  right: [39, 69],     // flèche droite, E  (D est réservée au debug)
  up: [38, 87, 90],    // flèche haut, W, Z
  down: [40, 83],      // flèche bas, S
};
const DEBUG_KEY = 'd';
const TRAIL_KEY = 'f';  // affiche/masque les traînées de phéromones (paillettes)

/**
 * Direction demandée par le clavier.
 * @param {function(number): boolean} isDown  renvoie true si la touche (keyCode) est enfoncée
 * @returns {{dx: number, dy: number}} chaque axe vaut -1, 0 ou 1 (deux touches opposées s'annulent)
 */
function movementFromKeys(isDown) {
  const any = (codes) => codes.some((c) => isDown(c));
  return {
    dx: (any(MOVE_KEYS.right) ? 1 : 0) - (any(MOVE_KEYS.left) ? 1 : 0),
    dy: (any(MOVE_KEYS.down) ? 1 : 0) - (any(MOVE_KEYS.up) ? 1 : 0),
  };
}

/** La touche (valeur de `key` dans p5) bascule-t-elle le mode debug ? D ou d. */
function isDebugKey(k) {
  return typeof k === 'string' && k.toLowerCase() === DEBUG_KEY;
}

/** La touche (valeur de `key` dans p5) bascule-t-elle l'affichage des phéromones ? F ou f. */
function isTrailKey(k) {
  return typeof k === 'string' && k.toLowerCase() === TRAIL_KEY;
}
