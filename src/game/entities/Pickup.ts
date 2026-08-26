import Phaser from 'phaser';
import type { ItemDefinition } from '../../markdown/types.ts';
import { itemTexture } from '../config.ts';

/** A collectible item. Walking over it is enough - no interact key needed. */
export class Pickup extends Phaser.Physics.Arcade.Sprite {
  readonly definition: ItemDefinition;
  private readonly extras: Phaser.GameObjects.GameObject[] = [];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    definition: ItemDefinition,
    reducedMotion: boolean,
  ) {
    super(scene, x, y, itemTexture(definition.name, definition.kind));
    this.definition = definition;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setScale(2.2);
    this.setDepth(12);
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    body?.setSize(this.width, this.height);
    body?.setAllowGravity(false);
    body?.setImmovable(true);

    const halo = scene.add.ellipse(x, y + 12, 26, 10, 0xf5b942, 0.18).setDepth(11);
    this.extras.push(halo);

    if (!reducedMotion) {
      scene.tweens.add({
        targets: this,
        y: y - 5,
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      scene.tweens.add({
        targets: halo,
        scaleX: { from: 0.8, to: 1.15 },
        alpha: { from: 0.1, to: 0.28 },
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  override destroy(fromScene?: boolean): void {
    for (const extra of this.extras) extra.destroy();
    this.extras.length = 0;
    super.destroy(fromScene);
  }
}
