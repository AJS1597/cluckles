import { describe, expect, it } from 'vitest';
import { PERKS, modsFor } from '../src/game/perks/perks';
import { RunState } from '../src/game/systems/run';

describe('run state', () => {
  it('starts with three hearts and a single equipped chicken', () => {
    const run = new RunState(1);
    expect(run.health).toBe(3);
    expect(run.maxHealth).toBe(3);
    expect(run.owned).toEqual(['henny']);
    expect(run.stack.slots.filter((slot) => slot !== null).length).toBe(1);
    expect(run.stack.slots[0]).toBe('henny');
  });

  it('lets a chicken fill as many slots as copies in the flock', () => {
    const run = new RunState(1);
    run.addChicken('henny');
    run.addChicken('henny');
    expect(run.copiesOwned('henny')).toBe(3);
    run.setSlot(2, 'henny');
    run.setSlot(3, 'henny');
    expect(run.stack.slots.filter((slot) => slot === 'henny').length).toBe(3);
  });

  it('refuses to equip more copies than the flock owns', () => {
    const run = new RunState(1);
    run.setSlot(2, 'henny');
    expect(run.copiesOwned('henny')).toBe(1);
    expect(run.stack.slots[2]).toBeNull();
    expect(run.stack.slots.filter((slot) => slot === 'henny').length).toBe(1);
  });

  it('places a new copy into the stack when there is room', () => {
    const run = new RunState(1);
    const slot = run.addChicken('henny');
    expect(slot).toBe(1);
    expect(run.stack.slots.filter((s) => s === 'henny').length).toBe(2);
  });

  it('swaps chickens between two ring slots', () => {
    const run = new RunState(1);
    // Owned chickens are added to the flock first; auto-placement fills slots,
    // so clear the stack and place each chicken explicitly.
    run.addChicken('triple');
    run.addChicken('frost');
    run.setSlot(0, null);
    run.setSlot(2, null);
    run.setSlot(0, 'henny');
    run.setSlot(1, 'triple');
    run.setSlot(3, 'frost');
    run.swapSlots(0, 3);
    expect(run.stack.slots[0]).toBe('frost');
    expect(run.stack.slots[3]).toBe('henny');
    expect(run.stack.slots[1]).toBe('triple');
  });

  it('swapping with an empty slot just moves the chicken', () => {
    const run = new RunState(1);
    run.setSlot(0, 'henny');
    run.setSlot(2, null);
    run.swapSlots(0, 2);
    expect(run.stack.slots[0]).toBeNull();
    expect(run.stack.slots[2]).toBe('henny');
  });

  it('takes damage and heals without exceeding max hearts', () => {
    const run = new RunState(1);
    expect(run.damage(1)).toBe(true);
    expect(run.health).toBe(2);
    run.heal(5);
    expect(run.health).toBe(3);
    run.damage(3);
    expect(run.isDead).toBe(true);
    expect(run.damage(1)).toBe(false);
  });

  it('cannot spend more feed than it has', () => {
    const run = new RunState(1);
    run.addFeed(5);
    expect(run.spendFeed(10)).toBe(false);
    expect(run.spendFeed(5)).toBe(true);
    expect(run.feed).toBe(0);
  });

  it('applies feed perks to gains', () => {
    const feedPerk = PERKS.find((perk) => modsFor([perk.id]).feedMul > 1);
    expect(feedPerk).toBeTruthy();

    const run = new RunState(1);
    run.takePerk(feedPerk!.id);
    const before = run.feed;
    run.addFeed(10);
    expect(run.feed - before).toBeGreaterThan(10);
  });

  it('grants a max heart for the health perk', () => {
    const healthPerk = PERKS.find((perk) => perk.id === 'tough-shell');
    if (!healthPerk) return;
    const run = new RunState(1);
    run.takePerk(healthPerk.id);
    expect(run.maxHealth).toBe(4);
    expect(run.health).toBe(4);
  });
});
