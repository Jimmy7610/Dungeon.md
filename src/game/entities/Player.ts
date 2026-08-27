import Phaser from 'phaser';
import { ARMOR_TEXTURES, IDLE_CYCLE, WALK_CYCLE } from '../art/player.ts';
import { PLAYER } from '../config.ts';
import { aimDirection } from '../systems/CombatSystem.ts';

export interface InputState {
  x: number;
  y: number;
  attack: boolean;
}

const WALK_FRAME_MS = 110;
const IDLE_FRAME_MS = 620;

/**
 * The little cyan developer: movement, aim, i-frames and attack timing.
 *
 * Movement and aim are deliberately independent. WASD only ever sets velocity;
 * `facing` - which drives the attack arc, the swing art and the sprite flip -
 * comes from the mouse. Until the pointer has been used, `facing` falls back to
 * the last movement direction so keyboard-only play still works.
 *
 * The physics body is sized from `PLAYER.bodyWidth/bodyHeight` in *display*
 * pixels, so none of this changes the collision box.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  /** Aim direction: what the player attacks and looks toward. */
  readonly facing = new Phaser.Math.Vector2(1, 0);
  /** True once the pointer has given a real aim; movement stops steering then. */
  private aimFromPointer = false;
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

  /**
   * Point the player at a world position. Called every frame from the scene
   * with the latest pointer position, so the direction stays correct as the
   * player moves underneath a stationary mouse.
   */
  aimAt(worldX: number, worldY: number): void {
    const direction = aimDirection({ x: this.x, y: this.y }, { x: worldX, y: worldY }, this.facing);
    this.facing.set(direction.x, direction.y);
    this.aimFromPointer = true;
    this.applyFacingFlip();
  }

  /** True once the mouse has taken over aiming. */
  get isAiming(): boolean {
    return this.aimFromPointer;
  }

  /** Face left or right based on aim, with a deadzone so vertical aim is stable. */
  private applyFacingFlip(): void {
    if (this.facing.x < -0.15) this.setFlipX(true);
    else if (this.facing.x > 0.15) this.setFlipX(false);
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
      body.setVelocity(vector.x * speed, vector.y * speed);
      // Movement only steers the character before the mouse has ever aimed;
      // once it has, walking never overrides where the player is pointing.
      if (!this.aimFromPointer) {
        this.facing.set(vector.x, vector.y);
        this.applyFacingFlip();
      }
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
