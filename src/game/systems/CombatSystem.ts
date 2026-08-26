import Phaser from 'phaser';
import { PLAYER } from '../config.ts';
import type { GameState } from './GameState.ts';

/** Damage the player deals right now, including the temporary scroll boost. */
export function playerAttackDamage(state: GameState, now: number): number {
  const tier = Math.min(PLAYER.weaponDamage.length - 1, Math.max(0, state.weaponTier));
  const base = PLAYER.weaponDamage[tier] ?? PLAYER.weaponDamage[0];
  const multiplier = state.isBoosted(now) ? PLAYER.scrollMultiplier : 1;
  return Math.round(base * multiplier);
}

/**
 * True when `target` sits inside the melee arc: within range and roughly in the
 * direction the player is facing. Keeps combat readable without a hitbox body.
 */
export function inMeleeArc(
  originX: number,
  originY: number,
  facing: Phaser.Math.Vector2,
  targetX: number,
  targetY: number,
  range: number,
  arcDegrees: number,
): boolean {
  const dx = targetX - originX;
  const dy = targetY - originY;
  const distanceSq = dx * dx + dy * dy;
  if (distanceSq > range * range) return false;
  if (distanceSq < 4) return true;
  const targetAngle = Math.atan2(dy, dx);
  const facingAngle = Math.atan2(facing.y, facing.x);
  const delta = Math.abs(Phaser.Math.Angle.Wrap(targetAngle - facingAngle));
  return delta <= Phaser.Math.DegToRad(arcDegrees) / 2;
}

/** Push a body away from a point. Used for hit feedback on both sides. */
export function applyKnockback(
  body: Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | null,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  force: number,
): void {
  if (!body || !('setVelocity' in body)) return;
  const angle = Math.atan2(toY - fromY, toX - fromX);
  body.setVelocity(Math.cos(angle) * force, Math.sin(angle) * force);
}
