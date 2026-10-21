import test from 'node:test';
import assert from 'node:assert/strict';
import loader from '../tools/loader.js';
import shim from '../tools/p5shim.js';

const E = loader.loadEngine();
const { createVector } = shim;

const field = (opts = {}) => new E.PheromoneField(1500, opts);
const make = (x = 0, y = 0, opts = {}) => new E.SteeringVehicle(x, y, Object.assign({ rng: E.makeRng(1) }, opts));

// ---------------------------------------------------------------------- le champ

test('grille : couvre l\'île avec une marge, au départ vide', () => {
  const f = field();
  assert.equal(f.size, Math.ceil((2 * (1500 + 60)) / 60));
  assert.equal(f.total(), 0);
  assert.equal(f.maxCell(), 0);
  assert.equal(f.sample(0, 0), 0);
});

test('paramètres invalides : erreur explicite', () => {
  assert.throws(() => field({ cellSize: 0 }), /cellSize/);
  assert.throws(() => field({ diffusion: 1.5 }), /diffusion/);
  assert.throws(() => field({ evaporation: 1 }), /evaporation/);
  assert.throws(() => field({ updateEvery: 0 }), /updateEvery/);
});

test('deposit : la quantité déposée est répartie sans perte, au centre, au bord et hors grille', () => {
  for (const [x, y] of [[0, 0], [13.7, -42.1], [1499, 0], [-1559, -1559], [9000, 9000], [-9000, 20]]) {
    const f = field({ maxValue: 100 });
    f.deposit(x, y, 2);
    assert.ok(Math.abs(f.total() - 2) < 1e-12, x + ',' + y + ' : ' + f.total());
  }
});

test('deposit : ignore les quantités négatives, nulles ou non finies et les positions invalides', () => {
  const f = field();
  for (const a of [-1, 0, NaN, Infinity, undefined]) f.deposit(10, 10, a);
  f.deposit(NaN, 0, 1);
  f.deposit(0, Infinity, 1);
  assert.equal(f.total(), 0);
});

test('deposit : chaque case est plafonnée à maxValue', () => {
  const f = field({ maxValue: 3 });
  for (let i = 0; i < 100; i++) f.deposit(0, 0, 1);
  assert.ok(f.maxCell() <= 3 + 1e-12);
  assert.ok(f.maxCell() > 2.9);
});

test('sample : interpolation bilinéaire exacte entre deux cases voisines', () => {
  const f = field();
  const a = f.cellCenter(20, 20);
  const b = f.cellCenter(21, 20);
  f.cells[20 * f.size + 20] = 4;
  f.cells[20 * f.size + 21] = 2;
  assert.ok(Math.abs(f.sample(a.x, a.y) - 4) < 1e-12);
  assert.ok(Math.abs(f.sample(b.x, b.y) - 2) < 1e-12);
  assert.ok(Math.abs(f.sample((a.x + b.x) / 2, a.y) - 3) < 1e-12);
  assert.equal(f.sample(NaN, 0), 0);
});

test('cellCenter / cellRange : cohérents (le centre d\'une case est dans sa propre plage)', () => {
  const f = field();
  const c = f.cellCenter(10, 12);
  const r = f.cellRange(c.x, c.y, c.x, c.y);
  assert.deepEqual([r.i0, r.i1, r.j0, r.j1], [10, 10, 12, 12]);
  const all = f.cellRange(-1e6, -1e6, 1e6, 1e6);
  assert.deepEqual([all.i0, all.i1, all.j0, all.j1], [0, f.size - 1, 0, f.size - 1]);
});

// ------------------------------------------------------- diffusion, évaporation

test('diffusion : le total est conservé (sans évaporation ni seuil epsilon), même dans un coin de la grille', () => {
  for (const [x, y] of [[0, 0], [-1550, -1550], [1550, 0]]) {
    const f = field({ evaporation: 0, maxValue: 1000, epsilon: 0 }); // epsilon 0 : aucune case n'est effacée
    f.deposit(x, y, 5);
    const before = f.total();
    for (let i = 0; i < 40; i++) f.diffuseAndEvaporate();
    assert.ok(Math.abs(f.total() - before) < 1e-9, x + ',' + y + ' : ' + before + ' -> ' + f.total());
  }
});

test('diffusion : une case isolée partage diffusion/4 avec chacune de ses 4 voisines', () => {
  const f = field({ diffusion: 0.2, evaporation: 0 });
  const mid = Math.floor(f.size / 2);
  f.cells[mid * f.size + mid] = 4;
  f.diffuseAndEvaporate();
  assert.ok(Math.abs(f.cell(mid, mid) - 4 * 0.8) < 1e-12);
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.ok(Math.abs(f.cell(mid + di, mid + dj) - 0.2) < 1e-12);
  assert.equal(f.cell(mid + 1, mid + 1), 0, 'pas de diffusion en diagonale en une étape');
});

test('seuil epsilon : les valeurs infimes sont effacées (le total diminue un peu, c\'est voulu)', () => {
  const f = field({ evaporation: 0, epsilon: 0.02, maxValue: 1000 });
  f.deposit(0, 0, 1);
  for (let i = 0; i < 3; i++) f.diffuseAndEvaporate();
  assert.ok(f.total() < 1 - 1e-6 && f.total() > 0.5, 'total : ' + f.total());
  for (const v of f.cells) assert.ok(v === 0 || v >= 0.02);
});

test('diffusion : sans diffusion (0) rien ne bouge ; la piste s\'élargit puis s\'aplatit avec le temps', () => {
  const still = field({ diffusion: 0, evaporation: 0 });
  still.deposit(100, 100, 3);
  const snap = Array.from(still.cells);
  still.diffuseAndEvaporate();
  assert.deepEqual(Array.from(still.cells), snap);

  const f = field({ evaporation: 0, maxValue: 1000 });
  f.cells[Math.floor(f.size / 2) * f.size + Math.floor(f.size / 2)] = 10;
  const peak0 = f.maxCell();
  for (let i = 0; i < 30; i++) f.diffuseAndEvaporate();
  assert.ok(f.maxCell() < peak0 * 0.5, 'le pic s\'aplatit');
});

test('évaporation : le total est multiplié par (1 - evaporation) à chaque étape (sans diffusion)', () => {
  const f = field({ diffusion: 0, evaporation: 0.1, epsilon: 0 });
  f.deposit(0, 0, 4);
  f.diffuseAndEvaporate();
  assert.ok(Math.abs(f.total() - 4 * 0.9) < 1e-12);
  f.diffuseAndEvaporate();
  assert.ok(Math.abs(f.total() - 4 * 0.81) < 1e-12);
});

test('évaporation : la piste finit par disparaître complètement (seuil epsilon)', () => {
  const f = field();
  f.deposit(0, 0, 2);
  for (let i = 0; i < 4000; i++) f.diffuseAndEvaporate();
  assert.equal(f.total(), 0);
});

test('demi-vie par défaut : environ 115 mises à jour, soit 345 frames', () => {
  const f = field({ diffusion: 0 });
  f.deposit(0, 0, 4);
  for (let i = 0; i < 115; i++) f.diffuseAndEvaporate();
  assert.ok(Math.abs(f.total() / 4 - 0.5) < 0.02, 'reste ' + f.total() / 4);
});

test('toutes les valeurs restent finies et positives ou nulles après un long usage', () => {
  const f = field();
  const rng = E.makeRng(9);
  for (let i = 0; i < 2000; i++) {
    f.deposit((rng() - 0.5) * 3200, (rng() - 0.5) * 3200, rng());
    f.update();
  }
  for (const v of f.cells) assert.ok(Number.isFinite(v) && v >= 0 && v <= f.maxValue + 1e-9);
});

test('update : diffusion et évaporation seulement toutes les updateEvery frames', () => {
  const f = field({ updateEvery: 3, diffusion: 0, evaporation: 0.5 });
  f.deposit(0, 0, 4);
  f.update();
  f.update();
  assert.ok(Math.abs(f.total() - 4) < 1e-12, 'rien après 2 frames');
  f.update();
  assert.ok(Math.abs(f.total() - 2) < 1e-12, 'évaporation à la 3e frame');
});

test('clear : remet tout à zéro', () => {
  const f = field();
  f.deposit(0, 0, 3);
  f.update();
  f.clear();
  assert.equal(f.total(), 0);
  assert.equal(f.counter, 0);
});

// -------------------------------------------------------- capteurs et suivi de piste

test('trailSensors : 3 capteurs à sensorDistance, à ±sensorAngle du cap ; à l\'arrêt on utilise `angle`', () => {
  const v = make(100, 50);
  v.vel.set(0, 2); // cap = +y (PI/2)
  const s = v.trailSensors(field(), { sensorDistance: 90, sensorAngle: 0.7 });
  assert.equal(s.points.length, 3);
  const headings = s.points.map((p) => Math.atan2(p.y - 50, p.x - 100));
  assert.ok(Math.abs(headings[1] - Math.PI / 2) < 1e-9, 'centre dans le cap');
  assert.ok(Math.abs(headings[0] - (Math.PI / 2 - 0.7)) < 1e-9, 'gauche');
  assert.ok(Math.abs(headings[2] - (Math.PI / 2 + 0.7)) < 1e-9, 'droite');
  s.points.forEach((p) => assert.ok(Math.abs(Math.hypot(p.x - 100, p.y - 50) - 90) < 1e-9));
  const still = make(0, 0);
  still.angle = Math.PI;
  const s2 = still.trailSensors(field());
  assert.ok(s2.points[1].x < -80 && Math.abs(s2.points[1].y) < 1e-6, 'à l\'arrêt : cap = angle');
});

test('trailSensors : sans phéromone tout est nul ; le centre l\'emporte à égalité', () => {
  const v = make();
  v.vel.set(3, 0);
  const s = v.trailSensors(field());
  assert.deepEqual(s.values, [0, 0, 0]);
  assert.equal(s.best, 1);
  assert.equal(s.bestValue, 0);
  assert.equal(s.strength, 0);
});

test('trailSensors : désigne le capteur qui sent le plus de phéromone et normalise la force', () => {
  for (const i of [0, 1, 2]) {
    const f = field({ maxValue: 100 });
    const v = make();
    v.vel.set(3, 0);
    const probe = v.trailSensors(f);
    f.deposit(probe.points[i].x, probe.points[i].y, 4);
    const s = v.trailSensors(f);
    assert.equal(s.best, i);
    assert.ok(s.bestValue >= 1, 'une lecture au point de dépôt vaut au moins 1/4 de la quantité : ' + s.bestValue);
    assert.ok(Math.abs(s.strength - Math.min(1, s.bestValue / f.saturation)) < 1e-12);
  }
  const f = field({ maxValue: 100 });
  const v = make();
  v.vel.set(3, 0);
  f.deposit(v.trailSensors(f).points[1].x, 0, 50);
  assert.equal(v.trailSensors(f).strength, 1, 'borné à 1');
});

test('followTrail : force vers le capteur le plus fort (gauche -> y négatif, droite -> y positif)', () => {
  const f = field({ maxValue: 100 });
  const v = make();
  v.vel.set(3, 0);
  const probe = v.trailSensors(f);
  f.deposit(probe.points[0].x, probe.points[0].y, 3);
  const left = v.followTrail(v.trailSensors(f));
  assert.ok(left.y < 0 && left.mag() > 0);
  f.clear();
  f.deposit(probe.points[2].x, probe.points[2].y, 3);
  const right = v.followTrail(v.trailSensors(f));
  assert.ok(right.y > 0);
  assert.ok(left.mag() <= v.maxForce + 1e-12 && right.mag() <= v.maxForce + 1e-12);
});

test('followTrail : force nulle sans piste, avec une piste trop faible ou sans capteurs', () => {
  const v = make();
  v.vel.set(3, 0);
  const f = field();
  assert.equal(v.followTrail(v.trailSensors(f)).mag(), 0);
  f.deposit(v.trailSensors(f).points[1].x, 0, 0.01);
  assert.equal(v.followTrail(v.trailSensors(f)).mag(), 0, 'sous minSignal');
  assert.equal(v.followTrail(null).mag(), 0);
  assert.equal(v.followTrail(undefined).mag(), 0);
});

test('followTrail : une piste faible donne une force plus faible qu\'une piste forte', () => {
  const v = make();
  v.vel.set(3, 0);
  const f = field({ maxValue: 100 });
  const p = v.trailSensors(f).points[1];
  f.deposit(p.x, p.y, 0.5);
  const weak = v.followTrail(v.trailSensors(f)).mag();
  f.deposit(p.x, p.y, 5);
  const strong = v.followTrail(v.trailSensors(f)).mag();
  assert.ok(weak > 0 && strong > weak);
});

test('trailSensors / followTrail ne modifient ni la vitesse, ni la position, ni les capteurs', () => {
  const v = make(5, 6);
  v.vel.set(2, 1);
  const f = field({ maxValue: 100 });
  f.deposit(80, 20, 3);
  const s = v.trailSensors(f);
  const snapshot = JSON.stringify(s.points.map((p) => [p.x, p.y]));
  v.followTrail(s);
  v.followTrail(s);
  assert.equal(JSON.stringify(s.points.map((p) => [p.x, p.y])), snapshot);
  assert.deepEqual([v.pos.x, v.pos.y, v.vel.x, v.vel.y], [5, 6, 2, 1]);
});

test('une véhicule qui suit une piste avance le long d\'elle (comportement observé sur 200 frames)', () => {
  const f = field({ maxValue: 100 });
  for (let x = 40; x <= 1200; x += 20) f.deposit(x, 0, 2); // piste le long de l'axe x
  const v = make(0, 40, { maxSpeed: 3, maxForce: 0.2 }); // décalée de 40 px sous la piste
  v.vel.set(2, 0);
  for (let i = 0; i < 200; i++) {
    const s = v.trailSensors(f);
    v.applyForce(v.followTrail(s));
    v.update();
    assert.ok(v.vel.mag() <= v.maxSpeed + 1e-9);
  }
  assert.ok(v.pos.x > 300, 'a avancé : x = ' + v.pos.x);
  assert.ok(Math.abs(v.pos.y) < 90, 'est restée près de la piste : y = ' + v.pos.y);
});

// ---------------------------------------------------------- intégration à la partie

test('GameWorld : possède un champ de phéromones et un réflexe, partagés par les bots', () => {
  const w = new E.GameWorld({ seed: 3 });
  assert.ok(w.pheromones instanceof E.PheromoneField);
  assert.equal(w.reflexNet, E.defaultReflexNet());
  const custom = new E.GameWorld({ seed: 3, pheromone: { cellSize: 100 } });
  assert.equal(custom.pheromones.cellSize, 100);
});

test('les combattantes déposent de la phéromone en bougeant, pas à l\'arrêt', () => {
  const w = new E.GameWorld({ withPlayer: false, bots: 3, seed: 6, obstacleCount: 0, lootCount: 0 });
  w.fighters.forEach((f) => { f.vel.set(0, 0); });
  w.depositTrail(w.fighters[0]);
  assert.equal(w.pheromones.total(), 0, 'à l\'arrêt : rien');
  w.fighters[0].vel.set(w.fighters[0].maxSpeed, 0);
  w.depositTrail(w.fighters[0]);
  assert.ok(Math.abs(w.pheromones.total() - w.pheromones.depositRate) < 1e-12, 'pleine vitesse : depositRate');
  w.pheromones.clear();
  w.fighters[0].vel.set(w.fighters[0].maxSpeed / 2, 0);
  w.depositTrail(w.fighters[0]);
  assert.ok(Math.abs(w.pheromones.total() - w.pheromones.depositRate / 2) < 1e-12, 'moitié de vitesse : moitié');
});

test('pendant une partie, des pistes se forment, se diffusent et restent bornées', () => {
  const w = new E.GameWorld({ withPlayer: false, bots: 6, seed: 12 });
  for (let i = 0; i < 600; i++) w.step();
  assert.ok(w.pheromones.total() > 1, 'des pistes existent : ' + w.pheromones.total());
  assert.ok(w.pheromones.maxCell() <= w.pheromones.maxValue + 1e-9);
  for (const v of w.pheromones.cells) assert.ok(Number.isFinite(v) && v >= 0);
});

test('les phéromones sont reproductibles : même graine, même champ', () => {
  const run = () => {
    const w = new E.GameWorld({ withPlayer: false, bots: 6, seed: 12 });
    for (let i = 0; i < 400; i++) w.step();
    return Array.from(w.pheromones.cells).map((v) => v.toFixed(9)).join(',');
  };
  assert.equal(run(), run());
});

test('perception : l\'entrée 15 est l\'intensité de la piste devant (0 sans piste, > 0 avec)', () => {
  const w = new E.GameWorld({ withPlayer: false, bots: 2, seed: 4, obstacleCount: 0, lootCount: 0 });
  const [me, other] = w.fighters;
  me.pos.set(0, 0); me.angle = 0; me.vel.set(2, 0); other.pos.set(5000, 5000);
  assert.equal(E.perceive(me, w).inputs[15], 0);
  const sensors = me.trailSensors(w.pheromones);
  w.pheromones.deposit(sensors.points[1].x, sensors.points[1].y, 5);
  const p = E.perceive(me, w);
  assert.ok(p.inputs[15] > 0.5 && p.inputs[15] <= 1);
  assert.equal(p.trail.best, 1);
});

test('une bot dont le cerveau réclame le suivi de piste suit la piste d\'une autre (orientation collective)', () => {
  const w = new E.GameWorld({ withPlayer: false, bots: 2, seed: 4, obstacleCount: 0, lootCount: 0 });
  const [me, other] = w.fighters;
  other.pos.set(-1200, 1200); // loin : aucune ennemie perçue
  me.pos.set(0, 40); me.angle = 0; me.vel.set(2, 0);
  me.brain = { decide: () => ({ loot: 0, pursue: 0, flee: 0, wander: 0, zone: 0, trail: 1, shoot: false, shootRaw: 0 }) };
  for (let x = 60; x <= 1100; x += 20) w.pheromones.deposit(x, 0, 2);
  for (let i = 0; i < 200; i++) {
    me.think(w);
    me.applyForce(me.computeSteering(w));
    me.update(1);
  }
  assert.ok(me.pos.x > 300, 'a suivi la piste : x = ' + me.pos.x);
  assert.ok(Math.abs(me.pos.y) < 100, 'est restée près de la piste : y = ' + me.pos.y);
});
