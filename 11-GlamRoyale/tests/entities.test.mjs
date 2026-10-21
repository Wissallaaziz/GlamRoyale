import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../tools/loader.js';

const E = loader.loadEngine();

// Règle de AGENTS.md : toute entité graphique du monde est un Vehicle ou une sous-classe,
// même immobile (obstacle, butin).

test('Obstacle et Loot sont des Vehicle immobiles (locomotion jamais utilisée)', () => {
  const o = new E.Obstacle(10, 20, 30, 'rock', 0.5);
  const l = new E.Loot(5, 6, 'potion', 1);
  for (const e of [o, l]) {
    assert.ok(e instanceof E.Vehicle);
    assert.equal(e.maxSpeed, 0);
    assert.equal(e.maxForce, 0);
    assert.equal(e.vel.mag(), 0);
  }
  assert.deepEqual([o.pos.x, o.pos.y, o.r, o.kind], [10, 20, 30, 'rock']);
  assert.deepEqual([l.pos.x, l.pos.y, l.type, l.taken], [5, 6, 'potion', false]);
});

test('une partie ne déplace jamais les obstacles ni le butin non ramassé', () => {
  const w = new E.GameWorld({ withPlayer: false, bots: 6, seed: 12 });
  const obstacles = w.obstacles.map((o) => [o.pos.x, o.pos.y]);
  const loot = w.loot.map((l) => [l.pos.x, l.pos.y]);
  for (let i = 0; i < 500; i++) w.step();
  assert.deepEqual(w.obstacles.map((o) => [o.pos.x, o.pos.y]), obstacles);
  assert.deepEqual(w.loot.map((l) => [l.pos.x, l.pos.y]), loot);
  assert.ok(w.obstacles.every((o) => o instanceof E.Obstacle));
  assert.ok(w.loot.every((l) => l instanceof E.Loot));
});

test('le butin généré n\'est jamais dans un obstacle et ses types sont connus', () => {
  const w = new E.GameWorld({ withPlayer: false, bots: 2, seed: 3 });
  assert.ok(w.loot.length > 60);
  for (const l of w.loot) {
    assert.ok(E.LOOT_TYPES[l.type]);
    assert.equal(E.pointInObstacle(l.pos.x, l.pos.y, w.obstacles, 0), false);
  }
});

const spec = (over = {}) => Object.assign(
  { x: 0, y: 0, vx: 7.5, vy: 0, speed: 7.5, damage: 15, life: 70, r: 7, kind: 'heart', homing: 0.18, ownerId: 0 }, over);

test('les tirs gardent leur vitesse : maxForce 0 (bulle) ou homing (cœur) ; seul le cœur est guidé', () => {
  assert.equal(new E.Bullet(spec({ kind: 'bubble', homing: 0 })).maxForce, 0);
  assert.equal(new E.Bullet(spec()).maxForce, 0.18);
  assert.equal(E.WEAPONS.heart.homing, 0.18);
  assert.equal(E.WEAPONS.bubble.homing, undefined);
});

test('un cœur guidé se courbe vers l\'ennemie ; une bulle continue tout droit', () => {
  const run = (bulletSpec) => {
    const w = new E.GameWorld({ withPlayer: false, bots: 2, seed: 9, obstacleCount: 0, lootCount: 0 });
    const [a, b] = w.fighters;
    a.pos.set(-500, 0); b.pos.set(150, 60); b.vel.set(0, 0);
    // on neutralise les bots pour isoler le projectile
    for (const f of w.fighters) { f.think = () => {}; f.computeSteering = () => new E.Bullet(spec()).acc.copy(); f.combat = () => []; }
    const bullet = new E.Bullet(bulletSpec);
    bullet.pos.set(0, 0);
    w.bullets.push(bullet);
    for (let i = 0; i < 10; i++) w.updateBullets();
    return bullet;
  };
  const heart = run(spec({ ownerId: 0 }));
  assert.ok(heart.alive && heart.pos.y > 1, 'le cœur a dévié vers la cible (y > 0) sans l\'avoir encore touchée : y = ' + heart.pos.y);
  const bubble = run(spec({ kind: 'bubble', homing: 0, speed: 9, vx: 9, r: 5, damage: 8 }));
  assert.ok(Math.abs(bubble.pos.y) < 1e-9, 'la bulle reste sur sa ligne');
  assert.ok(heart.vel.mag() <= heart.maxSpeed + 1e-9, 'la vitesse reste bornée');
});

test('homingTarget : ignore la tireuse, les éliminées, les cibles derrière ou trop loin', () => {
  const w = new E.GameWorld({ withPlayer: false, bots: 4, seed: 9, obstacleCount: 0, lootCount: 0 });
  const [owner, front, behind, far] = w.fighters;
  owner.pos.set(0, 0);
  front.pos.set(100, 0);
  behind.pos.set(-50, 0);
  far.pos.set(900, 0);
  const b = new E.Bullet(spec({ ownerId: owner.id }));
  b.pos.set(0, 0);
  assert.equal(w.homingTarget(b), front);
  front.alive = false;
  assert.equal(w.homingTarget(b), null, 'seule une cible derrière ou hors de portée reste');
});
