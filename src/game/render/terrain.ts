import { TILE } from '../config';
import { charAt, type EggRoom } from '../level/roomFormat';
import { TERRAIN } from '../level/tiles';
import { hash2 } from '../util/math';

const FLOOR_BASE = '#4b4339';
const FLOOR_ALT = '#524a3f';
const WALL_BASE = '#2b2532';
const WALL_MORTAR = '#1d1922';

export function roomPixelWidth(room: EggRoom): number {
  return room.width * TILE;
}

export function roomPixelHeight(room: EggRoom): number {
  return room.height * TILE;
}

function drawFloor(ctx: CanvasRenderingContext2D, x: number, y: number, hash: number): void {
  ctx.fillStyle = hash > 0.5 ? FLOOR_ALT : FLOOR_BASE;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.09)';
  ctx.fillRect(x, y + TILE - 2, TILE, 2);
  ctx.fillRect(x + TILE - 2, y, 2, TILE);
  // A few darker specks for texture.
  if (hash > 0.72) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.fillRect(x + 8 + hash * 20, y + 12 + hash * 18, 3, 3);
  }
  if (hash < 0.14) {
    ctx.fillStyle = 'rgba(255, 240, 200, 0.05)';
    ctx.fillRect(x + 6, y + 6, TILE - 14, 2);
  }
}

function drawWall(ctx: CanvasRenderingContext2D, x: number, y: number, hash: number): void {
  ctx.fillStyle = WALL_BASE;
  ctx.fillRect(x, y, TILE, TILE);
  const brickH = TILE / 2;
  for (let row = 0; row < 2; row++) {
    const offset = row % 2 === 0 ? 0 : -TILE / 2;
    for (let bx = offset; bx < TILE; bx += TILE) {
      const shade = 42 + Math.floor(hash * 12) + row * 4;
      ctx.fillStyle = `rgb(${shade}, ${shade - 6}, ${shade + 8})`;
      ctx.fillRect(x + bx + 1, y + row * brickH + 1, TILE - 2, brickH - 2);
    }
  }
  ctx.fillStyle = WALL_MORTAR;
  ctx.fillRect(x, y + brickH - 1, TILE, 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.fillRect(x, y, TILE, 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.fillRect(x, y + TILE - 3, TILE, 3);
}

function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, hash: number): void {
  drawFloor(ctx, x, y, hash);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath();
  ctx.ellipse(x + TILE / 2, y + TILE - 8, TILE * 0.38, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  const grad = ctx.createRadialGradient(x + 20, y + 18, 3, x + TILE / 2, y + TILE / 2, TILE * 0.6);
  grad.addColorStop(0, '#6d6a66');
  grad.addColorStop(1, '#3d3b39');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x + 6, y + TILE - 10);
  ctx.quadraticCurveTo(x + 2, y + 14, x + 20, y + 7);
  ctx.quadraticCurveTo(x + TILE - 4, y + 6, x + TILE - 6, y + TILE - 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.beginPath();
  ctx.ellipse(x + 20, y + 16, 7, 4, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

function drawFence(ctx: CanvasRenderingContext2D, x: number, y: number, hash: number): void {
  drawFloor(ctx, x, y, hash);
  ctx.fillStyle = '#6b4a28';
  ctx.fillRect(x + 4, y + 16, TILE - 8, 7);
  ctx.fillRect(x + 4, y + TILE - 22, TILE - 8, 7);
  ctx.fillStyle = '#8a6234';
  ctx.fillRect(x + 4, y + 16, TILE - 8, 2);
  ctx.fillRect(x + 4, y + TILE - 22, TILE - 8, 2);
  for (const px of [x + 8, x + TILE / 2 - 3, x + TILE - 14]) {
    ctx.fillStyle = '#5c3f22';
    ctx.fillRect(px, y + 8, 6, TILE - 16);
    ctx.fillStyle = '#7d5730';
    ctx.fillRect(px, y + 8, 2, TILE - 16);
  }
}

function drawWater(ctx: CanvasRenderingContext2D, x: number, y: number, hash: number): void {
  const grad = ctx.createLinearGradient(x, y, x, y + TILE);
  grad.addColorStop(0, '#2b5570');
  grad.addColorStop(1, '#20415a');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.strokeStyle = 'rgba(180, 225, 240, 0.18)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 2; i++) {
    const wy = y + 14 + i * 18 + hash * 6;
    ctx.beginPath();
    ctx.moveTo(x + 6, wy);
    ctx.quadraticCurveTo(x + TILE / 2, wy - 5, x + TILE - 6, wy);
    ctx.stroke();
  }
}

/**
 * Bake the whole room's tiles into one offscreen canvas. Rebuilt once per room
 * instead of every frame.
 */
export function buildTerrain(room: EggRoom): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = room.width * TILE;
  canvas.height = room.height * TILE;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return canvas;
  }

  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const px = x * TILE;
      const py = y * TILE;
      const char = charAt(room, x, y);
      const hash = hash2(x, y, 3);
      switch (char) {
        case TERRAIN.wall:
          drawWall(ctx, px, py, hash);
          break;
        case TERRAIN.rock:
          drawRock(ctx, px, py, hash);
          break;
        case TERRAIN.fence:
          drawFence(ctx, px, py, hash);
          break;
        case TERRAIN.water:
          drawWater(ctx, px, py, hash);
          break;
        default:
          drawFloor(ctx, px, py, hash);
          break;
      }
    }
  }

  // A soft inner shadow so the play field reads as a room.
  const shadow = ctx.createLinearGradient(0, 0, 0, canvas.height);
  shadow.addColorStop(0, 'rgba(0, 0, 0, 0.35)');
  shadow.addColorStop(0.12, 'rgba(0, 0, 0, 0)');
  shadow.addColorStop(0.88, 'rgba(0, 0, 0, 0)');
  shadow.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return canvas;
}
