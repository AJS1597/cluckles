import { PLAYER, TILE } from '../config';
import { isWaterAt, type EggRoom } from '../level/roomFormat';
import { moveAabb } from '../physics/tilemove';
import { moveTowards } from '../util/math';

export interface PlayerInput {
  /** -1..1 per axis; diagonals are normalised by the caller. */
  moveX: number;
  moveY: number;
  /** True while the fire key is held; every equipped slot fires its own cooldown. */
  shoot: boolean;
  interact: boolean;
  interactPressed: boolean;
}

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  facingX: number;
  facingY: number;
  invuln: number;
  hurtFlash: number;
  /** Per-slot cooldown remaining, indexed like the stack ring. */
  slotCooldown: number[];
  globalCooldown: number;
  inWater: boolean;
}

export function makePlayer(x: number, y: number): Player {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    r: PLAYER.radius,
    facingX: 0,
    facingY: 1,
    invuln: 0,
    hurtFlash: 0,
    slotCooldown: [0, 0, 0, 0],
    globalCooldown: 0,
    inWater: false,
  };
}

export function playerRect(p: Player): { x: number; y: number; w: number; h: number } {
  return { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 };
}

/** Pure movement step: accelerate toward the input, slide along walls. */
export function stepPlayer(
  p: Player,
  input: PlayerInput,
  room: EggRoom,
  dt: number,
  speedMul: number,
): void {
  let ix = input.moveX;
  let iy = input.moveY;
  const len = Math.hypot(ix, iy);
  if (len > 1) {
    ix /= len;
    iy /= len;
  }

  const tileX = Math.floor(p.x / TILE);
  const tileY = Math.floor(p.y / TILE);
  p.inWater = isWaterAt(room, tileX, tileY);
  const speed = PLAYER.speed * speedMul;

  const targetVx = ix * speed;
  const targetVy = iy * speed;

  if (len > 0.01) {
    p.vx = moveTowards(p.vx, targetVx, PLAYER.accel * dt);
    p.vy = moveTowards(p.vy, targetVy, PLAYER.accel * dt);
    p.facingX = ix;
    p.facingY = iy;
  } else {
    p.vx = moveTowards(p.vx, 0, PLAYER.friction * dt);
    p.vy = moveTowards(p.vy, 0, PLAYER.friction * dt);
  }

  const rect = playerRect(p);
  const moved = moveAabb(rect, p.vx * dt, p.vy * dt, room);
  if (moved.hitX) p.vx = 0;
  if (moved.hitY) p.vy = 0;
  p.x = moved.x + p.r;
  p.y = moved.y + p.r;

  p.invuln = Math.max(0, p.invuln - dt);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt);
  p.globalCooldown = Math.max(0, p.globalCooldown - dt);
  for (let i = 0; i < p.slotCooldown.length; i++) {
    p.slotCooldown[i] = Math.max(0, (p.slotCooldown[i] ?? 0) - dt);
  }
}
