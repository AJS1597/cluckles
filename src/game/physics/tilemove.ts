import { TILE } from '../config';
import { isSolidAt, type EggRoom } from '../level/roomFormat';
import type { Rect } from '../util/aabb';

export interface MoveResult {
  x: number;
  y: number;
  hitX: boolean;
  hitY: boolean;
}

/**
 * Axis-separated AABB movement against the room's solid tiles. Displacements
 * are small (fixed 120Hz steps) so a single tile-column sweep per axis is
 * enough, and it slides cleanly along walls.
 */
export function moveAabb(rect: Rect, dx: number, dy: number, room: EggRoom): MoveResult {
  let x = rect.x;
  let y = rect.y;
  let hitX = false;
  let hitY = false;

  if (dx !== 0) {
    x += dx;
    const top = Math.floor(y / TILE);
    const bottom = Math.floor((y + rect.h - 0.001) / TILE);
    if (dx > 0) {
      const tx = Math.floor((x + rect.w - 0.001) / TILE);
      for (let ty = top; ty <= bottom; ty++) {
        if (isSolidAt(room, tx, ty)) {
          x = tx * TILE - rect.w;
          hitX = true;
          break;
        }
      }
    } else {
      const tx = Math.floor(x / TILE);
      for (let ty = top; ty <= bottom; ty++) {
        if (isSolidAt(room, tx, ty)) {
          x = (tx + 1) * TILE;
          hitX = true;
          break;
        }
      }
    }
  }

  if (dy !== 0) {
    y += dy;
    const left = Math.floor(x / TILE);
    const right = Math.floor((x + rect.w - 0.001) / TILE);
    if (dy > 0) {
      const ty = Math.floor((y + rect.h - 0.001) / TILE);
      for (let tx = left; tx <= right; tx++) {
        if (isSolidAt(room, tx, ty)) {
          y = ty * TILE - rect.h;
          hitY = true;
          break;
        }
      }
    } else {
      const ty = Math.floor(y / TILE);
      for (let tx = left; tx <= right; tx++) {
        if (isSolidAt(room, tx, ty)) {
          y = (ty + 1) * TILE;
          hitY = true;
          break;
        }
      }
    }
  }

  return { x, y, hitX, hitY };
}

/** True when the circle at (x, y) touches any solid tile. */
export function circleHitsSolid(x: number, y: number, r: number, room: EggRoom): boolean {
  const minTx = Math.floor((x - r) / TILE);
  const maxTx = Math.floor((x + r) / TILE);
  const minTy = Math.floor((y - r) / TILE);
  const maxTy = Math.floor((y + r) / TILE);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!isSolidAt(room, tx, ty)) continue;
      const nx = Math.max(tx * TILE, Math.min(x, (tx + 1) * TILE));
      const ny = Math.max(ty * TILE, Math.min(y, (ty + 1) * TILE));
      const ddx = x - nx;
      const ddy = y - ny;
      if (ddx * ddx + ddy * ddy < r * r) {
        return true;
      }
    }
  }
  return false;
}
