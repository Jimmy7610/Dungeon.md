import { BOSS_SPRITES } from './bosses.ts';
import { ENEMY_SPRITES } from './enemies.ts';
import { ITEM_SPRITES } from './items.ts';
import { PLAYER_SPRITES } from './player.ts';
import type { PixelSprite } from './types.ts';

/**
 * Every sprite in the game, in one registry.
 *
 * Deliberately free of Phaser: the art is plain data, so it can be validated
 * in tests without booting a browser. `textures.ts` turns it into GPU
 * textures at boot.
 */
export const SPRITES: readonly PixelSprite[] = [
  ...PLAYER_SPRITES,
  ...ENEMY_SPRITES,
  ...ITEM_SPRITES,
  ...BOSS_SPRITES,
];
