import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import loader from '../tools/loader.js';
import shim from '../tools/p5shim.js';

const E = loader.loadEngine();
const { createVector } = shim;
const here = path.dirname(fileURLToPath(import.meta.url));

const make = (x = 0, y = 0, opts = {}) => new E.SteeringVehicle(x, y, Object.assign({ rng: E.makeRng(1) }, opts));

// ----------------------------------------------------------- base protégée

test('vehicle.js (base protégée par AGENTS.md) est identique à la copie de l\'exercice 4-Wander', () => {
  const src = fs.readFileSync(path.join(here, '..', 'vehicle.js'));
  const hash = crypto.createHash('sha256').update(src).digest('hex');
  assert.equal(hash, '0c623b1b28fff57514ad7c332c73ae37a093f07e7e54ac0c99759f410c410fef');
});

test('SteeringVehicle étend Vehicle ; Fighter, Bot, PlayerFighter et Bullet en descendent', () => {
  assert.ok(new E.SteeringVehicle(0, 0) instanceof E.Vehicle);
  const f = new E.Bot(0, 0, { rng: E.makeRng(1) });
  assert.ok(f instanceof E.Fighter && f instanceof E.SteeringVehicle && f instanceof E.Vehicle);
  assert.ok(new E.PlayerFighter(0, 0, { rng: E.makeRng(1) }) instanceof E.Vehicle);
  assert.ok(new E.Bullet({ x: 0, y: 0, vx: 1, vy: 0, speed: 9, damage: 1, life: 5, r: 4, kind: 'bubble', ownerId: 0 }) instanceof E.Vehicle);
});

// ------------------------------------------------- comportements hérités de Vehicle

test('seek (hérité) : force vers la cible, bornée par maxForce', () => {
  const v = make(0, 0, { maxForce: 0.2 });
  const f = v.seek(createVector(100, 0));
  assert.ok(f.x > 0 && Math.abs(f.y) < 1e-9);
  assert.ok(f.mag() <= 0.2 + 1e-9);
});

test('flee : vitesse désirée à l\'opposé de la cible, force = désirée - vitesse (pas l\'opposé de seek)', () => {
  const v = make(0, 0, { maxSpeed: 4, maxForce: 10 });
  v.vel.set(4, 0);                       // fonce vers la menace placée en (100, 0)
  const f = v.flee(createVector(100, 0));
  // désirée = (-4, 0) ; vitesse = (4, 0) -> force = (-8, 0)
  assert.ok(Math.abs(f.x + 8) < 1e-9 && Math.abs(f.y) < 1e-9);
  const s = v.seek(createVector(100, 0)); // seek : désirée (4, 0) - vitesse (4, 0) = (0, 0)
  assert.equal(s.mag(), 0);
  assert.ok(f.mag() > s.mag(), 'inverser seek donnerait une force nulle : flee doit freiner et fuir');
});

test('flee : force bornée par maxForce, cible confondue avec le véhicule = force nulle, entrée non modifiée', () => {
  const v = make(5, 5, { maxForce: 0.2 });
  const threat = createVector(50, 80);
  const before = threat.copy();
  assert.ok(v.flee(threat).mag() <= 0.2 + 1e-9);
  assert.deepEqual([threat.x, threat.y], [before.x, before.y]);
  assert.equal(v.flee(createVector(5, 5)).mag(), 0);
});

test('seek : le véhicule converge vers la cible sans dépasser maxSpeed', () => {
  const v = make(0, 0, { maxSpeed: 3, maxForce: 0.3 });
  const t = createVector(200, 100);
  for (let i = 0; i < 300; i++) {
    v.applyForce(v.seek(t));
    v.update();
    assert.ok(v.vel.mag() <= 3 + 1e-9);
  }
  assert.ok(Math.hypot(v.pos.x - 200, v.pos.y - 100) < 60);
});

test('arrive (hérité) : s\'arrête sur la cible, sans dépassement notable', () => {
  const v = make(0, 0, { maxSpeed: 4, maxForce: 0.3 });
  const t = createVector(300, 0);
  let maxOvershoot = 0;
  for (let i = 0; i < 700; i++) {
    v.applyForce(v.arrive(t));
    v.update();
    maxOvershoot = Math.max(maxOvershoot, v.pos.x - 300);
  }
  assert.ok(Math.abs(v.pos.x - 300) < 3, 'position finale ' + v.pos.x);
  assert.ok(v.vel.mag() < 0.2);
  assert.ok(maxOvershoot < 6);
});

test('wander (hérité) : force de norme maxForce, reproductible avec randomSeed', () => {
  const run = () => {
    shim.randomSeed(42);
    const v = make(0, 0, { maxForce: 0.1 });
    const out = [];
    for (let i = 0; i < 200; i++) {
      const f = v.wander();
      assert.ok(Math.abs(f.mag() - 0.1) < 1e-9);
      v.applyForce(f);
      v.update();
      out.push(v.pos.x.toFixed(9) + ',' + v.pos.y.toFixed(9));
    }
    return out;
  };
  assert.deepEqual(run(), run());
});

test('update (surcharge) : appelle la locomotion de la base une fois et aligne l\'orientation sur la vitesse', () => {
  const v = make();
  v.applyForce(createVector(0, 1));
  v.update();
  v.applyForce(createVector(0, 1));
  v.update();
  assert.ok(Math.abs(v.angle - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(v.pos.y - 3) < 1e-9, 'vel 1 puis 2 : position 1 + 2 = 3 (une seule intégration par appel)');
  assert.equal(v.acc.mag(), 0, 'accélération remise à zéro');
});

// -------------------------------------------------- comportements ajoutés ici

test('pursue : vise devant une cible qui se déplace (plus que seek sur sa position actuelle)', () => {
  const hunter = make(0, 0, { maxSpeed: 4 });
  const prey = make(200, 0, { maxSpeed: 3 });
  prey.vel.set(0, 3);
  const f = hunter.pursue(prey);
  assert.ok(f.y > hunter.seek(prey.pos).y + 1e-6);
});

test('evade : fuit la position FUTURE de la menace (flee sur la position prédite)', () => {
  const me = make(0, 0);
  const threat = make(100, 0);
  threat.vel.set(0, 3);                  // la menace monte vers y > 0
  const e = me.evade(threat);
  assert.ok(e.x < 0, 'on s\'éloigne en x');
  assert.ok(e.y < 0, 'et du côté opposé à la trajectoire prévue de la menace');
  const expected = me.flee(me.predictPosition(threat));
  assert.ok(Math.abs(e.x - expected.x) < 1e-12 && Math.abs(e.y - expected.y) < 1e-12);
});

test('pursue / evade : cible immobile ou véhicule à vitesse nulle, aucune valeur non finie', () => {
  const still = make(0, 0, { maxSpeed: 0 });   // maxSpeed 0 : pas de division par zéro
  const other = make(100, 0);
  for (const f of [still.pursue(other), still.evade(other), make(0, 0).pursue(make(100, 0)), make(0, 0).evade(make(100, 0))]) {
    assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y));
  }
});

test('pursue / evade ne modifient ni la position ni la vitesse de l\'autre véhicule', () => {
  const me = make(0, 0);
  const other = make(100, 50);
  other.vel.set(1, 2);
  me.pursue(other);
  me.evade(other);
  me.separate([me, other], 500);
  assert.deepEqual([other.pos.x, other.pos.y, other.vel.x, other.vel.y], [100, 50, 1, 2]);
});

test('separate : éloigne des voisins proches, ignore les lointains et les éliminées', () => {
  const v = make(0, 0);
  const near = make(20, 0);
  const far = make(500, 0);
  assert.ok(v.separate([v, near]).x < 0);
  assert.equal(v.separate([v, far]).mag(), 0);
  near.alive = false;
  assert.equal(v.separate([v, near]).mag(), 0);
});

test('obstacle avoidance : contourne un obstacle devant, rien si la voie est libre', () => {
  const v = make(0, 0, { maxForce: 0.2 });
  v.vel.set(3, 0);
  const f = v.avoidObstacles([new E.Obstacle(90, 5, 25)]);
  assert.ok(f.mag() > 0 && f.mag() <= 0.2 + 1e-9);
  assert.ok(f.y < 0, 'obstacle du côté y > 0 -> on dévie du côté opposé');
  assert.equal(v.avoidObstacles([new E.Obstacle(90, 300, 25)]).mag(), 0, 'obstacle de côté');
  assert.equal(v.avoidObstacles([new E.Obstacle(-90, 0, 25)]).mag(), 0, 'obstacle derrière');
});

test('obstacleThreat : augmente quand on se rapproche', () => {
  const v = make(0, 0);
  v.vel.set(3, 0);
  const far = v.obstacleThreat([new E.Obstacle(110, 0, 25)]);
  const near = v.obstacleThreat([new E.Obstacle(60, 0, 25)]);
  assert.ok(near > far && far >= 0 && near <= 1);
});

test('contain : aucune force au centre, force vers le centre près du bord', () => {
  const v = make(0, 0);
  assert.equal(v.contain(0, 0, 1000, 100).mag(), 0);
  v.pos.set(980, 0);
  const f = v.contain(0, 0, 1000, 100);
  assert.ok(f.x < 0);
  v.pos.set(905, 0);
  assert.ok(v.contain(0, 0, 1000, 100).mag() < f.mag(), 'plus on pénètre, plus la force est grande');
});

test('accumulate : le total ne dépasse jamais maxForce et le prioritaire garde sa part', () => {
  const v = make(0, 0, { maxForce: 0.1 });
  const total = createVector(0, 0);
  assert.ok(v.accumulate(total, createVector(0.08, 0)));
  assert.ok(v.accumulate(total, createVector(0, 0.08)));
  assert.ok(total.mag() <= 0.1 + 1e-9);
  assert.ok(total.x > 0.07, 'le premier comportement garde sa part');
  assert.ok(total.y > 0, 'le suivant reçoit le budget restant');
});

test('accumulate : un comportement qui sature le budget bloque les suivants', () => {
  const v = make(0, 0, { maxForce: 0.1 });
  const total = createVector(0, 0);
  assert.ok(v.accumulate(total, createVector(5, 0)));
  assert.ok(Math.abs(total.mag() - 0.1) < 1e-9);
  assert.equal(v.accumulate(total, createVector(0, 1)), false);
  assert.equal(total.y, 0);
});

test('steerTo : vitesse désirée - vitesse actuelle, tronquée', () => {
  const v = make(0, 0, { maxForce: 0.5 });
  v.vel.set(1, 0);
  const f = v.steerTo(createVector(1.2, 0));
  assert.ok(Math.abs(f.x - 0.2) < 1e-12);
  assert.ok(v.steerTo(createVector(100, 0)).mag() <= 0.5 + 1e-12);
});

test('confineToCircle et resolveCircle : repoussent et annulent la vitesse entrante', () => {
  const v = make(0, 0, { r: 10 });
  v.pos.set(1100, 0);
  v.vel.set(3, 0);
  v.confineToCircle(0, 0, 1000);
  assert.ok(Math.abs(v.pos.x - 990) < 1e-9);
  assert.ok(v.vel.x <= 1e-9);
  const w = make(0, 0, { r: 10 });
  w.pos.set(40, 0);
  w.vel.set(-2, 0);
  assert.ok(w.resolveCircle(0, 0, 50));
  assert.ok(Math.abs(w.pos.x - 60) < 1e-9);
  assert.ok(w.vel.x >= -1e-9);
});
