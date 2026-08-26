import Phaser from 'phaser';
import { PLAYER } from '../config.ts';

export interface InputState {
  x: number;
  y: number;
  attack: boolean;
}

/** The little cyan developer. Movement, facing, i-frames and attack timing. */
export class Player extends Phaser.Physics.Arcade.Sprite {
  readonly facing = new Phaser.Math.Vector2(1, 0);
  private nextAttackAt = 0;
  private invulnerableUntil = 0;
  private walkTimer = 0;
  private walkFrame = false;

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
  }

  get isInvulnerable(): boolean {
    return this.scene.time.now < this.invulnerableUntil;
  }

  canAttack(now: number): boolean {
    return now >= this.nextAttackAt;
  }

  registerAttack(now: number): void {
    this.nextAttackAt = now + PLAYER.attackCooldownMs;
  }

  grantInvulnerability(now: number): void {
    this.invulnerableUntil = now + PLAYER.invulnerableMs;
  }

  drive(input: InputState, delta: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    const vector = new Phaser.Math.Vector2(input.x, input.y);
    if (vector.lengthSq() > 0) {
      vector.normalize();
      this.facing.set(vector.x, vector.y);
      body.setVelocity(vector.x * PLAYER.speed, vector.y * PLAYER.speed);
      this.setFlipX(vector.x < -0.2 ? true : vector.x > 0.2 ? false : this.flipX);
      this.walkTimer += delta;
      if (this.walkTimer > 130) {
        this.walkTimer = 0;
        this.walkFrame = !this.walkFrame;
        this.setTexture(this.walkFrame ? 'player-walk' : 'player-idle');
      }
    } else {
      body.setVelocity(0, 0);
      this.walkTimer = 0;
      if (this.texture.key !== 'player-idle') this.setTexture('player-idle');
    }

    // Blink while invulnerable so damage always reads.
    this.setAlpha(this.isInvulnerable ? (Math.floor(this.scene.time.now / 90) % 2 ? 0.35 : 1) : 1);
  }
}
