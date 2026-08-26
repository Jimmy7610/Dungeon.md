/**
 * Weapon registry.
 *
 * Every weapon is one row of multipliers applied to the same melee swing, so
 * the combat code never branches on which weapon is held. `1.00` everywhere is
 * the Debugger - the baseline the rest of the campaign is tuned against.
 */
export interface WeaponProfile {
  id: string;
  name: string;
  /** Damage, relative to the baseline swing. */
  damage: number;
  /** Cooldown multiplier: below 1 is faster, above 1 is slower. */
  cooldown: number;
  range: number;
  /** Arc width multiplier: below 1 is a narrower, more precise swing. */
  arc: number;
  knockback: number;
  /** Slash colour. */
  accent: number;
  /** Heavier weapons get chunkier hit feedback. */
  impact: 'light' | 'medium' | 'heavy';
  /** Sprite key for the pickup. */
  texture: string;
  blurb: string;
}

export const UNARMED: WeaponProfile = {
  id: 'unarmed',
  name: 'Bare Hands',
  damage: 0.45,
  cooldown: 0.95,
  range: 0.85,
  arc: 1,
  knockback: 0.6,
  accent: 0xdbe4ee,
  impact: 'light',
  texture: 'item-sword',
  blurb: 'Better than nothing. Barely.',
};

const PROFILES: WeaponProfile[] = [
  {
    id: 'sword',
    name: 'Sword',
    damage: 0.85,
    cooldown: 1,
    range: 1,
    arc: 1,
    knockback: 1,
    accent: 0xdbe4ee,
    impact: 'light',
    texture: 'item-sword',
    blurb: 'Standard issue. Sharp enough.',
  },
  {
    id: 'debugger',
    name: 'Debugger',
    damage: 1,
    cooldown: 1,
    range: 1,
    arc: 1,
    knockback: 1,
    accent: 0x63e0ff,
    impact: 'light',
    texture: 'item-debugger',
    blurb: 'Fast, honest, steps through anything.',
  },
  {
    id: 'refactor-blade',
    name: 'Refactor Blade',
    damage: 1.3,
    cooldown: 0.92,
    range: 1.15,
    arc: 1,
    knockback: 1,
    accent: 0x7ee08a,
    impact: 'light',
    texture: 'item-blade',
    blurb: 'Same behaviour, much cleaner.',
  },
  {
    id: 'stack-trace-spear',
    name: 'Stack Trace Spear',
    damage: 1.45,
    cooldown: 1.12,
    range: 1.65,
    arc: 0.62,
    knockback: 1.15,
    accent: 0xffd24d,
    impact: 'medium',
    texture: 'item-spear',
    blurb: 'Reaches all the way down the call stack.',
  },
  {
    id: 'dependency-hammer',
    name: 'Dependency Hammer',
    damage: 1.85,
    cooldown: 1.38,
    range: 1,
    arc: 1.05,
    knockback: 2.1,
    accent: 0x5b8cff,
    impact: 'heavy',
    texture: 'item-hammer',
    blurb: 'Resolves conflicts structurally.',
  },
  {
    id: 'merge-axe',
    name: 'Merge Axe',
    damage: 2.08,
    cooldown: 1.22,
    range: 1.26,
    arc: 1.35,
    knockback: 1.6,
    accent: 0xff9f1c,
    impact: 'heavy',
    texture: 'item-axe',
    blurb: 'Takes both branches. Keeps neither.',
  },
  {
    id: 'root-access',
    name: 'Root Access',
    damage: 2.4,
    cooldown: 1.02,
    range: 1.35,
    arc: 1.45,
    knockback: 1.8,
    accent: 0xa78bfa,
    impact: 'heavy',
    texture: 'item-root',
    blurb: 'You should not have this.',
  },
];

const BY_ID = new Map<string, WeaponProfile>(PROFILES.map((profile) => [profile.id, profile]));

/** Unknown weapon names behave like the baseline rather than breaking combat. */
export function getWeapon(id: string): WeaponProfile {
  if (id === UNARMED.id) return UNARMED;
  return BY_ID.get(id) ?? { ...BY_ID.get('debugger')!, id, name: 'Improvised Weapon' };
}

export function allWeapons(): readonly WeaponProfile[] {
  return PROFILES;
}

export type StatDelta = 'much-better' | 'better' | 'same' | 'worse' | 'much-worse';

function delta(next: number, current: number, lowerIsBetter = false): StatDelta {
  const ratio = lowerIsBetter ? current / next : next / current;
  if (ratio >= 1.4) return 'much-better';
  if (ratio >= 1.06) return 'better';
  if (ratio <= 0.72) return 'much-worse';
  if (ratio <= 0.95) return 'worse';
  return 'same';
}

export interface WeaponComparison {
  damage: StatDelta;
  range: StatDelta;
  speed: StatDelta;
}

/** Drives the equip prompt's "Damage ++ / Speed -" readout. */
export function compareWeapons(next: WeaponProfile, current: WeaponProfile): WeaponComparison {
  return {
    damage: delta(next.damage, current.damage),
    range: delta(next.range, current.range),
    speed: delta(next.cooldown, current.cooldown, true),
  };
}

export function deltaSymbol(value: StatDelta): string {
  switch (value) {
    case 'much-better':
      return '+++';
    case 'better':
      return '++';
    case 'worse':
      return '-';
    case 'much-worse':
      return '--';
    default:
      return '=';
  }
}
