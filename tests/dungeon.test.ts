import { describe, expect, it } from 'vitest';
import { OPPOSITE } from '../src/game/dir';
import {
  ensureSpawns,
  generateDungeon,
  livingSpawns,
  neighborKey,
  recordSpawnHealth,
} from '../src/game/level/dungeon';
import { bossForFloor } from '../src/game/enemies/enemies';
import { mulberry32 } from '../src/game/util/math';
import { loadBuiltinRooms } from '../src/game/level/rooms';
import { seedFromText } from '../src/game/util/math';

function build(seed: number, depth = 1) {
  return generateDungeon({
    seed,
    depth,
    pool: loadBuiltinRooms(),
    ownedChickens: [],
    ownedPerks: [],
  });
}

describe('floor bosses', () => {
  it('gives every one of the first 10 floors a unique boss', () => {
    const ids = Array.from({ length: 10 }, (_, i) => bossForFloor(i + 1));
    expect(new Set(ids).size).toBe(10);
  });

  it('drops each floor boss into its own tagged arena', () => {
    for (let depth = 1; depth <= 10; depth++) {
      const dungeon = generateDungeon({
        seed: 11,
        depth,
        pool: loadBuiltinRooms(),
        ownedChickens: [],
        ownedPerks: [],
      });
      const bossNode = dungeon.nodes.get(dungeon.bossKey)!;
      expect(bossNode.room.tags ?? []).toContain(bossForFloor(depth));
    }
  });

  it('places the floor boss in the boss room', () => {
    const dungeon = generateDungeon({
      seed: 3,
      depth: 4,
      pool: loadBuiltinRooms(),
      ownedChickens: [],
      ownedPerks: [],
    });
    const boss = dungeon.nodes.get(dungeon.bossKey)!;
    expect(ensureSpawns(boss, 4, mulberry32(1))[0]!.type).toBe(bossForFloor(4));
  });
});

describe('enemy persistence', () => {
  it('keeps dead spawns dead and preserves survivor health', () => {
    const dungeon = build(3, 4);
    let node = null;
    let spawns = null;
    for (const candidate of dungeon.nodes.values()) {
      const rolled = ensureSpawns(candidate, 4, mulberry32(1));
      if (rolled.length >= 2) {
        node = candidate;
        spawns = rolled;
        break;
      }
    }

    expect(node).toBeTruthy();
    expect(spawns).toBeTruthy();
    expect(node!.enemyStates).toHaveLength(spawns!.length);
    expect(livingSpawns(node!).map((spawn) => spawn.index)).toEqual(
      spawns!.map((_, index) => index),
    );

    recordSpawnHealth(node!, 0, 0);
    recordSpawnHealth(node!, 1, 3);

    const living = livingSpawns(node!);
    expect(living.some((spawn) => spawn.index === 0)).toBe(false);
    expect(living.find((spawn) => spawn.index === 1)).toMatchObject({ index: 1, hp: 3 });

    // Re-entering must reuse the same saved state rather than rerolling spawns.
    const states = node!.enemyStates;
    expect(ensureSpawns(node!, 4, mulberry32(99))).toBe(spawns);
    expect(node!.enemyStates).toBe(states);
  });
});

describe('shop stock', () => {
  it('never sells feed', () => {
    for (let seed = 0; seed < 60; seed++) {
      const dungeon = generateDungeon({
        seed,
        depth: 1,
        pool: loadBuiltinRooms(),
        ownedChickens: [],
        ownedPerks: [],
      });
      for (const node of dungeon.nodes.values()) {
        for (const entry of node.shop ?? []) {
          expect(entry.plan.kind).not.toBe('feed');
        }
      }
    }
  });
});

describe('seed text', () => {
  it('maps the same text to the same seed and numbers to themselves', () => {
    expect(seedFromText('cluck')).toBe(seedFromText(' cluck '));
    expect(seedFromText('cluck')).not.toBe(seedFromText('clucks'));
    expect(seedFromText('42')).toBe(42);
  });
});

describe('floor generation', () => {
  it('always produces a fully connected graph', () => {
    for (let seed = 0; seed < 40; seed++) {
      const dungeon = build(seed);
      expect(dungeon.nodes.size).toBeGreaterThanOrEqual(5);

      const seen = new Set<string>([dungeon.startKey]);
      const queue: string[] = [dungeon.startKey];
      while (queue.length > 0) {
        const node = dungeon.nodes.get(queue.shift()!)!;
        for (const side of node.doors) {
          const key = neighborKey(node, side);
          if (dungeon.nodes.has(key) && !seen.has(key)) {
            seen.add(key);
            queue.push(key);
          }
        }
      }
      expect(seen.size).toBe(dungeon.nodes.size);
    }
  });

  it('wires doors symmetrically (1-4 per room)', () => {
    for (let seed = 0; seed < 40; seed++) {
      const dungeon = build(seed);
      for (const node of dungeon.nodes.values()) {
        expect(node.doors.length).toBeGreaterThanOrEqual(1);
        expect(node.doors.length).toBeLessThanOrEqual(4);
        for (const side of node.doors) {
          const neighbour = dungeon.nodes.get(neighborKey(node, side));
          expect(neighbour).toBeTruthy();
          expect(neighbour!.doors).toContain(OPPOSITE[side]);
        }
      }
    }
  });

  it('assigns distinct start, exit and boss rooms', () => {
    const dungeon = build(7, 2);
    expect(dungeon.nodes.get(dungeon.startKey)!.role).toBe('start');
    expect(dungeon.nodes.get(dungeon.exitKey)!.role).toBe('exit');
    expect(dungeon.nodes.get(dungeon.bossKey)!.role).toBe('boss');
    expect(dungeon.exitKey).not.toBe(dungeon.bossKey);
  });

  it('grows with depth', () => {
    expect(build(1, 3).nodes.size).toBeGreaterThanOrEqual(build(1, 1).nodes.size);
  });
});
