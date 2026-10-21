'use strict';
/**
 * Remplaçants minimaux des fonctions p5.js dont dépend vehicle.js (createVector, p5.Vector,
 * map, random, randomSeed, cos, sin, push, pop, frameCount). Ils servent UNIQUEMENT hors du
 * jeu : tests Node, entraînement en ligne de commande et page training.html (qui n'affiche
 * rien avec p5). Dans index.html, c'est le vrai p5 qui fournit tout cela.
 *
 * Les méthodes de Vec reproduisent la sémantique de p5.Vector : les méthodes d'instance
 * modifient le vecteur et le renvoient, les méthodes statiques créent un nouveau vecteur.
 */
class Vec {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
  copy() { return new Vec(this.x, this.y); }
  set(x, y) {
    if (x instanceof Vec) { this.x = x.x; this.y = x.y; } else { this.x = x; this.y = y; }
    return this;
  }
  add(a, b) {
    if (a instanceof Vec) { this.x += a.x; this.y += a.y; } else { this.x += a; this.y += b; }
    return this;
  }
  sub(a, b) {
    if (a instanceof Vec) { this.x -= a.x; this.y -= a.y; } else { this.x -= a; this.y -= b; }
    return this;
  }
  mult(n) { this.x *= n; this.y *= n; return this; }
  div(n) { this.x /= n; this.y /= n; return this; }
  mag() { return Math.hypot(this.x, this.y); }
  magSq() { return this.x * this.x + this.y * this.y; }
  normalize() { const l = this.mag(); if (l !== 0) this.div(l); return this; }
  setMag(m) { return this.normalize().mult(m); }
  limit(m) { if (this.magSq() > m * m) this.setMag(m); return this; }
  dot(v) { return this.x * v.x + this.y * v.y; }
  dist(v) { return Math.hypot(this.x - v.x, this.y - v.y); }
  heading() { return Math.atan2(this.y, this.x); }
  static sub(a, b) { return new Vec(a.x - b.x, a.y - b.y); }
  static add(a, b) { return new Vec(a.x + b.x, a.y + b.y); }
  static mult(v, n) { return new Vec(v.x * n, v.y * n); }
  static div(v, n) { return new Vec(v.x / n, v.y / n); }
  static dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  static fromAngle(a, len = 1) { return new Vec(Math.cos(a) * len, Math.sin(a) * len); }
}

// Générateur à graine (mulberry32), copie locale de core/rng.js pour que ce fichier reste
// utilisable seul. Comme randomSeed() de p5, il rend random() reproductible.
let seededRandom = null;
function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const stubs = {
  createVector: (x = 0, y = 0) => new Vec(x, y),
  p5: { Vector: Vec },
  map: (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c),
  randomSeed: (seed) => { seededRandom = mulberry32(seed); },
  random: (a, b) => {
    const r = seededRandom ? seededRandom() : Math.random();
    if (a === undefined) return r;
    if (b === undefined) return r * a;
    return a + r * (b - a);
  },
  cos: Math.cos,
  sin: Math.sin,
  PI: Math.PI,
  push: () => {},
  pop: () => {},
  frameCount: 1, // jamais multiple de 5 : pas de traînée mémorisée hors du jeu
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = stubs; // Node : tests et entraînement
} else {
  Object.assign(globalThis, stubs); // navigateur sans p5 : training.html
}
