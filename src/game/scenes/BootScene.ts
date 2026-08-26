import Phaser from 'phaser';
import { createTextures } from '../art/textures.ts';

/**
 * Generates every texture procedurally, then hands control to the runtime.
 * There is no network loading anywhere in the game.
 */
export class BootScene extends Phaser.Scene {
  constructor(private readonly onReady: () => void) {
    super('boot');
  }

  create(): void {
    createTextures(this);
    this.onReady();
  }
}
