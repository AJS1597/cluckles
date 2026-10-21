import { describe, expect, it } from 'vitest';
import { OPPOSITE } from '../src/game/dir';
import { generateDungeon, neighborKey } from '../src/game/level/dungeon';
import { loadBuiltinRooms } from '../src/game/level/rooms';

function build(seed: number, depth = 1) {
  return generateDungeon({
    seed,
    depth,
    pool: loadBuiltinRooms(),
    ownedChickens: [],
    ownedPerks: [],
  });
}

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
