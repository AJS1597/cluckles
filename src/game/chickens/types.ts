import { PROJECTILE } from '../config';
import type { StatMods } from '../perks/perks';

/** A fully-resolved projectile, ready to spawn. */
export interface ProjectileSpec {
  count: number;
  spread: number;
  speed: number;
  damage: number;
  radius: number;
  life: number;
  pierce: number;
  bounce: number;
  /** Turn rate in radians/second toward the nearest enemy. */
  homing: number;
  /** Explosion radius on impact (0 = no explosion). */
  explode: number;
  explodeDamage: number;
  knockback: number;
  phaseWalls: boolean;
  boomerang: boolean;
  /** 0..1 multiplier applied to enemy speed on hit (0 = no slow). */
  slowFactor: number;
  slowTime: number;
  poisonDps: number;
  poisonTime: number;
  /** Extra enemies a hit arcs to. */
  chain: number;
  color: string;
  trail: boolean;
  spin: boolean;
  crit: boolean;
}

export type Rarity = 'starter' | 'common' | 'uncommon' | 'rare';

export interface ChickenDef {
  id: string;
  name: string;
  /** Short ability tag shown on the HUD, e.g. "3-WAY". */
  ability: string;
  blurb: string;
  rarity: Rarity;
  color: string;
  accent: string;
  /** Seconds between shots from this chicken's slot. */
  cooldown: number;
  /** Relative chance to appear as a reward. 0 = never offered. */
  weight: number;
  projectile: Partial<ProjectileSpec> & { damage: number };
}

export interface ChickenFire extends ProjectileSpec {
  cooldown: number;
}

const BASE: ProjectileSpec = {
  count: 1,
  spread: 0,
  speed: PROJECTILE.speed,
  damage: PROJECTILE.damage,
  radius: PROJECTILE.radius,
  life: PROJECTILE.life,
  pierce: PROJECTILE.pierce,
  bounce: PROJECTILE.bounce,
  homing: PROJECTILE.homing,
  explode: PROJECTILE.explode,
  explodeDamage: 0,
  knockback: PROJECTILE.knockback,
  phaseWalls: false,
  boomerang: false,
  slowFactor: 0,
  slowTime: 0,
  poisonDps: 0,
  poisonTime: 0,
  chain: 0,
  color: '#fff3d0',
  trail: false,
  spin: false,
  crit: false,
};

/**
 * Merge a chicken definition with the shared defaults and apply the run's perk
 * modifiers. `roll` is only used for the critical-hit chance.
 */
export function resolveProjectile(
  def: ChickenDef,
  mods: StatMods,
  roll: () => number = Math.random,
): ChickenFire {
  const merged: ProjectileSpec = { ...BASE, ...def.projectile };
  const crit = mods.critChance > 0 && roll() < mods.critChance;
  const critMul = crit ? mods.critMul : 1;

  return {
    ...merged,
    count: Math.max(1, merged.count + mods.extraProjectiles),
    speed: merged.speed * mods.projSpeedMul,
    damage: merged.damage * mods.damageMul * critMul,
    explodeDamage: merged.explodeDamage * mods.damageMul,
    poisonDps: merged.poisonDps * mods.damageMul,
    cooldown: def.cooldown / mods.fireRateMul,
    crit,
  };
}
