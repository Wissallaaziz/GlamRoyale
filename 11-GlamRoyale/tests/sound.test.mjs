import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ui/sound.js est un script de navigateur : on le charge avec un AudioContext factice qui
// enregistre ce qui est créé, démarré et arrêté. Le signal audio réel n'est pas mesuré ici
// (voir le README : validation d'intégration dans le navigateur).
const here = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(here, '..', 'ui', 'sound.js'), 'utf8');

class FakeAudioContext {
  static created = [];
  constructor() {
    this.currentTime = 0;
    this.state = 'running';
    this.destination = {};
    this.oscillators = [];
    this.resumed = 0;
    FakeAudioContext.created.push(this);
  }
  createOscillator() {
    const osc = {
      type: '', started: null, stopped: null,
      frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect() {},
      start(t) { this.started = t; },
      stop(t) { this.stopped = t; },
    };
    this.oscillators.push(osc);
    return osc;
  }
  createGain() {
    return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
  }
  resume() { this.resumed++; }
}

function freshSfx(win = { AudioContext: FakeAudioContext }) {
  FakeAudioContext.created.length = 0;
  return new Function('window', code + '\n;return Sfx;')(win);
}

test('avant le premier geste de la joueuse (init), aucun son et aucune erreur', () => {
  const Sfx = freshSfx();
  Sfx.tone(440);
  Sfx.shot('bubble');
  assert.equal(Sfx.ctx, null);
  assert.equal(FakeAudioContext.created.length, 0);
});

test('init crée un seul contexte, même appelée plusieurs fois, et le reprend s\'il est suspendu', () => {
  const Sfx = freshSfx();
  Sfx.init();
  Sfx.init();
  assert.equal(FakeAudioContext.created.length, 1);
  Sfx.ctx.state = 'suspended';
  Sfx.init();
  assert.equal(Sfx.ctx.resumed, 1);
});

test('init sans Web Audio ne lève pas d\'erreur', () => {
  const Sfx = freshSfx({});
  Sfx.init();
  assert.equal(Sfx.ctx, null);
  Sfx.pickup();
});

test('tone démarre un oscillateur et l\'arrête après sa durée (aucune source ne reste active)', () => {
  const Sfx = freshSfx();
  Sfx.init();
  Sfx.tone(440, 0.2, 'sine', 0.05, null, 0.1);
  const [osc] = Sfx.ctx.oscillators;
  assert.equal(osc.started, 0.1);
  assert.ok(osc.stopped > osc.started + 0.19);
});

test('les jingles jouent le bon nombre de notes et arrêtent chacune d\'elles', () => {
  const Sfx = freshSfx();
  Sfx.init();
  Sfx.win();
  assert.equal(Sfx.ctx.oscillators.length, 4);
  Sfx.lose();
  assert.equal(Sfx.ctx.oscillators.length, 7);
  for (const osc of Sfx.ctx.oscillators) assert.ok(osc.stopped !== null && osc.stopped > osc.started);
});

test('couper le son : plus aucun oscillateur créé ; le rétablir rejoue', () => {
  const Sfx = freshSfx();
  Sfx.init();
  assert.equal(Sfx.toggleMute(), true);
  Sfx.shot('heart');
  Sfx.hit();
  Sfx.kill();
  assert.equal(Sfx.ctx.oscillators.length, 0);
  assert.equal(Sfx.toggleMute(), false);
  Sfx.hit();
  assert.equal(Sfx.ctx.oscillators.length, 1);
});

test('chaque arme a un son distinct', () => {
  const Sfx = freshSfx();
  Sfx.init();
  const types = new Set();
  for (const kind of ['bubble', 'heart', 'confetti']) {
    Sfx.shot(kind);
    types.add(Sfx.ctx.oscillators[Sfx.ctx.oscillators.length - 1].type);
  }
  assert.equal(types.size, 3);
});
