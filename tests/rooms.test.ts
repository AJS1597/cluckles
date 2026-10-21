import { describe, expect, it } from 'vitest';
import { loadBuiltinRooms } from '../src/game/level/rooms';

describe('built-in room pool', () => {
  it('ships at least 15 designed rooms', () => {
    expect(loadBuiltinRooms().length).toBeGreaterThanOrEqual(15);
  });

  it('covers every room role', () => {
    const roles = new Set(loadBuiltinRooms().map((room) => room.role));
    for (const role of ['start', 'combat', 'treasure', 'shop', 'boss', 'exit']) {
      expect(roles.has(role as never)).toBe(true);
    }
  });

  it('every row matches the declared width', () => {
    for (const room of loadBuiltinRooms()) {
      for (const row of room.tiles) {
        expect(row.length).toBe(room.width);
      }
      expect(room.tiles.length).toBe(room.height);
    }
  });
});
