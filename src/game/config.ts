import type { EnemyType, RoomTheme } from '../markdown/types.ts';

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
  /* Visual scale only. The physics body is sized in display pixels from
     bodyWidth/bodyHeight below, so changing this never moves collision. */
  scale: 2.7,
  invulnerableMs: 1050,
  /** Baseline swing. Weapon profiles multiply these three. */
  baseDamage: 18,
  attackCooldownMs: 320,
  minAttackCooldownMs: 120,
  attackDurationMs: 150,
  attackRange: 58,
  attackArcDegrees: 110,
  knockback: 260,

  /** Rubber Duck: permanent attack-speed passive (no stacking). */
  rubberDuckCooldownMultiplier: 0.9,
  /** Stack Overflow Scroll: one empowered strike. */
  overchargeMultiplier: 3,
  maxOvercharge: 3,
  /** sudo: one-off global buff. */
  sudoDamageMultiplier: 1.15,
  sudoArmorBonus: 1,
  /** Hotfix: hearts restored instead of dying. */
  hotfixHeal: 2,
  /** Energy Drink. */
  hasteMultiplier: 1.2,
} as const;

/** Elites reuse the normal AI with heavier numbers and a visible aura. */
export const ELITE = {
  scale: 1.35,
  healthMultiplier: 1.9,
  damageBonus: 1,
  speedMultiplier: 1.08,
  knockbackResistance: 0.45,
  goldDrop: 15,
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
    scale: 1.65,
    contactCooldownMs: 850,
    label: 'Bug',
  },
  skeleton: {
    texture: 'enemy-skeleton',
    speed: 74,
    detectRadius: 260,
    scale: 1.725,
    contactCooldownMs: 900,
    label: 'Skeleton',
  },
  slime: {
    texture: 'enemy-slime',
    speed: 58,
    detectRadius: 200,
    scale: 1.65,
    contactCooldownMs: 800,
    label: 'Slime',
  },
  dependency: {
    texture: 'enemy-dependency',
    speed: 82,
    detectRadius: 250,
    scale: 1.725,
    contactCooldownMs: 900,
    label: 'Dependency',
  },
  'null-pointer': {
    texture: 'enemy-null-pointer',
    speed: 112,
    detectRadius: 300,
    scale: 1.65,
    contactCooldownMs: 750,
    label: 'Null Pointer',
  },
  generic: {
    texture: 'enemy-generic',
    speed: 78,
    detectRadius: 230,
    scale: 1.65,
    contactCooldownMs: 850,
    label: 'Creature',
  },
};

export const BOSS = {
  scale: 1.6,
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

export const ITEM_SCALE = 1.72;

export const TRANSITION_MS = 260;
export const NARRATION_MS = 4200;

/** Sprite for each registry item; falls back by category. */
const ITEM_TEXTURE_BY_SPEC: Record<string, string> = {
  sword: 'item-sword',
  debugger: 'item-debugger',
  'refactor-blade': 'item-blade',
  'stack-trace-spear': 'item-spear',
  'dependency-hammer': 'item-hammer',
  'merge-axe': 'item-axe',
  'root-access': 'item-root',
  'cache-jacket': 'item-armor-cache',
  'firewall-vest': 'item-armor-firewall',
  'kernel-plate': 'item-armor-kernel',
  'root-armor': 'item-armor-root',
  'coffee-potion': 'item-coffee',
  'health-potion': 'item-potion',
  'energy-drink': 'item-energy',
  'patch-kit': 'item-patch',
  'full-restore': 'item-restore',
  'heart-upgrade': 'item-heart',
  'rubber-duck': 'item-duck',
  'stack-overflow-scroll': 'item-scroll',
  hotfix: 'item-hotfix',
  'commit-shield': 'item-shield',
  sudo: 'item-sudo',
  'git-key': 'item-key',
  'silver-key': 'item-key-silver',
  gold: 'item-gold',
};

const ITEM_TEXTURE_BY_CATEGORY: Record<string, string> = {
  weapon: 'item-sword',
  armor: 'item-armor-cache',
  consumable: 'item-potion',
  key: 'item-key',
  currency: 'item-gold',
  special: 'item-gem',
  generic: 'item-gem',
};

export function itemTexture(specId: string, category: string): string {
  return ITEM_TEXTURE_BY_SPEC[specId] ?? ITEM_TEXTURE_BY_CATEGORY[category] ?? 'item-gem';
}

/**
 * Room themes: palette and decoration style only. Nothing here touches
 * physics, collision, doors or spawn logic.
 */
export type DecorStyle =
  | 'code'
  | 'cables'
  | 'blocks'
  | 'glitch'
  | 'nodes'
  | 'debris'
  | 'split'
  | 'lines'
  | 'leak'
  | 'scan'
  | 'rust'
  | 'clean'
  | 'shelves'
  | 'runes'
  | 'treasure';

export interface ThemePalette {
  floor: number;
  floorAlt: number;
  detail: number;
  wall: number;
  wallTop: number;
  wallEdge: number;
  accent: number;
  /** Ambient light pooled around the room. */
  glow: number;
  glowAlpha: number;
  decor: DecorStyle;
}

const BASE_THEME: ThemePalette = {
  floor: 0x2e3a52,
  floorAlt: 0x35435e,
  detail: 0x475877,
  wall: 0x4c5978,
  wallTop: 0x6b7ba3,
  wallEdge: 0x222b3d,
  accent: 0x63e0ff,
  glow: 0xffb45c,
  glowAlpha: 0.07,
  decor: 'code',
};

export const THEME_PALETTES: Record<RoomTheme, ThemePalette> = {
  repository: BASE_THEME,
  basement: {
    ...BASE_THEME,
    floor: 0x262d3d,
    floorAlt: 0x2c3547,
    detail: 0x3c4762,
    wall: 0x414c66,
    wallTop: 0x5c6a8d,
    accent: 0xff6b52,
    glow: 0xff8a5c,
    glowAlpha: 0.06,
    decor: 'cables',
  },
  cache: {
    ...BASE_THEME,
    floor: 0x2b3a4c,
    floorAlt: 0x32445a,
    detail: 0x47607d,
    wall: 0x4a6079,
    wallTop: 0x6a86a5,
    accent: 0x7ee08a,
    glow: 0x7ee08a,
    glowAlpha: 0.05,
    decor: 'blocks',
  },
  null: {
    ...BASE_THEME,
    floor: 0x1e2233,
    floorAlt: 0x23283c,
    detail: 0x394061,
    wall: 0x363c58,
    wallTop: 0x4d5578,
    accent: 0xa78bfa,
    glow: 0xa78bfa,
    glowAlpha: 0.06,
    decor: 'glitch',
  },
  dependency: {
    ...BASE_THEME,
    floor: 0x2a3550,
    floorAlt: 0x303d5c,
    detail: 0x455683,
    wall: 0x475682,
    wallTop: 0x6376ab,
    accent: 0x5b8cff,
    glow: 0x5b8cff,
    glowAlpha: 0.06,
    decor: 'nodes',
  },
  graveyard: {
    ...BASE_THEME,
    floor: 0x2c3040,
    floorAlt: 0x32374a,
    detail: 0x464d66,
    wall: 0x454b62,
    wallTop: 0x616a89,
    accent: 0x9aa4b8,
    glow: 0x9aa4b8,
    glowAlpha: 0.05,
    decor: 'debris',
  },
  merge: {
    ...BASE_THEME,
    floor: 0x2d3752,
    floorAlt: 0x35405f,
    detail: 0x4a5a86,
    wall: 0x4b5880,
    wallTop: 0x6b7aa8,
    accent: 0xff9f1c,
    glow: 0xff9f1c,
    glowAlpha: 0.05,
    decor: 'split',
  },
  ci: {
    ...BASE_THEME,
    floor: 0x27364a,
    floorAlt: 0x2d3f56,
    detail: 0x3f5c78,
    wall: 0x445b76,
    wallTop: 0x6182a2,
    accent: 0x7ee08a,
    glow: 0x7ee08a,
    glowAlpha: 0.06,
    decor: 'lines',
  },
  firewall: {
    ...BASE_THEME,
    floor: 0x39303e,
    floorAlt: 0x423547,
    detail: 0x6a4550,
    wall: 0x64424c,
    wallTop: 0x8c5b62,
    accent: 0xff5c4d,
    glow: 0xff7a45,
    glowAlpha: 0.09,
    decor: 'scan',
  },
  memory: {
    ...BASE_THEME,
    floor: 0x2e2b4d,
    floorAlt: 0x353159,
    detail: 0x4d4682,
    wall: 0x4c467e,
    wallTop: 0x6b62a8,
    accent: 0xa78bfa,
    glow: 0xa78bfa,
    glowAlpha: 0.08,
    decor: 'leak',
  },
  deprecated: {
    ...BASE_THEME,
    floor: 0x33343a,
    floorAlt: 0x393a42,
    detail: 0x4e5058,
    wall: 0x4d4f58,
    wallTop: 0x6b6e79,
    accent: 0x9c8f6f,
    glow: 0x9c8f6f,
    glowAlpha: 0.04,
    decor: 'rust',
  },
  refactor: {
    ...BASE_THEME,
    floor: 0x27404e,
    floorAlt: 0x2c4b5c,
    detail: 0x3d6d84,
    wall: 0x3f6879,
    wallTop: 0x5b93a8,
    accent: 0x63e0ff,
    glow: 0x63e0ff,
    glowAlpha: 0.08,
    decor: 'clean',
  },
  archive: {
    ...BASE_THEME,
    floor: 0x272b38,
    floorAlt: 0x2c3140,
    detail: 0x3e4559,
    wall: 0x3f4559,
    wallTop: 0x59617c,
    accent: 0xf5b942,
    glow: 0xf5b942,
    glowAlpha: 0.05,
    decor: 'shelves',
  },
  vault: {
    ...BASE_THEME,
    floor: 0x27313f,
    floorAlt: 0x2c3849,
    detail: 0x415066,
    wall: 0x445168,
    wallTop: 0x627294,
    accent: 0x8dffb0,
    glow: 0x8dffb0,
    glowAlpha: 0.07,
    decor: 'runes',
  },
  secret: {
    ...BASE_THEME,
    floor: 0x3a3320,
    floorAlt: 0x443c26,
    detail: 0x6d5f34,
    wall: 0x5f5330,
    wallTop: 0x8a7745,
    accent: 0xf5b942,
    glow: 0xffd166,
    glowAlpha: 0.12,
    decor: 'treasure',
  },
};

export function themePalette(theme: RoomTheme): ThemePalette {
  return THEME_PALETTES[theme] ?? BASE_THEME;
}

/**
 * Scale a packed RGB colour towards black (factor < 1) or white (factor > 1).
 * Used to derive wall body/cap shades from one themed colour, so all 15 themes
 * get the same lighting structure without hand-tuning 15 extra values.
 */
export function shadeColor(color: number, factor: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((color & 0xff) * factor));
  return (r << 16) | (g << 8) | b;
}
