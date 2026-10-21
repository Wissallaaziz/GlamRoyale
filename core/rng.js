/**
 * Utilitaires communs : générateur pseudo-aléatoire à graine, angles, bornes.
 * Un RNG à graine rend les parties reproductibles (tests, entraînement).
 */

/** Générateur mulberry32 : renvoie une fonction qui donne un nombre dans [0, 1). */
function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nombre tiré d'une loi normale centrée réduite (Box-Muller). */
function gaussian(rng) {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/** Ramène un angle dans [-PI, PI]. */
function wrapAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function clampValue(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Mélange un tableau en place (Fisher-Yates) avec le RNG donné. */
function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}
