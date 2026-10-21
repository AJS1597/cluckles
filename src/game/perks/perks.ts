/**
 * Perks are passive run upgrades. Each one nudges a shared `StatMods` bag that
 * the projectile and player systems read, so adding a perk never means touching
 * combat code: it just changes numbers here.
 */

export interface StatMods {
  damageMul: number;
  /** >1 means faster firing. */
  fireRateMul: number;
  moveSpeedMul: number;
  projSpeedMul: number;
  extraProjectiles: number;
  feedMul: number;
  /** 0..1, fraction knocked off shop prices. */
  shopDiscount: number;
  pickupRadiusMul: number;
  /** Chance per kill of a bonus feed pickup. */
  luckChance: number;
  /** Hearts healed when a room is cleared. */
  healOnRoomClear: number;
  /** Damage dealt to enemies that touch the player. */
  thorns: number;
  critChance: number;
  critMul: number;
}

export const BASE_MODS: StatMods = {
  damageMul: 1,
  fireRateMul: 1,
  moveSpeedMul: 1,
  projSpeedMul: 1,
  extraProjectiles: 0,
  feedMul: 1,
  shopDiscount: 0,
  pickupRadiusMul: 1,
  luckChance: 0,
  healOnRoomClear: 0,
  thorns: 0,
  critChance: 0,
  critMul: 1,
};

export type PerkRarity = 'common' | 'uncommon' | 'rare';

export interface PerkDef {
  id: string;
  name: string;
  blurb: string;
  rarity: PerkRarity;
  color: string;
  /** Mutates the mods bag. Keep them additive where possible. */
  apply: (mods: StatMods) => void;
}

export const PERKS: readonly PerkDef[] = [
  {
    id: 'big-eggs',
    name: 'Big Eggs',
    blurb: '+25% projectile damage.',
    rarity: 'common',
    color: '#f2d06b',
    apply: (m) => {
      m.damageMul += 0.25;
    },
  },
  {
    id: 'fast-feathers',
    name: 'Fast Feathers',
    blurb: '+20% fire rate on every chicken.',
    rarity: 'common',
    color: '#8fe3b0',
    apply: (m) => {
      m.fireRateMul += 0.2;
    },
  },
  {
    id: 'sneakers',
    name: 'Sneakers',
    blurb: '+15% movement speed.',
    rarity: 'common',
    color: '#7fd0e3',
    apply: (m) => {
      m.moveSpeedMul += 0.15;
    },
  },
  {
    id: 'sharp-beak',
    name: 'Sharp Beak',
    blurb: '+20% projectile speed.',
    rarity: 'common',
    color: '#f0a04b',
    apply: (m) => {
      m.projSpeedMul += 0.2;
    },
  },
  {
    id: 'scrambled',
    name: 'Scrambled',
    blurb: 'Every shot fires one extra projectile.',
    rarity: 'rare',
    color: '#ffe8b0',
    apply: (m) => {
      m.extraProjectiles += 1;
    },
  },
  {
    id: 'tough-shell',
    name: 'Tough Shell',
    blurb: '+1 max heart, healed on pickup.',
    rarity: 'uncommon',
    color: '#e0614f',
    apply: () => {
      // Max health is handled directly by the run state when the perk is taken.
    },
  },
  {
    id: 'greedy-gizzard',
    name: 'Greedy Gizzard',
    blurb: 'Shop prices are 25% cheaper.',
    rarity: 'uncommon',
    color: '#c9a227',
    apply: (m) => {
      m.shopDiscount = Math.min(0.75, m.shopDiscount + 0.25);
    },
  },
  {
    id: 'golden-eggs',
    name: 'Golden Eggs',
    blurb: '+35% chicken feed from every source.',
    rarity: 'uncommon',
    color: '#f6c46c',
    apply: (m) => {
      m.feedMul += 0.35;
    },
  },
  {
    id: 'lucky-feather',
    name: 'Lucky Feather',
    blurb: '+20% chance an enemy drops extra feed.',
    rarity: 'common',
    color: '#b6f0a0',
    apply: (m) => {
      m.luckChance += 0.2;
    },
  },
  {
    id: 'egg-magnet',
    name: 'Egg Magnet',
    blurb: '+60% pickup radius.',
    rarity: 'common',
    color: '#a0d8ff',
    apply: (m) => {
      m.pickupRadiusMul += 0.6;
    },
  },
  {
    id: 'chicken-soup',
    name: 'Chicken Soup',
    blurb: 'Heal 1 heart every time you clear a room.',
    rarity: 'rare',
    color: '#ffd0a0',
    apply: (m) => {
      m.healOnRoomClear += 1;
    },
  },
  {
    id: 'spiked-shell',
    name: 'Spiked Shell',
    blurb: 'Enemies that touch you take 2 damage.',
    rarity: 'uncommon',
    color: '#d98fb0',
    apply: (m) => {
      m.thorns += 2;
    },
  },
  {
    id: 'eagle-eye',
    name: 'Eagle Eye',
    blurb: '15% chance to land a double-damage hit.',
    rarity: 'uncommon',
    color: '#ffe066',
    apply: (m) => {
      m.critChance += 0.15;
      m.critMul = Math.max(m.critMul, 2);
    },
  },
  {
    id: 'fat-hens',
    name: 'Fat Hens',
    blurb: '+15% damage and +10% knockback.',
    rarity: 'common',
    color: '#e0956a',
    apply: (m) => {
      m.damageMul += 0.15;
    },
  },
];

export const PERK_BY_ID: Record<string, PerkDef> = Object.fromEntries(
  PERKS.map((perk) => [perk.id, perk]),
);

export function modsFor(perkIds: readonly string[]): StatMods {
  const mods: StatMods = { ...BASE_MODS };
  for (const id of perkIds) {
    PERK_BY_ID[id]?.apply(mods);
  }
  return mods;
}

/** Perks granted by a perk pedestal, never repeating one the player owns. */
export function rollPerk(
  owned: readonly string[],
  roll: () => number,
): PerkDef | null {
  const pool = PERKS.filter((perk) => !owned.includes(perk.id));
  if (pool.length === 0) {
    return null;
  }
  // Rares show up around a third as often as commons.
  const weights = pool.map((perk) =>
    perk.rarity === 'rare' ? 1 : perk.rarity === 'uncommon' ? 2 : 3,
  );
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = roll() * total;
  for (let i = 0; i < pool.length; i++) {
    pick -= weights[i]!;
    if (pick <= 0) {
      return pool[i]!;
    }
  }
  return pool[pool.length - 1]!;
}
