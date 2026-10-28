/**
 * All tunable numbers for Cluckles live here. Pure data, no engine imports, so
 * the whole feel of the game can be adjusted from one file.
 */

/** Size of one tile in pixels. */
export const TILE = 32;

/** Default room dimensions in tiles. `.egg` files may differ. */
export const ROOM_COLS = 19;
export const ROOM_ROWS = 11;

/** Absolute limits the editor and validator enforce. */
export const MAX_COLS = 25;
export const MAX_ROWS = 15;

/** Logical render resolution. */
export const VIEW = { width: 960, height: 540 } as const;

export const FIXED_UPDATE_FPS = 60;

export const PLAYER = {
  radius: 12,
  speed: 250,
  accel: 2600,
  friction: 2000,
  maxHealth: 3,
  invulnTime: 0.9,
  hurtFlashTime: 0.35,
  knockback: 250,
  pickupRadius: 30,
} as const;

/** The chicken ring: four slots, filled clockwise starting from "up". */
export const STACK = {
  size: 4,
  globalCooldown: 0.05,
} as const;

/** Defaults merged into every chicken's projectile spec. */
export const PROJECTILE = {
  speed: 420,
  damage: 1,
  radius: 6,
  life: 1.6,
  pierce: 0,
  bounce: 0,
  homing: 0,
  explode: 0,
  knockback: 140,
} as const;

export const ENEMY = {
  speedMul: 1,
  knockback: 150,
  knockbackFalloff: 6,
  wanderTimeMin: 0.5,
  wanderTimeMax: 1.4,
  shootRange: 300,
  hurtTime: 0.12,
  deathTime: 0.35,
} as const;

export const COMBAT = {
  hitstop: 0.05,
  feedPerEnemy: 2,
} as const;

export const RUN = {
  floorsToWin: 10,
  maxRooms: 11,
  roomsFloor1: 7,
  roomsPerFloor: 1,
  feedRewardMin: 15,
  feedRewardMax: 30,
  shopPriceMin: 12,
  shopPriceMax: 34,
  startingFeed: 0,
} as const;
