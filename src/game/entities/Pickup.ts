import Phaser from 'phaser';
import { getItemSpec, type ItemSpec } from '../../markdown/items.ts';
import type { ItemDefinition } from '../../markdown/types.ts';
import { ITEM_SCALE, itemTexture } from '../config.ts';

/** Loot that is meant to feel rare gets a stronger presentation. */
const LEGENDARY = new Set(['root-access', 'root-armor', 'sudo']);

/** Accent colour per category, so the floor reads before the name does. */
const CATEGORY_ACCENT: Record<string, number> = {
  weapon: 0x63e0ff,
  armor: 0x7ee08a,
  consumable: 0xff5c8a,
  key: 0xf5b942,
  special: 0xa78bfa,
  currency: 0xf5b942,
  generic: 0x9aa4b8,
};

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
    this.setScale(ITEM_SCALE);
    this.setDepth(12);
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    body?.setSize(this.width, this.height);
    body?.setAllowGravity(false);
    body?.setImmovable(true);

    const legendary = LEGENDARY.has(this.spec.id);
    const accent = legendary ? 0xd6b3ff : (CATEGORY_ACCENT[this.spec.category] ?? 0x9aa4b8);

    // A contact shadow stops loot from floating, and a pooled glow makes it
    // findable across a busy floor.
    const shadow = scene.add
      .image(x, y + 12, 'shadow')
      .setDepth(10)
      .setDisplaySize(20, 8)
      .setAlpha(0.55);
    const glow = scene.add
      .ellipse(x, y + 10, legendary ? 40 : 30, legendary ? 16 : 12, accent, legendary ? 0.3 : 0.2)
      .setDepth(11);
    this.extras.push(shadow, glow);

    if (this.requiresInteract || legendary) {
      const ring = scene.add
        .ellipse(x, y, legendary ? 46 : 40, legendary ? 46 : 40, accent, 0)
        .setStrokeStyle(1, accent, legendary ? 0.75 : 0.5)
        .setDepth(11);
      this.extras.push(ring);
      if (!reducedMotion) {
        scene.tweens.add({
          targets: ring,
          scale: { from: 0.78, to: 1.18 },
          alpha: { from: 0.85, to: 0.1 },
          duration: legendary ? 1200 : 1500,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }

    if (legendary && !reducedMotion) {
      // Three slow sparks orbiting the rarest loot in the campaign.
      for (let index = 0; index < 3; index++) {
        const spark = scene.add.rectangle(x, y, 3, 3, 0xffffff, 0.9).setDepth(13);
        this.extras.push(spark);
        scene.tweens.add({
          targets: spark,
          angle: 360,
          duration: 2400,
          repeat: -1,
          onUpdate: (tween) => {
            const t = tween.progress * Math.PI * 2 + (index / 3) * Math.PI * 2;
            spark.setPosition(x + Math.cos(t) * 19, y + Math.sin(t) * 11);
            spark.setAlpha(0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t)));
          },
        });
      }
    }

    if (!reducedMotion) {
      scene.tweens.add({
        targets: this,
        y: y - 4,
        duration: 1200,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      scene.tweens.add({
        targets: glow,
        scaleX: { from: 0.82, to: 1.14 },
        alpha: { from: 0.12, to: 0.3 },
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
