/**
 * Rendu p5.js du monde : île, obstacles, butin, zone, combattantes, projectiles, minimap.
 * Aucune logique de jeu ici : on ne fait que lire l'état de GameWorld.
 */

// ------------------------------------------------------------------ formes de base

/** Cœur centré en (x, y), de taille s. */
function heartPath(x, y, s) {
  beginShape();
  vertex(x, y + s * 0.4);
  bezierVertex(x - s, y - s * 0.1, x - s * 0.5, y - s * 0.95, x, y - s * 0.35);
  bezierVertex(x + s * 0.5, y - s * 0.95, x + s, y - s * 0.1, x, y + s * 0.4);
  endShape(CLOSE);
}

/** Étoile à n branches. */
function starShape(x, y, r1, r2, n) {
  beginShape();
  for (let i = 0; i < n * 2; i++) {
    const a = (i * Math.PI) / n - Math.PI / 2;
    const r = i % 2 === 0 ? r2 : r1;
    vertex(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  endShape(CLOSE);
}

/** Texte avec contour (lisible sur n'importe quel fond). */
function glamText(str, x, y, size, fillCol = '#ffffff', strokeCol = GLAM.ink, align = CENTER) {
  push();
  textAlign(align, CENTER);
  textSize(size);
  stroke(strokeCol);
  strokeJoin(ROUND); // évite les pointes aux angles des lettres
  strokeWeight(Math.max(2, size * 0.16));
  fill(fillCol);
  text(str, x, y);
  pop();
}

/** Texte centré en (x, y) dont la taille diminue jusqu'à tenir dans maxW pixels. */
function fitText(str, x, y, maxW, size) {
  textSize(size);
  while (size > 10 && textWidth(str) > maxW) {
    size -= 1;
    textSize(size);
  }
  text(str, x, y);
}

// ----------------------------------------------------------------- debug Wander

/**
 * Mode debug (touche D) : dessine le Wander d'une bot comme dans les exercices du cours.
 * Point rouge = centre du cercle (devant la bot), cercle = rayon de Wander, point vert =
 * cible sur le cercle, ligne = direction de la force. Ne fait que LIRE f.wanderDebug().
 * Couleurs adaptées au fond clair de l'île (le cours dessine en blanc sur fond sombre).
 */
function drawWanderDebug(f) {
  const g = f.wanderDebug();
  push();
  noFill();
  stroke(91, 42, 94, 200);
  strokeWeight(2);
  circle(g.center.x, g.center.y, g.radius * 2);
  drawingContext.setLineDash([5, 10]);
  stroke(91, 42, 94, 130);
  line(f.pos.x, f.pos.y, g.center.x, g.center.y);
  drawingContext.setLineDash([]);
  stroke(224, 138, 0);
  strokeWeight(2);
  line(f.pos.x, f.pos.y, g.target.x, g.target.y);
  stroke(255);
  strokeWeight(2);
  fill(230, 30, 60);
  circle(g.center.x, g.center.y, 10);
  fill(0, 170, 70);
  circle(g.target.x, g.target.y, 16);
  pop();
}

// ------------------------------------------------------------------------- phéromones

/**
 * Traînées de paillettes = champ de phéromones. Une tache douce par case concernée (de la
 * lavande vers le rose quand la concentration monte) et une petite étoile qui scintille sur
 * les pistes les plus fortes. Lit le champ, ne le modifie pas.
 */
function drawPheromones(field, view) {
  const r = field.cellRange(view.x, view.y, view.x + view.w, view.y + view.h);
  const cs = field.cellSize;
  push();
  noStroke();
  for (let j = r.j0; j <= r.j1; j++) {
    for (let i = r.i0; i <= r.i1; i++) {
      const v = field.cell(i, j);
      if (v < 0.06) continue;
      const k = clampValue(v / field.saturation, 0, 1);
      const c = field.cellCenter(i, j);
      fill(196 + 59 * k, 170 - 91 * k, 255 - 92 * k, 28 + 105 * k);
      circle(c.x, c.y, cs * (0.75 + 0.5 * k));
      if (k > 0.45) {
        fill(255, 255, 255, 120 + 110 * Math.sin(frameCount * 0.08 + i * 1.7 + j * 2.3));
        starShape(c.x, c.y, 2, 5 + 4 * k, 4);
      }
    }
  }
  pop();
}

/**
 * Debug des phéromones (touche D) : les 3 capteurs de la bot (violet, plus gros quand le signal
 * est fort) et la ligne vers le capteur suivi. Lit f.perceived.trail, ne refait aucun calcul.
 */
function drawTrailDebug(f) {
  const t = f.perceived && f.perceived.trail;
  if (!t) return;
  push();
  if (t.bestValue >= 0.05) {
    stroke(140, 80, 210, 200);
    strokeWeight(2);
    line(f.pos.x, f.pos.y, t.points[t.best].x, t.points[t.best].y);
  }
  stroke(255);
  strokeWeight(2);
  t.points.forEach((p, i) => {
    fill(140, 80, 210, i === t.best && t.bestValue >= 0.05 ? 255 : 120);
    circle(p.x, p.y, 8 + 12 * clampValue(t.values[i] / 2, 0, 1));
  });
  pop();
}

// ------------------------------------------------------------------------ décor

/** Décor de l'île (fleurs, taches de couleur), généré une fois à partir d'une graine. */
function makeDecor(radius, seed) {
  const rng = makeRng(seed);
  const blobs = [];
  const dots = [];
  for (let i = 0; i < 26; i++) {
    const r = 80 + rng() * 160;
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * Math.max(0, radius - r);
    blobs.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r, c: rng() < 0.5 ? GLAM.mint : GLAM.lavender });
  }
  const palette = ['#ffffff', '#ffc2e2', '#d9c8ff', '#bff0dd'];
  for (let i = 0; i < 420; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * radius * 0.97;
    dots.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 3 + rng() * 4, c: palette[Math.floor(rng() * palette.length)], kind: rng() < 0.5 ? 0 : 1 });
  }
  return { blobs, dots };
}

/** view = {x, y, w, h} : rectangle visible en coordonnées monde. */
function inView(view, x, y, margin = 80) {
  return x > view.x - margin && x < view.x + view.w + margin && y > view.y - margin && y < view.y + view.h + margin;
}

function drawIsland(radius, decor, view) {
  noStroke();
  fill(GLAM.beach);
  circle(0, 0, (radius + 70) * 2);
  fill(GLAM.ground);
  circle(0, 0, radius * 2);
  for (const b of decor.blobs) {
    if (!inView(view, b.x, b.y, b.r)) continue;
    fill(rgba(b.c, 0.6));
    circle(b.x, b.y, b.r * 2);
  }
  for (const d of decor.dots) {
    if (!inView(view, d.x, d.y, 20)) continue;
    fill(d.c);
    if (d.kind === 0) circle(d.x, d.y, d.r * 2);
    else starShape(d.x, d.y, d.r * 0.4, d.r * 1.3, 4);
  }
  noFill();
  stroke(255, 255, 255, 150);
  strokeWeight(8);
  circle(0, 0, (radius + 75) * 2 + Math.sin(frameCount * 0.03) * 10);
  noStroke();
}

// -------------------------------------------------------------------- obstacles

function drawObstacle(o) {
  push();
  translate(o.pos.x, o.pos.y);
  noStroke();
  fill(90, 40, 120, 40);
  ellipse(6, 9, o.r * 2.1, o.r * 1.9);
  if (o.kind === 'tree') {
    fill('#7fdcb5'); circle(0, 0, o.r * 2);
    fill('#9ff0cd'); circle(-o.r * 0.15, -o.r * 0.15, o.r * 1.45);
    fill('#c8fae6'); circle(-o.r * 0.32, -o.r * 0.32, o.r * 0.6);
    for (let i = 0; i < 5; i++) {
      const a = o.seed * 6.28 + i * 1.2566;
      const x = Math.cos(a) * o.r * 0.55;
      const y = Math.sin(a) * o.r * 0.55;
      fill('#ff9fcf'); circle(x, y, o.r * 0.3);
      fill('#ffffff'); circle(x, y, o.r * 0.1);
    }
  } else if (o.kind === 'rock') {
    fill('#cdbdf5'); stroke('#a995e6'); strokeWeight(3);
    beginShape();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = o.r * (0.86 + 0.14 * Math.sin(i * 2.3 + o.seed * 10));
      vertex(Math.cos(a) * r, Math.sin(a) * r);
    }
    endShape(CLOSE);
    noStroke();
    fill(255, 255, 255, 120); circle(-o.r * 0.3, -o.r * 0.3, o.r * 0.55);
  } else {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + o.seed * 3;
      fill(i % 2 ? '#ffb3e0' : '#ffd1ee');
      stroke('#ff8fc7'); strokeWeight(2);
      beginShape();
      vertex(0, 0);
      vertex(Math.cos(a - 0.42) * o.r * 0.7, Math.sin(a - 0.42) * o.r * 0.7);
      vertex(Math.cos(a) * o.r, Math.sin(a) * o.r);
      vertex(Math.cos(a + 0.42) * o.r * 0.7, Math.sin(a + 0.42) * o.r * 0.7);
      endShape(CLOSE);
    }
    noStroke();
    fill(255, 255, 255, 190); circle(-o.r * 0.12, -o.r * 0.12, o.r * 0.4);
  }
  pop();
}

// ------------------------------------------------------------------------ butin

function drawLoot(l, t) {
  const bob = Math.sin(t * 0.08 + l.phase) * 3;
  const color = LOOT_TYPES[l.type].color;
  push();
  translate(l.pos.x, l.pos.y + bob);
  noStroke();
  fill(rgba(color, 0.28));
  circle(0, 3 - bob, 34 + Math.sin(t * 0.08 + l.phase) * 3);
  if (l.type === 'shield') {
    fill('#8fd3ff'); stroke('#ffffff'); strokeWeight(2); heartPath(0, 0, 13);
    noStroke(); fill(255, 255, 255, 200); circle(-4, -4, 5);
  } else if (l.type === 'potion') {
    stroke('#ffffff'); strokeWeight(2);
    fill('#ff8fc7'); rect(-7, -3, 14, 14, 5);
    fill('#ffd6ea'); rect(-3, -10, 6, 8, 2);
    fill('#c3a6ff'); rect(-4, -13, 8, 4, 2);
    noStroke(); fill(255, 255, 255, 200); circle(-3, 3, 4);
  } else if (l.type === 'ammo') {
    fill('#ffd166'); stroke('#ffffff'); strokeWeight(2);
    starShape(0, 0, 5, 12, 5);
  } else {
    stroke('#ffffff'); strokeWeight(2);
    noFill(); arc(0, -3, 12, 14, Math.PI, 0);
    fill('#c3a6ff'); rect(-10, -3, 20, 14, 4);
    noStroke(); fill('#ff8fc7'); circle(0, 4, 5);
  }
  pop();
}

// ------------------------------------------------------------------------- zone

function drawZone(world, view) {
  const z = world.zone;
  const ctx = drawingContext;
  ctx.save();
  ctx.beginPath();
  ctx.rect(view.x - 60, view.y - 60, view.w + 120, view.h + 120);
  ctx.arc(z.cx, z.cy, z.radius, 0, Math.PI * 2, true);
  ctx.fillStyle = rgba(GLAM.hotPink, 0.28);
  ctx.fill('evenodd');
  ctx.restore();

  noFill();
  stroke(255, 79, 163, 230); strokeWeight(6); circle(z.cx, z.cy, z.radius * 2);
  stroke(255, 255, 255, 220); strokeWeight(2); circle(z.cx, z.cy, z.radius * 2);

  // paillettes sur le bord du nuage
  noStroke();
  const t = frameCount;
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + t * 0.003;
    const rr = z.radius + Math.sin(t * 0.05 + i * 1.7) * 14;
    const x = z.cx + Math.cos(a) * rr;
    const y = z.cy + Math.sin(a) * rr;
    if (!inView(view, x, y, 20)) continue;
    fill(255, 255, 255, 120 + 110 * Math.sin(t * 0.07 + i));
    starShape(x, y, 2, 7, 4);
  }

  if (!z.finished) {
    ctx.setLineDash([16, 12]);
    noFill();
    stroke(255, 255, 255, 235); strokeWeight(3);
    circle(z.tx, z.ty, z.tr * 2);
    ctx.setLineDash([]);
  }
  noStroke();
}

// ----------------------------------------------------------- combattantes et tirs

function drawFighter(f, isFocus) {
  const r = f.r;
  push();
  translate(f.pos.x, f.pos.y);

  noStroke();
  fill(90, 40, 120, 45);
  ellipse(3, 6, r * 2.1, r * 1.7);

  if (f.shield > 0) {
    noFill(); stroke(143, 211, 255, 170); strokeWeight(3);
    circle(0, 0, r * 2 + 10);
  }
  if (isFocus) {
    noFill(); stroke(255, 255, 255, 200 + 55 * Math.sin(frameCount * 0.15)); strokeWeight(3);
    circle(0, 0, r * 2 + 18);
  }

  // arme
  push();
  rotate(f.aimAngle);
  noStroke();
  fill(f.weaponKey === 'heart' ? '#ff4fa3' : f.weaponKey === 'confetti' ? '#ffd166' : '#8fd3ff');
  stroke('#ffffff'); strokeWeight(2);
  rect(r * 0.5, -3.5, 15, 7, 3);
  pop();

  // corps
  stroke('#ffffff'); strokeWeight(2.5);
  fill(f.color);
  circle(0, 0, r * 2);
  noStroke();
  fill(255, 255, 255, 90);
  circle(-r * 0.3, -r * 0.35, r * 0.7);

  // visage : regarde dans la direction de visée
  const ex = Math.cos(f.aimAngle) * r * 0.32;
  const ey = Math.sin(f.aimAngle) * r * 0.32;
  const px = -Math.sin(f.aimAngle) * r * 0.3;
  const py = Math.cos(f.aimAngle) * r * 0.3;
  fill('#5b2a5e');
  circle(ex + px, ey + py, 4.2);
  circle(ex - px, ey - py, 4.2);
  fill(255, 120, 170, 150);
  circle(ex * 0.6 + px * 1.7, ey * 0.6 + py * 1.7, 4);
  circle(ex * 0.6 - px * 1.7, ey * 0.6 - py * 1.7, 4);

  // nœud rose
  stroke('#ffffff'); strokeWeight(1.5);
  fill(f.isPlayer ? '#ff4fa3' : '#ff8fc7');
  triangle(0, -r - 2, -9, -r - 9, -9, -r + 3);
  triangle(0, -r - 2, 9, -r - 9, 9, -r + 3);
  circle(0, -r - 2, 5);

  if (f.hitFlash > 0) {
    noStroke();
    fill(255, 255, 255, 40 + f.hitFlash * 18);
    circle(0, 0, r * 2 + 2);
  }

  // nom et petite barre de glow
  glamText(f.name, 0, -r - 20, 12, '#ffffff', GLAM.ink);
  if (f.hp < f.maxHp) {
    noStroke();
    fill(255, 255, 255, 190); rect(-17, r + 7, 34, 5, 3);
    fill(f.hp / f.maxHp > 0.35 ? '#ff6fb5' : '#ff3d6e'); rect(-17, r + 7, 34 * (f.hp / f.maxHp), 5, 3);
  }
  pop();
}

function drawBullet(b) {
  push();
  translate(b.pos.x, b.pos.y);
  noStroke();
  if (b.kind === 'heart') {
    fill('#ff4fa3'); stroke('#ffffff'); strokeWeight(1.5);
    heartPath(0, 0, b.r * 1.7);
  } else if (b.kind === 'confetti') {
    rotate(frameCount * 0.3 + b.pos.x);
    const cols = ['#ffd166', '#ff8fc7', '#8fd3ff', '#a5e887'];
    fill(cols[Math.floor(Math.abs(b.pos.x + b.pos.y)) % 4]);
    rect(-3, -2, 6, 4);
  } else {
    fill(190, 230, 255, 120); stroke(255, 255, 255, 230); strokeWeight(1.6);
    circle(0, 0, b.r * 2.2);
    noStroke(); fill(255, 255, 255, 230); circle(-b.r * 0.4, -b.r * 0.4, b.r * 0.7);
  }
  pop();
}

// ---------------------------------------------------------------------- minimap

function drawMinimap(world, x, y, size, focus) {
  const R = world.radius;
  const k = (size / 2 - 6) / R;
  push();
  translate(x + size / 2, y + size / 2);
  noStroke();
  fill(255, 255, 255, 170);
  circle(0, 0, size);
  fill(rgba(GLAM.ground, 1));
  circle(0, 0, R * 2 * k);
  const z = world.zone;
  noFill();
  stroke(255, 79, 163); strokeWeight(2);
  circle(z.cx * k, z.cy * k, z.radius * 2 * k);
  if (!z.finished) {
    drawingContext.setLineDash([4, 3]);
    stroke(255, 255, 255); strokeWeight(1.5);
    circle(z.tx * k, z.ty * k, z.tr * 2 * k);
    drawingContext.setLineDash([]);
  }
  noStroke();
  for (const f of world.fighters) {
    if (!f.alive) continue;
    fill(f.isPlayer ? '#ff4fa3' : '#9a7be0');
    stroke(255); strokeWeight(f.isPlayer ? 2 : 1);
    circle(f.pos.x * k, f.pos.y * k, f.isPlayer ? 9 : 6);
  }
  noStroke();
  noFill();
  stroke(GLAM.panelEdge); strokeWeight(3);
  circle(0, 0, size);
  pop();
}
