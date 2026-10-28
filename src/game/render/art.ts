import { CHICKEN_BY_ID } from '../chickens/chickens';
import type { ChickenDef } from '../chickens/types';
import { DIRS, dirAngle } from '../dir';
import { bossSpecial, type Enemy } from '../enemies/enemies';
import type { Projectile } from '../projectiles/projectiles';
import type { DoorSide } from '../level/roomFormat';
import { clamp } from '../util/math';
import type { PedestalKind } from '../level/tiles';

export interface PlayerVisual {
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  hurtFlash: number;
  inWater: boolean;
  stack: (ChickenDef | null)[];
  /** 0 = ready, 1 = just fired. */
  cooldownFrac: number[];
  /** 0..1 kick outward. */
  recoil: number[];
}

function shadow(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, alpha = 0.3): void {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** A small chicken drawn facing local "up" (-y), then rotated to a direction. */
function chickenBody(
  ctx: CanvasRenderingContext2D,
  def: ChickenDef,
  time: number,
  wobble: number,
): void {
  // Body
  const grad = ctx.createRadialGradient(-3, -4, 2, 0, 2, 13);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.5, def.color);
  grad.addColorStop(1, def.accent);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(0, 2, 9, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wing
  ctx.fillStyle = def.accent;
  ctx.beginPath();
  ctx.ellipse(0, 3, 5.5, 6.5, 0.2 + wobble * 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.fillStyle = def.color;
  ctx.beginPath();
  ctx.arc(0, -6, 6, 0, Math.PI * 2);
  ctx.fill();
  // Comb
  ctx.fillStyle = '#d24235';
  ctx.beginPath();
  ctx.arc(-2.2, -11, 2.2, 0, Math.PI * 2);
  ctx.arc(0.8, -11.6, 2.4, 0, Math.PI * 2);
  ctx.fill();
  // Beak pointing outward (up)
  ctx.fillStyle = '#f2b24a';
  ctx.beginPath();
  ctx.moveTo(-2.2, -8.5);
  ctx.lineTo(2.2, -8.5);
  ctx.lineTo(0, -13.5);
  ctx.closePath();
  ctx.fill();
  // Eye
  ctx.fillStyle = '#20181a';
  ctx.beginPath();
  ctx.arc(-2.4, -7, 1.1, 0, Math.PI * 2);
  ctx.arc(2.4, -7, 1.1, 0, Math.PI * 2);
  ctx.fill();
  // Comb tag so rare chickens read at a glance.
  if (def.rarity === 'rare') {
    ctx.fillStyle = 'rgba(255, 230, 120, 0.9)';
    ctx.beginPath();
    ctx.arc(0, 9, 1.6 + Math.sin(time * 5) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawChickenOnRing(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  def: ChickenDef,
  ready: number,
  recoil: number,
  time: number,
): void {
  const out = recoil * 7;
  const px = cx + Math.cos(angle) * out;
  const py = cy + Math.sin(angle) * out;
  const drift = 0;

  shadow(ctx, cx, cy + 8, 8, 3.5, 0.18);

  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(angle + Math.PI / 2);
  ctx.scale(1 + recoil * 0.18, 1 - recoil * 0.14);
  chickenBody(ctx, def, time, drift);
  ctx.restore();

  if (ready < 1) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 13, -Math.PI / 2, -Math.PI / 2 + (1 - ready) * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawEmptySlot(ctx: CanvasRenderingContext2D, cx: number, cy: number, time: number): void {
  ctx.save();
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = `rgba(255, 255, 255, ${0.14 + Math.sin(time * 2 + cx) * 0.05})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, 9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Every chicken in the stack sits on the player's position, stacked on top of
 * each other. The keeper sprite is not drawn; the chickens are the player.
 */
const FORMATION: Record<number, { x: number; y: number }> = {
  0: { x: 0, y: 0 },
  1: { x: 0, y: 0 },
  2: { x: 0, y: 0 },
  3: { x: 0, y: 0 },
};

export function drawPlayer(ctx: CanvasRenderingContext2D, v: PlayerVisual, time: number): void {
  for (const i of [0, 1, 2, 3]) {
    const def = v.stack[i] ?? null;
    const dir = DIRS[i]!;
    const angle = dirAngle(dir);
    const cx = v.x + FORMATION[i]!.x;
    const cy = v.y + FORMATION[i]!.y;
    if (def) {
      drawChickenOnRing(ctx, cx, cy, angle, def, v.cooldownFrac[i] ?? 1, v.recoil[i] ?? 0, time);
    } else {
      drawEmptySlot(ctx, cx, cy, time);
    }
  }

  if (v.hurtFlash > 0) {
    ctx.save();
    ctx.globalAlpha = clamp(v.hurtFlash * 3, 0, 0.55);
    ctx.fillStyle = '#ff5a45';
    ctx.beginPath();
    ctx.arc(v.x, v.y, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawEyes(ctx: CanvasRenderingContext2D, fx: number, fy: number, r: number, color = '#20181a'): void {
  const lookX = clamp(fx, -1, 1) * 1.6;
  const lookY = clamp(fy, -1, 1) * 1.4;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(-r + lookX, lookY, Math.max(1, r * 0.5), 0, Math.PI * 2);
  ctx.arc(r + lookX, lookY, Math.max(1, r * 0.5), 0, Math.PI * 2);
  ctx.fill();
}

function drawQuadruped(ctx: CanvasRenderingContext2D, e: Enemy, time: number, earStyle: 'cat' | 'fox' | 'dog' | 'crow'): void {
  const { color, accent } = e.def;
  const r = e.r;
  ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : color;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.ellipse(0, 2, r, r * 0.82, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Tail
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-r * 0.7, 2);
  if (earStyle === 'fox') {
    ctx.quadraticCurveTo(-r * 1.9, -r * 0.4 + Math.sin(time * 6) * 2, -r * 2.2, r * 0.6);
  } else {
    ctx.quadraticCurveTo(-r * 1.6, r * 0.2 + Math.sin(time * 7) * 2, -r * 1.7, r * 0.9);
  }
  ctx.stroke();

  // Head
  ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : color;
  ctx.beginPath();
  ctx.arc(0, -r * 0.72, r * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Ears
  ctx.fillStyle = accent;
  if (earStyle === 'cat' || earStyle === 'fox') {
    const tall = earStyle === 'fox' ? 1.3 : 1;
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, -r * 1.1);
    ctx.lineTo(-r * 0.24, -r * (1.1 + 0.7 * tall));
    ctx.lineTo(-r * 0.02, -r * 1.05);
    ctx.closePath();
    ctx.moveTo(r * 0.5, -r * 1.1);
    ctx.lineTo(r * 0.24, -r * (1.1 + 0.7 * tall));
    ctx.lineTo(r * 0.02, -r * 1.05);
    ctx.closePath();
    ctx.fill();
  } else if (earStyle === 'dog') {
    ctx.beginPath();
    ctx.ellipse(-r * 0.55, -r * 0.75, r * 0.22, r * 0.42, -0.3, 0, Math.PI * 2);
    ctx.ellipse(r * 0.55, -r * 0.75, r * 0.22, r * 0.42, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  drawEyes(ctx, e.facingX, e.facingY, r * 0.24);

  // Snout
  ctx.fillStyle = earStyle === 'fox' ? '#f4e2c8' : accent;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.42, r * 0.2, r * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Shared drawing for the floor bosses. Each one has a body and one signature
 * feature so the bosses read as different creatures at a glance.
 */
function drawBossSilhouette(ctx: CanvasRenderingContext2D, e: Enemy, time: number): void {
  const { id, color, accent } = e.def;
  const r = e.r;
  const flap = Math.sin(time * 6) * 0.3;
  ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : color;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;

  switch (id) {
    case 'vulture':
    case 'hawk': {
      // Wide wings, hooked beak.
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.ellipse(-r * 1.1, 0, r * 1.2, r * 0.45, -flap, 0, Math.PI * 2);
      ctx.ellipse(r * 1.1, 0, r * 1.2, r * 0.45, flap, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : color;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.8, r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2b24a';
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.7);
      ctx.quadraticCurveTo(0, -r * 1.25, r * 0.2, -r * 0.7);
      ctx.fill();
      drawEyes(ctx, e.facingX, e.facingY, r * 0.22, '#ffe066');
      return;
    }
    case 'cassowary': {
      // Tall body with a helmet crest and a dagger-like claw.
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.9, r * 1.1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.1);
      ctx.lineTo(-r * 0.3, -r * 1.7);
      ctx.lineTo(r * 0.3, -r * 1.7);
      ctx.closePath();
      ctx.fill();
      drawEyes(ctx, e.facingX, e.facingY, r * 0.2, '#ffe066');
      return;
    }
    case 'wolf':
    case 'lion': {
      // Four-legged body, pointed ears, and a mane ring for the lion.
      if (id === 'lion') {
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = e.hitFlash > 0 ? '#ffffff' : color;
      }
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.6);
      ctx.lineTo(-r * 0.35, -r * 1.2);
      ctx.lineTo(-r * 0.1, -r * 0.7);
      ctx.moveTo(r * 0.6, -r * 0.6);
      ctx.lineTo(r * 0.35, -r * 1.2);
      ctx.lineTo(r * 0.1, -r * 0.7);
      ctx.fill();
      drawEyes(ctx, e.facingX, e.facingY, r * 0.22, '#ffe066');
      return;
    }
    case 'bear': {
      // Round, heavy body with rounded ears.
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(-r * 0.7, -r * 0.7, r * 0.3, 0, Math.PI * 2);
      ctx.arc(r * 0.7, -r * 0.7, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      drawEyes(ctx, e.facingX, e.facingY, r * 0.2);
      return;
    }
    case 'croc':
    case 'tyrant': {
      // Long jaws with teeth, and a ridged spine for the gators.
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.3, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fffdf0';
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(r * 1.1 + i * 2, -2);
        ctx.lineTo(r * 1.2 + i * 2, 4);
        ctx.lineTo(r * 1.3 + i * 2, -2);
        ctx.fill();
      }
      ctx.fillStyle = accent;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(i * r * 0.35, -r * 0.5, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      drawEyes(ctx, e.facingX, e.facingY, r * 0.2, '#ffe066');
      return;
    }
    case 'shark': {
      // Fin on the back and a wide toothy grin.
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.6);
      ctx.lineTo(r * 0.2, -r * 0.6);
      ctx.lineTo(0, -r * 1.3);
      ctx.fill();
      ctx.fillStyle = '#fffdf0';
      ctx.beginPath();
      ctx.moveTo(r * 0.5, -r * 0.1);
      ctx.lineTo(r * 0.9, 0.1 * r);
      ctx.lineTo(r * 0.5, r * 0.3);
      ctx.fill();
      drawEyes(ctx, e.facingX, e.facingY, r * 0.2, '#ffe066');
      return;
    }
    default:
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      drawEyes(ctx, e.facingX, e.facingY, r * 0.3);
  }
}

function drawEnemyBody(ctx: CanvasRenderingContext2D, e: Enemy, time: number): void {
  const { id } = e.def;
  const { color, accent } = e.def;
  const r = e.r;

  switch (id) {
    case 'cat':
      drawQuadruped(ctx, e, time, 'cat');
      return;
    case 'fox':
      drawQuadruped(ctx, e, time, 'fox');
      return;
    case 'dog':
      drawQuadruped(ctx, e, time, 'dog');
      return;
    case 'rat': {
      ctx.fillStyle = e.hitFlash > 0 ? '#fff' : color;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.ellipse(0, 1, r, r * 0.72, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, 2);
      ctx.quadraticCurveTo(-r * 2.1, 2 + Math.sin(time * 10) * 3, -r * 2.4, -3);
      ctx.stroke();
      ctx.fillStyle = e.hitFlash > 0 ? '#fff' : color;
      ctx.beginPath();
      ctx.arc(0, -r * 0.7, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(-r * 0.4, -r * 1.1, r * 0.26, 0, Math.PI * 2);
      ctx.arc(r * 0.4, -r * 1.1, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
      drawEyes(ctx, e.facingX, e.facingY, r * 0.22);
      return;
    }
    case 'snake': {
      ctx.strokeStyle = e.hitFlash > 0 ? '#fff' : color;
      ctx.lineWidth = r * 0.9;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const t = i / 6;
        const x = -Math.cos(t * Math.PI) * r * 1.6;
        const y = Math.sin(t * Math.PI * 2 + time * 8) * r * 0.5;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = e.hitFlash > 0 ? '#fff' : accent;
      ctx.beginPath();
      ctx.arc(r * 1.5, Math.sin(time * 8) * r * 0.4, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      drawEyes(ctx, e.facingX, e.facingY, r * 0.2, '#ffe066');
      return;
    }
    case 'bat': {
      const flap = Math.sin(time * 16) * 0.5;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-r * 1.8, -r * 0.6 - flap * r, -r * 2.4, flap * r * 0.5);
      ctx.quadraticCurveTo(-r * 1.2, r * 0.2, 0, r * 0.5);
      ctx.closePath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(r * 1.8, -r * 0.6 - flap * r, r * 2.4, flap * r * 0.5);
      ctx.quadraticCurveTo(r * 1.2, r * 0.2, 0, r * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = e.hitFlash > 0 ? '#fff' : color;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      drawEyes(ctx, e.facingX, e.facingY, r * 0.22, '#ffe066');
      return;
    }
    case 'spider': {
      ctx.strokeStyle = e.hitFlash > 0 ? '#fff' : accent;
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI - Math.PI / 2;
        const wig = Math.sin(time * 9 + i) * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3 + wig);
        ctx.moveTo(0, 0);
        ctx.lineTo(-Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3 + wig);
        ctx.stroke();
      }
      ctx.fillStyle = e.hitFlash > 0 ? '#fff' : color;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff6a5a';
      drawEyes(ctx, e.facingX, e.facingY, r * 0.24, '#ff6a5a');
      return;
    }
    case 'crow': {
      const flap = Math.sin(time * 14) * 0.6;
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.2);
      ctx.quadraticCurveTo(-r * 1.6, -r * 0.8 - flap * r, -r * 2, r * 0.3);
      ctx.quadraticCurveTo(-r, r * 0.4, 0, r * 0.3);
      ctx.closePath();
      ctx.moveTo(0, -r * 0.2);
      ctx.quadraticCurveTo(r * 1.6, -r * 0.8 - flap * r, r * 2, r * 0.3);
      ctx.quadraticCurveTo(r, r * 0.4, 0, r * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = e.hitFlash > 0 ? '#fff' : color;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.8, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2b24a';
      ctx.beginPath();
      ctx.moveTo(r * 0.4, -r * 0.1);
      ctx.lineTo(r * 1.1, r * 0.1);
      ctx.lineTo(r * 0.4, r * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.arc(r * 0.2, -r * 0.25, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'slime': {
      const squash = Math.sin(time * 4) * 0.08;
      ctx.fillStyle = e.hitFlash > 0 ? '#fff' : color;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.2, r * (1 + squash), r * (0.85 - squash), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.ellipse(-r * 0.35, -r * 0.2, r * 0.25, r * 0.16, -0.4, 0, Math.PI * 2);
      ctx.fill();
      drawEyes(ctx, e.facingX, e.facingY, r * 0.26);
      return;
    }
    case 'vulture':
    case 'cassowary':
    case 'wolf':
    case 'bear':
    case 'hawk':
    case 'croc':
    case 'lion':
    case 'shark':
    case 'tyrant':
      drawBossSilhouette(ctx, e, time);
      return;
    case 'rooster': {
      // Tail feathers
      ctx.fillStyle = accent;
      for (let i = -2; i <= 2; i++) {
        ctx.save();
        ctx.rotate(i * 0.24);
        ctx.beginPath();
        ctx.ellipse(-r * 1.2, 0, r * 0.9, r * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = e.hitFlash > 0 ? '#fff' : color;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.stroke();
      // Comb
      ctx.fillStyle = '#ff3b30';
      ctx.beginPath();
      ctx.arc(0, -r * 1.05, r * 0.2, 0, Math.PI * 2);
      ctx.arc(-r * 0.3, -r * 1.15, r * 0.22, 0, Math.PI * 2);
      ctx.arc(r * 0.3, -r * 1.15, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2b24a';
      ctx.beginPath();
      ctx.moveTo(-r * 0.2, -r * 0.75);
      ctx.lineTo(r * 0.2, -r * 0.75);
      ctx.lineTo(0, -r * 0.35);
      ctx.closePath();
      ctx.fill();
      drawEyes(ctx, e.facingX, e.facingY, r * 0.3);
      return;
    }
    default: {
      ctx.fillStyle = e.hitFlash > 0 ? '#fff' : color;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      drawEyes(ctx, e.facingX, e.facingY, r * 0.3);
    }
  }
}

export function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, time: number): void {
  shadow(ctx, e.x, e.y + e.r * 0.95, e.r * 0.95, e.r * 0.4, 0.28);
  ctx.save();
  ctx.translate(e.x, e.y);

  if (e.dead) {
    const t = clamp(e.deathTime / 0.55, 0, 1);
    ctx.globalAlpha = 1 - t;
    ctx.scale(1 + t * 0.6, 1 - t * 0.5);
  }
  if (e.slowTime > 0) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#9fe3ff';
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  if (e.poisonTime > 0) {
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#b6e07a';
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawEnemyBody(ctx, e, time);

  // Frozen on room entry: a cold shimmer so the grace reads as intentional.
  if (e.inertTime > 0 && !e.dead) {
    const pulse = 0.5 + Math.sin(time * 8) * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#bfe9ff';
    ctx.beginPath();
    ctx.arc(0, 0, e.r * 1.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.35 + pulse * 0.35;
    ctx.strokeStyle = '#dff4ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (e.hp < e.maxHp && !e.dead) {
    const w = e.r * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-e.r, -e.r - 12, w, 4);
    ctx.fillStyle = e.hp / e.maxHp > 0.35 ? '#8fe3b0' : '#e0614f';
    ctx.fillRect(-e.r, -e.r - 12, w * (e.hp / e.maxHp), 4);
  }

  if (e.mode === 'telegraph' && !e.dead) {
    ctx.fillStyle = '#ff4d3d';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('!', 0, -e.r - 16);
  }

  // Secondary-attack windup: a gold charging ring, plus a strike reticle.
  if (e.mode === 'special' && e.specialPhase === 0 && !e.dead) {
    const pulse = 0.5 + Math.sin(time * 12) * 0.5;
    ctx.save();
    ctx.globalAlpha = 0.35 + pulse * 0.45;
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, e.r + 6 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (bossSpecial(e.def.id).kind === 'strike') {
      const rx = e.specialX - e.x;
      const ry = e.specialY - e.y;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = '#ffe066';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(rx, ry, 18, 0, Math.PI * 2);
      ctx.moveTo(rx - 24, ry);
      ctx.lineTo(rx + 24, ry);
      ctx.moveTo(rx, ry - 24);
      ctx.lineTo(rx, ry + 24);
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();
}

export function drawProjectile(ctx: CanvasRenderingContext2D, p: Projectile, time: number): void {
  if (p.trail) {
    ctx.save();
    ctx.strokeStyle = p.color;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = p.r * 1.2;
    ctx.lineCap = 'round';
    const tx = p.x - Math.cos(p.angle) * p.r * 3.2;
    const ty = p.y - Math.sin(p.angle) * p.r * 3.2;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 2.2);
  glow.addColorStop(0, p.color);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.spin) ctx.rotate(time * 14);
  ctx.fillStyle = p.owner === 'player' ? '#fffdf0' : '#2a0f14';
  ctx.strokeStyle = p.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, p.r * 0.78, p.r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  if (p.crit) {
    ctx.strokeStyle = '#ffd54a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, p.r + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawPedestal(
  ctx: CanvasRenderingContext2D,
  kind: PedestalKind,
  x: number,
  y: number,
  time: number,
  options: { chickenId?: string; price?: number; sold?: boolean; label?: string } = {},
): void {
  const bob = Math.sin(time * 2.4 + x * 0.05) * 4;

  // Base slab
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(x, y + 16, 20, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  const baseGrad = ctx.createLinearGradient(x, y + 4, x, y + 20);
  baseGrad.addColorStop(0, '#6a6355');
  baseGrad.addColorStop(1, '#3c372e');
  ctx.fillStyle = baseGrad;
  roundRect(ctx, x - 17, y + 2, 34, 16, 4);
  ctx.fill();

  ctx.save();
  ctx.globalAlpha = options.sold ? 0.25 : 1;

  if (kind === 'chicken') {
    const def = CHICKEN_BY_ID[options.chickenId ?? 'henny'] ?? CHICKEN_BY_ID['henny']!;
    ctx.save();
    ctx.translate(x, y - 12 + bob);
    ctx.scale(1.5, 1.5);
    chickenBody(ctx, def, time, 0);
    ctx.restore();
    const glow = ctx.createRadialGradient(x, y - 12, 2, x, y - 12, 34);
    glow.addColorStop(0, 'rgba(255, 235, 170, 0.35)');
    glow.addColorStop(1, 'rgba(255, 235, 170, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y - 12, 34, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'feed') {
    ctx.fillStyle = '#c9a227';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 9, y - 10 + Math.sin(a) * 5 + bob, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#e8c65a';
    ctx.beginPath();
    ctx.arc(x, y - 12 + bob, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'perk') {
    const glow = ctx.createRadialGradient(x, y - 12 + bob, 2, x, y - 12 + bob, 24);
    glow.addColorStop(0, '#e6c8ff');
    glow.addColorStop(1, 'rgba(180, 130, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y - 12 + bob, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c489f2';
    ctx.beginPath();
    ctx.arc(x, y - 12 + bob, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    star(ctx, x, y - 12 + bob, 5);
  } else {
    ctx.fillStyle = '#7fd0e3';
    ctx.beginPath();
    ctx.arc(x, y - 12 + bob, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#12303a';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', x, y - 11 + bob);
  }

  ctx.restore();

  if (options.price !== undefined) {
    ctx.fillStyle = options.sold ? '#7a7a7a' : '#f6d76c';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(options.sold ? 'SOLD' : `${options.price} FEED`, x, y + 34);
  }
  if (options.label) {
    ctx.fillStyle = '#e8e0c8';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(options.label, x, y - 40 + bob);
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const r = i % 2 === 0 ? radius : radius * 0.42;
    const px = x + Math.cos(a) * r;
    const py = y + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

export function drawTrapdoor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  time: number,
  open: boolean,
): void {
  ctx.save();
  if (open) {
    const glow = ctx.createRadialGradient(x, y, 4, x, y, 42);
    glow.addColorStop(0, 'rgba(255, 220, 120, 0.5)');
    glow.addColorStop(1, 'rgba(255, 220, 120, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 42, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#120e14';
  ctx.beginPath();
  ctx.ellipse(x, y, 26, 20, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = open ? '#f0c860' : '#5a5a62';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#1d1826';
  ctx.beginPath();
  ctx.ellipse(x, y, 19, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const ly = y - 8 + i * 5;
    ctx.strokeStyle = open ? `rgba(240, 200, 96, ${0.8 - i * 0.15})` : 'rgba(120,120,130,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 13 + i, ly);
    ctx.lineTo(x + 13 - i, ly);
    ctx.stroke();
  }
  ctx.restore();
  void time;
}

export function drawDoorMat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  side: DoorSide,
  open: boolean,
  time: number,
): void {
  const pulse = 0.5 + Math.sin(time * 3) * 0.2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(side === 'left' ? Math.PI : side === 'up' ? Math.PI / 2 : side === 'down' ? -Math.PI / 2 : 0);
  ctx.globalAlpha = open ? 1 : 0.6;
  ctx.fillStyle = open ? `rgba(240, 200, 96, ${0.35 + pulse * 0.2})` : 'rgba(60, 60, 70, 0.5)';
  ctx.fillRect(0, -34, 16, 68);
  ctx.fillStyle = open ? '#f0c860' : '#6a6a74';
  ctx.fillRect(0, -34, 4, 68);
  ctx.restore();
}
