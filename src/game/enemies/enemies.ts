import { BOSS, ENEMY, TILE } from '../config';
import { charAt, type EggRoom } from '../level/roomFormat';
import { charIsSolid } from '../level/tiles';
import { randRange, randInt, type Rng } from '../util/math';
import { moveAabb } from '../physics/tilemove';

/**
 * Enemy AI in the spirit of the first Zelda: mostly straight-line movement,
 * turning at walls, with a couple of simple state machines (a telegraph then a
 * lunge, or a telegraph then a shot). No pathfinding, no steering.
 */

export type EnemyBehavior =
  | 'wander'
  | 'erratic'
  | 'chase'
  | 'bounce'
  | 'hop'
  | 'lunge'
  | 'shoot'
  | 'boss';

export interface EnemyDef {
  id: string;
  name: string;
  behavior: EnemyBehavior;
  hp: number;
  speed: number;
  radius: number;
  damage: number;
  color: string;
  accent: string;
  feed: number;
  boss: boolean;
  /** Ranged attack tuning. */
  shootCooldown: number;
  shootSpeed: number;
  shootDamage: number;
  shootCount: number;
  shootSpread: number;
  shootRadius: number;
  /** Lunge tuning. */
  lungeCooldown: number;
  lungeSpeed: number;
}

const RANGED: Pick<
  EnemyDef,
  'shootCooldown' | 'shootSpeed' | 'shootDamage' | 'shootCount' | 'shootSpread' | 'shootRadius'
> = {
  shootCooldown: 2.2,
  shootSpeed: 300,
  shootDamage: 1,
  shootCount: 1,
  shootSpread: 0,
  shootRadius: 9,
};

const MELEE: Pick<EnemyDef, 'lungeCooldown' | 'lungeSpeed'> = {
  lungeCooldown: 2.4,
  lungeSpeed: 430,
};

function def(partial: Partial<EnemyDef> & Pick<EnemyDef, 'id' | 'name' | 'behavior' | 'hp' | 'speed' | 'radius' | 'color' | 'accent'>): EnemyDef {
  return {
    damage: 1,
    feed: 1,
    boss: false,
    ...RANGED,
    ...MELEE,
    ...partial,
  };
}

/**
 * Enemies left as-is because they are already the weakest (lowest HP). Every
 * other regular enemy gets the global slow-down and attack-spacing nerf below.
 */
const UNNERFED_ENEMIES: readonly string[] = ['rat', 'snake'];

/** Global nerf: 10% slower movement and 15% longer gaps between attacks. */
const NERF = { speedMul: 0.9, cooldownMul: 1.15 } as const;

const BASE_ENEMY_DEFS: Record<string, EnemyDef> = Object.fromEntries(
  [
    def({
      id: 'rat',
      name: 'Sewer Rat',
      behavior: 'erratic',
      hp: 3,
      speed: 126,
      radius: 12,
      color: '#9a9a9a',
      accent: '#54545c',
      feed: 1,
    }),
    def({
      id: 'cat',
      name: 'Alley Cat',
      behavior: 'lunge',
      hp: 4,
      speed: 132,
      radius: 14,
      color: '#e0954a',
      accent: '#8c5a1e',
      damage: 1,
      feed: 2,
      lungeCooldown: 3.4,
      lungeSpeed: 380,
    }),
    def({
      id: 'fox',
      name: 'Red Fox',
      behavior: 'lunge',
      hp: 4,
      speed: 152,
      radius: 14,
      color: '#e0663a',
      accent: '#a13a12',
      feed: 2,
      lungeCooldown: 1.9,
      lungeSpeed: 520,
    }),
    def({
      id: 'dog',
      name: 'Guard Dog',
      behavior: 'lunge',
      hp: 7,
      speed: 106,
      radius: 16,
      color: '#a06a3a',
      accent: '#6a3a12',
      feed: 3,
      lungeCooldown: 2.6,
      lungeSpeed: 430,
    }),
    def({
      id: 'snake',
      name: 'Barn Snake',
      behavior: 'bounce',
      hp: 3,
      speed: 162,
      radius: 13,
      color: '#7ac06a',
      accent: '#2f6a2a',
      feed: 2,
    }),
    def({
      id: 'bat',
      name: 'Cellar Bat',
      behavior: 'erratic',
      hp: 3,
      speed: 182,
      radius: 11,
      color: '#8a6ab0',
      accent: '#4a2a6a',
      feed: 1,
    }),
    def({
      id: 'spider',
      name: 'Web Spider',
      behavior: 'shoot',
      hp: 5,
      speed: 62,
      radius: 13,
      color: '#6a5a5a',
      accent: '#2a2222',
      feed: 3,
      shootCooldown: 2.0,
      shootSpeed: 250,
      shootCount: 1,
      shootRadius: 8,
    }),
    def({
      id: 'crow',
      name: 'Scare Crow',
      behavior: 'chase',
      hp: 4,
      speed: 158,
      radius: 12,
      color: '#3a3a44',
      accent: '#101018',
      feed: 2,
    }),
    def({
      id: 'slime',
      name: 'Gutter Slime',
      behavior: 'hop',
      hp: 8,
      speed: 78,
      radius: 16,
      color: '#8ad06a',
      accent: '#3a7a2a',
      feed: 3,
    }),
    def({
      id: 'rooster',
      name: 'The Fat Rooster',
      behavior: 'boss',
      hp: 70,
      speed: 96,
      radius: 26,
      color: '#e04a3a',
      accent: '#7a1a12',
      feed: 14,
      boss: true,
      shootCooldown: 1.7,
      shootSpeed: 280,
      shootDamage: 1,
      shootCount: 5,
      shootSpread: 0.9,
      shootRadius: 11,
    }),
    // Unique floor bosses. Each one keeps the shared boss behaviour but has its
    // own stats and volley pattern, so every floor fight feels different.
    def({ id: 'vulture', name: 'Carrion Vulture', behavior: 'boss', hp: 60, speed: 120, radius: 24, color: '#5a4a3a', accent: '#2a2018', feed: 14, boss: true, shootCooldown: 1.4, shootSpeed: 340, shootDamage: 1, shootCount: 3, shootSpread: 0.5, shootRadius: 10 }),
    def({ id: 'cassowary', name: 'Dagger Cassowary', behavior: 'boss', hp: 80, speed: 150, radius: 25, color: '#3a3a4a', accent: '#c94f3d', feed: 16, boss: true, shootCooldown: 2.1, shootSpeed: 380, shootDamage: 1, shootCount: 1, shootSpread: 0, shootRadius: 12 }),
    def({ id: 'wolf', name: 'Dire Wolf', behavior: 'boss', hp: 90, speed: 170, radius: 26, color: '#7a7a86', accent: '#2a2a33', feed: 18, boss: true, shootCooldown: 1.9, shootSpeed: 360, shootDamage: 1, shootCount: 2, shootSpread: 0.3, shootRadius: 10 }),
    def({ id: 'bear', name: 'Brown Bear', behavior: 'boss', hp: 110, speed: 90, radius: 30, color: '#6a4a2a', accent: '#3a2412', feed: 20, boss: true, shootCooldown: 2.4, shootSpeed: 260, shootDamage: 1, shootCount: 6, shootSpread: 1.6, shootRadius: 13 }),
    def({ id: 'hawk', name: 'Storm Hawk', behavior: 'boss', hp: 75, speed: 180, radius: 22, color: '#b08050', accent: '#4a2e18', feed: 17, boss: true, shootCooldown: 1.2, shootSpeed: 420, shootDamage: 1, shootCount: 1, shootSpread: 0, shootRadius: 9 }),
    def({ id: 'croc', name: 'Swamp Croc', behavior: 'boss', hp: 120, speed: 100, radius: 30, color: '#5a7a3a', accent: '#24361a', feed: 22, boss: true, shootCooldown: 2.0, shootSpeed: 300, shootDamage: 1, shootCount: 4, shootSpread: 0.8, shootRadius: 12 }),
    def({ id: 'lion', name: 'Maned Lion', behavior: 'boss', hp: 130, speed: 140, radius: 30, color: '#d8a24a', accent: '#7a4a16', feed: 24, boss: true, shootCooldown: 1.6, shootSpeed: 340, shootDamage: 1, shootCount: 3, shootSpread: 0.6, shootRadius: 11 }),
    def({ id: 'shark', name: 'Land Shark', behavior: 'boss', hp: 150, speed: 130, radius: 32, color: '#7090a8', accent: '#2a3e52', feed: 26, boss: true, shootCooldown: 1.8, shootSpeed: 320, shootDamage: 1, shootCount: 5, shootSpread: 1.1, shootRadius: 12 }),
    def({ id: 'tyrant', name: 'Tyrant Gator', behavior: 'boss', hp: 170, speed: 110, radius: 34, color: '#4a6a4a', accent: '#1a2e1a', feed: 28, boss: true, shootCooldown: 1.5, shootSpeed: 360, shootDamage: 1, shootCount: 7, shootSpread: 1.4, shootRadius: 13 }),
  ].map((entry) => [entry.id, entry]),
) as Record<string, EnemyDef>;

export const ENEMY_DEFS: Record<string, EnemyDef> = Object.fromEntries(
  Object.values(BASE_ENEMY_DEFS).map((entry) => {
    if (entry.boss || UNNERFED_ENEMIES.includes(entry.id)) {
      return [entry.id, entry];
    }
    return [
      entry.id,
      {
        ...entry,
        speed: entry.speed * NERF.speedMul,
        shootCooldown: entry.shootCooldown * NERF.cooldownMul,
        lungeCooldown: entry.lungeCooldown * NERF.cooldownMul,
      },
    ];
  }),
) as Record<string, EnemyDef>;

/** The unique boss for each floor. Floors past the tenth reuse the list in order. */
export const FLOOR_BOSS_IDS: readonly string[] = [
  'rooster',
  'vulture',
  'cassowary',
  'wolf',
  'bear',
  'hawk',
  'croc',
  'lion',
  'shark',
  'tyrant',
];

export function bossForFloor(depth: number): string {
  return FLOOR_BOSS_IDS[(Math.max(1, depth) - 1) % FLOOR_BOSS_IDS.length]!;
}

export interface EnemyShotEvent {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  color: string;
  /** Turn rate (radians/sec) for enemy projectiles that home on the player. */
  homing?: number;
}

export type EnemyMode = 'move' | 'telegraph' | 'dash' | 'special';

export interface Enemy {
  id: number;
  def: EnemyDef;
  /** Center position. */
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  dirX: number;
  dirY: number;
  facingX: number;
  facingY: number;
  timer: number;
  mode: EnemyMode;
  hurtTime: number;
  hitFlash: number;
  dead: boolean;
  removed: boolean;
  deathTime: number;
  slowTime: number;
  slowFactor: number;
  poisonTime: number;
  poisonDps: number;
  bob: number;
  shootTimer: number;
  lungeTimer: number;
  /**
   * Boss secondary attack state. `specialTimer` counts down to the next
   * special while moving; during one, `specialPhase` is 0 (windup) or 1
   * (active) and `specialStep` counts sub-steps (dashes, strikes, emissions).
   * `specialX`/`specialY` cache a locked target or return point.
   */
  specialTimer: number;
  specialPhase: number;
  specialStep: number;
  specialX: number;
  specialY: number;
  /** Rotation for spiral boss volleys. */
  phase: number;
  knockX: number;
  knockY: number;
  feed: number;
  spawnX: number;
  spawnY: number;
}

export interface EnemyContext {
  playerX: number;
  playerY: number;
  playerAlive: boolean;
  room: EggRoom;
  rng: Rng;
  /**
   * Optional hook used by summon-style boss specials. Coordinates are tiles;
   * the caller decides how to add the enemy (so the AI never mutates the list
   * it is being iterated over).
   */
  spawnMinion?: (type: string, tileX: number, tileY: number) => void;
}

export function makeEnemy(
  defId: string,
  tileX: number,
  tileY: number,
  depth: number,
  id: number,
): Enemy {
  const definition = ENEMY_DEFS[defId] ?? ENEMY_DEFS['rat']!;
  const hpScale = 1 + (depth - 1) * 0.28;
  const speedScale = 1 + (depth - 1) * 0.05;
  const hp = Math.round(definition.hp * hpScale);
  const x = (tileX + 0.5) * TILE;
  const y = (tileY + 0.5) * TILE;
  return {
    id,
    def: { ...definition, speed: definition.speed * speedScale },
    x,
    y,
    r: definition.radius,
    hp,
    maxHp: hp,
    dirX: 0,
    dirY: 1,
    facingX: 0,
    facingY: 1,
    timer: 0,
    mode: 'move',
    hurtTime: 0,
    hitFlash: 0,
    dead: false,
    removed: false,
    deathTime: 0,
    slowTime: 0,
    slowFactor: 1,
    poisonTime: 0,
    poisonDps: 0,
    bob: Math.random() * Math.PI * 2,
    shootTimer: Math.random() * definition.shootCooldown,
    lungeTimer: definition.lungeCooldown * (0.5 + Math.random() * 0.5),
    specialTimer: definition.boss
      ? bossSpecial(definition.id).cooldown * (0.6 + Math.random() * 0.4) * BOSS.specialCooldownMul
      : 0,
    specialPhase: 0,
    specialStep: 0,
    specialX: 0,
    specialY: 0,
    phase: 0,
    knockX: 0,
    knockY: 0,
    feed: definition.feed,
    spawnX: x,
    spawnY: y,
  };
}

function cardinal(rng: Rng): { x: number; y: number } {
  const dirs = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
  ];
  return dirs[randInt(rng, 0, 4)]!;
}

function aimAt(fromX: number, fromY: number, toX: number, toY: number): { x: number; y: number } {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/**
 * Advance one enemy. Returns any shots it fired this step and mutates the enemy
 * in place. The caller is responsible for applying collision damage to the
 * player and for removing dead enemies.
 */
export function updateEnemy(e: Enemy, ctx: EnemyContext, dt: number): EnemyShotEvent[] {
  const shots: EnemyShotEvent[] = [];
  e.bob += dt;
  e.hitFlash = Math.max(0, e.hitFlash - dt);

  if (e.dead) {
    e.deathTime += dt;
    return shots;
  }

  e.hurtTime = Math.max(0, e.hurtTime - dt);
  if (e.slowTime > 0) {
    e.slowTime -= dt;
    if (e.slowTime <= 0) e.slowFactor = 1;
  }
  if (e.poisonTime > 0 && e.poisonDps > 0) {
    e.poisonTime -= dt;
    e.hp -= e.poisonDps * dt;
  }

  const speed = e.def.speed * ENEMY.speedMul * e.slowFactor;
  let vx = e.knockX;
  let vy = e.knockY;

  if (e.hurtTime <= 0) {
    const motion = behaviorMotion(e, ctx, speed, dt, shots);
    vx += motion.x;
    vy += motion.y;
  }

  // Knockback decays quickly so hits feel snappy.
  const decay = Math.exp(-ENEMY.knockbackFalloff * dt);
  e.knockX *= decay;
  e.knockY *= decay;
  if (Math.abs(e.knockX) < 2) e.knockX = 0;
  if (Math.abs(e.knockY) < 2) e.knockY = 0;

  if (vx !== 0 || vy !== 0) {
    const rect = { x: e.x - e.r, y: e.y - e.r, w: e.r * 2, h: e.r * 2 };
    const moved = moveAabb(rect, vx * dt, vy * dt, ctx.room);
    e.x = moved.x + e.r;
    e.y = moved.y + e.r;
    if (moved.hitX) {
      e.knockX = 0;
      onWallHit(e, 'x', ctx);
    }
    if (moved.hitY) {
      e.knockY = 0;
      onWallHit(e, 'y', ctx);
    }
  }

  return shots;
}

function onWallHit(e: Enemy, axis: 'x' | 'y', ctx: EnemyContext): void {
  if (e.def.behavior === 'bounce') {
    if (axis === 'x') e.dirX = -e.dirX;
    else e.dirY = -e.dirY;
  } else if (e.def.behavior === 'wander' || e.def.behavior === 'erratic' || e.def.behavior === 'hop') {
    const next = cardinal(ctx.rng);
    e.dirX = next.x;
    e.dirY = next.y;
    e.timer = Math.min(e.timer, 0.2);
  }
}

function behaviorMotion(
  e: Enemy,
  ctx: EnemyContext,
  speed: number,
  dt: number,
  shots: EnemyShotEvent[],
): { x: number; y: number } {
  const { behavior } = e.def;
  const playerDx = ctx.playerX - e.x;
  const playerDy = ctx.playerY - e.y;
  const dist = Math.hypot(playerDx, playerDy) || 1;

  switch (behavior) {
    case 'wander':
    case 'erratic': {
      e.timer -= dt;
      if (e.timer <= 0) {
        const next = cardinal(ctx.rng);
        e.dirX = next.x;
        e.dirY = next.y;
        e.timer =
          behavior === 'erratic'
            ? randRange(ctx.rng, 0.35, 0.85)
            : randRange(ctx.rng, ENEMY.wanderTimeMin, ENEMY.wanderTimeMax);
      }
      if (e.dirX === 0 && e.dirY === 0) {
        e.dirY = 1;
      }
      e.facingX = e.dirX;
      e.facingY = e.dirY;
      return { x: e.dirX * speed, y: e.dirY * speed };
    }

    case 'bounce': {
      if (e.dirX === 0 && e.dirY === 0) {
        const next = cardinal(ctx.rng);
        e.dirX = next.x;
        e.dirY = next.y;
      }
      e.facingX = e.dirX;
      e.facingY = e.dirY;
      return { x: e.dirX * speed, y: e.dirY * speed };
    }

    case 'hop': {
      e.timer -= dt;
      if (e.mode === 'move' && e.timer <= 0) {
        e.mode = 'dash';
        e.timer = 0.2;
        const next = cardinal(ctx.rng);
        e.dirX = next.x;
        e.dirY = next.y;
      } else if (e.mode === 'dash' && e.timer <= 0) {
        e.mode = 'move';
        e.timer = randRange(ctx.rng, 0.25, 0.5);
      }
      const burst = e.mode === 'dash' ? speed * 3.1 : 0;
      e.facingX = e.dirX;
      e.facingY = e.dirY;
      return { x: e.dirX * burst, y: e.dirY * burst };
    }

    case 'chase': {
      const aim = aimAt(e.x, e.y, ctx.playerX, ctx.playerY);
      e.facingX = aim.x;
      e.facingY = aim.y;
      return { x: aim.x * speed, y: aim.y * speed };
    }

    case 'lunge': {
      e.timer -= dt;
      if (e.mode === 'move') {
        if (e.timer <= 0 && ctx.playerAlive && dist < 460) {
          e.mode = 'telegraph';
          e.timer = 0.38;
        }
        const aim = aimAt(e.x, e.y, ctx.playerX, ctx.playerY);
        e.facingX = aim.x;
        e.facingY = aim.y;
        return { x: aim.x * speed, y: aim.y * speed };
      }
      if (e.mode === 'telegraph') {
        const aim = aimAt(e.x, e.y, ctx.playerX, ctx.playerY);
        e.facingX = aim.x;
        e.facingY = aim.y;
        if (e.timer <= 0) {
          e.mode = 'dash';
          e.timer = 0.26;
          e.dirX = aim.x;
          e.dirY = aim.y;
        }
        return { x: 0, y: 0 };
      }
      // dash
      if (e.timer <= 0) {
        e.mode = 'move';
        e.timer = e.def.lungeCooldown;
      }
      return { x: e.dirX * e.def.lungeSpeed, y: e.dirY * e.def.lungeSpeed };
    }

    case 'shoot': {
      if (e.mode === 'move') {
        e.timer -= dt;
        if (e.timer <= 0) {
          const next = cardinal(ctx.rng);
          e.dirX = next.x;
          e.dirY = next.y;
          e.timer = randRange(ctx.rng, 0.8, 1.8);
        }
        const aim = aimAt(e.x, e.y, ctx.playerX, ctx.playerY);
        e.facingX = aim.x;
        e.facingY = aim.y;
        e.shootTimer -= dt;
        if (e.shootTimer <= 0 && ctx.playerAlive && dist < ENEMY.shootRange) {
          e.mode = 'telegraph';
          e.timer = 0.36;
        }
        return { x: e.dirX * speed * 0.5, y: e.dirY * speed * 0.5 };
      }
      const aim = aimAt(e.x, e.y, ctx.playerX, ctx.playerY);
      e.facingX = aim.x;
      e.facingY = aim.y;
      e.timer -= dt;
      if (e.timer <= 0) {
        fireAimed(e, shots, aim);
        e.mode = 'move';
        e.shootTimer = e.def.shootCooldown;
      }
      return { x: 0, y: 0 };
    }

    case 'boss': {
      if (e.mode === 'move') {
        e.shootTimer -= dt;
        e.specialTimer -= dt;
        const aim = aimAt(e.x, e.y, ctx.playerX, ctx.playerY);
        e.facingX = aim.x;
        e.facingY = aim.y;
        // The secondary attack takes priority when its timer elapses.
        if (e.specialTimer <= 0 && ctx.playerAlive) {
          e.mode = 'special';
          e.specialPhase = 0;
          e.specialStep = 0;
          e.specialX = ctx.playerX;
          e.specialY = ctx.playerY;
          e.timer = bossSpecial(e.def.id).windup;
          return { x: 0, y: 0 };
        }
        if (e.shootTimer <= 0 && ctx.playerAlive) {
          e.mode = 'telegraph';
          // Longer windup than regular enemies, so every attack is readable.
          e.timer = 0.9;
        }
        return bossMotion(e, ctx, speed, dt, dist, aim);
      }
      if (e.mode === 'telegraph') {
        const aim = aimAt(e.x, e.y, ctx.playerX, ctx.playerY);
        e.facingX = aim.x;
        e.facingY = aim.y;
        e.timer -= dt;
        if (e.timer <= 0) {
          // The phase advances each volley, so spirals keep turning.
          e.phase = (e.phase + 0.35) % (Math.PI * 2);
          fireBoss(e, shots, aim, e.phase);
          e.mode = 'move';
          e.shootTimer = e.def.shootCooldown;
        }
        return { x: 0, y: 0 };
      }
      if (e.mode === 'special') {
        return bossSpecialStep(e, ctx, dt, shots);
      }
      return { x: 0, y: 0 };
    }
  }
}

/**
 * How each boss moves. Movement is what makes two bosses feel different, so the
 * styles below are picked per boss rather than all walking straight at you.
 *   chase   walks straight at the player
 *   strafe  circles the player at a set range, reversing every few seconds
 *   dive    holds at range, then dashes through the player's position
 *   orbit   drifts slowly around the room's centre
 */
export type BossMove = 'chase' | 'strafe' | 'dive' | 'orbit';

const BOSS_MOVE: Record<string, BossMove> = {
  rooster: 'chase',
  vulture: 'orbit',
  cassowary: 'dive',
  wolf: 'strafe',
  bear: 'chase',
  hawk: 'dive',
  croc: 'orbit',
  lion: 'strafe',
  shark: 'dive',
  tyrant: 'orbit',
};

export function bossMove(id: string): BossMove {
  return BOSS_MOVE[id] ?? 'chase';
}

function bossMotion(
  e: Enemy,
  ctx: EnemyContext,
  speed: number,
  dt: number,
  dist: number,
  aim: { x: number; y: number },
): { x: number; y: number } {
  switch (bossMove(e.def.id)) {
    case 'chase':
      return { x: aim.x * speed, y: aim.y * speed };
    case 'strafe': {
      // Tangential motion around the player, with a reversal every few seconds.
      e.timer -= dt;
      if (e.timer <= 0) {
        e.dirX = -e.dirX || 1;
        e.timer = 2.5;
      }
      const tangentX = -aim.y * e.dirX;
      const tangentY = aim.x * e.dirX;
      const pull = dist > 170 ? 1 : dist < 120 ? -1 : 0;
      return { x: (tangentX + aim.x * pull) * speed, y: (tangentY + aim.y * pull) * speed };
    }
    case 'dive': {
      // Keep distance, then dash through the player after a short pause.
      e.timer -= dt;
      if (e.timer <= 0) {
        if (e.mode === 'move' && dist > 140) {
          e.dirX = aim.x;
          e.dirY = aim.y;
          e.timer = 0.45;
          return { x: e.dirX * speed * 3.2, y: e.dirY * speed * 3.2 };
        }
        e.timer = 1.2;
      }
      const pull = dist < 150 ? -1 : 0.25;
      return { x: -aim.x * speed * pull, y: -aim.y * speed * pull };
    }
    case 'orbit': {
      // Slow drift toward the room centre with a sideways sweep.
      const cx = ctx.room.width * TILE * 0.5;
      const cy = ctx.room.height * TILE * 0.5;
      const toCx = cx - e.x;
      const toCy = cy - e.y;
      const len = Math.hypot(toCx, toCy) || 1;
      return { x: (toCx / len) * speed * 0.5 - aim.y * speed * 0.6, y: (toCy / len) * speed * 0.5 + aim.x * speed * 0.6 };
    }
  }
}

/**
 * Boss attack shapes. Every shape leaves a gap or a slow, readable pattern so
 * the player can dodge by moving, instead of the big fan being unavoidable.
 */
export type BossPattern = 'aimed' | 'spiral' | 'ring-gap' | 'burst';

const BOSS_PATTERN: Record<string, BossPattern> = {
  rooster: 'aimed',
  vulture: 'burst',
  cassowary: 'aimed',
  wolf: 'burst',
  bear: 'ring-gap',
  hawk: 'aimed',
  croc: 'spiral',
  lion: 'burst',
  shark: 'ring-gap',
  tyrant: 'spiral',
};

export function bossPattern(id: string): BossPattern {
  return BOSS_PATTERN[id] ?? 'aimed';
}

/**
 * Every boss has one secondary attack, keyed by boss id. They are built from a
 * small set of archetypes so the code stays tidy, but each boss uses exactly
 * one archetype with its own tuning, so the special always feels like *that*
 * boss. All of them telegraph first and leave a dodge window.
 */
export type BossSpecialKind =
  | 'burst'
  | 'ring'
  | 'charge'
  | 'summon'
  | 'slam'
  | 'strike'
  | 'sweep'
  | 'pounce'
  | 'homing'
  | 'roll';

export interface BossSpecialDef {
  kind: BossSpecialKind;
  /** Seconds between specials. */
  cooldown: number;
  /** Telegraph duration before the special actually happens. */
  windup: number;
  /** Active/channel duration (charge dash time, sweep/roll length). */
  duration: number;
  /** Projectile count (fan/ring/volley/strikes). */
  count: number;
  /** Angular spread in radians (fans) or full turn (rings). */
  spread: number;
  /** Projectile speed override. */
  speed: number;
  /** Repeated steps: dashes for charge, bolts for strike. */
  steps: number;
  /** Minion type spawned by a summon special. */
  minion?: string;
}

const BOSS_SPECIAL: Record<string, BossSpecialDef> = {
  // Wide lobbed fan of eggs.
  rooster: { kind: 'burst', cooldown: 8, windup: 0.7, duration: 0.25, count: 7, spread: 1.7, speed: 230, steps: 1 },
  // Radial ring of bones from the roost.
  vulture: { kind: 'ring', cooldown: 8.5, windup: 0.8, duration: 0.25, count: 12, spread: Math.PI * 2, speed: 205, steps: 1 },
  // Three rapid kicks across the lanes.
  cassowary: { kind: 'charge', cooldown: 7, windup: 0.6, duration: 0.24, count: 0, spread: 0, speed: 640, steps: 3 },
  // Calls the pack.
  wolf: { kind: 'summon', cooldown: 12, windup: 0.9, duration: 0.25, count: 3, spread: 0, speed: 0, steps: 1, minion: 'rat' },
  // Heavy ground slam: a big, slow shockwave ring.
  bear: { kind: 'slam', cooldown: 9, windup: 1.0, duration: 0.3, count: 14, spread: Math.PI * 2, speed: 165, steps: 1 },
  // Pinpoint lightning barrage.
  hawk: { kind: 'strike', cooldown: 7, windup: 0.9, duration: 0.25, count: 0, spread: 0, speed: 560, steps: 3 },
  // Sweeping tail arc.
  croc: { kind: 'sweep', cooldown: 8, windup: 0.7, duration: 1.0, count: 10, spread: Math.PI * 0.85, speed: 270, steps: 1 },
  // Dash out and back.
  lion: { kind: 'pounce', cooldown: 7.5, windup: 0.55, duration: 0.2, count: 0, spread: 0, speed: 700, steps: 1 },
  // A volley of blood that curves after you.
  shark: { kind: 'homing', cooldown: 8, windup: 0.8, duration: 0.3, count: 5, spread: 0.9, speed: 235, steps: 1 },
  // Spinning death roll: a fast double spiral.
  tyrant: { kind: 'roll', cooldown: 9, windup: 0.9, duration: 1.4, count: 18, spread: Math.PI * 2, speed: 225, steps: 1 },
};

export function bossSpecial(id: string): BossSpecialDef {
  return BOSS_SPECIAL[id] ?? BOSS_SPECIAL['rooster']!;
}

function fireBoss(
  e: Enemy,
  shots: EnemyShotEvent[],
  aim: { x: number; y: number },
  phase: number,
): void {
  const pattern = bossPattern(e.def.id);
  const { x, y } = e;
  const speed = e.def.shootSpeed;
  const push = (angle: number, s: number = speed) =>
    shots.push({
      x: x + Math.cos(angle) * (e.r + 2),
      y: y + Math.sin(angle) * (e.r + 2),
      vx: Math.cos(angle) * s,
      vy: Math.sin(angle) * s,
      damage: e.def.shootDamage,
      radius: e.def.shootRadius,
      color: e.def.accent,
    });
  const base = Math.atan2(aim.y, aim.x);

  switch (pattern) {
    case 'aimed':
      // One clear shot straight at the player: dodge by sidestepping.
      push(base);
      return;
    case 'burst':
      // Two quick, slightly spread shots: the second is easy to step around.
      push(base - 0.12);
      push(base + 0.12);
      return;
    case 'spiral': {
      // Eight evenly spaced shots, rotated a little each volley: walk the gaps.
      const count = 8;
      for (let i = 0; i < count; i++) {
        push(phase + (i / count) * Math.PI * 2);
      }
      return;
    }
    case 'ring-gap': {
      // A full ring with one gap aimed away from the player, so there is a
      // safe lane to escape through.
      const count = 12;
      const gap = base + Math.PI;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        let diff = Math.abs(angle - gap) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < Math.PI / 6) continue;
        push(angle, speed * 0.8);
      }
      return;
    }
  }
}

function fireAimed(
  e: Enemy,
  shots: EnemyShotEvent[],
  aim: { x: number; y: number },
): void {
  const base = Math.atan2(aim.y, aim.x);
  const count = Math.max(1, e.def.shootCount);
  const spread = e.def.shootSpread;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1) - 0.5;
    const angle = base + t * spread;
    shots.push({
      x: e.x + Math.cos(angle) * (e.r + 2),
      y: e.y + Math.sin(angle) * (e.r + 2),
      vx: Math.cos(angle) * e.def.shootSpeed,
      vy: Math.sin(angle) * e.def.shootSpeed,
      damage: e.def.shootDamage,
      radius: e.def.shootRadius,
      color: e.def.accent,
    });
  }
}

// ------------------------------------------------------- boss secondary attacks

/** Push an enemy shot fired from the boss body at an arbitrary angle. */
function specialPush(
  e: Enemy,
  shots: EnemyShotEvent[],
  angle: number,
  speed: number,
  homing = 0,
): void {
  shots.push({
    x: e.x + Math.cos(angle) * (e.r + 2),
    y: e.y + Math.sin(angle) * (e.r + 2),
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage: e.def.shootDamage,
    radius: e.def.shootRadius,
    color: e.def.accent,
    homing,
  });
}

/** How long the active phase of a special lasts. */
function specialActiveTime(def: BossSpecialDef): number {
  switch (def.kind) {
    case 'charge':
      return def.steps * (def.duration + 0.22);
    case 'pounce':
      return def.duration * 2;
    case 'sweep':
    case 'roll':
      return def.duration;
    case 'strike':
      return def.steps * 0.28;
    default:
      return BOSS.specialRecovery;
  }
}

/** Find open tiles in expanding rings around the boss for a summon. */
function summonMinions(e: Enemy, ctx: EnemyContext, def: BossSpecialDef): void {
  if (!ctx.spawnMinion) return;
  const cx = Math.floor(e.x / TILE);
  const cy = Math.floor(e.y / TILE);
  const chosen: { x: number; y: number }[] = [];
  for (let radius = 2; radius <= 7 && chosen.length < def.count; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= ctx.room.width - 1 || y >= ctx.room.height - 1) continue;
        if (charIsSolid(charAt(ctx.room, x, y))) continue;
        if (chosen.some((c) => Math.hypot(c.x - x, c.y - y) < 3)) continue;
        chosen.push({ x, y });
        if (chosen.length >= def.count) break;
      }
    }
  }
  for (const spot of chosen) {
    ctx.spawnMinion(def.minion ?? 'rat', spot.x, spot.y);
  }
}

/** Fire the instantaneous part of a special (channeled kinds are set up here). */
function beginSpecial(
  e: Enemy,
  ctx: EnemyContext,
  def: BossSpecialDef,
  aim: { x: number; y: number },
  shots: EnemyShotEvent[],
): void {
  switch (def.kind) {
    case 'burst': {
      const base = Math.atan2(aim.y, aim.x);
      for (let i = 0; i < def.count; i++) {
        const t = def.count === 1 ? 0 : i / (def.count - 1) - 0.5;
        specialPush(e, shots, base + t * def.spread, def.speed);
      }
      return;
    }
    case 'ring': {
      for (let i = 0; i < def.count; i++) {
        specialPush(e, shots, (i / def.count) * Math.PI * 2, def.speed);
      }
      return;
    }
    case 'slam': {
      // A full ring with one gap aimed away from the player: an escape lane.
      const base = Math.atan2(aim.y, aim.x);
      const gap = base + Math.PI;
      for (let i = 0; i < def.count; i++) {
        const angle = (i / def.count) * Math.PI * 2;
        let diff = Math.abs(angle - gap) % (Math.PI * 2);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < Math.PI / 5) continue;
        specialPush(e, shots, angle, def.speed);
      }
      return;
    }
    case 'homing': {
      const base = Math.atan2(aim.y, aim.x);
      for (let i = 0; i < def.count; i++) {
        const t = def.count === 1 ? 0 : i / (def.count - 1) - 0.5;
        specialPush(e, shots, base + t * def.spread, def.speed, 3.2);
      }
      return;
    }
    case 'summon': {
      summonMinions(e, ctx, def);
      return;
    }
    case 'pounce': {
      // Remember where to return to.
      e.specialX = e.x;
      e.specialY = e.y;
      return;
    }
    default:
      // charge / sweep / roll / strike play out in bossSpecialStep.
      return;
  }
}

/** Advance a boss through its secondary attack. Returns this step's motion. */
function bossSpecialStep(
  e: Enemy,
  ctx: EnemyContext,
  dt: number,
  shots: EnemyShotEvent[],
): { x: number; y: number } {
  const def = bossSpecial(e.def.id);
  const aim = aimAt(e.x, e.y, ctx.playerX, ctx.playerY);
  e.facingX = aim.x;
  e.facingY = aim.y;

  if (e.specialPhase === 0) {
    // Windup: keep tracking so aimed specials lock on when it ends.
    e.specialX = ctx.playerX;
    e.specialY = ctx.playerY;
    e.timer -= dt;
    if (e.timer <= 0) {
      beginSpecial(e, ctx, def, aim, shots);
      e.specialPhase = 1;
      e.specialStep = 0;
      e.timer = specialActiveTime(def);
    }
    return { x: 0, y: 0 };
  }

  const total = specialActiveTime(def);
  const elapsed = Math.max(0, total - Math.max(0, e.timer));
  e.timer -= dt;

  switch (def.kind) {
    case 'charge': {
      // Alternate dash / rest phases, always aimed at the player.
      const phaseLen = total / Math.max(1, def.steps * 2 - 1);
      const phase = Math.min(def.steps * 2 - 2, Math.floor(elapsed / phaseLen));
      const dashing = phase % 2 === 0;
      if (e.timer <= 0) finishSpecial(e, def);
      return dashing ? { x: aim.x * def.speed, y: aim.y * def.speed } : { x: 0, y: 0 };
    }
    case 'pounce': {
      let motion: { x: number; y: number };
      if (elapsed < def.duration) {
        motion = { x: aim.x * def.speed, y: aim.y * def.speed };
      } else {
        const back = aimAt(e.x, e.y, e.specialX, e.specialY);
        motion = { x: back.x * def.speed, y: back.y * def.speed };
      }
      if (e.timer <= 0) finishSpecial(e, def);
      return motion;
    }
    case 'sweep': {
      const base = Math.atan2(aim.y, aim.x);
      const target = Math.floor((elapsed / def.duration) * def.count);
      while (e.specialStep < target) {
        const t = def.count === 1 ? 0 : e.specialStep / (def.count - 1) - 0.5;
        specialPush(e, shots, base + t * def.spread, def.speed);
        e.specialStep += 1;
      }
      if (e.timer <= 0) finishSpecial(e, def);
      return { x: 0, y: 0 };
    }
    case 'roll': {
      // A double spiral: two opposite arms spinning around the boss.
      const target = Math.floor((elapsed / def.duration) * def.count);
      const step = (Math.PI * 2 * 3) / Math.max(1, def.count);
      while (e.specialStep < target) {
        const angle = e.phase + e.specialStep * step;
        specialPush(e, shots, angle, def.speed);
        specialPush(e, shots, angle + Math.PI, def.speed);
        e.specialStep += 1;
      }
      if (e.timer <= 0) finishSpecial(e, def);
      return { x: 0, y: 0 };
    }
    case 'strike': {
      const interval = 0.28;
      const target = Math.floor(elapsed / interval);
      while (e.specialStep < target && e.specialStep < def.steps) {
        const tx = ctx.playerX;
        const ty = ctx.playerY;
        e.specialX = tx;
        e.specialY = ty;
        // A bolt falls from above onto the marked spot. Clamp the spawn so a
        // strike near the top wall does not start outside the room.
        shots.push({
          x: tx,
          y: Math.max(TILE * 1.5, ty - 130),
          vx: 0,
          vy: def.speed,
          damage: e.def.shootDamage,
          radius: e.def.shootRadius,
          color: e.def.accent,
        });
        e.specialStep += 1;
      }
      if (e.timer <= 0) finishSpecial(e, def);
      return { x: 0, y: 0 };
    }
    default:
      if (e.timer <= 0) finishSpecial(e, def);
      return { x: 0, y: 0 };
  }
}

function finishSpecial(e: Enemy, def: BossSpecialDef): void {
  e.mode = 'move';
  e.specialPhase = 0;
  e.specialStep = 0;
  e.specialTimer = def.cooldown * BOSS.specialCooldownMul;
}

export function enemyRect(e: Enemy): { x: number; y: number; w: number; h: number } {
  return { x: e.x - e.r, y: e.y - e.r, w: e.r * 2, h: e.r * 2 };
}
