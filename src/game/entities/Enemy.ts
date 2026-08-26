import Phaser from 'phaser';
import type { EnemyType } from '../../markdown/types.ts';
import { ELITE, ENEMY_PROFILES, type EnemyProfile } from '../config.ts';

export interface EnemyOptions {
  bodyId: string;
  type: EnemyType;
  health: number;
  damage: number;
  elite: boolean;
  /** True when the directive gave an explicit `health:`; elite scaling then
   *  respects the author's number instead of multiplying it. */
  healthExplicit: boolean;
  reducedMotion: boolean;
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
  readonly elite: boolean;
  private aura: Phaser.GameObjects.Ellipse | undefined;
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
    this.elite = options.elite;

    // Elites reuse the same AI - only the numbers and the dressing change.
    const health = options.elite && !options.healthExplicit
      ? Math.round(options.health * ELITE.healthMultiplier)
      : options.health;
    this.damage = options.elite ? options.damage + ELITE.damageBonus : options.damage;
    this.maxHealth = health;
    this.health = health;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setScale(this.baseScale);
    this.setDepth(15);
    if (options.elite) this.createAura(scene, options.reducedMotion);
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    body?.setSize(this.width * 0.66, this.height * 0.6);
    body?.setOffset(this.width * 0.17, this.height * 0.34);
    body?.setCollideWorldBounds(true);
    body?.setBounce(0.2);
  }

  /** Elites are physically larger, which also reads at a glance. */
  get baseScale(): number {
    return this.elite ? this.profile.scale * ELITE.scale : this.profile.scale;
  }

  get speed(): number {
    return this.elite ? this.profile.speed * ELITE.speedMultiplier : this.profile.speed;
  }

  /** Elites resist knockback, so heavy weapons still matter against them. */
  get knockbackScale(): number {
    return this.elite ? ELITE.knockbackResistance : 1;
  }

  private createAura(scene: Phaser.Scene, reducedMotion: boolean): void {
    const size = this.displayWidth * 1.5;
    this.aura = scene.add.ellipse(this.x, this.y, size, size * 0.75, 0xff5c4d, 0.16).setDepth(14);
    this.aura.setStrokeStyle(2, 0xff9f1c, 0.75);
    if (!reducedMotion) {
      scene.tweens.add({
        targets: this.aura,
        alpha: { from: 0.1, to: 0.28 },
        scale: { from: 0.92, to: 1.08 },
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
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
      body.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
      this.setFlipX(targetX < this.x);
    } else {
      if (time >= this.nextWanderAt) {
        this.nextWanderAt = time + Phaser.Math.Between(700, 1800);
        const wanderAngle = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const speed = this.speed * 0.4;
        this.wander.set(Math.cos(wanderAngle) * speed, Math.sin(wanderAngle) * speed);
      }
      body.setVelocity(this.wander.x, this.wander.y);
    }

    // A gentle bob keeps idle enemies alive on screen without extra tweens.
    this.setScale(
      this.baseScale,
      this.baseScale * (1 + Math.sin(time / 220 + this.bobPhase) * 0.04),
    );
    this.aura?.setPosition(this.x, this.y);
  }

  override destroy(fromScene?: boolean): void {
    this.aura?.destroy();
    this.aura = undefined;
    super.destroy(fromScene);
  }
}
