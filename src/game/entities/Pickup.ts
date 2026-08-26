import Phaser from 'phaser';
import { getItemSpec, type ItemSpec } from '../../markdown/items.ts';
import type { ItemDefinition } from '../../markdown/types.ts';
import { itemTexture } from '../config.ts';

/**
 * A collectible item.
 *
 * Consumables, keys and gold are picked up by walking over them. Weapons and
 * armour set `interact`, so they wait for an explicit E press and never
 * silently replace what the player is already carrying.
 */
export class Pickup extends Phaser.Physics.Arcade.Sprite {
  readonly definition: ItemDefinition;
  readonly spec: ItemSpec;
  private readonly extras: Phaser.GameObjects.GameObject[] = [];

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    definition: ItemDefinition,
    reducedMotion: boolean,
  ) {
    super(scene, x, y, itemTexture(definition.specId, definition.category));
    this.definition = definition;
    this.spec = getItemSpec(definition.specId);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setScale(2.4);
    this.setDepth(12);
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    body?.setSize(this.width, this.height);
    body?.setAllowGravity(false);
    body?.setImmovable(true);

    // Equipment gets a stronger, cooler halo so it reads as "come look at this".
    const equipment = this.requiresInteract;
    const haloColor = equipment ? 0x63e0ff : 0xf5b942;
    const halo = scene.add
      .ellipse(x, y + 13, equipment ? 34 : 26, equipment ? 13 : 10, haloColor, 0.2)
      .setDepth(11);
    this.extras.push(halo);

    if (equipment) {
      const ring = scene.add
        .ellipse(x, y, 40, 40, haloColor, 0)
        .setStrokeStyle(1, haloColor, 0.5)
        .setDepth(11);
      this.extras.push(ring);
      if (!reducedMotion) {
        scene.tweens.add({
          targets: ring,
          scale: { from: 0.8, to: 1.15 },
          alpha: { from: 0.7, to: 0.15 },
          duration: 1500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }

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
        alpha: { from: 0.1, to: 0.3 },
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  get requiresInteract(): boolean {
    return this.spec.interact === true;
  }

  override destroy(fromScene?: boolean): void {
    for (const extra of this.extras) extra.destroy();
    this.extras.length = 0;
    super.destroy(fromScene);
  }
}
