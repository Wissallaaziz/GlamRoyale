import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import loader from '../tools/loader.js';

const E = loader.loadEngine();
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(here, '..', rel), 'utf8');

// ui/controls.js est un script classique (globales) : on le charge comme le navigateur.
const C = new Function(read('ui/controls.js') + '\n;return { MOVE_KEYS, DEBUG_KEY, movementFromKeys, isDebugKey };')();

const make = (x = 0, y = 0) => new E.SteeringVehicle(x, y, { rng: E.makeRng(1) });
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ------------------------------------------------------------ géométrie du Wander

test('wanderDebug : centre à distanceCercle devant, cible sur le cercle à wanderTheta + cap', () => {
  const v = make(100, 50);
  v.vel.set(3, 0); // cap 0
  v.wanderTheta = 0;
  const g = v.wanderDebug();
  assert.ok(near(g.center.x, 100 + v.distanceCercle) && near(g.center.y, 50));
  assert.equal(g.radius, v.wanderRadius);
  assert.ok(near(g.target.x, g.center.x + v.wanderRadius) && near(g.target.y, 50));
  v.wanderTheta = Math.PI / 2;
  const g2 = v.wanderDebug();
  assert.ok(near(g2.target.x, g2.center.x, 1e-9) && near(g2.target.y, 50 + v.wanderRadius, 1e-9));
});

test('wanderDebug : la cible est toujours à wanderRadius du centre, quel que soit le cap', () => {
  const v = make(0, 0);
  for (const [vx, vy, th] of [[2, 1, 0.7], [-1, 3, -1.2], [0.2, -4, 1.5]]) {
    v.vel.set(vx, vy);
    v.wanderTheta = th;
    const g = v.wanderDebug();
    assert.ok(near(Math.hypot(g.target.x - g.center.x, g.target.y - g.center.y), v.wanderRadius, 1e-9));
  }
});

test('wanderDebug montre exactement la cible que wander() vise (même direction de force)', () => {
  const v = make(100, 50);
  v.vel.set(2, 1);
  v.wanderTheta = 0.7;
  const g = v.wanderDebug();
  const force = v.wander(); // wander hérité de Vehicle, appelé APRÈS la lecture du debug
  const toTarget = { x: g.target.x - v.pos.x, y: g.target.y - v.pos.y };
  const lt = Math.hypot(toTarget.x, toTarget.y);
  const lf = Math.hypot(force.x, force.y);
  assert.ok(near(force.x / lf, toTarget.x / lt, 1e-9) && near(force.y / lf, toTarget.y / lt, 1e-9));
  assert.ok(near(lf, v.maxForce, 1e-9), 'la force reste limitée à maxForce');
});

test('wanderDebug ne modifie rien (ni position, ni vitesse, ni wanderTheta) et ne dessine rien', () => {
  const v = make(10, 20);
  v.vel.set(1, 2);
  v.wanderTheta = 0.3;
  v.wanderDebug();
  v.wanderDebug();
  assert.deepEqual([v.pos.x, v.pos.y, v.vel.x, v.vel.y, v.wanderTheta], [10, 20, 1, 2, 0.3]);
});

test('wanderDebug : vitesse nulle (début de partie) donne des valeurs finies', () => {
  const v = make(5, 5);
  v.vel.set(0, 0);
  const g = v.wanderDebug();
  for (const n of [g.center.x, g.center.y, g.target.x, g.target.y, g.radius]) assert.ok(Number.isFinite(n));
});

test('les bots héritent de wanderDebug ; Vehicle.debug (base protégée) n\'est jamais activé par le moteur', () => {
  const b = new E.Bot(0, 0, { rng: E.makeRng(1) });
  assert.equal(typeof b.wanderDebug, 'function');
  const w = new E.GameWorld({ withPlayer: false, bots: 4, seed: 3, maxFrames: 200 });
  while (!w.over) w.step();
  assert.equal(E.Vehicle.debug, false);
});

// --------------------------------------------------------------- touches clavier

const keys = (...codes) => (c) => codes.includes(c);

test('la touche D ne déplace plus la joueuse (elle est réservée au debug)', () => {
  assert.deepEqual(C.movementFromKeys(keys(68)), { dx: 0, dy: 0 });
  assert.ok(!Object.values(C.MOVE_KEYS).flat().includes(68));
  assert.equal(C.DEBUG_KEY, 'd');
});

test('déplacements : flèches, Z Q S E, W A S ; les touches opposées s\'annulent', () => {
  assert.deepEqual(C.movementFromKeys(keys(39)), { dx: 1, dy: 0 });   // flèche droite
  assert.deepEqual(C.movementFromKeys(keys(69)), { dx: 1, dy: 0 });   // E
  assert.deepEqual(C.movementFromKeys(keys(37)), { dx: -1, dy: 0 });  // flèche gauche
  assert.deepEqual(C.movementFromKeys(keys(81)), { dx: -1, dy: 0 });  // Q
  assert.deepEqual(C.movementFromKeys(keys(65)), { dx: -1, dy: 0 });  // A
  assert.deepEqual(C.movementFromKeys(keys(90)), { dx: 0, dy: -1 });  // Z
  assert.deepEqual(C.movementFromKeys(keys(87)), { dx: 0, dy: -1 });  // W
  assert.deepEqual(C.movementFromKeys(keys(38)), { dx: 0, dy: -1 });  // flèche haut
  assert.deepEqual(C.movementFromKeys(keys(83)), { dx: 0, dy: 1 });   // S
  assert.deepEqual(C.movementFromKeys(keys(40)), { dx: 0, dy: 1 });   // flèche bas
  assert.deepEqual(C.movementFromKeys(keys(37, 39)), { dx: 0, dy: 0 });
  assert.deepEqual(C.movementFromKeys(keys(90, 83)), { dx: 0, dy: 0 });
  assert.deepEqual(C.movementFromKeys(keys(39, 90)), { dx: 1, dy: -1 }, 'diagonale');
  assert.deepEqual(C.movementFromKeys(keys()), { dx: 0, dy: 0 });
});

test('isDebugKey : d et D seulement', () => {
  assert.equal(C.isDebugKey('d'), true);
  assert.equal(C.isDebugKey('D'), true);
  for (const k of ['e', 'w', 'Enter', '', undefined, null, 68]) assert.equal(C.isDebugKey(k), false, String(k));
});

test('branchement : index.html charge controls.js avant sketch.js, sketch.js bascule S.debug avec D', () => {
  const html = read('index.html');
  assert.ok(html.indexOf('ui/controls.js') !== -1);
  assert.ok(html.indexOf('<script src="ui/controls.js">') !== -1);
  assert.ok(html.indexOf('<script src="ui/controls.js">') < html.indexOf('<script src="sketch.js">'),
    'controls.js doit être chargé avant sketch.js');
  const sketch = read('sketch.js');
  assert.match(sketch, /isDebugKey\(key\)/);
  assert.match(sketch, /S\.debug = !S\.debug/);
  assert.match(sketch, /if \(S\.debug\)[\s\S]{0,200}drawWanderDebug\(/);
  assert.doesNotMatch(sketch, /keyIsDown\(68\)/);
});
