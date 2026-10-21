import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../tools/loader.js';
const E = loader.loadEngine();

/** Monde minimal : une bot au centre, tourné vers +x, sans butin ni obstacle. */
function setup() {
  const world = new E.GameWorld({ withPlayer: false, bots: 2, seed: 4, obstacleCount: 0, lootCount: 0 });
  const [me, other] = world.fighters;
  me.pos.set(0, 0);
  me.angle = 0;
  me.vel.set(0, 0);
  other.pos.set(5000, 5000); // très loin
  return { world, me, other };
}

test('16 entrées (dont la piste de phéromones), toutes finies et dans [-1, 1]', () => {
  const { world, me } = setup();
  const p = E.perceive(me, world);
  assert.equal(p.inputs.length, E.BRAIN_INPUTS);
  for (const v of p.inputs) assert.ok(Number.isFinite(v) && v >= -1 && v <= 1, String(v));
});

test('aucune ennemie à portée : entrées ennemies à 0 et enemy = null', () => {
  const { world, me } = setup();
  const p = E.perceive(me, world);
  assert.equal(p.enemy, null);
  assert.deepEqual(p.inputs.slice(0, 3), [0, 0, 0]);
});

test('ennemie droit devant : angle relatif nul (sin 0, cos 1) et proximité entre 0 et 1', () => {
  const { world, me, other } = setup();
  other.pos.set(350, 0);
  const p = E.perceive(me, world);
  assert.equal(p.enemy, other);
  assert.ok(Math.abs(p.inputs[1]) < 1e-9);
  assert.ok(Math.abs(p.inputs[2] - 1) < 1e-9);
  assert.ok(Math.abs(p.inputs[0] - 0.5) < 1e-9, 'à 350 px sur 700 : proximité 0.5');
});

test('ennemie derrière : cos négatif ; sur le côté : sin = ±1', () => {
  const { world, me, other } = setup();
  other.pos.set(-200, 0);
  assert.ok(E.perceive(me, world).inputs[2] < -0.99);
  other.pos.set(0, 200);
  assert.ok(Math.abs(E.perceive(me, world).inputs[1] - 1) < 1e-9, 'y positif = à droite quand on regarde vers +x (repère écran)');
});

test('les éliminées ne sont plus perçues', () => {
  const { world, me, other } = setup();
  other.pos.set(100, 0);
  other.alive = false;
  assert.equal(E.perceive(me, world).enemy, null);
});

test('butin : seul le butin utile est perçu', () => {
  const { world, me } = setup();
  world.loot.push(new E.Loot(100, 0, 'potion'));
  me.hp = me.maxHp; // potion inutile à pleine santé
  assert.equal(E.perceive(me, world).loot, null);
  me.hp = 40;
  const p = E.perceive(me, world);
  assert.ok(p.loot);
  assert.ok(p.inputs[3] > 0.8);
});

test('marge de zone : positive dans la zone cible, négative en dehors', () => {
  const { world, me } = setup();
  me.pos.set(world.zone.tx, world.zone.ty);
  assert.ok(E.perceive(me, world).inputs[6] > 0);
  me.pos.set(world.zone.tx + world.zone.tr + 300, world.zone.ty);
  assert.ok(E.perceive(me, world).inputs[6] < 0);
});

test('santé, munitions et bouclier normalisés', () => {
  const { world, me } = setup();
  me.hp = 50; me.ammo = 60; me.shield = 30;
  const p = E.perceive(me, world).inputs;
  assert.equal(p[9], 0.5);
  assert.equal(p[10], 0.5);
  assert.equal(p[13], 0.5);
});

test('menace d\'obstacle : > 0 quand un obstacle bloque la route', () => {
  const { world, me } = setup();
  me.vel.set(3, 0);
  world.obstacles.push(new E.Obstacle(70, 0, 30));
  assert.ok(E.perceive(me, world).inputs[11] > 0);
});
