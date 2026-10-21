import { clamp } from '../util/math';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  gravity: number;
  text?: string;
  textScale?: number;
}

/** A tiny pooled-ish particle system: sparks, dust and floating text. */
export class Particles {
  private items: Particle[] = [];

  clear(): void {
    this.items.length = 0;
  }

  private push(p: Particle): void {
    if (this.items.length > 340) {
      this.items.shift();
    }
    this.items.push(p);
  }

  burst(x: number, y: number, color: string, count = 10, speed = 180): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.3 + Math.random() * 0.3,
        maxLife: 0.6,
        size: 2 + Math.random() * 3,
        color,
        gravity: 60,
      });
    }
  }

  ring(x: number, y: number, color: string, count = 14, speed = 220): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      this.push({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.4,
        maxLife: 0.4,
        size: 3,
        color,
        gravity: 0,
      });
    }
  }

  puff(x: number, y: number, color: string): void {
    for (let i = 0; i < 5; i++) {
      this.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 40,
        vy: -20 - Math.random() * 30,
        life: 0.5,
        maxLife: 0.5,
        size: 5 + Math.random() * 6,
        color,
        gravity: -30,
      });
    }
  }

  text(x: number, y: number, value: string, color: string, scale = 1): void {
    this.push({
      x,
      y,
      vx: 0,
      vy: -42,
      life: 0.9,
      maxLife: 0.9,
      size: 1,
      color,
      gravity: 0,
      text: value,
      textScale: scale,
    });
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.6;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.items) {
      const t = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = t;
      if (p.text) {
        ctx.fillStyle = p.color;
        ctx.font = `bold ${Math.round(14 * (p.textScale ?? 1))}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 3;
        ctx.strokeText(p.text, p.x, p.y);
        ctx.fillText(p.text, p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.4 + t * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
