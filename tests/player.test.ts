import { describe, expect, it } from 'vitest';
import { makePlayer, stepPlayer, type PlayerInput } from '../src/game/entities/player';
import { makeBlankRoom, setChar } from '../src/game/level/roomFormat';
import { TERRAIN } from '../src/game/level/tiles';

function move(moveX: number, moveY: number): PlayerInput {
  return {
    moveX,
    moveY,
    shoot: false,
    interact: false,
    interactPressed: false,
  };
}

describe('player movement', () => {
  it('accelerates toward the input', () => {
    const room = makeBlankRoom(19, 11);
    const player = makePlayer(300, 176);
    for (let i = 0; i < 30; i++) stepPlayer(player, move(1, 0), room, 1 / 60, 1);
    expect(player.x).toBeGreaterThan(300);
    expect(player.vx).toBeGreaterThan(0);
  });

  it('slides along walls instead of tunnelling through them', () => {
    const room = makeBlankRoom(19, 11);
    const player = makePlayer(300, 176);
    for (let i = 0; i < 900; i++) stepPlayer(player, move(1, 1), room, 1 / 60, 1);
    expect(player.x).toBeLessThan(19 * 32);
    expect(player.y).toBeLessThan(11 * 32);
    expect(player.x).toBeGreaterThan(0);
    expect(player.y).toBeGreaterThan(0);
  });

  it('cannot walk onto water', () => {
    const room = makeBlankRoom(19, 11);
    for (let x = 2; x < 17; x++) setChar(room, x, 5, TERRAIN.water);
    const player = makePlayer(1 * 32 + 16, 5 * 32 + 16);
    for (let i = 0; i < 180; i++) stepPlayer(player, move(1, 0), room, 1 / 60, 1);
    // Water starts at tile column 2 (world x = 64); the player is stopped at its edge.
    expect(player.x + player.r).toBeLessThanOrEqual(64.5);
    expect(player.inWater).toBe(false);
  });
});
