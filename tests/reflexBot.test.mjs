import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../tools/loader.js';

const E = loader.loadEngine();

/** Réflexe de substitution : décision imposée, pour isoler l'effet du réflexe sur les forces. */
const stubReflex = (flee) => ({
  decide: (p, c, s) => ({ mode: flee ? 'flee' : 'explore', flee, pFlee: flee ? 1 : 0, inputs: [p, c, s], outputs: flee ? [0, 1] : [1, 0] }),
});
const weights = (o) => ({ loot: 0, pursue: 0, flee: 0, wander: 0, zone: 0, trail: 0, shoot: false, shootRaw: 0, ...o });

/** Monde minimal : `me` en (0, 0) à l'arrêt, `other` en (400, 0), ni butin ni obstacle. */
function setup(flee, brain = {}, otherPos = [400, 0]) {
  const world = new E.GameWorld({
    withPlayer: false, bots: 2, seed: 4, obstacleCount: 0, lootCount: 0, reflexNet: stubReflex(flee),
  });
  const [me, other] = world.fighters;
  me.pos.set(0, 0); me.vel.set(0, 0); me.angle = 0;
  other.pos.set(otherPos[0], otherPos[1]); other.vel.set(0, 0);
  me.brain = { decide: () => weights(brain) };
  return { world, me, other };
}

const force = ({ world, me }) => { me.think(world); return me.computeSteering(world); };

// ------------------------------------------------------------------ reflexInputs

test('reflexInputs : sans menace -> [0, 0, vitesse normalisée]', () => {
  const f = new E.Fighter(0, 0, { rng: E.makeRng(1), maxSpeed: 4 });
  f.vel.set(2, 0);
  assert.deepEqual(E.reflexInputs(f, null), [0, 0, 0.5]);
  f.vel.set(10, 0); // au-delà de maxSpeed : borné
  assert.equal(E.reflexInputs(f, null)[2], 1);
});

test('reflexInputs : proximité = 1 - distance / portée, bornée à [0, 1]', () => {
  const f = new E.Fighter(0, 0, { rng: E.makeRng(1) });
  const t = new E.Fighter(350, 0, { rng: E.makeRng(2) });
  assert.ok(Math.abs(E.reflexInputs(f, t)[0] - 0.5) < 1e-12);
  t.pos.set(5000, 0);
  assert.equal(E.reflexInputs(f, t)[0], 0);
  t.pos.set(1, 0);
  assert.ok(E.reflexInputs(f, t)[0] > 0.99);
});

test('reflexInputs : rapprochement +1 face à face à pleine vitesse, 0 à vitesses égales, négatif en s\'éloignant', () => {
  const f = new E.Fighter(0, 0, { rng: E.makeRng(1), maxSpeed: 3 });
  const t = new E.Fighter(200, 0, { rng: E.makeRng(2), maxSpeed: 3 });
  f.vel.set(3, 0); t.vel.set(-3, 0);
  assert.ok(Math.abs(E.reflexInputs(f, t)[1] - 1) < 1e-12, 'face à face');
  f.vel.set(3, 0); t.vel.set(3, 0);
  assert.ok(Math.abs(E.reflexInputs(f, t)[1]) < 1e-12, 'même vitesse, même sens');
  f.vel.set(0, 0); t.vel.set(3, 0);
  assert.ok(Math.abs(E.reflexInputs(f, t)[1] + 0.5) < 1e-12, 'la menace s\'éloigne');
  f.vel.set(-3, 0); t.vel.set(3, 0);
  assert.ok(Math.abs(E.reflexInputs(f, t)[1] + 1) < 1e-12, 'elles s\'éloignent à pleine vitesse');
});

test('reflexInputs : une menace qui passe à côté (mouvement perpendiculaire) ne compte pas comme un rapprochement', () => {
  const f = new E.Fighter(0, 0, { rng: E.makeRng(1) });
  const t = new E.Fighter(200, 0, { rng: E.makeRng(2) });
  t.vel.set(0, 3.4);
  assert.ok(Math.abs(E.reflexInputs(f, t)[1]) < 1e-12);
});

test('reflexInputs : fonce sur moi ou je fonce sur elle comptent pareil', () => {
  const mk = () => [new E.Fighter(0, 0, { rng: E.makeRng(1), maxSpeed: 3 }), new E.Fighter(200, 0, { rng: E.makeRng(2), maxSpeed: 3 })];
  const [f1, t1] = mk();
  t1.vel.set(-3, 0);
  const [f2, t2] = mk();
  f2.vel.set(3, 0);
  assert.ok(Math.abs(E.reflexInputs(f1, t1)[1] - 0.5) < 1e-12);
  assert.ok(Math.abs(E.reflexInputs(f2, t2)[1] - 0.5) < 1e-12);
});

test('reflexInputs : combattantes superposées -> valeurs finies, sans division par zéro', () => {
  const f = new E.Fighter(10, 10, { rng: E.makeRng(1) });
  const t = new E.Fighter(10, 10, { rng: E.makeRng(2) });
  t.vel.set(2, 2);
  const r = E.reflexInputs(f, t);
  assert.ok(r.every(Number.isFinite));
  assert.deepEqual(r.slice(0, 2), [1, 0]);
});

test('reflexInputs : ne modifie ni la combattante ni la menace', () => {
  const f = new E.Fighter(5, 6, { rng: E.makeRng(1) });
  const t = new E.Fighter(100, 50, { rng: E.makeRng(2) });
  f.vel.set(1, 2); t.vel.set(-2, 0.5);
  E.reflexInputs(f, t);
  assert.deepEqual([f.pos.x, f.pos.y, f.vel.x, f.vel.y], [5, 6, 1, 2]);
  assert.deepEqual([t.pos.x, t.pos.y, t.vel.x, t.vel.y], [100, 50, -2, 0.5]);
});

test('toutes les entrées du réflexe sont dans leurs bornes pendant une vraie partie', () => {
  const w = new E.GameWorld({ withPlayer: false, bots: 8, seed: 14 });
  for (let i = 0; i < 700; i++) {
    w.step();
    for (const f of w.fighters) {
      if (!f.alive || !f.perceived) continue;
      const [p, c, s] = f.perceived.reflexInputs;
      assert.ok(p >= 0 && p <= 1 && c >= -1 && c <= 1 && s >= 0 && s <= 1 && [p, c, s].every(Number.isFinite));
    }
  }
});

// --------------------------------------------------------------- réflexe dans la bot

test('Bot.think : mémorise la décision du réflexe, avec ses entrées', () => {
  const ctx = setup(true);
  ctx.me.think(ctx.world);
  assert.equal(ctx.me.reflex.mode, 'flee');
  assert.deepEqual(ctx.me.reflex.inputs, ctx.me.perceived.reflexInputs);
});

test('réflexe réel : une ennemie qui fonce sur moi à courte distance -> fuir ; une ennemie qui s\'éloigne -> explorer', () => {
  const world = new E.GameWorld({ withPlayer: false, bots: 2, seed: 4, obstacleCount: 0, lootCount: 0 });
  const [me, other] = world.fighters;
  me.pos.set(0, 0); me.vel.set(me.maxSpeed, 0);
  other.pos.set(100, 0); other.vel.set(-other.maxSpeed, 0);
  me.think(world);
  assert.equal(me.reflex.mode, 'flee');
  me.vel.set(0, 0);
  other.vel.set(other.maxSpeed, 0);
  me.think(world);
  assert.equal(me.reflex.mode, 'explore');
  other.pos.set(3000, 0);
  me.think(world);
  assert.equal(me.reflex.mode, 'explore', 'aucune ennemie à portée');
});

test('Bot sans cerveau : décision par défaut complète (avec le poids de la piste)', () => {
  const world = new E.GameWorld({ withPlayer: false, bots: 2, seed: 4, obstacleCount: 0, lootCount: 0 });
  const bot = new E.Bot(0, 0, { rng: E.makeRng(1), brain: null });
  bot.think(world);
  assert.equal(bot.decision.trail, 0.5);
  assert.ok(bot.computeSteering(world).mag() <= bot.maxForce + 1e-9);
});

// -------------------------------------------------------- effet sur les forces

test('mode explorer : la poursuite voulue par le cerveau est suivie (force vers l\'ennemie)', () => {
  const ctx = setup(false, { pursue: 1 });
  const f = force(ctx);
  assert.ok(f.x > 0.15 && Math.abs(f.y) < 1e-9, 'f = ' + f.x + ',' + f.y);
});

test('mode fuir : la poursuite est coupée et l\'Evasion est au moins à fleeMinWeight', () => {
  const ctx = setup(true, { pursue: 1 });
  const f = force(ctx);
  assert.ok(f.x < 0, 'fuit vers -x');
  assert.ok(Math.abs(f.x + ctx.me.maxForce * E.REFLEX_EFFECT.fleeMinWeight) < 1e-9, 'f.x = ' + f.x);
});

test('mode fuir : si le cerveau veut déjà fuir plus fort, son poids est conservé', () => {
  const ctx = setup(true, { flee: 1 });
  assert.ok(Math.abs(force(ctx).x + ctx.me.maxForce) < 1e-9);
});

test('mode explorer : la fuite voulue par le cerveau est atténuée (calmFleeFactor)', () => {
  const ctx = setup(false, { flee: 1 });
  const f = force(ctx);
  assert.ok(Math.abs(f.x + ctx.me.maxForce * E.REFLEX_EFFECT.calmFleeFactor) < 1e-9, 'f.x = ' + f.x);
});

test('mode fuir : l\'attirance du butin est réduite (lootFactor) mais pas supprimée', () => {
  const calm = setup(false, { loot: 1 });
  calm.world.loot.push(new E.Loot(0, 300, 'bag'));
  const fc = force(calm);
  const scared = setup(true, { loot: 1 });
  scared.world.loot.push(new E.Loot(0, 300, 'bag'));
  const fs = force(scared);
  assert.ok(Math.abs(fc.y - calm.me.maxForce) < 1e-9, 'explorer : plein poids vers le butin');
  assert.ok(Math.abs(fs.y - scared.me.maxForce * E.REFLEX_EFFECT.lootFactor) < 1e-9, 'fuir : réduit à ' + fs.y);
});

test('mode fuir : le suivi de piste est coupé ; mode explorer : il est suivi', () => {
  const calm = setup(false, { trail: 1 });
  for (let x = 40; x <= 400; x += 20) calm.world.pheromones.deposit(x, 0, 3);
  assert.ok(force(calm).x > 0.1, 'explorer : suit la piste vers +x');
  const scared = setup(true, { trail: 1 });
  for (let x = 40; x <= 400; x += 20) scared.world.pheromones.deposit(x, 0, 3);
  const f = force(scared);
  assert.ok(Math.abs(f.x + scared.me.maxForce * E.REFLEX_EFFECT.fleeMinWeight) < 1e-9, 'fuir : seule l\'Evasion reste, f.x = ' + f.x);
});

test('le réflexe « fuir » sans ennemie perçue ne change rien (rien à fuir)', () => {
  const calm = setup(false, { wander: 0, zone: 0, trail: 1 }, [3000, 0]);
  const scared = setup(true, { wander: 0, zone: 0, trail: 1 }, [3000, 0]);
  for (const c of [calm, scared]) for (let x = 40; x <= 400; x += 20) c.world.pheromones.deposit(x, 0, 3);
  const a = force(calm);
  const b = force(scared);
  assert.ok(a.x > 0.1);
  assert.ok(Math.abs(a.x - b.x) < 1e-12 && Math.abs(a.y - b.y) < 1e-12);
});

test('la force totale reste bornée par maxForce dans tous les cas, et l\'évitement d\'obstacle garde la priorité', () => {
  for (const flee of [true, false]) {
    const ctx = setup(flee, { pursue: 1, flee: 1, loot: 1, trail: 1, wander: 1, zone: 1 });
    assert.ok(force(ctx).mag() <= ctx.me.maxForce + 1e-9);
  }
  const ctx = setup(true, { flee: 1 });
  ctx.me.vel.set(-2, 0); // elle fonce vers -x, droit sur un obstacle, alors que la fuite pousse aussi vers -x
  ctx.world.obstacles.push(new E.Obstacle(-60, 8, 25));
  const f = force(ctx);
  assert.ok(f.mag() <= ctx.me.maxForce + 1e-9);
  assert.ok(f.y < 0, 'l\'évitement (priorité 1) dévie latéralement : f.y = ' + f.y);
});

test('partie complète avec le vrai réflexe : se termine, classement valide, vitesse et force bornées', () => {
  const w = new E.GameWorld({ withPlayer: false, bots: 12, seed: 3 });
  let guard = 0;
  while (!w.over && guard++ < 20000) {
    w.step();
    for (const f of w.fighters) assert.ok(f.vel.mag() <= f.maxSpeed + 1e-9);
  }
  assert.ok(w.over);
  assert.deepEqual(w.fighters.map((f) => f.placement).sort((a, b) => a - b), Array.from({ length: 12 }, (_, i) => i + 1));
  const modes = new Set();
  const w2 = new E.GameWorld({ withPlayer: false, bots: 12, seed: 3 });
  for (let i = 0; i < 2500 && !w2.over; i++) {
    w2.step();
    for (const f of w2.fighters) if (f.alive && f.reflex) modes.add(f.reflex.mode);
  }
  assert.deepEqual([...modes].sort(), ['explore', 'flee'], 'les deux modes sont réellement utilisés en jeu');
});
