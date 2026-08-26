/**
 * Hand-drawn pixel art, stored as text.
 *
 * Each row is a string; every character is an index into the sprite's palette
 * and `.` is transparent. Shapes and palettes are kept separate so an enemy
 * type can reuse a silhouette with a different colour scheme.
 *
 * Nothing here is loaded from the network - textures are generated at runtime
 * (see `textures.ts`).
 */

export interface PixelSprite {
  key: string;
  palette: readonly string[];
  pixels: readonly string[];
}

/* ------------------------------------------------------------------ shapes */

const PLAYER_IDLE = [
  '....0000....',
  '...011110...',
  '..01111110..',
  '..01333310..',
  '..01303010..',
  '..01333310..',
  '...044440...',
  '..04444440..',
  '..34444443..',
  '..04444440..',
  '...055550...',
  '...05..50...',
];

const PLAYER_WALK = [
  '....0000....',
  '...011110...',
  '..01111110..',
  '..01333310..',
  '..01303010..',
  '..01333310..',
  '...044440...',
  '..04444440..',
  '.344444443..',
  '..04444440..',
  '...055550...',
  '..05....50..',
];

/** Six-legged beetle silhouette. */
const BEETLE = [
  '............',
  '..0......0..',
  '...0....0...',
  '..01111110..',
  '.0133113310.',
  '401111111104',
  '.0122222210.',
  '401222222104',
  '.0122222210.',
  '..02222220..',
  '...044440...',
  '............',
];

/** Bony skull-and-ribs silhouette. */
const SKULL = [
  '............',
  '...011110...',
  '..01111110..',
  '.0110110110.',
  '.0111111110.',
  '..01111110..',
  '...010010...',
  '..02222220..',
  '.0202202020.',
  '..02222220..',
  '...02..20...',
  '...00..00...',
];

/** Rounded blob with a highlight. */
const BLOB = [
  '............',
  '............',
  '....0000....',
  '..00111100..',
  '.0112111110.',
  '.0121111110.',
  '.0111111110.',
  '011111111110',
  '011001100110',
  '011111111110',
  '.0000000000.',
  '............',
];

/** Stacked packages, chained together. */
const BLOCK = [
  '............',
  '..00000000..',
  '..01111110..',
  '..01022010..',
  '..01111110..',
  '..00000000..',
  '.0011111100.',
  '.0102222010.',
  '.0111111110.',
  '.0011111100.',
  '..00000000..',
  '............',
];

/** Glitchy ghost with a ragged hem. */
const GHOST = [
  '............',
  '....0000....',
  '..00111100..',
  '.0111111110.',
  '.0102110210.',
  '.0111111110.',
  '.0111221110.',
  '.0111111110.',
  '.0111111110.',
  '.0101101010.',
  '..0.0..0.0..',
  '............',
];

/* ------------------------------------------------------------------- items */

const SWORD = [
  '....00....',
  '...0110...',
  '...0110...',
  '...0110...',
  '...0110...',
  '.02222220.',
  '...0330...',
  '...0330...',
  '....22....',
  '..........',
];

const POTION = [
  '..........',
  '...0000...',
  '...0110...',
  '..011110..',
  '.01222210.',
  '.01222210.',
  '.01222210.',
  '.01222210.',
  '..011110..',
  '...0000...',
];

const KEY = [
  '..........',
  '...000....',
  '..01110...',
  '..01010...',
  '..01110...',
  '...010....',
  '...010....',
  '...0110...',
  '...010....',
  '..........',
];

const DUCK = [
  '..........',
  '...000....',
  '..01110...',
  '..01010...',
  '..011102..',
  '.0111110..',
  '.01111110.',
  '.01111110.',
  '..000000..',
  '..........',
];

const SCROLL = [
  '..........',
  '.00000000.',
  '.01111110.',
  '.01222210.',
  '.01111110.',
  '.01222210.',
  '.01111110.',
  '.01222210.',
  '.00000000.',
  '..........',
];

const COIN = [
  '..........',
  '..........',
  '...0000...',
  '..011110..',
  '.01122110.',
  '.01111110.',
  '..011110..',
  '...0000...',
  '..........',
  '..........',
];

const GEM = [
  '..........',
  '...0000...',
  '..011110..',
  '.01122110.',
  '.01111110.',
  '..011110..',
  '...0110...',
  '....00....',
  '..........',
  '..........',
];


const SPEAR = [
  '....00....',
  '...0110...',
  '...0110...',
  '....00....',
  '....11....',
  '....11....',
  '..022220..',
  '....11....',
  '....11....',
  '....22....',
];

const HAMMER = [
  '.00000000.',
  '.02222220.',
  '.02111120.',
  '.02222220.',
  '.00033000.',
  '....33....',
  '....33....',
  '....33....',
  '...0330...',
  '....00....',
];

const AXE = [
  '..0000....',
  '.011110...',
  '011111100.',
  '01111110..',
  '.011110.3.',
  '..0000.33.',
  '......33..',
  '.....33...',
  '....33....',
  '....00....',
];

const VEST = [
  '..0....0..',
  '.011..110.',
  '0111111110',
  '0112112110',
  '0112112110',
  '0111111110',
  '0111111110',
  '.01111110.',
  '.00000000.',
  '..........',
];

const CAN = [
  '..000000..',
  '.01111110.',
  '.01222210.',
  '.01211210.',
  '.01222210.',
  '.01211210.',
  '.01222210.',
  '.01111110.',
  '..000000..',
  '..........',
];

const KIT = [
  '..........',
  '.00000000.',
  '.01111110.',
  '.01122110.',
  '.01222210.',
  '.01222210.',
  '.01122110.',
  '.01111110.',
  '.00000000.',
  '..........',
];

const HEART = [
  '..........',
  '..00..00..',
  '.0110110..',
  '011111110.',
  '011111110.',
  '.0111110..',
  '..01110...',
  '...010....',
  '....0.....',
  '..........',
];

const SHIELD = [
  '..000000..',
  '.01111110.',
  '.01122110.',
  '.01221210.',
  '.01221210.',
  '.01122110.',
  '..011110..',
  '...0110...',
  '....00....',
  '..........',
];

const TERMINAL = [
  '0000000000',
  '0111111110',
  '0122111110',
  '0112211110',
  '0111221110',
  '0112211110',
  '0122111110',
  '0111122210',
  '0111111110',
  '0000000000',
];

/* ------------------------------------------------------------------ bosses */

/** A giant corrupted mass of code. */
const BOSS_MASS = [
  '................',
  '.....000000.....',
  '...0011111100...',
  '..011122211110..',
  '.01112222211110.',
  '.01224444422110.',
  '0112222222222110',
  '0112242222422110',
  '0112222222222110',
  '0112233223322110',
  '.01223333332210.',
  '.01122222222110.',
  '..011222222110..',
  '...0011111100...',
  '.....000000.....',
  '................',
];

/** A crowned skull for `forgotten-king`. */
const BOSS_KING = [
  '................',
  '...3..3..3..3...',
  '...3333333333...',
  '..033333333330..',
  '..011111111110..',
  '.01122222221110.',
  '.01222222222210.',
  '0122222222222210',
  '0120044004400210',
  '0122000000002210',
  '.01222222222210.',
  '.01222002222210.',
  '..012020202100..',
  '..011111111110..',
  '...0111111110...',
  '....00000000....',
];

/* ---------------------------------------------------------------- palettes */

const OUTLINE = '#070b12';

const PALETTES = {
  player: [OUTLINE, '#63e0ff', '#1b8fc4', '#ffd9b3', '#2f6feb', '#20293a'],
  bug: [OUTLINE, '#ff6b52', '#c02d1c', '#ffd24d'],
  skeleton: [OUTLINE, '#e8eef7', '#9fb0c6'],
  slime: [OUTLINE, '#5fd98a', '#c9ffe0'],
  dependency: [OUTLINE, '#5b8cff', '#c7d8ff'],
  nullPointer: [OUTLINE, '#a78bfa', '#f0e7ff'],
  generic: [OUTLINE, '#8b93a7', '#d6dbe6'],
  sword: [OUTLINE, '#dbe4ee', '#f5b942', '#7a4a22'],
  debugger: [OUTLINE, '#63e0ff', '#ff6ad5', '#1b8fc4'],
  potionRed: [OUTLINE, '#cfe8ff', '#ff5c8a'],
  potionCoffee: [OUTLINE, '#cfe8ff', '#b5651d'],
  keyGold: [OUTLINE, '#f5b942'],
  keySilver: [OUTLINE, '#cbd5e1'],
  duck: [OUTLINE, '#ffe066', '#ff9f1c'],
  scroll: [OUTLINE, '#e8dcc0', '#6b6151'],
  gold: [OUTLINE, '#f5b942', '#fff1c1'],
  gem: [OUTLINE, '#a78bfa', '#e9d5ff'],
  blade: [OUTLINE, '#b8f5c8', '#7ee08a', '#3f7d4f'],
  spear: [OUTLINE, '#ffe9a8', '#f5b942'],
  hammer: [OUTLINE, '#c7d8ff', '#5b8cff', '#7a4a22'],
  axe: [OUTLINE, '#ffd0a3', '#ff9f1c', '#7a4a22'],
  root: [OUTLINE, '#e9d5ff', '#a78bfa'],
  armorCache: [OUTLINE, '#7ee08a', '#2f6b45'],
  armorFirewall: [OUTLINE, '#ff9f7a', '#b3241a'],
  armorKernel: [OUTLINE, '#9fd8ff', '#2a6f9e'],
  armorRoot: [OUTLINE, '#e9d5ff', '#7c4ddb'],
  energy: [OUTLINE, '#cfe8ff', '#43d6a0'],
  patch: [OUTLINE, '#cbd5e1', '#63e0ff'],
  restore: [OUTLINE, '#fff1c1', '#7ee08a'],
  heart: [OUTLINE, '#ff5c8a'],
  shield: [OUTLINE, '#cbd5e1', '#63e0ff'],
  sudo: [OUTLINE, '#0f1a12', '#8dffb0'],
  bossMass: ['#04120a', '#12472c', '#2f8a52', '#8dffb0', '#ff5c4d'],
  bossKing: ['#0a0a12', '#5b6472', '#cbd5e1', '#fbbf24', '#a78bfa'],
} as const;

export const SPRITES: readonly PixelSprite[] = [
  { key: 'player-idle', palette: PALETTES.player, pixels: PLAYER_IDLE },
  { key: 'player-walk', palette: PALETTES.player, pixels: PLAYER_WALK },

  { key: 'enemy-bug', palette: PALETTES.bug, pixels: BEETLE },
  { key: 'enemy-skeleton', palette: PALETTES.skeleton, pixels: SKULL },
  { key: 'enemy-slime', palette: PALETTES.slime, pixels: BLOB },
  { key: 'enemy-dependency', palette: PALETTES.dependency, pixels: BLOCK },
  { key: 'enemy-null-pointer', palette: PALETTES.nullPointer, pixels: GHOST },
  { key: 'enemy-generic', palette: PALETTES.generic, pixels: BLOB },

  { key: 'item-sword', palette: PALETTES.sword, pixels: SWORD },
  { key: 'item-debugger', palette: PALETTES.debugger, pixels: SWORD },
  { key: 'item-potion', palette: PALETTES.potionRed, pixels: POTION },
  { key: 'item-coffee', palette: PALETTES.potionCoffee, pixels: POTION },
  { key: 'item-key', palette: PALETTES.keyGold, pixels: KEY },
  { key: 'item-key-silver', palette: PALETTES.keySilver, pixels: KEY },
  { key: 'item-duck', palette: PALETTES.duck, pixels: DUCK },
  { key: 'item-scroll', palette: PALETTES.scroll, pixels: SCROLL },
  { key: 'item-gold', palette: PALETTES.gold, pixels: COIN },
  { key: 'item-gem', palette: PALETTES.gem, pixels: GEM },
  { key: 'item-blade', palette: PALETTES.blade, pixels: SWORD },
  { key: 'item-spear', palette: PALETTES.spear, pixels: SPEAR },
  { key: 'item-hammer', palette: PALETTES.hammer, pixels: HAMMER },
  { key: 'item-axe', palette: PALETTES.axe, pixels: AXE },
  { key: 'item-root', palette: PALETTES.root, pixels: TERMINAL },
  { key: 'item-armor-cache', palette: PALETTES.armorCache, pixels: VEST },
  { key: 'item-armor-firewall', palette: PALETTES.armorFirewall, pixels: VEST },
  { key: 'item-armor-kernel', palette: PALETTES.armorKernel, pixels: VEST },
  { key: 'item-armor-root', palette: PALETTES.armorRoot, pixels: VEST },
  { key: 'item-energy', palette: PALETTES.energy, pixels: CAN },
  { key: 'item-patch', palette: PALETTES.patch, pixels: KIT },
  { key: 'item-restore', palette: PALETTES.restore, pixels: KIT },
  { key: 'item-heart', palette: PALETTES.heart, pixels: HEART },
  { key: 'item-shield', palette: PALETTES.shield, pixels: SHIELD },
  { key: 'item-hotfix', palette: PALETTES.restore, pixels: SHIELD },
  { key: 'item-sudo', palette: PALETTES.sudo, pixels: TERMINAL },

  { key: 'boss-legacy-code', palette: PALETTES.bossMass, pixels: BOSS_MASS },
  { key: 'boss-forgotten-king', palette: PALETTES.bossKing, pixels: BOSS_KING },
];
