import { DIRS, type Dir } from '../dir';
import { STACK } from '../config';

/** A slot holds a chicken id, or null when empty. */
export type StackSlot = string | null;

export interface StackState {
  /** Index i faces DIRS[i]: 0=up, 1=right, 2=down, 3=left. */
  slots: StackSlot[];
}

export function makeStack(): StackState {
  return { slots: Array.from({ length: STACK.size }, () => null) };
}

export function cloneStack(stack: StackState): StackState {
  return { slots: [...stack.slots] };
}

export function slotIndexForDir(dir: Dir): number {
  return DIRS.indexOf(dir);
}

export function dirForSlot(index: number): Dir {
  return DIRS[index] ?? 'up';
}

/** The chicken that answers an arrow key, or null when that direction is empty. */
export function chickenAt(stack: StackState, dir: Dir): string | null {
  return stack.slots[slotIndexForDir(dir)] ?? null;
}

export function assignChicken(stack: StackState, slot: number, chickenId: string | null): StackState {
  const next = cloneStack(stack);
  if (slot >= 0 && slot < next.slots.length) {
    next.slots[slot] = chickenId;
  }
  return next;
}

export function clearSlot(stack: StackState, slot: number): StackState {
  return assignChicken(stack, slot, null);
}

export function firstEmptySlot(stack: StackState): number {
  return stack.slots.findIndex((slot) => slot === null);
}

/** Put a chicken in the first empty slot; returns the slot used or -1 if full. */
export function autoPlace(stack: StackState, chickenId: string): { stack: StackState; slot: number } {
  const slot = firstEmptySlot(stack);
  if (slot < 0) {
    return { stack, slot: -1 };
  }
  return { stack: assignChicken(stack, slot, chickenId), slot };
}
