/**
 * Shared colour ramps for the code-generated pixel art.
 *
 * Everything in Dungeon.md is drawn from the data in `src/game/art/` and
 * turned into Phaser textures at boot - there are no image files anywhere in
 * the project. Keeping the ramps in one place is what stops the world from
 * drifting into unrelated palettes.
 */

/** Near-black outline used by every sprite so silhouettes stay readable. */
export const OUTLINE = '#05080f';

/** Softer outline for objects that should sit back in the scene. */
export const OUTLINE_SOFT = '#0b1220';

export const PALETTES = {
  /* ------------------------------------------------------------- player */
  player: [
    OUTLINE, // 0
    '#8cecff', // 1 hood highlight
    '#3fbde8', // 2 hood mid
    '#1d7ba6', // 3 hood shadow
    '#ffd9b3', // 4 skin
    '#3b7dfb', // 5 jacket
    '#1f4fd0', // 6 jacket shadow
    '#26334a', // 7 trousers
    '#101a29', // 8 boots
    '#eaf6ff', // 9 highlight
  ],

  /* ------------------------------------------------------------ enemies */
  bug: [OUTLINE, '#ff7a5c', '#d13a22', '#8a1f10', '#ffd24d', '#2b0d08'],
  skeleton: [OUTLINE, '#eef3fa', '#b6c4d6', '#7c8a9e', '#63e0ff'],
  slime: [OUTLINE, '#79f0a4', '#3fbf74', '#1f7f4c', '#d8ffe8'],
  dependency: [OUTLINE, '#7ba4ff', '#3b6fe0', '#1d3f96', '#cfe0ff', '#ffd24d'],
  nullPointer: [OUTLINE, '#c4a8ff', '#8b5cf6', '#5b21b6', '#f4ecff', '#ff5c8a'],
  generic: [OUTLINE, '#a4adc0', '#6c7688', '#434c5e', '#d8dee9'],

  /* -------------------------------------------------------------- items */
  debugger: [OUTLINE, '#8cecff', '#2aa7d8', '#ff6ad5', '#1a2b3d'],
  refactorBlade: [OUTLINE, '#b6ffcf', '#4fd98a', '#1f7f4c', '#0f3d28'],
  spear: [OUTLINE, '#ffe9a8', '#f5b942', '#a8721c', '#5a3a10'],
  hammer: [OUTLINE, '#a8c4ff', '#4a7be0', '#22407f', '#7a4a22'],
  axe: [OUTLINE, '#ffc48a', '#ff8a3c', '#b03a12', '#7a4a22'],
  rootAccess: [OUTLINE, '#efe6ff', '#a78bfa', '#6d28d9', '#2b1a4d', '#8dffb0'],

  armorCache: [OUTLINE, '#8ef0b0', '#3fa870', '#1d5c3c', '#0f2a1c'],
  armorFirewall: [OUTLINE, '#ffb08a', '#e05a34', '#8c2a12', '#3d1208'],
  armorKernel: [OUTLINE, '#a8dcff', '#3f8fd0', '#1d4f7a', '#0f2436'],
  armorRoot: [OUTLINE, '#efe6ff', '#a78bfa', '#6d28d9', '#2b1a4d'],

  potionHealth: [OUTLINE, '#dbeeff', '#ff5c8a', '#a81f47', '#8fb6d6'],
  potionCoffee: [OUTLINE, '#dbeeff', '#c07a3a', '#6d3f18', '#8fb6d6'],
  energy: [OUTLINE, '#dbeeff', '#43d6a0', '#1d7f5c', '#ffd24d'],
  patch: [OUTLINE, '#cfe0ff', '#63e0ff', '#1f6f96', '#0f2436'],
  restore: [OUTLINE, '#fff6d6', '#7ee08a', '#2f8a52', '#f5b942'],
  heart: [OUTLINE, '#ff7a9c', '#e0234f', '#8a0f2c', '#ffd6e0'],

  keyGold: [OUTLINE, '#ffe9a8', '#f5b942', '#a8721c'],
  keySilver: [OUTLINE, '#eef3fa', '#c0ccdb', '#7c8a9e'],
  duck: [OUTLINE, '#ffe97a', '#f5c518', '#ff9f1c', '#fffbe6'],
  scroll: [OUTLINE, '#f0e4c4', '#c9b78c', '#6b6151', '#63e0ff'],
  shield: [OUTLINE, '#dbeeff', '#63e0ff', '#1f6f96', '#0f2436'],
  hotfix: [OUTLINE, '#d6ffe4', '#7ee08a', '#2f8a52', '#ff5c4d'],
  sudo: [OUTLINE, '#0c1512', '#8dffb0', '#2f8a52', '#d6ffe4'],
  gold: [OUTLINE, '#fff1c1', '#f5b942', '#a8721c'],
  gem: [OUTLINE, '#e9d5ff', '#a78bfa', '#6d28d9'],
} as const;

export type PaletteName = keyof typeof PALETTES;
