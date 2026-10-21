/**
 * Règles du butin (l'entité est Loot, dans entities/loot.js) : tirage du type, répartition
 * sur l'île, utilité pour une combattante, effet du ramassage.
 */

/** Tire un type de butin selon les poids de LOOT_TYPES. */
function pickLootType(rng) {
  let r = rng();
  for (const key of Object.keys(LOOT_TYPES)) {
    r -= LOOT_TYPES[key].weight;
    if (r <= 0) return key;
  }
  return 'ammo';
}

/** Répartit le butin sur l'île, jamais à l'intérieur d'un obstacle. */
function generateLoot(rng, radius, obstacles, count) {
  const out = [];
  let tries = 0;
  while (out.length < count && tries < count * 50) {
    tries++;
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * radius * 0.92;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    if (pointInObstacle(x, y, obstacles, 20)) continue;
    out.push(new Loot(x, y, pickLootType(rng), rng() * Math.PI * 2));
  }
  return out;
}

/** Ce butin est-il utile à cette combattante ? (les bots ignorent le butin inutile) */
function lootUseful(f, loot) {
  switch (loot.type) {
    case 'potion': return f.hp < f.maxHp - 5;
    case 'shield': return f.shield < f.maxShield - 5;
    case 'ammo': return f.ammo < f.maxAmmo - 10;
    default: return true;
  }
}

/** Applique l'effet du butin. Renvoie une courte description pour le HUD. */
function applyLoot(f, loot, rng) {
  switch (loot.type) {
    case 'shield': f.addShield(30); return '+30 bouclier';
    case 'potion': f.heal(35); return '+35 glow';
    case 'ammo': f.addAmmo(30); return '+30 munitions';
    case 'bag': {
      const keys = Object.keys(WEAPONS);
      const w = keys[Math.floor(rng() * keys.length)];
      f.pickWeapon(w);
      f.addAmmo(25);
      f.addShield(15);
      return WEAPONS[w].name;
    }
    default: return '';
  }
}
