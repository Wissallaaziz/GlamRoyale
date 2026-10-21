/**
 * Règles liées aux obstacles (l'entité elle-même est Obstacle, dans entities/obstacle.js) :
 * génération sans chevauchement, ligne de tir bloquée, test point/obstacle.
 */

/**
 * Génère des obstacles sans chevauchement, avec un couloir d'au moins 70 px entre deux
 * obstacles pour que les combattantes puissent toujours passer.
 */
function generateObstacles(rng, radius, count) {
  const out = [];
  let tries = 0;
  while (out.length < count && tries < count * 60) {
    tries++;
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * radius * 0.94;
    const pick = rng();
    const kind = pick < 0.5 ? 'tree' : pick < 0.8 ? 'rock' : 'crystal';
    const r = kind === 'tree' ? 26 + rng() * 18 : kind === 'rock' ? 30 + rng() * 26 : 24 + rng() * 20;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    if (d + r > radius * 0.97) continue;
    let ok = true;
    for (const o of out) {
      if (Math.hypot(o.pos.x - x, o.pos.y - y) < o.r + r + 70) { ok = false; break; }
    }
    if (ok) out.push(new Obstacle(x, y, r, kind, rng()));
  }
  return out;
}

/** true si le segment [a, b] (points {x, y}) traverse un obstacle : ligne de tir bloquée. */
function segmentBlocked(a, b, obstacles) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  for (const o of obstacles) {
    let t = len2 === 0 ? 0 : ((o.pos.x - a.x) * abx + (o.pos.y - a.y) * aby) / len2;
    t = clampValue(t, 0, 1);
    const px = a.x + abx * t;
    const py = a.y + aby * t;
    if (Math.hypot(o.pos.x - px, o.pos.y - py) < o.r) return true;
  }
  return false;
}

/** true si le point (x, y) est dans un obstacle (avec marge). */
function pointInObstacle(x, y, obstacles, margin = 0) {
  for (const o of obstacles) {
    if (Math.hypot(o.pos.x - x, o.pos.y - y) < o.r + margin) return true;
  }
  return false;
}
