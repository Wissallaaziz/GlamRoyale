/**
 * Page d'entraînement : fait avancer un Trainer (ai/trainer.js) frame par frame sans bloquer
 * l'interface, dessine la partie en cours et la courbe de fitness, exporte/importe les
 * cerveaux. Toute la logique d'évolution est dans Trainer/Evolution ; ici il n'y a que de
 * l'interface.
 */
const T = {
  trainer: null,
  running: false,
  framesPerTick: 30,
  stepCount: 0,
};

const el = (id) => document.getElementById(id);

function newTrainer(seedGenome = null) {
  T.trainer = new Trainer({ size: 36, rounds: 2, maxFrames: 7000, seed: Math.floor(Math.random() * 1e6) + 1, seedGenome });
  T.stepCount = 0;
  showMessage(seedGenome ? 'Population créée à partir d\'un cerveau existant.' : 'Nouvelle population aléatoire.');
}

function pretrainedGenome() {
  if (typeof PRETRAINED_BRAIN === 'undefined') return null;
  try { return Brain.fromJSON(PRETRAINED_BRAIN).weights; } catch (e) { return null; }
}

function showMessage(text) {
  el('message').textContent = text;
}

/** Cerveau exportable : le meilleur de la dernière génération terminée. */
function bestBrainJson() {
  const t = T.trainer;
  if (!t.lastBest) return null;
  return new Brain(t.lastBest.genome).toJSON({
    generation: t.generation,
    fitness: Math.round(t.lastBest.fitness * 10) / 10,
  });
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ----------------------------------------------------------------------- dessin

function drawMatch() {
  const canvas = el('view');
  const ctx = canvas.getContext('2d');
  const w = T.trainer.world;
  const k = (canvas.width / 2 - 8) / w.radius;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(k, k);
  ctx.fillStyle = '#fde4f0';
  ctx.beginPath(); ctx.arc(0, 0, w.radius, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c9b9ee';
  for (const o of w.obstacles) { ctx.beginPath(); ctx.arc(o.pos.x, o.pos.y, o.r, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ffd166';
  for (const l of w.loot) if (!l.taken) { ctx.beginPath(); ctx.arc(l.pos.x, l.pos.y, 9, 0, Math.PI * 2); ctx.fill(); }
  const z = w.zone;
  ctx.lineWidth = 6 / k;
  ctx.strokeStyle = '#ff4fa3';
  ctx.beginPath(); ctx.arc(z.cx, z.cy, z.radius, 0, Math.PI * 2); ctx.stroke();
  if (!z.finished) {
    ctx.setLineDash([30 / k, 20 / k]);
    ctx.strokeStyle = '#8a6fd0';
    ctx.beginPath(); ctx.arc(z.tx, z.ty, z.tr, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = '#5b2a5e';
  for (const b of w.bullets) { ctx.beginPath(); ctx.arc(b.pos.x, b.pos.y, 10, 0, Math.PI * 2); ctx.fill(); }
  for (const f of w.fighters) {
    if (!f.alive) continue;
    ctx.fillStyle = f.color;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4 / k;
    ctx.beginPath(); ctx.arc(f.pos.x, f.pos.y, 26, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#ff4fa3';
    ctx.lineWidth = 6 / k;
    ctx.beginPath(); ctx.arc(f.pos.x, f.pos.y, 40, -Math.PI / 2, -Math.PI / 2 + (f.hp / f.maxHp) * Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

function drawChart() {
  const canvas = el('chart');
  const ctx = canvas.getContext('2d');
  const h = T.trainer.history;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const m = { l: 44, r: 12, t: 12, b: 28 };
  const pw = canvas.width - m.l - m.r;
  const ph = canvas.height - m.t - m.b;
  ctx.strokeStyle = '#ffb3d9';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#5b2a5e';
  ctx.font = '12px sans-serif';
  ctx.strokeRect(m.l, m.t, pw, ph);
  if (h.length < 2) {
    ctx.fillText('La courbe apparaît après 2 générations.', m.l + 12, m.t + ph / 2);
    return;
  }
  const maxV = Math.max(...h.map((r) => r.best), 1);
  const x = (i) => m.l + (i / (h.length - 1)) * pw;
  const y = (v) => m.t + ph - (v / maxV) * ph;
  ctx.fillText(Math.round(maxV), 6, m.t + 10);
  ctx.fillText('0', 26, m.t + ph);
  ctx.fillText('génération ' + h[h.length - 1].generation, m.l + pw - 90, m.t + ph + 18);
  const line = (key, color) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    h.forEach((r, i) => (i ? ctx.lineTo(x(i), y(r[key])) : ctx.moveTo(x(i), y(r[key]))));
    ctx.stroke();
  };
  line('average', '#9a7be0');
  line('best', '#ff4fa3');
}

function updateStats() {
  const t = T.trainer;
  const last = t.history[t.history.length - 1];
  const rows = [
    ['Génération', t.generation],
    ['Partie', (t.matchIndex + 1) + ' / ' + t.matches.length],
    ['Frame de la partie', t.world.frame + ' / ' + t.maxFrames],
    ['Vivantes', t.world.aliveCount() + ' / ' + t.world.fighters.length],
    ['Meilleure fitness', last ? last.best.toFixed(1) : '—'],
    ['Fitness moyenne', last ? last.average.toFixed(1) : '—'],
  ];
  el('stats').innerHTML = rows.map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('');
}

// --------------------------------------------------------------------- boucle

function tick() {
  if (T.running) T.trainer.step(T.framesPerTick);
  drawMatch();
  drawChart();
  updateStats();
  requestAnimationFrame(tick);
}

function init() {
  newTrainer(pretrainedGenome());
  el('toggle').addEventListener('click', () => {
    T.running = !T.running;
    el('toggle').textContent = T.running ? '⏸ Pause' : '▶ Démarrer';
  });
  el('speed').addEventListener('input', (e) => {
    T.framesPerTick = Number(e.target.value);
    el('speedValue').textContent = T.framesPerTick + ' frames/tick';
  });
  el('reset').addEventListener('click', () => newTrainer(null));
  el('fromBest').addEventListener('click', () => {
    const g = pretrainedGenome();
    if (g) newTrainer(g);
    else showMessage('Aucun cerveau pré-entraîné (weights/best.js).');
  });
  el('exportJs').addEventListener('click', () => {
    const b = bestBrainJson();
    if (!b) return showMessage('Laissez d\'abord tourner au moins une génération.');
    download('best.js', 'const PRETRAINED_BRAIN = ' + JSON.stringify(b) + ';\n', 'text/javascript');
    showMessage('best.js exporté : remplacez weights/best.js.');
  });
  el('exportJson').addEventListener('click', () => {
    const b = bestBrainJson();
    if (!b) return showMessage('Laissez d\'abord tourner au moins une génération.');
    download('best.json', JSON.stringify(b), 'application/json');
    showMessage('best.json exporté.');
  });
  el('useInGame').addEventListener('click', () => {
    const b = bestBrainJson();
    if (!b) return showMessage('Laissez d\'abord tourner au moins une génération.');
    try {
      window.localStorage.setItem('glam.brain', JSON.stringify(b));
      showMessage('Cerveau mémorisé : lancez index.html.');
    } catch (e) {
      showMessage('Mémorisation impossible dans ce navigateur : exportez best.js.');
    }
  });
  el('importFile').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then((text) => {
      try {
        newTrainer(Brain.fromJSON(JSON.parse(text)).weights);
      } catch (err) {
        showMessage('Fichier refusé : ' + err.message);
      }
    });
  });
  requestAnimationFrame(tick);
}

init();
