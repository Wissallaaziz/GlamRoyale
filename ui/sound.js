/**
 * Effets sonores synthétisés avec l'API Web Audio (aucun fichier audio, aucune dépendance).
 * Le contexte audio ne peut démarrer qu'après un geste de la joueuse : Sfx.init() est
 * appelé au premier clic ou à la première touche.
 */
const Sfx = {
  ctx: null,
  muted: false,

  init() {
    try {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    } catch (e) { /* pas de son : le jeu continue */ }
  },

  toggleMute() { this.muted = !this.muted; return this.muted; },

  /** Joue une note : fréquence (Hz), durée (s), forme d'onde, volume, glissando, délai. */
  tone(freq, dur = 0.12, type = 'sine', vol = 0.06, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    try {
      const t0 = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(this.ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch (e) { /* ignoré */ }
  },

  shot(kind, v = 1) {
    if (kind === 'heart') this.tone(520, 0.18, 'triangle', 0.07 * v, 880);
    else if (kind === 'confetti') this.tone(300, 0.12, 'sawtooth', 0.04 * v, 120);
    else this.tone(700, 0.09, 'sine', 0.06 * v, 1200);
  },
  hit(v = 1) { this.tone(220, 0.14, 'square', 0.05 * v, 110); },
  pickup() { this.tone(880, 0.08, 'sine', 0.06); this.tone(1320, 0.12, 'sine', 0.06, null, 0.07); },
  kill(v = 1) { this.tone(440, 0.25, 'triangle', 0.08 * v, 110); },
  zone() { this.tone(160, 0.2, 'sawtooth', 0.04, 90); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.08, null, i * 0.12)); },
  lose() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.26, 'triangle', 0.07, null, i * 0.14)); },
};
