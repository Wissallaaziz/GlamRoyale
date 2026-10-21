/**
 * Perception : transforme l'état du monde en 16 entrées normalisées pour le cerveau évolutif
 * (plus 3 entrées pour le réflexe explorer/fuir, voir reflexInputs). Les angles sont donnés
 * relativement à la direction de la combattante (sinus/cosinus), ce qui rend le réseau
 * indépendant de l'orientation absolue.
 */
const PERCEPTION = {
  enemyRange: 700,  // distance max à laquelle une ennemie est « vue »
  lootRange: 800,   // distance max de détection du butin
  crowdRange: 320,  // rayon pour compter les ennemies proches
  zoneScale: 500,   // normalisation de la marge par rapport à la zone
};

/**
 * Entrées du réflexe explorer/fuir (réseau 3–6–2) pour une menace donnée (ou null).
 *   0 proximité            1 - distance / enemyRange (0 sans menace ou hors de portée)
 *   1 vitesse de rapprochement   composante de la vitesse relative qui réduit la distance,
 *                          divisée par (maxSpeed de la menace + maxSpeed de la combattante) :
 *                          +1 = elles foncent l'une vers l'autre, 0 = distance constante,
 *                          -1 = elles s'éloignent à pleine vitesse
 *   2 vitesse de la combattante   |vitesse| / maxSpeed, entre 0 et 1
 * Les vecteurs de la menace et de la combattante ne sont pas modifiés.
 */
function reflexInputs(f, threat) {
  const speed = clampValue(f.vel.mag() / Math.max(f.maxSpeed, 1e-9), 0, 1);
  if (!threat) return [0, 0, speed];
  const dx = f.pos.x - threat.pos.x;
  const dy = f.pos.y - threat.pos.y;
  const dist = Math.hypot(dx, dy);
  const proximity = clampValue(1 - dist / PERCEPTION.enemyRange, 0, 1);
  if (dist < 1e-9) return [1, 0, speed]; // superposées : direction indéfinie, pas de rapprochement
  // axe menace -> combattante ; la menace qui fonce vers moi et moi qui fonce vers elle comptent
  const ux = dx / dist;
  const uy = dy / dist;
  const relative = (threat.vel.x - f.vel.x) * ux + (threat.vel.y - f.vel.y) * uy;
  const closing = clampValue(relative / Math.max(threat.maxSpeed + f.maxSpeed, 1e-9), -1, 1);
  return [proximity, closing, speed];
}

/**
 * @param {Fighter} f     la combattante qui perçoit
 * @param {GameWorld} world
 * @returns {{inputs:number[], enemy, enemyDist, loot, lootDist, crowd, threat, trail, reflexInputs}}
 *   trail = capteurs de phéromones (SteeringVehicle.trailSensors), reflexInputs = entrées du réflexe
 */
function perceive(f, world) {
  const P = PERCEPTION;
  let enemy = null;
  let enemyDist = Infinity;
  let crowd = 0;
  for (const o of world.fighters) {
    if (o === f || !o.alive) continue;
    const d = Math.hypot(o.pos.x - f.pos.x, o.pos.y - f.pos.y);
    if (d < P.crowdRange) crowd++;
    if (d < enemyDist) { enemyDist = d; enemy = o; }
  }
  if (enemyDist > P.enemyRange) { enemy = null; enemyDist = Infinity; }

  let loot = null;
  let lootDist = Infinity;
  for (const l of world.loot) {
    if (l.taken || !lootUseful(f, l)) continue;
    const d = Math.hypot(l.pos.x - f.pos.x, l.pos.y - f.pos.y);
    if (d < lootDist) { lootDist = d; loot = l; }
  }
  if (lootDist > P.lootRange) { loot = null; lootDist = Infinity; }

  const rel = (x, y) => wrapAngle(Math.atan2(y - f.pos.y, x - f.pos.x) - f.angle);
  const z = world.zone;
  const zoneDist = Math.hypot(f.pos.x - z.tx, f.pos.y - z.ty);
  const zoneRel = rel(z.tx, z.ty);
  const threat = f.obstacleThreat(world.obstacles);
  const trail = f.trailSensors(world.pheromones);

  let eS = 0, eC = 0, lS = 0, lC = 0;
  if (enemy) { const a = rel(enemy.pos.x, enemy.pos.y); eS = Math.sin(a); eC = Math.cos(a); }
  if (loot) { const a = rel(loot.pos.x, loot.pos.y); lS = Math.sin(a); lC = Math.cos(a); }

  const inputs = [
    enemy ? 1 - enemyDist / P.enemyRange : 0,
    eS, eC,
    loot ? 1 - lootDist / P.lootRange : 0,
    lS, lC,
    clampValue((z.tr - zoneDist) / P.zoneScale, -1, 1),
    Math.sin(zoneRel), Math.cos(zoneRel),
    f.hp / f.maxHp,
    f.ammo / f.maxAmmo,
    threat,
    Math.min(crowd / 4, 1),
    f.shield / f.maxShield,
    enemy ? enemy.hp / enemy.maxHp : 0,
    trail.strength,
  ];
  return { inputs, enemy, enemyDist, loot, lootDist, crowd, threat, trail, reflexInputs: reflexInputs(f, enemy) };
}
