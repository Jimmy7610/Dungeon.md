import Phaser from 'phaser';
import type { EnemyType } from '../../markdown/types.ts';
import { ENEMY_PROFILES, type EnemyProfile } from '../config.ts';

export interface EnemyOptions {
  bodyId: string;
  type: EnemyType;
  health: number;
  damage: number;
}

/**
 * Shared enemy behaviour: wander, notice the player, chase, bump into them.
 * Rooms are small and open enough that direct chase reads as intelligent
 * without any pathfinding.
 */
export class Enemy extends Phaser.Physics.Arcade.Sprite {
  readonly bodyId: string;
  readonly enemyType: EnemyType;
  readonly damage: number;
  readonly profile: EnemyProfile;
  maxHealth: number;
  health: number;
  nextContactAt = 0;
  private nextWanderAt = 0;
  private wander = new Phaser.Math.Vector2(0, 0);
  private aggro = false;
  private bobPhase = Math.random() * Math.PI * 2;

  constructor(scene: Phaser.Scene, x: number, y: number, options: EnemyOptions) {
    const profile = ENEMY_PROFILES[options.type] ?? ENEMY_PROFILES.generic;
    super(scene, x, y, profile.texture);
    this.profile = profile;
    this.bodyId = options.bodyId;
    this.enemyType = options.type;
    this.damage = options.damage;
    this.maxHealth = options.health;
    this.health = options.health;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setScale(profile.scale);
    this.setDepth(15);
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    body?.setSize(this.width * 0.66, this.height * 0.6);
    body?.setOffset(this.width * 0.17, this.height * 0.34);
    body?.setCollideWorldBounds(true);
    body?.setBounce(0.2);
  }

  /** Returns true when this hit killed the enemy. */
  takeDamage(amount: number): boolean {
    this.health -= amount;
    this.aggro = true;
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(90, () => {
      if (this.active) this.clearTint();
    });
    return this.health <= 0;
  }

  think(time: number, targetX: number, targetY: number, canSee: boolean): void {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;

    const distance = Phaser.Math.Distance.Between(this.x, this.y, targetX, targetY);
    if (canSee && distance <= this.profile.detectRadius) this.aggro = true;

    if (this.aggro && canSee) {
      const angle = Math.atan2(targetY - this.y, targetX - this.x);
      body.setVelocity(
        Math.cos(angle) * this.profile.speed,
        Math.sin(angle) * this.profile.speed,
      );
      this.setFlipX(targetX < this.x);
    } else {
      if (time >= this.nextWanderAt) {
        this.nextWanderAt = time + Phaser.Math.Between(700, 1800);
        const wanderAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const speed = this.profile.speed * 0.4;
        this.wander.set(Math.cos(wanderAngle) * speed, Math.sin(wanderAngle) * speed);
      }
      body.setVelocity(this.wander.x, this.wander.y);
    }

    // A gentle bob keeps idle enemies alive on screen without extra tweens.
    this.setScale(
      this.profile.scale,
      this.profile.scale * (1 + Math.sin(time / 220 + this.bobPhase) * 0.04),
    );
  }
}
