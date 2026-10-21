import { describe, expect, it } from 'vitest';
import {
  doorEntryTile,
  findWalkableNear,
  isSolidAt,
  type DoorSide,
} from '../src/game/level/roomFormat';
import { loadBuiltinRooms } from '../src/game/level/rooms';

const SIDES: DoorSide[] = ['up', 'right', 'down', 'left'];

describe('door entry placement', () => {
  it('never drops the player into a solid tile in any built-in room', () => {
    for (const room of loadBuiltinRooms()) {
      for (const side of SIDES) {
        const tile = doorEntryTile(room, side);
        expect(isSolidAt(room, tile.x, tile.y)).toBe(false);
        expect(tile.x).toBeGreaterThan(0);
        expect(tile.y).toBeGreaterThan(0);
        expect(tile.x).toBeLessThan(room.width - 1);
        expect(tile.y).toBeLessThan(room.height - 1);
      }
    }
  });

  it('specifically fixes the diamond room whose middle columns are rock', () => {
    const diamond = loadBuiltinRooms().find((room) => room.id === 'diamond');
    expect(diamond).toBeTruthy();
    // The naive door-inward tile really is rock here.
    expect(isSolidAt(diamond!, 9, 2)).toBe(true);
    expect(isSolidAt(diamond!, 9, 8)).toBe(true);
    for (const side of SIDES) {
      const tile = doorEntryTile(diamond!, side);
      expect(isSolidAt(diamond!, tile.x, tile.y)).toBe(false);
    }
  });

  it('findWalkableNear escapes rock and water', () => {
    const diamond = loadBuiltinRooms().find((room) => room.id === 'diamond')!;
    const centre = findWalkableNear(diamond, 9, 5);
    expect(isSolidAt(diamond, centre.x, centre.y)).toBe(false);

    const pond = loadBuiltinRooms().find((room) => room.id === 'pond')!;
    const wet = findWalkableNear(pond, 9, 5);
    expect(isSolidAt(pond, wet.x, wet.y)).toBe(false);
  });
});
