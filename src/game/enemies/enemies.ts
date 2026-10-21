import { ENEMY, TILE } from '../config';
import type { EggRoom } from '../level/roomFormat';
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

export const ENEMY_DEFS: Record<string, EnemyDef> = Object.fromEntries(
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
      feed: 2,
      lungeCooldown: 2.1,
      lungeSpeed: 470,
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
  ].map((entry) => [entry.id, entry]),
) as Record<string, EnemyDef>;

export interface EnemyShotEvent {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  color: string;
}

export type EnemyMode = 'move' | 'telegraph' | 'dash';

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
      e.shootTimer -= dt;
      if (e.mode === 'move') {
        const aim = aimAt(e.x, e.y, ctx.playerX, ctx.playerY);
        e.facingX = aim.x;
        e.facingY = aim.y;
        if (e.shootTimer <= 0 && ctx.playerAlive) {
          e.mode = 'telegraph';
          e.timer = 0.5;
        }
        return { x: aim.x * speed, y: aim.y * speed };
      }
      if (e.mode === 'telegraph') {
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
      return { x: 0, y: 0 };
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

export function enemyRect(e: Enemy): { x: number; y: number; w: number; h: number } {
  return { x: e.x - e.r, y: e.y - e.r, w: e.r * 2, h: e.r * 2 };
}
