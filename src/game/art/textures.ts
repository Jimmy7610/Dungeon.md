import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config.ts';
import { createEffectTextures } from './effects.ts';
import { SPRITES } from './registry.ts';
import type { PixelSprite } from './types.ts';

/**
 * Turn a text sprite into a texture. Rows are padded/trimmed to the declared
 * width, so a miscounted character can never throw or skew a sprite.
 */
function drawSprite(scene: Phaser.Scene, sprite: PixelSprite): void {
  if (scene.textures.exists(sprite.key)) return;
  const rows = sprite.pixels;
  const height = rows.length;
  const width = sprite.width ?? rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (width === 0 || height === 0) return;

  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  for (let y = 0; y < height; y++) {
    const row = (rows[y] ?? '').padEnd(width, '.');
    for (let x = 0; x < width; x++) {
      const char = row[x] ?? '.';
      if (char === '.' || char === ' ') continue;
      const index = Number.parseInt(char, 16);
      const color = sprite.palette[index];
      if (!color) continue;
      graphics.fillStyle(Phaser.Display.Color.HexStringToColor(color).color, 1);
      graphics.fillRect(x, y, 1, 1);
    }
  }
  graphics.generateTexture(sprite.key, width, height);
  graphics.destroy();
}

export function createTextures(scene: Phaser.Scene): void {
  for (const sprite of SPRITES) drawSprite(scene, sprite);
  createEffectTextures(scene, GAME_WIDTH, GAME_HEIGHT);
}

/** Used by tests to assert that every registered sprite is well formed. */
export function spriteRegistry(): readonly PixelSprite[] {
  return SPRITES;
}

export { SPRITES };
