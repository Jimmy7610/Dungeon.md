import Phaser from 'phaser';

/**
 * Small generated textures used for feedback: shadows, particles, sparkles and
 * boss projectiles. All produced at boot and shared by every entity, so no
 * Graphics object is rebuilt per frame.
 */

/** Soft round particle for hits, dust and sparkles. */
function drawParticle(scene: Phaser.Scene): void {
  if (scene.textures.exists('particle')) return;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(0xffffff, 1);
  graphics.fillCircle(4, 4, 4);
  graphics.generateTexture('particle', 8, 8);
  graphics.destroy();
}

/** A hard square pixel - reads as a code fragment rather than smoke. */
function drawPixelChunk(scene: Phaser.Scene): void {
  if (scene.textures.exists('chunk')) return;
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  graphics.fillStyle(0xffffff, 1);
  graphics.fillRect(0, 0, 4, 4);
  graphics.generateTexture('chunk', 4, 4);
  graphics.destroy();
}

/**
 * Contact shadow. One shared ellipse, tinted and scaled per entity, which is
 * what lifts sprites off the floor instead of leaving them pasted on it.
 */
function drawShadow(scene: Phaser.Scene): void {
  if (scene.textures.exists('shadow')) return;
  const size = 32;
  const texture = scene.textures.createCanvas('shadow', size, size / 2);
  const context = texture?.getContext();
  if (!texture || !context) return;
  const gradient = context.createRadialGradient(size / 2, size / 4, 1, size / 2, size / 4, size / 2);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
  gradient.addColorStop(0.6, 'rgba(0, 0, 0, 0.22)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size / 2);
  texture.refresh();
}

/** Boss projectile: a broken bracket fragment, not a generic ball. */
function drawShard(scene: Phaser.Scene): void {
  if (scene.textures.exists('shard')) return;
  const pixels = [
    '.0000.',
    '011110',
    '012210',
    '012210',
    '011110',
    '.0000.',
  ];
  const palette = ['#0b0512', '#c4a8ff', '#ff5c4d'];
  const graphics = scene.make.graphics({ x: 0, y: 0 }, false);
  pixels.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      if (cell === '.') return;
      const color = palette[Number.parseInt(cell, 10)];
      if (!color) return;
      graphics.fillStyle(Phaser.Display.Color.HexStringToColor(color).color, 1);
      graphics.fillRect(x, y, 1, 1);
    });
  });
  graphics.generateTexture('shard', 6, 6);
  graphics.destroy();
}

/**
 * Warm torch-lit vignette. Drawn to a canvas texture once and stretched over
 * the room; far cheaper than a shader and it survives `prefers-reduced-motion`.
 */
function drawVignette(scene: Phaser.Scene, width: number, height: number): void {
  if (scene.textures.exists('vignette')) return;
  const texture = scene.textures.createCanvas('vignette', width, height);
  const context = texture?.getContext();
  if (!texture || !context) return;
  const gradient = context.createRadialGradient(
    width / 2,
    height / 2,
    height * 0.2,
    width / 2,
    height / 2,
    height * 0.88,
  );
  gradient.addColorStop(0, 'rgba(255, 200, 130, 0.05)');
  gradient.addColorStop(0.55, 'rgba(8, 11, 18, 0)');
  gradient.addColorStop(1, 'rgba(4, 6, 11, 0.5)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  texture.refresh();
}

export function createEffectTextures(scene: Phaser.Scene, width: number, height: number): void {
  drawParticle(scene);
  drawPixelChunk(scene);
  drawShadow(scene);
  drawShard(scene);
  drawVignette(scene, width, height);
}
