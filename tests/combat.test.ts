import { describe, expect, it } from 'vitest';
import { CHICKEN_BY_ID, CHICKENS } from '../src/game/chickens/chickens';
import { resolveProjectile } from '../src/game/chickens/types';
import {
  ENEMY_DEFS,
  FLOOR_BOSS_IDS,
  bossMove,
  bossPattern,
  makeEnemy,
  updateEnemy,
} from '../src/game/enemies/enemies';
import { makeBlankRoom } from '../src/game/level/roomFormat';
import { BASE_MODS } from '../src/game/perks/perks';
import { spawnFromFire, stepProjectile } from '../src/game/projectiles/projectiles';
import { mulberry32 } from '../src/game/util/math';

describe('enemy balance', () => {
  it('nerfs every regular enemy except the rat and snake', () => {
    const base = { cat: { speed: 132, lungeCooldown: 3.4 }, bat: { speed: 182 } };
    expect(ENEMY_DEFS['cat']!.speed).toBeCloseTo(132 * 0.9);
    expect(ENEMY_DEFS['cat']!.lungeCooldown).toBeCloseTo(3.4 * 1.15);
    expect(ENEMY_DEFS['bat']!.speed).toBeCloseTo(base.bat.speed * 0.9);
    expect(ENEMY_DEFS['rat']!.speed).toBe(126);
    expect(ENEMY_DEFS['snake']!.speed).toBe(162);
  });

  it('gives every floor boss its own movement style', () => {
    const moves = FLOOR_BOSS_IDS.map((id) => bossMove(id));
    expect(new Set(moves).size).toBeGreaterThanOrEqual(3);
    for (const id of FLOOR_BOSS_IDS) {
      expect(['chase', 'strafe', 'dive', 'orbit']).toContain(bossMove(id));
    }
  });

  it('gives every floor boss a defined attack pattern', () => {
    for (const id of FLOOR_BOSS_IDS) {
      expect(['aimed', 'burst', 'spiral', 'ring-gap']).toContain(bossPattern(id));
    }
  });
});

describe('chicken roster', () => {
  it('has at least ten chickens including a 3-shot and an explosive egg', () => {
    expect(CHICKENS.length).toBeGreaterThanOrEqual(10);
    expect(CHICKENS.some((c) => (c.projectile.count ?? 1) >= 3)).toBe(true);
    expect(CHICKENS.some((c) => (c.projectile.explode ?? 0) > 0)).toBe(true);
  });

  it('applies perk modifiers to damage and projectile count', () => {
    const triple = CHICKEN_BY_ID['triple']!;
    const mods = { ...BASE_MODS, damageMul: 2, extraProjectiles: 1 };
    const fire = resolveProjectile(triple, mods);
    expect(fire.count).toBe((triple.projectile.count ?? 1) + 1);
    expect(fire.damage).toBeCloseTo((triple.projectile.damage ?? 0) * 2);
  });
});

describe('projectiles', () => {
  it('spawns one projectile per shot and fans them out', () => {
    const fire = resolveProjectile(CHICKEN_BY_ID['triple']!, BASE_MODS);
    const shots = spawnFromFire(fire, 100, 100, 0);
    expect(shots.length).toBe(fire.count);
    expect(new Set(shots.map((shot) => shot.angle)).size).toBeGreaterThan(1);
  });

  it('expires after its lifetime', () => {
    const fire = { ...resolveProjectile(CHICKEN_BY_ID['henny']!, BASE_MODS), life: 0.1 };
    const projectile = spawnFromFire(fire, 300, 176, 0)[0]!;
    const room = makeBlankRoom(19, 11);
    let steps = 0;
    while (!projectile.dead && steps < 1000) {
      stepProjectile(projectile, 1 / 60, { room, homingTarget: null, playerX: 0, playerY: 0 });
      steps += 1;
    }
    expect(projectile.dead).toBe(true);
  });

  it('richochets off a wall when it has bounces', () => {
    const fire = {
      ...resolveProjectile(CHICKEN_BY_ID['henny']!, BASE_MODS),
      life: 10,
      bounce: 3,
      speed: 500,
    };
    const projectile = spawnFromFire(fire, 200, 176, 0)[0]!;
    const room = makeBlankRoom(19, 11);
    let reversed = false;
    for (let i = 0; i < 600; i++) {
      stepProjectile(projectile, 1 / 60, { room, homingTarget: null, playerX: 0, playerY: 0 });
      if (projectile.vx < 0) {
        reversed = true;
        break;
      }
    }
    expect(reversed).toBe(true);
  });
});

describe('enemy ai', () => {
  const room = () => makeBlankRoom(19, 11);

  it('chasers close the distance to the player', () => {
    const enemy = makeEnemy('crow', 3, 5, 1, 1);
    const target = { x: 500, y: 200 };
    const start = Math.hypot(enemy.x - target.x, enemy.y - target.y);
    const rng = mulberry32(1);
    for (let i = 0; i < 60; i++) {
      updateEnemy(enemy, { playerX: target.x, playerY: target.y, playerAlive: true, room: room(), rng }, 1 / 60);
    }
    const end = Math.hypot(enemy.x - target.x, enemy.y - target.y);
    expect(end).toBeLessThan(start);
  });

  it('ranged enemies telegraph and then fire', () => {
    const arena = room();
    const spider = makeEnemy('spider', 9, 5, 1, 1);
    const rng = mulberry32(3);
    let shots = 0;
    for (let i = 0; i < 600; i++) {
      shots += updateEnemy(
        spider,
        { playerX: spider.x + 120, playerY: spider.y, playerAlive: true, room: arena, rng },
        1 / 60,
      ).length;
    }
    expect(shots).toBeGreaterThan(0);
  });

  it('holds enemy AI still during the room-entry grace window', () => {
    const enemy = makeEnemy('crow', 3, 5, 1, 1);
    enemy.inertTime = 1.0;
    const target = { x: 500, y: 200 };
    const start = { x: enemy.x, y: enemy.y };
    const rng = mulberry32(2);
    const ctx = () => ({
      playerX: target.x,
      playerY: target.y,
      playerAlive: true,
      room: room(),
      rng,
    });
    // Frozen through the grace window...
    for (let i = 0; i < 59; i++) updateEnemy(enemy, ctx(), 1 / 60);
    expect(enemy.x).toBeCloseTo(start.x);
    expect(enemy.y).toBeCloseTo(start.y);
    // ...then moving once it expires.
    for (let i = 0; i < 60; i++) updateEnemy(enemy, ctx(), 1 / 60);
    expect(Math.hypot(enemy.x - start.x, enemy.y - start.y)).toBeGreaterThan(0);
  });

  it('never pushes an enemy out of the room', () => {
    const arena = room();
    const rng = mulberry32(9);
    for (const type of ['rat', 'snake', 'slime', 'bat']) {
      const enemy = makeEnemy(type, 9, 5, 1, 1);
      for (let i = 0; i < 900; i++) {
        updateEnemy(enemy, { playerX: 320, playerY: 176, playerAlive: true, room: arena, rng }, 1 / 60);
      }
      expect(enemy.x).toBeGreaterThan(0);
      expect(enemy.y).toBeGreaterThan(0);
      expect(enemy.x).toBeLessThan(19 * 32);
      expect(enemy.y).toBeLessThan(11 * 32);
    }
  });
});
