import { TILE } from '../config';
import type { ChickenFire } from '../chickens/types';
import { isSolidAt, type EggRoom } from '../level/roomFormat';

export type ProjectileOwner = 'player' | 'enemy';

export interface Projectile {
  id: number;
  owner: ProjectileOwner;
  /** Center position and velocity. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  life: number;
  pierce: number;
  bounce: number;
  homing: number;
  explode: number;
  explodeDamage: number;
  knockback: number;
  phaseWalls: boolean;
  boomerang: boolean;
  slowFactor: number;
  slowTime: number;
  poisonDps: number;
  poisonTime: number;
  chain: number;
  color: string;
  trail: boolean;
  spin: boolean;
  crit: boolean;
  angle: number;
  age: number;
  dead: boolean;
  returning: boolean;
  /** Enemy ids this projectile has already damaged (so pierce does not re-hit). */
  hitIds: number[];
}

let nextId = 1;

export function resetProjectileIds(): void {
  nextId = 1;
}

function base(owner: ProjectileOwner, x: number, y: number): Projectile {
  return {
    id: nextId++,
    owner,
    x,
    y,
    vx: 0,
    vy: 0,
    r: 6,
    damage: 1,
    life: 1,
    pierce: 0,
    bounce: 0,
    homing: 0,
    explode: 0,
    explodeDamage: 0,
    knockback: 0,
    phaseWalls: false,
    boomerang: false,
    slowFactor: 0,
    slowTime: 0,
    poisonDps: 0,
    poisonTime: 0,
    chain: 0,
    color: '#fff',
    trail: false,
    spin: false,
    crit: false,
    angle: 0,
    age: 0,
    dead: false,
    returning: false,
    hitIds: [],
  };
}

/** Spread `count` projectiles across `spread` radians around `angle`. */
export function spawnFromFire(
  fire: ChickenFire,
  x: number,
  y: number,
  angle: number,
): Projectile[] {
  const out: Projectile[] = [];
  const count = Math.max(1, fire.count);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const a = angle + t * fire.spread;
    const p = base('player', x, y);
    p.vx = Math.cos(a) * fire.speed;
    p.vy = Math.sin(a) * fire.speed;
    p.r = fire.radius;
    p.damage = fire.damage;
    p.life = fire.life;
    p.pierce = fire.pierce;
    p.bounce = fire.bounce;
    p.homing = fire.homing;
    p.explode = fire.explode;
    p.explodeDamage = fire.explodeDamage;
    p.knockback = fire.knockback;
    p.phaseWalls = fire.phaseWalls;
    p.boomerang = fire.boomerang;
    p.slowFactor = fire.slowFactor;
    p.slowTime = fire.slowTime;
    p.poisonDps = fire.poisonDps;
    p.poisonTime = fire.poisonTime;
    p.chain = fire.chain;
    p.color = fire.color;
    p.trail = fire.trail;
    p.spin = fire.spin;
    p.crit = fire.crit;
    p.angle = a;
    out.push(p);
  }
  return out;
}

export function spawnEnemyShot(
  x: number,
  y: number,
  vx: number,
  vy: number,
  damage: number,
  radius: number,
  color: string,
): Projectile {
  const p = base('enemy', x, y);
  p.vx = vx;
  p.vy = vy;
  p.damage = damage;
  p.r = radius;
  p.color = color;
  p.life = 4;
  p.angle = Math.atan2(vy, vx);
  return p;
}

function solidAt(room: EggRoom, px: number, py: number): boolean {
  return isSolidAt(room, Math.floor(px / TILE), Math.floor(py / TILE));
}

export interface StepOptions {
  room: EggRoom;
  homingTarget: { x: number; y: number } | null;
  playerX: number;
  playerY: number;
}

export interface StepResult {
  wallHit: boolean;
  expired: boolean;
}

/**
 * Advance a projectile. Handles lifetime, homing, wall reflections and the
 * boomerang return leg. Collisions with actors are resolved by the caller.
 */
export function stepProjectile(p: Projectile, dt: number, opts: StepOptions): StepResult {
  if (p.dead) {
    return { wallHit: false, expired: false };
  }

  p.age += dt;
  p.life -= dt;
  if (p.life <= 0) {
    p.dead = true;
    return { wallHit: false, expired: true };
  }

  if (p.homing > 0 && opts.homingTarget) {
    const dx = opts.homingTarget.x - p.x;
    const dy = opts.homingTarget.y - p.y;
    const targetAngle = Math.atan2(dy, dx);
    const speed = Math.hypot(p.vx, p.vy);
    const current = Math.atan2(p.vy, p.vx);
    let delta = targetAngle - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    const maxTurn = p.homing * dt;
    const next = current + Math.max(-maxTurn, Math.min(maxTurn, delta));
    p.vx = Math.cos(next) * speed;
    p.vy = Math.sin(next) * speed;
  }

  if (p.boomerang && !p.returning && p.age > p.life * 0.42) {
    p.returning = true;
    p.phaseWalls = true;
  }
  if (p.returning) {
    const dx = opts.playerX - p.x;
    const dy = opts.playerY - p.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = Math.hypot(p.vx, p.vy) || 300;
    p.vx = (dx / dist) * speed;
    p.vy = (dy / dist) * speed;
    if (dist < p.r + 16) {
      p.dead = true;
      return { wallHit: false, expired: true };
    }
  }

  const nx = p.x + p.vx * dt;
  const ny = p.y + p.vy * dt;
  let wallHit = false;

  if (!p.phaseWalls) {
    const hitX = solidAt(opts.room, nx + Math.sign(p.vx || 1) * p.r, p.y);
    const hitY = solidAt(opts.room, p.x, ny + Math.sign(p.vy || 1) * p.r);
    if (hitX) {
      p.vx = -p.vx;
      wallHit = true;
    }
    if (hitY) {
      p.vy = -p.vy;
      wallHit = true;
    }
    if (!hitX && !hitY && solidAt(opts.room, nx + Math.sign(p.vx || 1) * p.r, ny + Math.sign(p.vy || 1) * p.r)) {
      p.vx = -p.vx;
      p.vy = -p.vy;
      wallHit = true;
    }
    if (wallHit) {
      if (p.bounce > 0) {
        p.bounce -= 1;
        if (p.bounce === 0 && !p.boomerang) {
          // Last bounce still travels; dies on the next wall.
        }
      } else {
        p.dead = true;
        return { wallHit: true, expired: true };
      }
    }
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.angle = Math.atan2(p.vy, p.vx);
  return { wallHit, expired: false };
}
