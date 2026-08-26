import { PALETTES } from './palettes.ts';
import type { PixelSprite } from './types.ts';

/**
 * The developer. 16x16, drawn facing the camera in a hooded jacket with
 * headphones, so the silhouette still reads at split-screen size.
 *
 * Palette indices: 0 outline · 1-3 hood · 4 skin · 5-6 jacket · 7 trousers
 * · 8 boots · 9 highlight.
 */

const IDLE_A = [
  '................',
  '.....000000.....',
  '...0011111100...',
  '..011111111110..',
  '..012111111210..',
  '.6012344443210.6',
  '.6012404404210.6',
  '..012344443210..',
  '...0134444310...',
  '...0055555500...',
  '..055566655550..',
  '.40555666555504.',
  '..055566655550..',
  '..007777777700..',
  '...0777007770...',
  '...0880..0880...',
];

/** Breathing frame: the whole figure settles one pixel. */
const IDLE_B = [
  '................',
  '................',
  '.....000000.....',
  '...0011111100...',
  '..011111111110..',
  '.6012344443210.6',
  '.6012404404210.6',
  '..012344443210..',
  '...0134444310...',
  '...0055555500...',
  '..055566655550..',
  '.40555666555504.',
  '..055566655550..',
  '..007777777700..',
  '...0777007770...',
  '...0880..0880...',
];

/** Left leg forward, left arm back. */
const WALK_A = [
  '................',
  '.....000000.....',
  '...0011111100...',
  '..011111111110..',
  '..012111111210..',
  '.6012344443210.6',
  '.6012404404210.6',
  '..012344443210..',
  '...0134444310...',
  '...0055555500...',
  '..055566655550..',
  '440555666555504.',
  '..055566655550..',
  '..007777777700..',
  '..07770..07770..',
  '.0880.......0880',
];

/** Right leg forward, right arm back. */
const WALK_B = [
  '................',
  '.....000000.....',
  '...0011111100...',
  '..011111111110..',
  '..012111111210..',
  '.6012344443210.6',
  '.6012404404210.6',
  '..012344443210..',
  '...0134444310...',
  '...0055555500...',
  '..055566655550..',
  '.405556665555044',
  '..055566655550..',
  '..007777777700..',
  '..07770..07770..',
  '0880.......0880.',
];

/** Legs together - stops the cycle reading as a two-frame flip. */
const WALK_MID = [
  '................',
  '................',
  '.....000000.....',
  '...0011111100...',
  '..011111111110..',
  '.6012344443210.6',
  '.6012404404210.6',
  '..012344443210..',
  '...0134444310...',
  '...0055555500...',
  '..055566655550..',
  '.40555666555504.',
  '..055566655550..',
  '..007777777700..',
  '...0777777770...',
  '...0880..0880...',
];

/**
 * Armour overlay: a chest piece drawn on top of any player frame. It only
 * covers the torso rows, which do not move between frames, so one overlay
 * works for the whole animation and the player's collision body is untouched.
 */
const ARMOR_SHAPE = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '..011111111110..',
  '.01122222222110.',
  '.01211111111210.',
  '.01211111111210.',
  '..011222222110..',
  '................',
  '................',
];

export const PLAYER_SPRITES: PixelSprite[] = [
  { key: 'player-idle', palette: PALETTES.player, pixels: IDLE_A, width: 16 },
  { key: 'player-idle-b', palette: PALETTES.player, pixels: IDLE_B, width: 16 },
  { key: 'player-walk', palette: PALETTES.player, pixels: WALK_A, width: 16 },
  { key: 'player-walk-b', palette: PALETTES.player, pixels: WALK_B, width: 16 },
  { key: 'player-walk-mid', palette: PALETTES.player, pixels: WALK_MID, width: 16 },

  { key: 'armor-cache-jacket', palette: PALETTES.armorCache, pixels: ARMOR_SHAPE, width: 16 },
  { key: 'armor-firewall-vest', palette: PALETTES.armorFirewall, pixels: ARMOR_SHAPE, width: 16 },
  { key: 'armor-kernel-plate', palette: PALETTES.armorKernel, pixels: ARMOR_SHAPE, width: 16 },
  { key: 'armor-root-armor', palette: PALETTES.armorRoot, pixels: ARMOR_SHAPE, width: 16 },
];

/** Four-step walk cycle and a two-step idle breath. */
export const WALK_CYCLE = [
  'player-walk',
  'player-walk-mid',
  'player-walk-b',
  'player-walk-mid',
] as const;
export const IDLE_CYCLE = ['player-idle', 'player-idle-b'] as const;

/** Armour spec id -> overlay texture key. */
export const ARMOR_TEXTURES: Record<string, string> = {
  'cache-jacket': 'armor-cache-jacket',
  'firewall-vest': 'armor-firewall-vest',
  'kernel-plate': 'armor-kernel-plate',
  'root-armor': 'armor-root-armor',
};
