import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../tools/loader.js';
const E = loader.loadEngine();

const snapshot = (w) => w.fighters.map((f) => [f.pos.x.toFixed(6), f.pos.y.toFixed(6), f.hp.toFixed(3)].join(','));

test('une partie est reproductible : même graine, mêmes résultats', () => {
  const run = () => {
    const w = new E.GameWorld({ withPlayer: false, bots: 8, seed: 21 });
    for (let i = 0; i < 800; i++) w.step();
    return snapshot(w);
  };
  assert.deepEqual(run(), run());
});

test('12 combattantes par défaut (1 joueuse + 11 bots), la joueuse est un PlayerFighter', () => {
  const w = new E.GameWorld({ seed: 2 });
  assert.equal(w.fighters.length, 12);
  assert.ok(w.player instanceof E.PlayerFighter);
  assert.equal(w.fighters.filter((f) => f instanceof E.Bot).length, 11);
  assert.ok(w.fighters.every((f) => f instanceof E.Vehicle), 'toutes héritent de Vehicle');
});

test('personne ne sort de l\'île ni ne se retrouve dans un obstacle pendant la partie', () => {
  const w = new E.GameWorld({ withPlayer: false, bots: 12, seed: 5 });
  for (let i = 0; i < 1500; i++) {
    w.step();
    for (const f of w.fighters) {
      if (!f.alive) continue;
      assert.ok(Math.hypot(f.pos.x, f.pos.y) <= w.radius + 1e-6, 'hors de l\'île');
      for (const o of w.obstacles) {
        assert.ok(Math.hypot(f.pos.x - o.pos.x, f.pos.y - o.pos.y) >= o.r + f.r - 0.5, 'dans un obstacle');
      }
    }
  }
});

test('la vitesse ne dépasse jamais maxSpeed et la force de steering jamais maxForce', () => {
  const w = new E.GameWorld({ withPlayer: false, bots: 12, seed: 8 });
  for (let i = 0; i < 600; i++) {
    for (const f of w.fighters) {
      if (!f.alive) continue;
      f.think(w);
      assert.ok(f.computeSteering(w).mag() <= f.maxForce + 1e-9);
    }
    w.step();
    for (const f of w.fighters) assert.ok(f.vel.mag() <= f.maxSpeed + 1e-9);
  }
});

test('la partie se termine avec un classement 1..N sans doublon', () => {
  const w = new E.GameWorld({ withPlayer: false, bots: 12, seed: 3 });
  let guard = 0;
  while (!w.over && guard++ < 20000) w.step();
  assert.ok(w.over);
  const places = w.fighters.map((f) => f.placement).sort((a, b) => a - b);
  assert.deepEqual(places, Array.from({ length: 12 }, (_, i) => i + 1));
  if (w.winner) assert.equal(w.winner.placement, 1);
  assert.equal(w.rankings[0].placement, 1);
});

test('temps écoulé : la partie s\'arrête et classe les survivantes par glow', () => {
  const w = new E.GameWorld({ withPlayer: false, bots: 6, seed: 3, maxFrames: 50 });
  for (let i = 0; i < 60; i++) w.step();
  assert.ok(w.over);
  assert.equal(w.frame, 50);
  assert.deepEqual(w.fighters.map((f) => f.placement).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
});

test('la joueuse se déplace par des forces : vitesse bornée, freinage sans touche', () => {
  const w = new E.GameWorld({ bots: 3, seed: 6, obstacleCount: 0 });
  const p = w.player;
  const start = p.pos.copy();
  for (let i = 0; i < 120; i++) {
    w.step({ dx: 1, dy: 0, aimX: p.pos.x + 100, aimY: p.pos.y });
    assert.ok(p.vel.mag() <= p.maxSpeed + 1e-9);
  }
  assert.ok(p.pos.x > start.x + 100, 'avance vers la droite');
  for (let i = 0; i < 120; i++) w.step({});
  assert.ok(p.vel.mag() < 0.05, 'a freiné');
});

test('tirer coûte des munitions, respecte le délai de recharge et crée des projectiles', () => {
  const w = new E.GameWorld({ bots: 1, seed: 6, obstacleCount: 0 });
  const p = w.player;
  const ammo = p.ammo;
  w.step({ shoot: true, aimX: p.pos.x + 50, aimY: p.pos.y });
  assert.equal(p.ammo, ammo - 1);
  assert.equal(w.bullets.length >= 1, true);
  w.step({ shoot: true, aimX: p.pos.x + 50, aimY: p.pos.y });
  assert.equal(p.ammo, ammo - 1, 'recharge : pas de second tir immédiat');
  p.ammo = 0;
  p.cooldown = 0;
  assert.deepEqual(p.tryShoot(), [], 'plus de munitions');
});

test('un projectile blesse sa cible, le bouclier absorbe d\'abord, le tireur est crédité', () => {
  const w = new E.GameWorld({ withPlayer: false, bots: 2, seed: 9, obstacleCount: 0, lootCount: 0 });
  const [a, b] = w.fighters;
  a.pos.set(0, 0); b.pos.set(120, 0);
  a.vel.set(0, 0); b.vel.set(0, 0);
  b.shield = 20;
  const bullet = new E.Bullet({ x: 100, y: 0, vx: 9, vy: 0, speed: 9, damage: 8, life: 30, r: 5, kind: 'bubble', ownerId: a.id });
  w.bullets.push(bullet);
  w.updateBullets();
  assert.equal(b.shield, 12);
  assert.equal(b.hp, 100);
  assert.equal(a.damageDealt, 8);
  assert.ok(w.events.some((e) => e.type === 'hit'));
});

test('les obstacles arrêtent les projectiles', () => {
  const w = new E.GameWorld({ withPlayer: false, bots: 2, seed: 9, obstacleCount: 0, lootCount: 0 });
  const [a, b] = w.fighters;
  a.pos.set(0, 0); b.pos.set(300, 0);
  w.obstacles.push(new E.Obstacle(150, 0, 30));
  w.bullets.push(new E.Bullet({ x: 100, y: 0, vx: 9, vy: 0, speed: 9, damage: 8, life: 60, r: 5, kind: 'bubble', ownerId: a.id }));
  for (let i = 0; i < 40; i++) w.updateBullets();
  assert.equal(b.hp, 100);
  assert.equal(w.bullets.length, 0);
});

test('une élimination attribue le kill et le classement', () => {
  const w = new E.GameWorld({ withPlayer: false, bots: 3, seed: 9, obstacleCount: 0, lootCount: 0 });
  const [a, b, c] = w.fighters;
  a.pos.set(0, 0); b.pos.set(100, 0); c.pos.set(0, 400);
  b.hp = 5;
  w.bullets.push(new E.Bullet({ x: 90, y: 0, vx: 9, vy: 0, speed: 9, damage: 8, life: 30, r: 5, kind: 'bubble', ownerId: a.id }));
  w.updateBullets();
  w.handleDeaths();
  assert.equal(b.alive, false);
  assert.equal(a.kills, 1);
  assert.equal(b.placement, 3);
  assert.equal(w.killFeed[0].killer, a.name);
});

test('le butin est ramassé une seule fois et applique son effet', () => {
  const w = new E.GameWorld({ bots: 1, seed: 6, obstacleCount: 0, lootCount: 0 });
  const p = w.player;
  p.hp = 50;
  const loot = new E.Loot(p.pos.x, p.pos.y, 'potion');
  w.loot.push(loot);
  w.step({});
  assert.equal(loot.taken, true);
  assert.equal(p.hp, 85);
  assert.equal(p.lootCount, 1);
  w.step({});
  assert.equal(p.hp, 85, 'pas de double ramassage');
});

test('sac à main : donne une arme utilisable (équipée), les armes se changent avec equip()', () => {
  const f = new E.Fighter(0, 0, { rng: E.makeRng(1) });
  assert.equal(f.weaponKey, 'bubble');
  f.equip('heart');
  assert.equal(f.weaponKey, 'bubble', 'arme non possédée : pas de changement');
  f.pickWeapon('heart');
  assert.equal(f.weaponKey, 'heart');
  f.equip('bubble');
  assert.equal(f.weaponKey, 'bubble');
});

test('la zone inflige des dégâts hors du cercle, ignore le bouclier, et est comptée', () => {
  const w = new E.GameWorld({ withPlayer: false, bots: 2, seed: 9, obstacleCount: 0, lootCount: 0 });
  const [a] = w.fighters;
  w.zone.radius = 100;
  w.zone.cx = 0; w.zone.cy = 0;
  a.pos.set(800, 0);
  a.shield = 50;
  w.applyZoneDamage();
  assert.ok(a.hp < 100);
  assert.equal(a.shield, 50);
  assert.equal(a.zoneFrames, 1);
});

test('les armes : portées cohérentes (confettis courts, cœurs longs)', () => {
  assert.ok(E.weaponRange(E.WEAPONS.confetti) < E.weaponRange(E.WEAPONS.bubble));
  assert.ok(E.weaponRange(E.WEAPONS.heart) >= E.weaponRange(E.WEAPONS.bubble));
});

test('obstacles : sans chevauchement et avec un couloir praticable', () => {
  const obs = E.generateObstacles(E.makeRng(3), 1500, 70);
  assert.ok(obs.length >= 50);
  for (let i = 0; i < obs.length; i++) {
    for (let j = i + 1; j < obs.length; j++) {
      const d = Math.hypot(obs[i].pos.x - obs[j].pos.x, obs[i].pos.y - obs[j].pos.y);
      assert.ok(d >= obs[i].r + obs[j].r + 70 - 1e-6);
    }
  }
});

test('segmentBlocked : détecte un obstacle sur la ligne de tir', () => {
  const obs = [new E.Obstacle(50, 0, 10)];
  assert.equal(E.segmentBlocked({ x: 0, y: 0 }, { x: 100, y: 0 }, obs), true);
  assert.equal(E.segmentBlocked({ x: 0, y: 30 }, { x: 100, y: 30 }, obs), false);
  assert.equal(E.segmentBlocked({ x: 0, y: 0 }, { x: 30, y: 0 }, obs), false, 'segment trop court');
});
