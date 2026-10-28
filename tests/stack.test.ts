import { describe, expect, it } from 'vitest';
import {
  assignChicken,
  autoPlace,
  chickenAt,
  firstEmptySlot,
  makeStack,
  slotIndexForDir,
} from '../src/game/systems/stack';

describe('chicken stack', () => {
  it('maps directions to slots clockwise from up', () => {
    expect(slotIndexForDir('up')).toBe(0);
    expect(slotIndexForDir('right')).toBe(1);
    expect(slotIndexForDir('down')).toBe(2);
    expect(slotIndexForDir('left')).toBe(3);
  });

  it('only answers in an occupied direction', () => {
    let stack = makeStack();
    expect(chickenAt(stack, 'up')).toBeNull();
    stack = assignChicken(stack, 0, 'henny');
    expect(chickenAt(stack, 'up')).toBe('henny');
    expect(chickenAt(stack, 'down')).toBeNull();
  });

  it('allows a chicken in every direction at once (independent slots)', () => {
    let stack = makeStack();
    for (let i = 0; i < 4; i++) {
      stack = assignChicken(stack, i, `chicken-${i}`);
    }
    for (const dir of ['up', 'right', 'down', 'left'] as const) {
      expect(chickenAt(stack, dir)).not.toBeNull();
    }
  });

  it('auto-places into the first empty slot then reports full', () => {
    let stack = makeStack();
    for (let i = 0; i < 4; i++) {
      const placed = autoPlace(stack, `chicken-${i}`);
      expect(placed.slot).toBe(i);
      stack = placed.stack;
    }
    expect(firstEmptySlot(stack)).toBe(-1);
    expect(autoPlace(stack, 'overflow').slot).toBe(-1);
  });
});
