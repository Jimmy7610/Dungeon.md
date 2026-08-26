import Phaser from 'phaser';
import { ARMOR_TEXTURES, IDLE_CYCLE, WALK_CYCLE } from '../art/player.ts';
import { PLAYER } from '../config.ts';

export interface InputState {
  x: number;
  y: number;
  attack: boolean;
}

const WALK_FRAME_MS = 110;
const IDLE_FRAME_MS = 620;

/**
 * The little cyan developer: movement, facing, i-frames and attack timing.
 *
 * The sprite grew from 12px to 16px of source art, but the physics body is
 * still sized from `PLAYER.bodyWidth/bodyHeight` in *display* pixels, so the
 * collision box is exactly what it was before the art pass.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  readonly facing = new Phaser.Math.Vector2(1, 0);
  private nextAttackAt = 0;
  private invulnerableUntil = 0;
  private frameTimer = 0;
  private frameIndex = 0;
  private walking = false;

  /** Chest overlay showing the equipped armour tier. */
  private readonly armorLayer: Phaser.GameObjects.Image;
  /** Contact shadow, so the character is standing on the floor, not over it. */
  private readonly shadow: Phaser.GameObjects.Image;
  /** Root Armor gets a faint halo. */
  private readonly aura: Phaser.GameObjects.Ellipse;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player-idle');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setScale(PLAYER.scale);
    this.setOrigin(0.5, 0.6);
    this.setDepth(20);
    this.body?.setSize(PLAYER.bodyWidth / PLAYER.scale, PLAYER.bodyHeight / PLAYER.scale);
    this.body?.setOffset(
      (this.width - PLAYER.bodyWidth / PLAYER.scale) / 2,
      this.height - PLAYER.bodyHeight / PLAYER.scale - 1,
    );
    (this.body as Phaser.Physics.Arcade.Body | null)?.setCollideWorldBounds(true);

    this.shadow = scene.add
      .image(x, y, 'shadow')
      .setDepth(19)
      .setDisplaySize(this.displayWidth * 0.62, this.displayHeight * 0.22)
      .setAlpha(0.75);
    this.aura = scene.add.ellipse(x, y, 46, 46, 0xa78bfa, 0).setDepth(18);
    this.armorLayer = scene.add
      .image(x, y, 'armor-cache-jacket')
      .setOrigin(0.5, 0.6)
      .setScale(PLAYER.scale)
      .setDepth(21)
      .setVisible(false);
  }

  get isInvulnerable(): boolean {
    return this.scene.time.now < this.invulnerableUntil;
  }

  canAttack(now: number): boolean {
    return now >= this.nextAttackAt;
  }

  /** Cooldown comes from the equipped weapon, so it is passed in. */
  registerAttack(now: number, cooldownMs: number): void {
    this.nextAttackAt = now + cooldownMs;
  }

  grantInvulnerability(now: number): void {
    this.invulnerableUntil = now + PLAYER.invulnerableMs;
  }

  /** Show the equipped armour tier on the character. */
  setArmor(specId: string | null): void {
    const texture = specId ? ARMOR_TEXTURES[specId] : undefined;
    if (!texture) {
      this.armorLayer.setVisible(false);
      this.aura.setFillStyle(0xa78bfa, 0);
      return;
    }
    this.armorLayer.setTexture(texture).setVisible(true);
    // Root Armor is the only one that glows.
    this.aura.setFillStyle(0xa78bfa, specId === 'root-armor' ? 0.16 : 0);
  }

  drive(input: InputState, delta: number, speed: number = PLAYER.speed): void {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    const vector = new Phaser.Math.Vector2(input.x, input.y);
    const moving = vector.lengthSq() > 0;

    if (moving) {
      vector.normalize();
      this.facing.set(vector.x, vector.y);
      body.setVelocity(vector.x * speed, vector.y * speed);
      this.setFlipX(vector.x < -0.2 ? true : vector.x > 0.2 ? false : this.flipX);
    } else {
      body.setVelocity(0, 0);
    }

    if (moving !== this.walking) {
      this.walking = moving;
      this.frameTimer = 0;
      this.frameIndex = 0;
    }

    // Four-step walk, two-step idle breath.
    const cycle = moving ? WALK_CYCLE : IDLE_CYCLE;
    const frameMs = moving ? WALK_FRAME_MS : IDLE_FRAME_MS;
    this.frameTimer += delta;
    if (this.frameTimer >= frameMs) {
      this.frameTimer -= frameMs;
      this.frameIndex = (this.frameIndex + 1) % cycle.length;
    }
    const frame = cycle[this.frameIndex] ?? cycle[0]!;
    if (this.texture.key !== frame) this.setTexture(frame);

    // Blink while invulnerable so damage always reads.
    const alpha = this.isInvulnerable
      ? Math.floor(this.scene.time.now / 90) % 2
        ? 0.35
        : 1
      : 1;
    this.setAlpha(alpha);

    // Two frames settle the whole figure one source pixel; the overlay follows
    // so the chest piece never floats off the torso.
    const settled = frame === 'player-idle-b' || frame === 'player-walk-mid';
    this.armorLayer
      .setPosition(this.x, this.y + (settled ? PLAYER.scale : 0))
      .setFlipX(this.flipX)
      .setAlpha(alpha);
    this.shadow.setPosition(this.x, this.y + this.displayHeight * 0.32);
    this.aura.setPosition(this.x, this.y);
  }

  override destroy(fromScene?: boolean): void {
    this.armorLayer.destroy();
    this.shadow.destroy();
    this.aura.destroy();
    super.destroy(fromScene);
  }
}
