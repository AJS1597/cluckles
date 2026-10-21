import { describe, expect, it } from 'vitest';
import {
  authoredDoors,
  charAt,
  doorGapTiles,
  makeBlankRoom,
  parseEgg,
  serializeEgg,
  setChar,
} from '../src/game/level/roomFormat';
import { DOOR_CHAR, TERRAIN } from '../src/game/level/tiles';

describe('.egg room format', () => {
  it('makes a room with a solid border and floor inside', () => {
    const room = makeBlankRoom(19, 11);
    expect(room.tiles).toHaveLength(11);
    expect(room.tiles[0]).toHaveLength(19);
    for (let x = 0; x < 19; x++) {
      expect(charAt(room, x, 0)).toBe(TERRAIN.wall);
      expect(charAt(room, x, 10)).toBe(TERRAIN.wall);
    }
    expect(charAt(room, 5, 5)).toBe(TERRAIN.floor);
  });

  it('round-trips through serialize and parse', () => {
    const room = makeBlankRoom(19, 11, 'Round Trip', 'treasure');
    room.doors = ['up', 'left'];
    const parsed = parseEgg(serializeEgg(room));
    expect(parsed.name).toBe('Round Trip');
    expect(parsed.role).toBe('treasure');
    expect(parsed.width).toBe(19);
    expect(parsed.tiles).toEqual(room.tiles);
    expect(parsed.doors).toEqual(['up', 'left']);
  });

  it('rejects unknown characters and wrong row lengths', () => {
    expect(() =>
      parseEgg({ width: 5, height: 5, tiles: ['#####', '#...#', '#.Z.#', '#...#', '#####'] }),
    ).toThrow();
    expect(() =>
      parseEgg({ width: 5, height: 5, tiles: ['####', '#...#', '#...#', '#...#', '#####'] }),
    ).toThrow();
  });

  it('derives doors from painted door tiles and places them on the middle', () => {
    const room = makeBlankRoom(19, 11);
    const cells = doorGapTiles(room, 'up');
    const middle = cells[Math.floor(cells.length / 2)]!;
    expect(middle.x).toBe(9);
    setChar(room, middle.x, middle.y, DOOR_CHAR);
    expect(authoredDoors(room)).toContain('up');
  });
});
