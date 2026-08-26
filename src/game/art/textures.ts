import Phaser from 'phaser';
import { SPRITES, type PixelSprite } from './pixels.ts';
import { GAME_HEIGHT, GAME_WIDTH } from '../config.ts';

/**
 * Turn the text-based pixel art into real textures once, at boot.
 *
 * Rows are padded/truncated to the widest row so a miscounted character in the
 * art can never throw or produce a skewed sprite.
 */
function drawSprite(scene: Phaser.Scene, sprite: PixelSprite): void {
  if (scene.textures.exists(sprite.key)) return;
  const rows = sprite.pixels;
  const height = rows.length;
  const width = rows.reduce((max, row) => Math.max(max, row.length), 0);
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

/** A soft round particle used for hits, sparkles and dust. */
function drawParticle(scene: Phaser.Scene): void {
  if (scene.textures.exists('particle')) return;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(0xffffff, 1);
  graphics.fillCircle(4, 4, 4);
  graphics.generateTexture('particle', 8, 8);
  graphics.destroy();
}

/** Small square used for boss projectiles. */
function drawShard(scene: Phaser.Scene): void {
  if (scene.textures.exists('shard')) return;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(0x0b1220, 1);
  graphics.fillRect(0, 0, 10, 10);
  graphics.fillStyle(0x9d7bff, 1);
  graphics.fillRect(1, 1, 8, 8);
  graphics.fillStyle(0xe9d5ff, 1);
  graphics.fillRect(2, 2, 3, 3);
  graphics.generateTexture('shard', 10, 10);
  graphics.destroy();
}

/**
 * Warm torch-lit vignette. Drawn to a canvas texture once and stretched over
 * the room; far cheaper than a shader and it survives `prefers-reduced-motion`.
 */
function drawVignette(scene: Phaser.Scene): void {
  if (scene.textures.exists('vignette')) return;
  const texture = scene.textures.createCanvas('vignette', GAME_WIDTH, GAME_HEIGHT);
  const context = texture?.getContext();
  if (!texture || !context) return;
  const gradient = context.createRadialGradient(
    GAME_WIDTH / 2,
    GAME_HEIGHT / 2,
    GAME_HEIGHT * 0.18,
    GAME_WIDTH / 2,
    GAME_HEIGHT / 2,
    GAME_HEIGHT * 0.86,
  );
  gradient.addColorStop(0, 'rgba(255, 190, 110, 0.07)');
  gradient.addColorStop(0.5, 'rgba(8, 11, 18, 0)');
  gradient.addColorStop(1, 'rgba(4, 6, 11, 0.38)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  texture.refresh();
}

export function createTextures(scene: Phaser.Scene): void {
  for (const sprite of SPRITES) drawSprite(scene, sprite);
  drawParticle(scene);
  drawShard(scene);
  drawVignette(scene);
}
