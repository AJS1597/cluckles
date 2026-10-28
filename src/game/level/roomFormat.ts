import type { Dir } from '../dir';
import {
  DOOR_CHAR,
  ENEMY_CHARS,
  SPAWN_CHAR,
  TERRAIN,
  charIsSolid,
  charIsWater,
  isEnemyChar,
  pedestalOf,
  type PedestalKind,
} from './tiles';

/**
 * The .egg room format.
 *
 * A room is a rectangular grid of single characters plus a little metadata.
 * Terrain characters (`#`, `.`, `~`, `o`, `=`) describe collision and floor.
 * Entity characters (uppercase enemies, `p` spawn, `+` door, and the lowercase
 * pedestal markers) sit *on top* of floor, so authoring a room never needs more
 * than one grid. This keeps the editor simple and the file human readable.
 *
 * Files are JSON and use the `.egg` extension.
 */

export type DoorSide = Extract<Dir, 'up' | 'right' | 'down' | 'left'>;

export type RoomRole =
  | 'start'
  | 'combat'
  | 'treasure'
  | 'shop'
  | 'boss'
  | 'exit';

export const EGG_FORMAT = 'cluckles.egg';
export const EGG_VERSION = 1;

export interface PedestalSpec {
  kind: PedestalKind;
  /** Tile coordinates (integers) of the pedestal center. */
  x: number;
  y: number;
}

export interface EnemySpec {
  type: string;
  x: number;
  y: number;
}

export interface EggRoom {
  format: typeof EGG_FORMAT;
  version: number;
  id: string;
  name: string;
  role: RoomRole;
  width: number;
  height: number;
  /** One string per row, `width` characters each. */
  tiles: string[];
  /** Optional authored doors. When absent, doors are derived from `+` tiles. */
  doors?: DoorSide[];
  author?: string;
  tags?: string[];
}

export const DEFAULT_DOOR_SIDE: DoorSide = 'up';

const VALID_ROLES: readonly RoomRole[] = [
  'start',
  'combat',
  'treasure',
  'shop',
  'boss',
  'exit',
];

const VALID_DOOR_SIDES: readonly DoorSide[] = ['up', 'right', 'down', 'left'];

export class EggParseError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string, fallback?: string): string {
  if (typeof value === 'string') {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new EggParseError(`Missing string field "${field}"`);
}

function requireInt(value: unknown, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value);
  }
  throw new EggParseError(`Missing numeric field "${field}"`);
}

function knownChar(char: string): boolean {
  if (Object.values(TERRAIN).includes(char as (typeof TERRAIN)[keyof typeof TERRAIN])) {
    return true;
  }
  if (char === SPAWN_CHAR || char === DOOR_CHAR) {
    return true;
  }
  if (isEnemyChar(char) || pedestalOf(char)) {
    return true;
  }
  return false;
}

/** Parse a .egg file (JSON string or already-decoded object) into an EggRoom. */
export function parseEgg(input: string | unknown, fallbackId = 'room'): EggRoom {
  let raw: unknown = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch (error) {
      throw new EggParseError(`Not valid JSON: ${(error as Error).message}`);
    }
  }

  if (!isRecord(raw)) {
    throw new EggParseError('Room root must be an object');
  }

  const format = typeof raw['format'] === 'string' ? (raw['format'] as string) : EGG_FORMAT;
  if (format !== EGG_FORMAT && format !== 'egg') {
    throw new EggParseError(`Unknown room format "${format}"`);
  }

  const width = requireInt(raw['width'], 'width');
  const height = requireInt(raw['height'], 'height');
  if (width < 3 || height < 3) {
    throw new EggParseError('Room must be at least 3x3 tiles');
  }

  if (!Array.isArray(raw['tiles']) || raw['tiles'].length !== height) {
    throw new EggParseError(`tiles must be an array of ${height} rows`);
  }

  const tiles: string[] = [];
  for (let y = 0; y < height; y++) {
    const row = raw['tiles'][y];
    if (typeof row !== 'string' || row.length !== width) {
      throw new EggParseError(`Row ${y} must be a string of length ${width}`);
    }
    for (const char of row) {
      if (!knownChar(char)) {
        throw new EggParseError(`Row ${y} contains unknown tile "${char}"`);
      }
    }
    tiles.push(row);
  }

  const roleRaw = typeof raw['role'] === 'string' ? (raw['role'] as string) : 'combat';
  const role = (VALID_ROLES as readonly string[]).includes(roleRaw)
    ? (roleRaw as RoomRole)
    : 'combat';

  let doors: DoorSide[] | undefined;
  if (Array.isArray(raw['doors'])) {
    doors = raw['doors']
      .filter((side): side is DoorSide => VALID_DOOR_SIDES.includes(side as DoorSide))
      .filter((side, index, all) => all.indexOf(side) === index);
  }

  const tags = Array.isArray(raw['tags'])
    ? raw['tags'].filter((tag): tag is string => typeof tag === 'string')
    : undefined;

  const room: EggRoom = {
    format: EGG_FORMAT,
    version: typeof raw['version'] === 'number' ? raw['version'] : EGG_VERSION,
    id: requireString(raw['id'], 'id', fallbackId),
    name: requireString(raw['name'], 'name', fallbackId),
    role,
    width,
    height,
    tiles,
  };
  if (doors) room.doors = doors;
  if (typeof raw['author'] === 'string') room.author = raw['author'];
  if (tags && tags.length > 0) room.tags = tags;
  return room;
}

/** Serialize an EggRoom to a pretty JSON string suitable for a .egg file. */
export function serializeEgg(room: EggRoom): string {
  const clean: Record<string, unknown> = {
    format: EGG_FORMAT,
    version: EGG_VERSION,
    id: room.id,
    name: room.name,
    role: room.role,
    width: room.width,
    height: room.height,
    doors: room.doors ?? [],
    tiles: room.tiles,
  };
  if (room.author) clean['author'] = room.author;
  if (room.tags && room.tags.length > 0) clean['tags'] = room.tags;
  return `${JSON.stringify(clean, null, 2)}\n`;
}

export function makeBlankRoom(
  width: number,
  height: number,
  name = 'New Room',
  role: RoomRole = 'combat',
): EggRoom {
  const tiles: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const edge = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      row += edge ? TERRAIN.wall : TERRAIN.floor;
    }
    tiles.push(row);
  }
  return {
    format: EGG_FORMAT,
    version: EGG_VERSION,
    id: `custom-${Date.now().toString(36)}`,
    name,
    role,
    width,
    height,
    tiles,
    doors: [],
  };
}

export function cloneRoom(room: EggRoom): EggRoom {
  const copy: EggRoom = {
    format: EGG_FORMAT,
    version: room.version,
    id: room.id,
    name: room.name,
    role: room.role,
    width: room.width,
    height: room.height,
    tiles: [...room.tiles],
    doors: room.doors ? [...room.doors] : [],
  };
  if (room.author) copy.author = room.author;
  if (room.tags) copy.tags = [...room.tags];
  return copy;
}

export function charAt(room: EggRoom, x: number, y: number): string {
  if (x < 0 || y < 0 || x >= room.width || y >= room.height) {
    return TERRAIN.wall;
  }
  return room.tiles[y]!.charAt(x);
}

export function setChar(room: EggRoom, x: number, y: number, char: string): void {
  if (x < 0 || y < 0 || x >= room.width || y >= room.height) {
    return;
  }
  const row = room.tiles[y]!;
  room.tiles[y] = row.substring(0, x) + char + row.substring(x + 1);
}

/** Out-of-bounds counts as solid, which keeps projectiles inside the room. */
export function isSolidAt(room: EggRoom, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= room.width || y >= room.height) {
    return true;
  }
  return charIsSolid(charAt(room, x, y));
}

export function isWaterAt(room: EggRoom, x: number, y: number): boolean {
  return charIsWater(charAt(room, x, y));
}

export function roomEnemies(room: EggRoom): EnemySpec[] {
  const found: EnemySpec[] = [];
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const char = charAt(room, x, y);
      const type = ENEMY_CHARS[char];
      if (type) {
        found.push({ type, x, y });
      }
    }
  }
  return found;
}

export function roomPedestals(room: EggRoom): PedestalSpec[] {
  const found: PedestalSpec[] = [];
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      const kind = pedestalOf(charAt(room, x, y));
      if (kind) {
        found.push({ kind, x, y });
      }
    }
  }
  return found;
}

export function roomSpawn(room: EggRoom): { x: number; y: number } {
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      if (charAt(room, x, y) === SPAWN_CHAR) {
        return { x, y };
      }
    }
  }
  return { x: Math.floor(room.width / 2), y: Math.floor(room.height / 2) };
}

/** Doors authored either via the `doors` array or by painting `+` tiles. */
export function authoredDoors(room: EggRoom): DoorSide[] {
  const set = new Set<DoorSide>(room.doors ?? []);
  for (let y = 0; y < room.height; y++) {
    for (let x = 0; x < room.width; x++) {
      if (charAt(room, x, y) !== DOOR_CHAR) continue;
      if (y === 0) set.add('up');
      if (y === room.height - 1) set.add('down');
      if (x === 0) set.add('left');
      if (x === room.width - 1) set.add('right');
    }
  }
  return [...set];
}

/** Tile columns occupied by the door gap on the north/south walls. */
export function doorColumns(room: EggRoom): number[] {
  const mid = Math.floor(room.width / 2);
  return [mid - 1, mid, mid + 1].filter((x) => x > 0 && x < room.width - 1);
}

/** Tile rows occupied by the door gap on the east/west walls. */
export function doorRows(room: EggRoom): number[] {
  const mid = Math.floor(room.height / 2);
  return [mid - 1, mid, mid + 1].filter((y) => y > 0 && y < room.height - 1);
}

/** Pixel-space rectangle (in tiles) of the door gap for a side. */
export function doorGapTiles(room: EggRoom, side: DoorSide): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  if (side === 'up') {
    for (const x of doorColumns(room)) cells.push({ x, y: 0 });
  } else if (side === 'down') {
    for (const x of doorColumns(room)) cells.push({ x, y: room.height - 1 });
  } else if (side === 'left') {
    for (const y of doorRows(room)) cells.push({ x: 0, y });
  } else {
    for (const y of doorRows(room)) cells.push({ x: room.width - 1, y });
  }
  return cells;
}

/** Center tile of a door, used to position the player when entering. */
export function doorCenterTile(room: EggRoom, side: DoorSide): { x: number; y: number } {
  if (side === 'up') return { x: Math.floor(room.width / 2), y: 0 };
  if (side === 'down') return { x: Math.floor(room.width / 2), y: room.height - 1 };
  if (side === 'left') return { x: 0, y: Math.floor(room.height / 2) };
  return { x: room.width - 1, y: Math.floor(room.height / 2) };
}

function clampTile(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Nearest walkable tile to (tx, ty). Used to place the player and pedestals so
 * they can never end up inside rock, wall, fence or water.
 */
export function findWalkableNear(room: EggRoom, tx: number, ty: number): { x: number; y: number } {
  const cx = clampTile(tx, 1, Math.max(1, room.width - 2));
  const cy = clampTile(ty, 1, Math.max(1, room.height - 2));
  if (!charIsSolid(charAt(room, cx, cy))) {
    return { x: cx, y: cy };
  }
  const maxRadius = Math.max(room.width, room.height);
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= room.width - 1 || y >= room.height - 1) continue;
        if (!charIsSolid(charAt(room, x, y))) {
          return { x, y };
        }
      }
    }
  }
  return { x: cx, y: cy };
}

/**
 * Nearest tile that the player can actually walk to from the room's spawn.
 * Plain `findWalkableNear` only checks solidity, so a pedestal can end up in a
 * pocket walled off by rocks. This flood-fills from spawn and only picks tiles
 * in that connected area.
 */
export function findReachableNear(room: EggRoom, tx: number, ty: number): { x: number; y: number } {
  const start = roomSpawn(room);
  const seen = new Set<number>();
  const key = (x: number, y: number) => y * room.width + x;
  const queue: { x: number; y: number }[] = [];
  if (!charIsSolid(charAt(room, start.x, start.y))) {
    queue.push(start);
    seen.add(key(start.x, start.y));
  }
  for (let i = 0; i < queue.length; i++) {
    const { x, y } = queue[i]!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 1 || ny < 1 || nx >= room.width - 1 || ny >= room.height - 1) continue;
      if (seen.has(key(nx, ny)) || charIsSolid(charAt(room, nx, ny))) continue;
      seen.add(key(nx, ny));
      queue.push({ x: nx, y: ny });
    }
  }
  let best = queue[0] ?? findWalkableNear(room, tx, ty);
  let bestDist = Infinity;
  for (const tile of queue) {
    const d = Math.hypot(tile.x - tx, tile.y - ty);
    if (d < bestDist) {
      bestDist = d;
      best = tile;
    }
  }
  return { x: best.x, y: best.y };
}

/**
 * Where the player appears when they walk in through `side`. Steps inward from
 * the door and then snaps to the nearest walkable tile, so a door can never
 * spit you out inside a rock (e.g. the diamond room's centre columns).
 */
export function doorEntryTile(room: EggRoom, side: DoorSide, inset = 2): { x: number; y: number } {
  const door = doorCenterTile(room, side);
  let x = door.x;
  let y = door.y;
  if (side === 'left') x += inset;
  else if (side === 'right') x -= inset;
  else if (side === 'up') y += inset;
  else y -= inset;
  return findWalkableNear(room, x, y);
}
