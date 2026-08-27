/**
 * Combat maths.
 *
 * Deliberately free of Phaser so hit geometry can be unit-tested: the scene
 * passes in plain numbers and applies the result to bodies itself.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(angle: number): number {
  let wrapped = angle % (Math.PI * 2);
  if (wrapped > Math.PI) wrapped -= Math.PI * 2;
  if (wrapped <= -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

/**
 * True when `target` sits inside the melee arc: within range and roughly in
 * the direction the player faces. Keeps combat readable without a hitbox body,
 * and lets weapon range and arc width actually change what you can reach.
 */
export function inMeleeArc(
  origin: Vec2,
  facing: Vec2,
  target: Vec2,
  range: number,
  arcDegrees: number,
): boolean {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const distanceSq = dx * dx + dy * dy;
  if (distanceSq > range * range) return false;
  if (distanceSq < 4) return true;
  if (arcDegrees >= 360) return true;
  const targetAngle = Math.atan2(dy, dx);
  const facingAngle = Math.atan2(facing.y, facing.x);
  const difference = Math.abs(wrapAngle(targetAngle - facingAngle));
  return difference <= degToRad(arcDegrees) / 2;
}

/** Velocity that pushes `to` directly away from `from`. */
export function knockbackVelocity(from: Vec2, to: Vec2, force: number): Vec2 {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  return { x: Math.cos(angle) * force, y: Math.sin(angle) * force };
}

/**
 * Pointer positions within this many pixels of the player are treated as "no
 * direction" - normalising them would produce a zero vector or NaN.
 */
const MIN_AIM_DISTANCE_SQ = 4;

/**
 * Direction from the player to the aim point, as a unit vector.
 *
 * Deliberately derived from positions only - never from velocity - so movement
 * and aim stay independent: the player can walk left while aiming right.
 * Degenerate input (pointer on top of the player, NaN) keeps the previous valid
 * aim instead of feeding a zero vector into the combat geometry.
 */
export function aimDirection(from: Vec2, to: Vec2, fallback: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSq = dx * dx + dy * dy;
  if (!Number.isFinite(lengthSq) || lengthSq < MIN_AIM_DISTANCE_SQ) {
    return safeFallback(fallback);
  }
  const length = Math.sqrt(lengthSq);
  return { x: dx / length, y: dy / length };
}

/** Never hand back a zero-length or non-finite direction. */
function safeFallback(fallback: Vec2): Vec2 {
  const lengthSq = fallback.x * fallback.x + fallback.y * fallback.y;
  if (!Number.isFinite(lengthSq) || lengthSq < 1e-6) return { x: 1, y: 0 };
  const length = Math.sqrt(lengthSq);
  return { x: fallback.x / length, y: fallback.y / length };
}
