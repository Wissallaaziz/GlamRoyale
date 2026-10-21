/**
 * Particules décoratives : étincelles, cœurs, confettis. Purement visuel : rien ici
 * n'influence la logique du jeu.
 */
class ParticleSystem {
  constructor(max = 500) {
    this.list = [];
    this.max = max;
  }

  /** Explosion de n particules autour de (x, y). shape : 'circle' | 'star' | 'heart'. */
  burst(x, y, color, n = 12, speed = 3, life = 32, shape = 'circle') {
    for (let i = 0; i < n && this.list.length < this.max; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.list.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.3,
        life, maxLife: life, size: 3 + Math.random() * 4, color, shape,
        spin: (Math.random() - 0.5) * 0.3, rot: Math.random() * 6,
      });
    }
  }

  /** Une seule étincelle qui monte doucement. */
  sparkle(x, y, color = '#ffffff') {
    if (this.list.length >= this.max) return;
    this.list.push({ x, y, vx: (Math.random() - 0.5) * 0.4, vy: -0.4 - Math.random() * 0.4, life: 40, maxLife: 40,
      size: 3 + Math.random() * 3, color, shape: 'star', spin: 0.1, rot: 0 });
  }

  update() {
    for (const p of this.list) {
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.rot += p.spin;
      p.life--;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  draw() {
    const ctx = drawingContext;
    noStroke();
    for (const p of this.list) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      fill(p.color);
      const s = p.size * (0.6 + 0.4 * (p.life / p.maxLife));
      if (p.shape === 'star') {
        push(); translate(p.x, p.y); rotate(p.rot); starShape(0, 0, s * 0.45, s, 4); pop();
      } else if (p.shape === 'heart') {
        heartPath(p.x, p.y, s * 1.4);
      } else {
        circle(p.x, p.y, s);
      }
    }
    ctx.globalAlpha = 1;
  }
}
