import type { EnemyType } from '../markdown/types.ts';

/** Every tunable number in one place - no magic constants scattered around. */

export const TILE = 32;
export const ROOM_COLS = 25;
export const ROOM_ROWS = 17;
export const GAME_WIDTH = TILE * ROOM_COLS; // 800
export const GAME_HEIGHT = TILE * ROOM_ROWS; // 544

export const COLORS = {
  floor: 0x2e3a52,
  floorAlt: 0x35435e,
  floorDetail: 0x475877,
  wall: 0x4c5978,
  wallTop: 0x6b7ba3,
  wallEdge: 0x222b3d,
  accent: 0x63e0ff,
  accentWarm: 0xf5b942,
  danger: 0xff5c4d,
  good: 0x7ee08a,
  boss: 0x9d7bff,
} as const;

export const PLAYER = {
  maxHealth: 5,
  speed: 190,
  bodyWidth: 16,
  bodyHeight: 14,
  scale: 2.6,
  invulnerableMs: 1050,
  attackCooldownMs: 320,
  attackDurationMs: 150,
  attackRange: 58,
  attackArcDegrees: 110,
  knockback: 260,
  /** Damage by weapon tier: 0 = bare hands, 1 = Sword, 2 = Debugger. */
  weaponDamage: [8, 16, 26] as const,
  /** Stack Overflow Scroll: temporary damage multiplier. */
  scrollMultiplier: 1.6,
  scrollDurationMs: 20000,
} as const;

export interface EnemyProfile {
  texture: string;
  speed: number;
  detectRadius: number;
  scale: number;
  contactCooldownMs: number;
  label: string;
}

export const ENEMY_PROFILES: Record<EnemyType, EnemyProfile> = {
  bug: {
    texture: 'enemy-bug',
    speed: 96,
    detectRadius: 240,
    scale: 2.2,
    contactCooldownMs: 850,
    label: 'Bug',
  },
  skeleton: {
    texture: 'enemy-skeleton',
    speed: 74,
    detectRadius: 260,
    scale: 2.3,
    contactCooldownMs: 900,
    label: 'Skeleton',
  },
  slime: {
    texture: 'enemy-slime',
    speed: 58,
    detectRadius: 200,
    scale: 2.2,
    contactCooldownMs: 800,
    label: 'Slime',
  },
  dependency: {
    texture: 'enemy-dependency',
    speed: 82,
    detectRadius: 250,
    scale: 2.3,
    contactCooldownMs: 900,
    label: 'Dependency',
  },
  'null-pointer': {
    texture: 'enemy-null-pointer',
    speed: 112,
    detectRadius: 300,
    scale: 2.2,
    contactCooldownMs: 750,
    label: 'Null Pointer',
  },
  generic: {
    texture: 'enemy-generic',
    speed: 78,
    detectRadius: 230,
    scale: 2.2,
    contactCooldownMs: 850,
    label: 'Creature',
  },
};

export const BOSS = {
  scale: 4,
  speed: 62,
  chargeSpeed: 430,
  chargeTelegraphMs: 620,
  chargeIntervalMs: 4200,
  volleyIntervalMs: 3200,
  projectileSpeed: 210,
  contactCooldownMs: 900,
  /** Fraction of max health at which the boss summons help (once). */
  enrageAt: 0.5,
  minionHealth: 20,
} as const;

export const TRANSITION_MS = 260;
export const NARRATION_MS = 4200;

export const ITEM_TEXTURES: Record<string, string> = {
  weapon: 'item-sword',
  heal: 'item-potion',
  key: 'item-key',
  gold: 'item-gold',
  trinket: 'item-gem',
};

/** Named items that get their own sprite instead of the kind default. */
export const ITEM_TEXTURE_BY_NAME: Record<string, string> = {
  debugger: 'item-debugger',
  'rubber duck': 'item-duck',
  'stack overflow scroll': 'item-scroll',
  'coffee potion': 'item-coffee',
  'silver key': 'item-key-silver',
};

export function itemTexture(name: string, kind: string): string {
  return ITEM_TEXTURE_BY_NAME[name.toLowerCase()] ?? ITEM_TEXTURES[kind] ?? 'item-gem';
}
