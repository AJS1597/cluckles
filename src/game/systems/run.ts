import { PLAYER, RUN } from '../config';
import { STARTER_CHICKENS } from '../chickens/chickens';
import { modsFor, type StatMods } from '../perks/perks';
import {
  assignChicken,
  autoPlace,
  cloneStack,
  makeStack,
  type StackState,
} from './stack';

/**
 * Everything that survives a room transition: hearts, feed, the chicken
 * collection, the ring, and perks. The scene reads `mods` from here so perk
 * effects are always in sync with what the player owns.
 */
export class RunState {
  health: number;
  maxHealth: number;
  feed: number;
  depth: number;
  seed: number;
  owned: string[];
  stack: StackState;
  perks: string[];
  /** Rooms cleared this floor, used for difficulty and rewards. */
  roomsCleared: number;

  private cachedMods: StatMods;

  constructor(seed: number = Math.floor(Math.random() * 0xffffffff)) {
    this.seed = seed >>> 0;
    this.maxHealth = PLAYER.maxHealth;
    this.health = PLAYER.maxHealth;
    this.feed = RUN.startingFeed;
    this.depth = 1;
    this.owned = [];
    this.stack = makeStack();
    this.perks = [];
    this.roomsCleared = 0;
    this.cachedMods = modsFor([]);

    for (const id of STARTER_CHICKENS) {
      this.addChicken(id);
    }
    // Start with a second Henny so two directions are live from the first room.
    this.addChicken('henny');
    this.setSlot(2, 'henny');
  }

  get mods(): StatMods {
    return this.cachedMods;
  }

  get isDead(): boolean {
    return this.health <= 0;
  }

  get pickupRadius(): number {
    return 34 * this.cachedMods.pickupRadiusMul;
  }

  private refresh(): void {
    this.cachedMods = modsFor(this.perks);
  }

  /** Adds a chicken to the collection and drops it in the first empty slot. */
  addChicken(id: string): number {
    this.owned.push(id);
    const placed = autoPlace(this.stack, id);
    this.stack = placed.stack;
    return placed.slot;
  }

  setSlot(slot: number, chickenId: string | null): void {
    this.stack = assignChicken(this.stack, slot, chickenId);
  }

  swapSlots(a: number, b: number): void {
    const next = cloneStack(this.stack);
    const tmp = next.slots[a] ?? null;
    next.slots[a] = next.slots[b] ?? null;
    next.slots[b] = tmp;
    this.stack = next;
  }

  takePerk(id: string): void {
    if (this.perks.includes(id)) {
      return;
    }
    this.perks.push(id);
    if (id === 'tough-shell') {
      this.maxHealth += 1;
      this.health += 1;
    }
    this.refresh();
  }

  /** Feed rewards are scaled by the Golden Eggs perk. */
  addFeed(amount: number): void {
    this.feed += Math.max(0, Math.round(amount * this.cachedMods.feedMul));
  }

  priceOf(base: number): number {
    return Math.max(1, Math.round(base * (1 - this.cachedMods.shopDiscount)));
  }

  spendFeed(amount: number): boolean {
    if (this.feed < amount) {
      return false;
    }
    this.feed -= amount;
    return true;
  }

  heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /** Returns true when the hit landed (the player was not already dead). */
  damage(amount: number): boolean {
    if (this.isDead) {
      return false;
    }
    this.health = Math.max(0, this.health - amount);
    return true;
  }

  reset(seed: number = this.seed): void {
    this.seed = seed >>> 0;
    this.maxHealth = PLAYER.maxHealth;
    this.health = PLAYER.maxHealth;
    this.feed = RUN.startingFeed;
    this.depth = 1;
    this.owned = [];
    this.stack = makeStack();
    this.perks = [];
    this.roomsCleared = 0;
    this.refresh();
    for (const id of STARTER_CHICKENS) {
      this.addChicken(id);
    }
    this.addChicken('henny');
    this.setSlot(2, 'henny');
  }
}
