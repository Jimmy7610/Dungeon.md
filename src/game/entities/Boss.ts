import Phaser from 'phaser';
import type { BossDefinition } from '../../markdown/types.ts';
import { BOSS, COLORS } from '../config.ts';

const GLYPHS = ['{', '}', '</>', ';', 'null', '=>', '404', 'any'];

export type BossAction = 'charge' | 'volley' | 'enrage';

/**
 * The final encounter. Same "chase the player" core as a regular enemy, plus a
 * telegraphed charge, a projectile volley and a one-off enrage that calls for
 * help. Actions are announced through `onAction` so the scene owns the effects.
 */
export class Boss extends Phaser.Physics.Arcade.Sprite {
  readonly definition: BossDefinition;
  maxHealth: number;
  health: number;
  nextContactAt = 0;
  private nextChargeAt = 0;
  private nextVolleyAt = 0;
  private chargingUntil = 0;
  private telegraphUntil = 0;
  private enraged = false;
  private readonly glyphs: Phaser.GameObjects.Text[] = [];
  private readonly reducedMotion: boolean;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    definition: BossDefinition,
    reducedMotion: boolean,
    private readonly onAction: (action: BossAction) => void,
  ) {
    super(scene, x, y, `boss-${definition.type}`);
    this.definition = definition;
    this.maxHealth = definition.health;
    this.health = definition.health;
    this.reducedMotion = reducedMotion;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setScale(BOSS.scale);
    this.setDepth(18);
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    body?.setSize(this.width * 0.72, this.height * 0.7);
    body?.setOffset(this.width * 0.14, this.height * 0.16);
    body?.setCollideWorldBounds(true);
    body?.setBounce(0.4);

    const now = scene.time.now;
    this.nextChargeAt = now + BOSS.chargeIntervalMs;
    this.nextVolleyAt = now + BOSS.volleyIntervalMs * 0.6;

    if (!reducedMotion) {
      for (let index = 0; index < GLYPHS.length; index++) {
        const glyph = scene.add
          .text(x, y, GLYPHS[index] ?? '{', {
            fontFamily: 'ui-monospace, monospace',
            fontSize: '15px',
            color: '#8dffb0',
          })
          .setOrigin(0.5)
          .setDepth(17)
          .setAlpha(0.75);
        this.glyphs.push(glyph);
      }
    }
  }

  get isCharging(): boolean {
    return this.scene.time.now < this.chargingUntil;
  }

  takeDamage(amount: number): boolean {
    this.health -= amount;
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(80, () => {
      if (this.active) this.clearTint();
    });
    if (!this.enraged && this.health <= this.maxHealth * BOSS.enrageAt && this.health > 0) {
      this.enraged = true;
      this.onAction('enrage');
    }
    return this.health <= 0;
  }

  think(time: number, targetX: number, targetY: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    const angle = Math.atan2(targetY - this.y, targetX - this.x);

    if (time < this.telegraphUntil) {
      // Wind-up: stand still and flash so the charge can be dodged.
      body.setVelocity(0, 0);
      this.setTint(Math.floor(time / 80) % 2 ? COLORS.danger : 0xffffff);
    } else if (this.isCharging) {
      this.clearTint();
    } else {
      this.clearTint();
      const speed = this.enraged ? BOSS.speed * 1.35 : BOSS.speed;
      body.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

      if (time >= this.nextChargeAt) {
        this.nextChargeAt = time + BOSS.chargeIntervalMs;
        this.telegraphUntil = time + BOSS.chargeTelegraphMs;
        this.scene.time.delayedCall(BOSS.chargeTelegraphMs, () => {
          if (!this.active) return;
          const chargeAngle = Math.atan2(targetY - this.y, targetX - this.x);
          this.chargingUntil = this.scene.time.now + 520;
          (this.body as Phaser.Physics.Arcade.Body | null)?.setVelocity(
            Math.cos(chargeAngle) * BOSS.chargeSpeed,
            Math.sin(chargeAngle) * BOSS.chargeSpeed,
          );
          this.onAction('charge');
        });
      } else if (time >= this.nextVolleyAt) {
        this.nextVolleyAt = time + BOSS.volleyIntervalMs;
        this.onAction('volley');
      }
    }

    this.setFlipX(targetX < this.x);
    this.updateGlyphs(time);
  }

  private updateGlyphs(time: number): void {
    if (this.reducedMotion) return;
    const radius = 82 + Math.sin(time / 600) * 9;
    for (let index = 0; index < this.glyphs.length; index++) {
      const glyph = this.glyphs[index];
      if (!glyph) continue;
      const orbit = time / 900 + (index / this.glyphs.length) * Math.PI * 2;
      glyph.setPosition(this.x + Math.cos(orbit) * radius, this.y + Math.sin(orbit) * radius * 0.6);
      glyph.setAlpha(0.35 + 0.4 * (0.5 + 0.5 * Math.sin(orbit)));
    }
  }

  override destroy(fromScene?: boolean): void {
    for (const glyph of this.glyphs) glyph.destroy();
    this.glyphs.length = 0;
    super.destroy(fromScene);
  }
}
