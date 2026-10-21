/**
 * The character alphabet used by `.egg` rooms.
 *
 * Terrain characters describe collision and floor art. Entity characters sit on
 * top of floor, so a room never needs more than one grid.
 *
 *   #  wall (solid)      .  floor          ~  water (impassable)
 *   o  rock (solid)      =  fence (solid)  +  door (walkable)
 *   p  player spawn
 *   C F D R B S X W M O  enemies (cat, fox, dog, rat, bat, snake, spider, crow, slime, rooster)
 *   c f k s h            pedestals (chicken, feed, perk, shop, heart)
 */

export const TERRAIN = {
  wall: '#',
  floor: '.',
  water: '~',
  rock: 'o',
  fence: '=',
} as const;

export type TerrainChar = (typeof TERRAIN)[keyof typeof TERRAIN];

export const SPAWN_CHAR = 'p';
export const DOOR_CHAR = '+';

/** Uppercase letters map to enemy type ids (see enemies/enemies.ts). */
export const ENEMY_CHARS: Record<string, string> = {
  C: 'cat',
  F: 'fox',
  D: 'dog',
  R: 'rat',
  B: 'bat',
  S: 'snake',
  X: 'spider',
  W: 'crow',
  M: 'slime',
  O: 'rooster',
};

export const PEDESTAL_CHARS = {
  chicken: 'c',
  feed: 'f',
  perk: 'k',
  shop: 's',
  heart: 'h',
} as const;

export type PedestalKind = keyof typeof PEDESTAL_CHARS;

export function charIsSolid(char: string): boolean {
  // Water is a solid obstacle: you cannot walk on it.
  return (
    char === TERRAIN.wall ||
    char === TERRAIN.rock ||
    char === TERRAIN.fence ||
    char === TERRAIN.water
  );
}

export function charIsWater(char: string): boolean {
  return char === TERRAIN.water;
}

export function isEnemyChar(char: string): boolean {
  return Object.prototype.hasOwnProperty.call(ENEMY_CHARS, char);
}

export function pedestalOf(char: string): PedestalKind | null {
  for (const kind of Object.keys(PEDESTAL_CHARS) as PedestalKind[]) {
    if (PEDESTAL_CHARS[kind] === char) return kind;
  }
  return null;
}

/** Every character a `.egg` tile grid may legally contain. */
export function isValidRoomChar(char: string): boolean {
  if ((Object.values(TERRAIN) as readonly string[]).includes(char)) return true;
  if (char === SPAWN_CHAR || char === DOOR_CHAR) return true;
  return isEnemyChar(char) || pedestalOf(char) !== null;
}
