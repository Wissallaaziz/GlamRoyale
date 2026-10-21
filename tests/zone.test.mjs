import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../tools/loader.js';
const E = loader.loadEngine();

const newZone = (seed = 1) => new E.Zone(1500, E.makeRng(seed));

test('au départ la zone couvre toute l\'île et annonce déjà la prochaine zone', () => {
  const z = newZone();
  assert.equal(z.radius, 1500);
  assert.equal(z.state, 'waiting');
  assert.ok(Math.abs(z.tr - 0.62 * 1500) < 1e-9);
  assert.ok(z.contains(0, 0));
  assert.ok(!z.contains(1600, 0));
});

test('la zone ne bouge pas pendant l\'attente puis rétrécit sans jamais grandir', () => {
  const z = newZone();
  for (let i = 0; i < 899; i++) z.update();
  assert.equal(z.radius, 1500);
  let prev = z.radius;
  for (let i = 0; i < 3000; i++) {
    z.update();
    assert.ok(z.radius <= prev + 1e-9, 'le rayon ne doit pas augmenter');
    prev = z.radius;
  }
});

test('le cercle cible est toujours entièrement inclus dans le cercle courant', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const z = newZone(seed);
    for (let i = 0; i < 6000; i++) {
      z.update();
      const d = Math.hypot(z.tx - z.cx, z.ty - z.cy);
      assert.ok(d + z.tr <= z.radius + 1e-6 || z.state === 'shrinking', 'seed ' + seed + ' frame ' + i);
    }
  }
});

test('la zone atteint son rayon final et se termine', () => {
  const z = newZone();
  for (let i = 0; i < 10000; i++) z.update();
  assert.ok(z.finished);
  assert.ok(Math.abs(z.radius - 0.02 * 1500) < 1e-6);
});

test('les dégâts augmentent de phase en phase', () => {
  const z = newZone();
  const seen = [];
  for (let i = 0; i < 10000; i++) {
    z.update();
    if (seen[seen.length - 1] !== z.damage) seen.push(z.damage);
  }
  assert.deepEqual(seen, [0.03, 0.05, 0.08, 0.12, 0.2]);
});

test('safePoint : reste sur place dans le cœur du cercle cible, sinon y ramène', () => {
  const z = newZone();
  const inside = { x: z.tx, y: z.ty };
  assert.deepEqual(z.safePoint(inside), inside);
  const far = { x: z.tx + 1000, y: z.ty };
  const sp = z.safePoint(far, 0.6);
  assert.ok(Math.abs(Math.hypot(sp.x - z.tx, sp.y - z.ty) - 0.6 * z.tr) < 1e-6);
});

test('framesLeft décroît pendant la phase', () => {
  const z = newZone();
  const a = z.framesLeft;
  z.update();
  assert.equal(z.framesLeft, a - 1);
});
