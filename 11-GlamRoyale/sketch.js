/**
 * sketch.js : contrôleur de l'exemple. Il initialise la scène, recueille les entrées,
 * orchestre UNE mise à jour de partie par frame (GameWorld.step) et dessine. La logique
 * (steering, réseaux de neurones, collisions, zone) est dans les classes ; ici il n'y a ni
 * formule de steering ni intégration de mouvement.
 *
 * Ordre d'une frame : lire les entrées -> world.step() (perception, décisions, forces,
 * locomotion héritée, règles de scène) -> événements (sons, particules) -> caméra -> dessin.
 */

const S = {
  mode: 'menu',        // 'menu' (démonstration) | 'playing' | 'watching' | 'over'
  lastMode: 'playing', // mode relancé par « Rejouer »
  world: null,
  particles: null,
  decor: null,
  cam: { x: 0, y: 0, zoom: 1 },
  shake: 0,
  flash: 0,
  evo: null,           // population qui évolue entre les parties
  pretrainedGen: 0,
  endInfo: null,
  toasts: [],
  showBrain: true,
  showTrails: true,    // traînées de phéromones (touche F)
  debug: false,        // mode debug : Wander et capteurs de piste (touche D)
  paused: false,
  pendingWeapon: null,
  focusFighter: null,  // combattante suivie par la caméra quand la joueuse n'est plus là
  brainFocus: null,    // bot dont le cerveau est affiché
};

function setup() {
  createCanvas(windowWidth, windowHeight);
  frameRate(60);
  textFont('"Trebuchet MS", "Segoe UI", system-ui, sans-serif');
  S.decor = makeDecor(GAME_DEFAULTS.radius, 7);
  initEvolution();
  startMatch('menu');
  describeScene('Écran d\'accueil de Glam Royale : des bots s\'affrontent sur une île pastel pendant que le menu est affiché.');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

/** Crée la population de cerveaux (11 bots), amorcée avec le génome pré-entraîné s'il existe. */
function initEvolution() {
  S.evo = new Evolution({
    size: GAME_DEFAULTS.bots,
    rng: makeRng((Date.now() % 100000) + 17),
    mutationRate: 0.08,
    mutationScale: 0.2,
    eliteCount: 2,
    immigrants: 0,
  });
  // cerveau mémorisé par training.html (« Utiliser dans le jeu »), sinon weights/best.js ;
  // un cerveau d'une ancienne architecture est ignoré et on passe au suivant
  const candidates = [loadSavedBrain(), typeof PRETRAINED_BRAIN !== 'undefined' ? PRETRAINED_BRAIN : null];
  for (const source of candidates) {
    if (!source) continue;
    try {
      S.evo.seedFrom(Brain.fromJSON(source).weights, 0.1, 0.12);
      S.pretrainedGen = source.generation || 0;
      break;
    } catch (e) {
      console.warn('Poids ignorés :', e.message);
    }
  }
}

/** Cerveau enregistré dans le navigateur par training.html ; null s'il n'y en a pas. */
function loadSavedBrain() {
  try {
    const raw = window.localStorage.getItem('glam.brain');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null; // stockage indisponible ou contenu invalide : on ignore
  }
}

/** Nouvelle partie. mode : 'menu' (démo), 'playing' (avec joueuse) ou 'watching' (bots seuls). */
function startMatch(mode) {
  const brains = S.evo.population.map((ind) => new Brain(ind.genome));
  S.world = new GameWorld({ withPlayer: mode === 'playing', brains, seed: Math.floor(Math.random() * 1e9) });
  S.particles = new ParticleSystem();
  S.toasts = [];
  S.endInfo = null;
  S.paused = false;
  S.mode = mode;
  if (mode !== 'menu') S.lastMode = mode;
  S.focusFighter = S.world.player || S.world.fighters[0];
  S.cam.x = S.focusFighter.pos.x;
  S.cam.y = S.focusFighter.pos.y;
  if (mode === 'playing') {
    describeScene('Partie en cours : tu contrôles une combattante rose, 11 bots à réseaux de neurones t\'affrontent.');
    toast('Objectif : sois la dernière en vie ! Reste dans le cercle blanc.', GLAM.hotPink, 260);
  }
  if (mode === 'watching') describeScene('Les bots s\'affrontent seuls : tu observes la partie.');
}

/** Texte alternatif du canvas (accessibilité). */
function describeScene(text) {
  describe(text);
}

// ------------------------------------------------------------------ boucle

function draw() {
  const w = S.world;
  let steps = 1;
  if (S.paused) steps = 0;
  else if (isSpectating() && keyIsDown(32)) steps = 4; // Espace : avance rapide
  for (let i = 0; i < steps && !w.over; i++) {
    w.step(S.mode === 'playing' ? readInput() : {});
    handleEvents(w);
  }
  if (w.over) {
    if (S.mode === 'playing' || S.mode === 'watching') finishMatch();
    else if (S.mode === 'menu') startMatch('menu');
  }
  updateCamera();
  S.particles.update();
  S.toasts.forEach((t) => { t.life--; });
  S.toasts = S.toasts.filter((t) => t.life > 0);
  if (S.shake > 0) S.shake *= 0.85;
  if (S.flash > 0) S.flash--;
  render();
}

/** La joueuse regarde-t-elle la partie sans la jouer (éliminée, observation, menu) ? */
function isSpectating() {
  if (S.mode === 'watching' || S.mode === 'menu') return true;
  return S.mode === 'playing' && S.world.player && !S.world.player.alive;
}

/** Lit le clavier et la souris : la scène ne déplace pas la joueuse, elle transmet ses commandes. */
function readInput() {
  // flèches, Z Q S E (AZERTY) ou W A S + E ; D est réservée au debug (voir ui/controls.js)
  const { dx, dy } = movementFromKeys((code) => keyIsDown(code));
  const weapon = S.pendingWeapon;
  S.pendingWeapon = null;
  return {
    dx,
    dy,
    aimX: (mouseX - width / 2) / S.cam.zoom + S.cam.x,
    aimY: (mouseY - height / 2) / S.cam.zoom + S.cam.y,
    shoot: mouseIsPressed || keyIsDown(32),
    weapon,
  };
}

function updateCamera() {
  const w = S.world;
  S.cam.zoom = constrain(Math.min(width, height) / 800, 0.55, 1.15);
  let target = w.player && w.player.alive ? w.player : null;
  if (!target) {
    if (!S.focusFighter || !S.focusFighter.alive) {
      // on suit la survivante la plus proche de la caméra
      let best = null;
      let bestD = Infinity;
      for (const f of w.fighters) {
        if (!f.alive) continue;
        const d = Math.hypot(f.pos.x - S.cam.x, f.pos.y - S.cam.y);
        if (d < bestD) { bestD = d; best = f; }
      }
      S.focusFighter = best || S.focusFighter;
    }
    target = S.focusFighter;
  }
  S.cam.x += (target.pos.x - S.cam.x) * 0.12;
  S.cam.y += (target.pos.y - S.cam.y) * 0.12;

  // bot dont on affiche le cerveau : la plus proche de la joueuse, ou la bot suivie
  let focusBot = null;
  if (w.player && w.player.alive) {
    let bestD = 700;
    for (const f of w.fighters) {
      if (f === w.player || !f.alive || !f.decision) continue;
      const d = Math.hypot(f.pos.x - w.player.pos.x, f.pos.y - w.player.pos.y);
      if (d < bestD) { bestD = d; focusBot = f; }
    }
  } else if (target && target.decision) {
    focusBot = target;
  }
  S.brainFocus = focusBot;
}

// ----------------------------------------------------------------- événements

function toast(text, color = GLAM.pink, life = 130) {
  S.toasts.push({ text, color, life });
  if (S.toasts.length > 3) S.toasts.shift();
}

/** Convertit les événements de la frame en sons, particules et messages. */
function handleEvents(w) {
  const audible = S.mode !== 'menu';
  const p = w.player;
  for (const ev of w.events) {
    const near = clampValue(1 - Math.hypot(ev.x - S.cam.x, ev.y - S.cam.y) / 900, 0, 1);
    if (ev.type === 'shot') {
      S.particles.burst(ev.x, ev.y, '#ffffff', 2, 1.5, 14, 'star');
      if (audible && near > 0.05) Sfx.shot(ev.kind, near);
    } else if (ev.type === 'hit') {
      const col = ev.kind === 'heart' ? '#ff4fa3' : ev.kind === 'confetti' ? '#ffd166' : '#8fd3ff';
      S.particles.burst(ev.x, ev.y, col, 8, 2.5, 22, ev.kind === 'heart' ? 'heart' : 'circle');
      if (audible && near > 0.05) Sfx.hit(near);
      if (p && ev.id === p.id) { S.shake = 8; S.flash = 8; }
    } else if (ev.type === 'pop') {
      S.particles.burst(ev.x, ev.y, '#ffffff', 4, 1.6, 16);
    } else if (ev.type === 'pickup') {
      S.particles.burst(ev.x, ev.y, LOOT_TYPES[ev.loot].color, 10, 2.2, 28, 'star');
      if (p && ev.id === p.id) {
        toast(ev.text, LOOT_TYPES[ev.loot].color);
        if (audible) Sfx.pickup();
      }
    } else if (ev.type === 'kill') {
      S.particles.burst(ev.x, ev.y, ev.color, 26, 4.2, 44, 'heart');
      S.particles.burst(ev.x, ev.y, '#ffffff', 14, 3.2, 34, 'star');
      if (audible && near > 0.05) Sfx.kill(near);
      if (p && ev.by === p.id) toast('Élimination !', GLAM.hotPink);
    } else if (ev.type === 'zoneHit') {
      if (audible) Sfx.zone();
      S.flash = Math.max(S.flash, 4);
    }
  }
  if (w.frame % 600 === 0 && S.mode !== 'menu') describeScene('Partie en cours : ' + w.aliveCount() + ' combattantes encore en jeu.');
}

/** Fin de partie : classement, évolution des bots, écran de fin. */
function finishMatch() {
  const w = S.world;
  const total = w.fighters.length;
  for (const f of w.fighters) {
    if (f instanceof Bot) S.evo.setFitness(f.genomeIndex, computeFitness(f, total, w.maxFrames));
  }
  const best = S.evo.best().fitness;
  S.evo.nextGeneration();
  S.endInfo = { generation: S.pretrainedGen + S.evo.generation, bestFitness: best };
  const p = w.player;
  if (audible()) {
    if (p && p.placement === 1) Sfx.win();
    else Sfx.lose();
  }
  S.mode = 'over';
  describeScene(p ? 'Partie terminée : tu finis ' + p.placement + 'e sur ' + total + '.' : 'Partie terminée : ' + (w.winner ? w.winner.name + ' gagne.' : 'match nul.'));
}

function audible() {
  return !Sfx.muted;
}

// ---------------------------------------------------------------------- dessin

function render() {
  const w = S.world;
  const z = S.cam.zoom;
  background(GLAM.sea);
  const view = { x: S.cam.x - width / 2 / z, y: S.cam.y - height / 2 / z, w: width / z, h: height / z };
  const sx = S.shake > 0.5 ? (Math.random() - 0.5) * S.shake : 0;
  const sy = S.shake > 0.5 ? (Math.random() - 0.5) * S.shake : 0;

  push();
  translate(width / 2 + sx, height / 2 + sy);
  scale(z);
  translate(-S.cam.x, -S.cam.y);
  drawIsland(w.radius, S.decor, view);
  if (S.showTrails) drawPheromones(w.pheromones, view);
  for (const l of w.loot) if (!l.taken && inView(view, l.pos.x, l.pos.y, 40)) l.show(frameCount);
  for (const o of w.obstacles) if (inView(view, o.pos.x, o.pos.y, o.r + 40)) o.show();
  drawZone(w, view);
  drawAimGuide(w);
  if (S.debug) {
    for (const f of w.fighters) {
      if (f.alive && !f.isPlayer && inView(view, f.pos.x, f.pos.y, 160)) {
        drawWanderDebug(f);
        drawTrailDebug(f);
      }
    }
  }
  for (const b of w.bullets) if (inView(view, b.pos.x, b.pos.y, 30)) b.show();
  for (const f of w.fighters) {
    if (f.alive && inView(view, f.pos.x, f.pos.y, 80)) f.show(f === w.player);
  }
  S.particles.draw();
  pop();

  if (S.flash > 0) {
    push();
    noStroke();
    fill(255, 79, 163, S.flash * 12);
    rect(0, 0, width, height);
    pop();
  }
  if (S.mode === 'menu') drawMenu(S);
  else {
    drawHud(S);
    if (S.mode === 'over') drawEnd(S);
    if (S.paused) {
      push();
      noStroke();
      fill(224, 208, 255, 150);
      rect(0, 0, width, height);
      glamText('PAUSE', width / 2, height / 2, 64, '#ffffff', GLAM.hotPink);
      pop();
    }
  }
}

/** Petit guide pointillé de la joueuse vers la souris. */
function drawAimGuide(w) {
  const p = w.player;
  if (!p || !p.alive || S.mode !== 'playing') return;
  push();
  drawingContext.setLineDash([6, 8]);
  stroke(255, 255, 255, 190);
  strokeWeight(2);
  const len = 110;
  line(p.pos.x + Math.cos(p.aimAngle) * 28, p.pos.y + Math.sin(p.aimAngle) * 28,
    p.pos.x + Math.cos(p.aimAngle) * len, p.pos.y + Math.sin(p.aimAngle) * len);
  drawingContext.setLineDash([]);
  pop();
}

// --------------------------------------------------------------------- entrées

function keyPressed() {
  Sfx.init();
  const k = (key || '').toLowerCase();
  if (k === 'm') {
    toast(Sfx.toggleMute() ? 'Son coupé' : 'Son activé');
    return false;
  }
  if (isDebugKey(key)) {
    S.debug = !S.debug;
    toast(S.debug ? 'Debug activé (D) : Wander et capteurs de piste' : 'Debug désactivé (D)');
    return false;
  }
  if (isTrailKey(key)) {
    S.showTrails = !S.showTrails;
    toast(S.showTrails ? 'Phéromones affichées (F)' : 'Phéromones masquées (F)');
    return false;
  }
  if (S.mode === 'menu') {
    if (keyCode === ENTER) startMatch('playing');
    else if (k === 'w') startMatch('watching');
    else if (k === 't') window.location.href = 'training.html';
    return false;
  }
  if (keyCode === ESCAPE) { startMatch('menu'); return false; }
  if (k === 't' && S.mode === 'over') { window.location.href = 'training.html'; return false; }
  if (k === 'n') S.showBrain = !S.showBrain;
  else if (k === 'p' && S.mode !== 'over') S.paused = !S.paused;
  else if (k === '1' || k === '2' || k === '3') S.pendingWeapon = WEAPON_KEYS[Number(k) - 1];
  else if ((k === 'r' || keyCode === ENTER) && (S.mode === 'over' || isSpectating())) startMatch(S.lastMode);
  return keyCode === 32 || keyCode === UP_ARROW || keyCode === DOWN_ARROW ? false : undefined;
}

function mousePressed() {
  Sfx.init();
  if (S.mode === 'menu') startMatch('playing');
  else if (S.mode === 'over') startMatch(S.lastMode);
}
