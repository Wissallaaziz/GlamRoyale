/**
 * Interface (HUD, menu, écran de fin). Fonctions de rendu pures : elles lisent l'état du
 * jeu (objet S de sketch.js passé en paramètre) et dessinent en coordonnées écran.
 * Aucune force, aucune position n'est modifiée ici.
 */

const WEAPON_KEYS = ['bubble', 'heart', 'confetti'];
const BRAIN_LABELS = [['loot', 'Butin (Seek/Arrival)'], ['pursue', 'Poursuite (Pursuit)'], ['flee', 'Fuite (Evasion)'],
  ['wander', 'Errance (Wander)'], ['zone', 'Retour en zone'], ['trail', 'Piste (phéromones)']];

function drawPanel(x, y, w, h, alpha = 0.84) {
  push();
  fill(255, 255, 255, 255 * alpha);
  stroke(GLAM.panelEdge);
  strokeWeight(3);
  rect(x, y, w, h, 18);
  pop();
}

/** Barre arrondie remplie à `pct` (0..1) avec un libellé à l'intérieur. */
function drawBar(x, y, w, h, pct, col, label) {
  push();
  noStroke();
  fill(255, 255, 255, 150);
  rect(x, y, w, h, h / 2);
  if (pct > 0.001) {
    fill(col);
    rect(x, y, Math.max(h * 0.7, w * clampValue(pct, 0, 1)), h, h / 2);
  }
  if (label) {
    fill(GLAM.ink);
    textAlign(LEFT, CENTER);
    textSize(h * 0.72);
    text(label, x + 10, y + h / 2 + 1);
  }
  pop();
}

function formatTime(frames) {
  const s = Math.floor(frames / 60);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

/** HUD en jeu : compteurs, zone, minimap, barres, journal, cerveau d'une bot. */
function drawHud(S) {
  const w = S.world;
  const p = w.player;
  const pad = 16;
  push();
  noStroke();

  // compteurs
  drawPanel(pad, pad, 210, 74);
  fill(GLAM.ink);
  textAlign(LEFT, CENTER);
  textSize(18);
  text('♥ Vivantes  ' + w.aliveCount() + ' / ' + w.fighters.length, pad + 16, pad + 24);
  const me = p || S.focusFighter;
  text('★ Éliminations  ' + (me ? me.kills : 0), pad + 16, pad + 52);

  // état de la zone
  const z = w.zone;
  let zoneText;
  if (z.finished) zoneText = 'Dernier cercle !';
  else if (z.state === 'waiting') zoneText = 'Prochaine zone dans ' + Math.ceil(z.framesLeft / 60) + ' s';
  else zoneText = 'La zone rétrécit ! (' + Math.ceil(z.framesLeft / 60) + ' s)';
  const zw = Math.min(380, width - 2 * pad - 190);
  drawPanel(width / 2 - zw / 2, pad, zw, 42);
  fill(z.state === 'shrinking' || z.finished ? GLAM.hotPink : GLAM.ink);
  textAlign(CENTER, CENTER);
  textSize(17);
  text(zoneText + '   ·   phase ' + Math.min(z.phaseIndex + 1, z.phases.length) + '/' + z.phases.length, width / 2, pad + 22);

  // légende du mode debug (touche D)
  if (S.debug) {
    const dw = Math.min(480, width - 2 * pad);
    drawPanel(width / 2 - dw / 2, pad + 52, dw, 36);
    fill(GLAM.ink);
    textAlign(CENTER, CENTER);
    fitText('DEBUG (D) : Wander rouge = centre, vert = cible · violet = capteurs de piste', width / 2, pad + 71, dw - 24, 15);
  }

  // minimap
  const mm = Math.min(160, width * 0.26);
  drawMinimap(w, width - mm - pad, pad, mm, p);

  // journal d'éliminations
  let ky = pad + 90;
  textAlign(LEFT, CENTER);
  textSize(14);
  for (const k of w.killFeed.slice(-4)) {
    if (w.frame - k.frame > 700) continue;
    const msg = k.byZone ? k.victim + ' a été emportée par la zone' : k.killer + ' ✦ ' + k.victim;
    const tw = textWidth(msg) + 20;
    fill(255, 255, 255, 190);
    rect(pad, ky, tw, 24, 12);
    fill(GLAM.ink);
    text(msg, pad + 10, ky + 13);
    ky += 28;
  }

  // barres de la joueuse
  if (p && p.alive) {
    const bw = Math.min(340, width - 2 * pad);
    const bx = width / 2 - bw / 2;
    const by = height - 112;
    drawPanel(bx - 14, by - 12, bw + 28, 100);
    drawBar(bx, by, bw, 20, p.hp / p.maxHp, GLAM.pink, 'Glow  ' + Math.ceil(p.hp) + ' / ' + p.maxHp);
    drawBar(bx, by + 28, bw, 16, p.shield / p.maxShield, GLAM.shield, 'Bouclier  ' + Math.ceil(p.shield));
    fill(GLAM.ink);
    textAlign(LEFT, CENTER);
    textSize(14);
    text(p.weapon.name + '   ·   ' + p.ammo + ' munitions', bx, by + 62);
    textAlign(RIGHT, CENTER);
    text(WEAPON_KEYS.map((k, i) => (p.owned.has(k) ? '[' + (i + 1) + ']' : ' · ')).join(' '), bx + bw, by + 62);
  } else if (p) {
    const msg = 'Éliminée (#' + p.placement + ')  ·  Espace : accélérer  ·  R : rejouer';
    drawPanel(width / 2 - 250, height - 70, 500, 46);
    fill(GLAM.ink);
    textAlign(CENTER, CENTER);
    textSize(16);
    text(msg, width / 2, height - 46);
  }

  // cerveau de la bot observée
  if (S.showBrain && S.brainFocus && S.brainFocus.decision) {
    const b = S.brainFocus;
    const bx = pad;
    const by = height - 252;
    drawPanel(bx, by, 262, 236);
    fill(GLAM.ink);
    textAlign(LEFT, CENTER);
    textSize(14);
    text('Cerveau de ' + b.name + ' (réseau de neurones)', bx + 14, by + 18);
    BRAIN_LABELS.forEach(([key, label], i) => {
      drawBar(bx + 14, by + 36 + i * 22, 234, 16, b.decision[key], b.color, label);
    });
    fill(GLAM.ink);
    text('Tir : ' + (b.decision.shoot ? 'oui' : 'non') + '  (' + b.decision.shootRaw.toFixed(2) + ')', bx + 14, by + 176);
    // réflexe explorer/fuir (réseau 3-6-2, apprentissage supervisé)
    if (b.reflex) {
      const r = b.reflex;
      fill(r.flee ? GLAM.hotPink : GLAM.ink);
      text('Réflexe 3-6-2 : ' + (r.flee ? 'FUIR' : 'explorer') + '  (' + r.pFlee.toFixed(2) + ')', bx + 14, by + 196);
      fill(GLAM.ink);
      textSize(12);
      text('menace ' + r.inputs[0].toFixed(2) + ' · approche ' + (r.inputs[1] >= 0 ? '+' : '') + r.inputs[1].toFixed(2) +
        ' · vitesse ' + r.inputs[2].toFixed(2), bx + 14, by + 215);
    }
  }

  // génération
  fill(GLAM.ink);
  textAlign(RIGHT, CENTER);
  textSize(14);
  const gen = S.pretrainedGen + S.evo.generation;
  text('Évolution des bots · génération ' + gen, width - pad, height - 18);

  drawToasts(S);
  pop();
}

function drawToasts(S) {
  let y = 76;
  for (const t of S.toasts) {
    push();
    drawingContext.globalAlpha = clampValue(t.life / 30, 0, 1);
    textSize(18);
    const tw = textWidth(t.text) + 36;
    fill(255, 255, 255, 235);
    stroke(t.color);
    strokeWeight(3);
    rect(width / 2 - tw / 2, y + 40, tw, 34, 17);
    noStroke();
    fill(GLAM.ink);
    textAlign(CENTER, CENTER);
    text(t.text, width / 2, y + 58);
    pop();
    y += 40;
  }
}

/** Écran d'accueil par-dessus une démonstration de bots. */
function drawMenu(S) {
  push();
  noStroke();
  fill(224, 208, 255, 150);
  rect(0, 0, width, height);
  for (let i = 0; i < 40; i++) {
    const x = (((i * 7919) % 1000) / 1000) * width;
    const y = (((i * 104729) % 1000) / 1000) * height;
    fill(255, 255, 255, 120 + 100 * Math.sin(frameCount * 0.05 + i));
    starShape(x, y, 2, 8, 4);
  }
  const cx = width / 2;
  const bob = Math.sin(frameCount * 0.04) * 6;
  glamText('GLAM ROYALE', cx, height * 0.17 + bob, Math.min(width * 0.1, 96), '#ffffff', GLAM.hotPink);
  glamText('le battle royale girly aux bots à réseaux de neurones', cx, height * 0.17 + 62 + bob, Math.min(width * 0.032, 22), '#ffffff', GLAM.ink);

  const pw = Math.min(620, width - 32);
  const ph = 318;
  const px = cx - pw / 2;
  const py = height * 0.17 + 100;
  drawPanel(px, py, pw, ph, 0.9);
  fill(GLAM.ink);
  textAlign(CENTER, CENTER);
  textSize(Math.min(20, width * 0.045));
  const lines = [
    ['OBJECTIF : être la dernière en vie !', GLAM.hotPink],
    ['Ramasse du butin, tire sur les 11 bots, reste hors du nuage rose (il fait perdre du glow).', GLAM.ink],
    ['Entrée ou clic : jouer  ·  W : regarder les bots  ·  T : entraîner les réseaux', GLAM.hotPink],
    ['Flèches ou Z Q S E : bouger  ·  Souris : viser  ·  Clic ou Espace : tirer', GLAM.ink],
    ['1 2 3 : arme  ·  N : cerveau  ·  D : debug  ·  F : phéromones  ·  M : son  ·  P : pause', GLAM.ink],
    ['Cerveaux pré-entraînés · génération ' + (S.pretrainedGen + S.evo.generation), GLAM.ink],
  ];
  lines.forEach(([t, c], i) => {
    fill(c);
    fitText(t, cx, py + 34 + i * 46, pw - 28, i === 0 ? 28 : 17);
  });
  pop();
}

/** Écran de fin de partie : résultat, statistiques, classement, évolution des bots. */
function drawEnd(S) {
  const w = S.world;
  const p = w.player;
  push();
  noStroke();
  fill(224, 208, 255, 140);
  rect(0, 0, width, height);
  const cx = width / 2;
  const pw = Math.min(560, width - 32);
  const ph = 430;
  const py = Math.max(16, height / 2 - ph / 2);
  drawPanel(cx - pw / 2, py, pw, ph, 0.94);

  let title;
  if (p) title = p.placement === 1 ? '♛ VICTOIRE ROYALE ! ♛' : 'Éliminée · #' + p.placement + ' sur ' + w.fighters.length;
  else title = w.winner ? 'Gagnante : ' + w.winner.name : 'Match nul';
  glamText(title, cx, py + 46, Math.min(34, width * 0.07), p && p.placement === 1 ? '#ffd166' : '#ffffff', GLAM.hotPink);

  fill(GLAM.ink);
  textAlign(CENTER, CENTER);
  textSize(16);
  const me = p || w.winner;
  if (me) {
    fitText('Éliminations ' + me.kills + '   ·   Dégâts ' + Math.round(me.damageDealt) + '   ·   Butin ' + me.lootCount +
      '   ·   Survie ' + formatTime(me.survivalFrames), cx, py + 90, pw - 28, 16);
  }
  textSize(15);
  text('Classement', cx, py + 128);
  textAlign(LEFT, CENTER);
  w.rankings.slice(0, 6).forEach((f, i) => {
    const y = py + 156 + i * 28;
    fill(f.color);
    stroke(255);
    strokeWeight(2);
    circle(cx - pw / 2 + 48, y, 18);
    noStroke();
    fill(GLAM.ink);
    text('#' + f.placement + '  ' + f.name + (f.isPlayer ? '  (toi)' : '') + '  ·  ' + f.kills + ' élim.', cx - pw / 2 + 68, y);
  });
  textAlign(CENTER, CENTER);
  fill(GLAM.hotPink);
  textSize(15);
  const info = S.endInfo;
  if (info) fitText('Les bots ont évolué : génération ' + info.generation + ' · meilleure fitness ' + Math.round(info.bestFitness), cx, py + 344, pw - 28, 15);
  fill(GLAM.ink);
  fitText('R ou Entrée : rejouer  ·  Échap : menu  ·  T : entraîner', cx, py + 384, pw - 28, 15);
  pop();
}
