import { beforeEach, describe, expect, it } from 'vitest';
import { classifyItem, getItemSpec } from '../../markdown/items.ts';
import type { ItemDefinition } from '../../markdown/types.ts';
import { PLAYER } from '../config.ts';
import { allWeapons, compareWeapons, getWeapon, UNARMED } from '../items/weapons.ts';
import { aimDirection, inMeleeArc, knockbackVelocity, wrapAngle } from './CombatSystem.ts';
import { GameState } from './GameState.ts';

/** Build the item definition the parser would produce for this name. */
function item(name: string): ItemDefinition {
  const spec = classifyItem(name);
  return { id: `test:item:${name}`, name, specId: spec.id, category: spec.category };
}

describe('item registry', () => {
  it('classifies each category', () => {
    expect(classifyItem('Debugger').category).toBe('weapon');
    expect(classifyItem('Firewall Vest').category).toBe('armor');
    expect(classifyItem('Health Potion').category).toBe('consumable');
    expect(classifyItem('Git Key').category).toBe('key');
    expect(classifyItem('sudo').category).toBe('special');
    expect(classifyItem('Gold').category).toBe('currency');
    expect(classifyItem('Ancient Spreadsheet').category).toBe('generic');
  });

  it('is case-insensitive', () => {
    expect(classifyItem('REFACTOR BLADE').id).toBe('refactor-blade');
    expect(classifyItem('  merge axe ').id).toBe('merge-axe');
  });

  it('marks weapons and armour as needing an explicit equip', () => {
    expect(classifyItem('Merge Axe').interact).toBe(true);
    expect(classifyItem('Kernel Plate').interact).toBe(true);
    expect(classifyItem('Health Potion').interact).toBeUndefined();
  });

  it('falls back heuristically for unknown names', () => {
    expect(classifyItem('Rusty Blade').category).toBe('weapon');
    expect(classifyItem('Server Key').category).toBe('key');
    expect(classifyItem('Strange Tonic').category).toBe('consumable');
  });
});

describe('weapon registry', () => {
  it('uses the Debugger as the 1.00x baseline', () => {
    const debugger_ = getWeapon('debugger');
    expect(debugger_.damage).toBe(1);
    expect(debugger_.cooldown).toBe(1);
    expect(debugger_.range).toBe(1);
  });

  it('orders the campaign weapons by damage', () => {
    const order = [
      'debugger',
      'refactor-blade',
      'stack-trace-spear',
      'dependency-hammer',
      'merge-axe',
      'root-access',
    ].map((id) => getWeapon(id).damage);
    for (let index = 1; index < order.length; index++) {
      expect(order[index]!).toBeGreaterThan(order[index - 1]!);
    }
  });

  it('gives the spear reach and the hammer weight', () => {
    expect(getWeapon('stack-trace-spear').range).toBeGreaterThan(getWeapon('debugger').range * 1.5);
    expect(getWeapon('stack-trace-spear').arc).toBeLessThan(getWeapon('debugger').arc);
    expect(getWeapon('dependency-hammer').knockback).toBeGreaterThan(2);
    expect(getWeapon('dependency-hammer').cooldown).toBeGreaterThan(1.3);
  });

  it('never produces a non-positive cooldown', () => {
    const state = new GameState();
    for (const weapon of [...allWeapons(), UNARMED]) {
      state.equipWeapon(weapon.id);
      state.hasRubberDuck = true;
      expect(state.attackCooldownMs()).toBeGreaterThanOrEqual(PLAYER.minAttackCooldownMs);
      expect(Number.isFinite(state.attackCooldownMs())).toBe(true);
      expect(Number.isFinite(state.attackDamage())).toBe(true);
      expect(state.attackDamage()).toBeGreaterThan(0);
    }
  });

  it('handles an unknown weapon id without breaking combat', () => {
    const state = new GameState();
    state.equipWeapon('not-a-real-weapon');
    expect(state.attackDamage()).toBeGreaterThan(0);
    expect(state.attackCooldownMs()).toBeGreaterThan(0);
  });

  it('compares weapons for the equip card', () => {
    const comparison = compareWeapons(getWeapon('merge-axe'), getWeapon('debugger'));
    expect(comparison.damage).toBe('much-better');
    expect(comparison.speed).toBe('worse');
  });
});

describe('melee geometry', () => {
  const origin = { x: 0, y: 0 };
  const facing = { x: 1, y: 0 };

  it('respects range', () => {
    expect(inMeleeArc(origin, facing, { x: 50, y: 0 }, 58, 110)).toBe(true);
    expect(inMeleeArc(origin, facing, { x: 80, y: 0 }, 58, 110)).toBe(false);
    // The spear's longer reach makes the same target hittable.
    expect(inMeleeArc(origin, facing, { x: 80, y: 0 }, 58 * 1.65, 110)).toBe(true);
  });

  it('respects arc width', () => {
    const target = { x: 30, y: 30 };
    expect(inMeleeArc(origin, facing, target, 58, 110)).toBe(true);
    // A narrow spear thrust misses the same off-axis target.
    expect(inMeleeArc(origin, facing, target, 58, 110 * 0.62)).toBe(false);
  });

  it('never hits behind the player', () => {
    expect(inMeleeArc(origin, facing, { x: -40, y: 0 }, 58, 110)).toBe(false);
  });

  it('wraps angles into a single turn', () => {
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI * 3)).toBeCloseTo(Math.PI);
  });

  it('pushes knockback directly away from the source', () => {
    const push = knockbackVelocity({ x: 0, y: 0 }, { x: 10, y: 0 }, 100);
    expect(push.x).toBeCloseTo(100);
    expect(push.y).toBeCloseTo(0);
  });
});

describe('armor and damage', () => {
  let state: GameState;
  beforeEach(() => {
    state = new GameState();
  });

  it('starts with no armour', () => {
    expect(state.armor).toBe(0);
    expect(state.maxArmor).toBe(0);
  });

  it('equipping armour fills it to capacity', () => {
    state.equipArmor('firewall-vest');
    expect(state.maxArmor).toBe(2);
    expect(state.armor).toBe(2);
  });

  it('absorbs damage before health', () => {
    state.equipArmor('kernel-plate');
    const result = state.applyDamage(1);
    expect(result.armorLost).toBe(1);
    expect(result.healthLost).toBe(0);
    expect(state.armor).toBe(2);
    expect(state.health).toBe(PLAYER.maxHealth);
  });

  it('overflows into health when armour runs out', () => {
    state.equipArmor('cache-jacket');
    expect(state.maxArmor).toBe(1);
    const result = state.applyDamage(2);
    expect(result.armorLost).toBe(1);
    expect(result.healthLost).toBe(1);
    expect(state.armor).toBe(0);
    expect(state.health).toBe(PLAYER.maxHealth - 1);
  });

  it('reduces health directly once armour is gone', () => {
    state.applyDamage(2);
    expect(state.health).toBe(PLAYER.maxHealth - 2);
  });

  it('reports death when health reaches zero', () => {
    const result = state.applyDamage(99);
    expect(result.died).toBe(true);
    expect(state.health).toBe(0);
  });

  it('ignores zero and negative damage', () => {
    const result = state.applyDamage(0);
    expect(result).toMatchObject({ armorLost: 0, healthLost: 0, died: false });
    expect(state.health).toBe(PLAYER.maxHealth);
  });

  it('upgrading armour refills to the new capacity', () => {
    state.equipArmor('cache-jacket');
    state.applyDamage(1);
    expect(state.armor).toBe(0);
    state.equipArmor('kernel-plate');
    expect(state.armor).toBe(3);
  });
});

describe('consumables', () => {
  let state: GameState;
  beforeEach(() => {
    state = new GameState();
  });

  it('heals but never exceeds max health', () => {
    state.applyDamage(2);
    expect(state.health).toBe(3);
    state.collect(item('Health Potion'), 0);
    expect(state.health).toBe(PLAYER.maxHealth);
  });

  it('restores the documented amounts', () => {
    expect(getItemSpec('coffee-potion').heal).toBe(2);
    expect(getItemSpec('health-potion').heal).toBe(3);
    expect(getItemSpec('energy-drink').heal).toBe(1);
  });

  it('leaves a potion on the floor when health is full', () => {
    const result = state.collect(item('Health Potion'), 0);
    expect(result.consumed).toBe(false);
    expect(result.message).toBe('Health full');
  });

  it('Energy Drink also grants temporary haste', () => {
    state.applyDamage(1);
    const result = state.collect(item('Energy Drink'), 1000);
    expect(result.consumed).toBe(true);
    expect(state.isHasted(1500)).toBe(true);
    expect(state.isHasted(9000)).toBe(false);
    expect(state.moveSpeed(1500)).toBeGreaterThan(state.moveSpeed(9000));
  });

  it('Patch Kit repairs armour up to capacity', () => {
    state.equipArmor('kernel-plate');
    state.applyDamage(3);
    expect(state.armor).toBe(0);
    state.collect(item('Patch Kit'), 0);
    expect(state.armor).toBe(2);
    state.collect(item('Patch Kit'), 0);
    expect(state.armor).toBe(3);
  });

  it('Patch Kit is not wasted with no armour or full armour', () => {
    expect(state.collect(item('Patch Kit'), 0).consumed).toBe(false);
    state.equipArmor('cache-jacket');
    expect(state.collect(item('Patch Kit'), 0).consumed).toBe(false);
  });

  it('Heart Upgrade raises max health permanently', () => {
    state.collect(item('Heart Upgrade'), 0);
    expect(state.maxHealth).toBe(PLAYER.maxHealth + 1);
    expect(state.health).toBe(PLAYER.maxHealth + 1);
    state.collect(item('Heart Upgrade'), 0);
    expect(state.maxHealth).toBe(PLAYER.maxHealth + 2);
  });

  it('Full Restore refills health and armour', () => {
    state.equipArmor('kernel-plate');
    state.applyDamage(4);
    const result = state.collect(item('Full Restore'), 0);
    expect(result.consumed).toBe(true);
    expect(state.health).toBe(state.maxHealth);
    expect(state.armor).toBe(state.maxArmor);
  });

  it('Full Restore is left alone when it would do nothing', () => {
    expect(state.collect(item('Full Restore'), 0).consumed).toBe(false);
  });

  it('gold accumulates', () => {
    state.collect(item('Gold'), 0);
    state.collect(item('Gold'), 0);
    expect(state.gold).toBe(20);
  });

  it('keys are remembered case-insensitively', () => {
    state.collect(item('Git Key'), 0);
    expect(state.hasKey('Git Key')).toBe(true);
    expect(state.hasKey('git key')).toBe(true);
    expect(state.hasKey('Silver Key')).toBe(false);
  });
});

describe('special items', () => {
  let state: GameState;
  beforeEach(() => {
    state = new GameState();
  });

  it('Rubber Duck speeds up attacks once and does not stack', () => {
    const base = state.attackCooldownMs();
    state.collect(item('Rubber Duck'), 0);
    const boosted = state.attackCooldownMs();
    expect(boosted).toBeLessThan(base);
    const second = state.collect(item('Rubber Duck'), 0);
    expect(second.consumed).toBe(false);
    expect(state.attackCooldownMs()).toBe(boosted);
  });

  it('Stack Overflow Scroll empowers exactly one strike', () => {
    state.equipWeapon('debugger');
    const normal = state.attackDamage();
    state.collect(item('Stack Overflow Scroll'), 0);
    expect(state.overchargeCharges).toBe(1);
    expect(state.consumeOvercharge()).toBe(true);
    expect(state.attackDamage({ overcharged: true })).toBeCloseTo(
      normal * PLAYER.overchargeMultiplier,
      0,
    );
    expect(state.overchargeCharges).toBe(0);
    expect(state.consumeOvercharge()).toBe(false);
    expect(state.attackDamage()).toBe(normal);
  });

  it('Hotfix prevents exactly one death', () => {
    state.collect(item('Hotfix'), 0);
    const fatal = state.applyDamage(99);
    expect(fatal.died).toBe(false);
    expect(fatal.revived).toBe(true);
    expect(state.health).toBe(PLAYER.hotfixHeal);
    expect(state.hotfixCharges).toBe(0);
    expect(state.applyDamage(99).died).toBe(true);
  });

  it('Hotfix does not stack', () => {
    state.collect(item('Hotfix'), 0);
    expect(state.collect(item('Hotfix'), 0).consumed).toBe(false);
    expect(state.hotfixCharges).toBe(1);
  });

  it('Commit Shield blocks one whole hit before armour', () => {
    state.equipArmor('cache-jacket');
    state.collect(item('Commit Shield'), 0);
    const blocked = state.applyDamage(3);
    expect(blocked.blocked).toBe(true);
    expect(state.armor).toBe(1);
    expect(state.health).toBe(PLAYER.maxHealth);
    // The next hit lands normally.
    expect(state.applyDamage(1).armorLost).toBe(1);
  });

  it('sudo boosts damage and armour capacity once', () => {
    state.equipWeapon('debugger');
    state.equipArmor('root-armor');
    const before = state.attackDamage();
    expect(state.maxArmor).toBe(5);
    state.collect(item('sudo'), 0);
    expect(state.attackDamage()).toBeGreaterThan(before);
    expect(state.maxArmor).toBe(6);
    const second = state.collect(item('sudo'), 0);
    expect(second.consumed).toBe(false);
    expect(state.maxArmor).toBe(6);
  });

  it('sudo applies to armour equipped afterwards', () => {
    state.collect(item('sudo'), 0);
    state.equipArmor('cache-jacket');
    expect(state.maxArmor).toBe(2);
  });

  it('an unknown item is a plain collectible', () => {
    const result = state.collect(item('Ancient Spreadsheet'), 0);
    expect(result.consumed).toBe(true);
    expect(state.gold).toBe(0);
    expect(state.maxHealth).toBe(PLAYER.maxHealth);
  });
});

describe('state lifecycle', () => {
  it('reset clears every run-scoped upgrade', () => {
    const state = new GameState();
    state.collect(item('Heart Upgrade'), 0);
    state.collect(item('sudo'), 0);
    state.collect(item('Hotfix'), 0);
    state.collect(item('Gold'), 0);
    state.equipWeapon('merge-axe');
    state.equipArmor('kernel-plate');

    state.reset();

    expect(state.maxHealth).toBe(PLAYER.maxHealth);
    expect(state.health).toBe(PLAYER.maxHealth);
    expect(state.maxArmor).toBe(0);
    expect(state.armorId).toBeNull();
    expect(state.weaponId).toBe(UNARMED.id);
    expect(state.gold).toBe(0);
    expect(state.hasSudo).toBe(false);
    expect(state.hotfixCharges).toBe(0);
  });

  it('collected items are remembered so they cannot be taken twice', () => {
    const state = new GameState();
    const upgrade = item('Heart Upgrade');
    state.collect(upgrade, 0);
    state.collectedItems.add(upgrade.id);
    expect(state.collectedItems.has(upgrade.id)).toBe(true);
    expect(state.maxHealth).toBe(PLAYER.maxHealth + 1);
  });

  it('exposes active passives for the HUD', () => {
    const state = new GameState();
    expect(state.passives()).toEqual([]);
    state.collect(item('Rubber Duck'), 0);
    state.collect(item('Commit Shield'), 0);
    expect(state.passives().map((passive) => passive.id)).toEqual(['duck', 'shield']);
  });
});

describe('mouse aim', () => {
  const player = { x: 400, y: 300 };
  const fallback = { x: 1, y: 0 };

  it('points right when the pointer is right of the player', () => {
    const aim = aimDirection(player, { x: 600, y: 300 }, fallback);
    expect(aim.x).toBeCloseTo(1);
    expect(aim.y).toBeCloseTo(0);
  });

  it('points left when the pointer is left of the player', () => {
    const aim = aimDirection(player, { x: 200, y: 300 }, fallback);
    expect(aim.x).toBeCloseTo(-1);
    expect(aim.y).toBeCloseTo(0);
  });

  it('points up when the pointer is above the player', () => {
    const aim = aimDirection(player, { x: 400, y: 100 }, fallback);
    expect(aim.x).toBeCloseTo(0);
    expect(aim.y).toBeCloseTo(-1);
  });

  it('points down when the pointer is below the player', () => {
    const aim = aimDirection(player, { x: 400, y: 500 }, fallback);
    expect(aim.y).toBeCloseTo(1);
  });

  it('returns a normalised diagonal', () => {
    const aim = aimDirection(player, { x: 500, y: 400 }, fallback);
    expect(aim.x).toBeCloseTo(Math.SQRT1_2);
    expect(aim.y).toBeCloseTo(Math.SQRT1_2);
    expect(Math.hypot(aim.x, aim.y)).toBeCloseTo(1);
  });

  it('always returns a unit vector', () => {
    for (const target of [
      { x: 401, y: 1000 },
      { x: -900, y: 305 },
      { x: 400.5, y: 296 },
      { x: 12345, y: -6789 },
    ]) {
      expect(Math.hypot(...Object.values(aimDirection(player, target, fallback)))).toBeCloseTo(1);
    }
  });

  it('keeps the previous aim when the pointer sits on the player', () => {
    const previous = { x: 0, y: -1 };
    const aim = aimDirection(player, { x: 400, y: 300 }, previous);
    expect(aim).toEqual(previous);
    const almost = aimDirection(player, { x: 401, y: 300 }, previous);
    expect(almost).toEqual(previous);
  });

  it('never emits a zero or non-finite direction', () => {
    expect(aimDirection(player, { x: 400, y: 300 }, { x: 0, y: 0 })).toEqual({ x: 1, y: 0 });
    expect(aimDirection(player, { x: Number.NaN, y: 300 }, fallback)).toEqual(fallback);
    const aim = aimDirection(player, { x: Number.POSITIVE_INFINITY, y: 300 }, fallback);
    expect(Number.isFinite(aim.x) && Number.isFinite(aim.y)).toBe(true);
  });

  it('is derived from position only, so movement cannot change it', () => {
    // The same pointer, with the player walking left underneath it: the aim
    // keeps pointing right and simply re-resolves as the gap widens.
    const pointer = { x: 600, y: 300 };
    const walkingLeft = [400, 380, 360, 340].map((x) =>
      aimDirection({ x, y: 300 }, pointer, fallback),
    );
    for (const aim of walkingLeft) {
      expect(aim.x).toBeCloseTo(1);
      expect(aim.y).toBeCloseTo(0);
    }
  });

  it('flips to the other side once the player walks past the pointer', () => {
    expect(aimDirection({ x: 590, y: 300 }, { x: 600, y: 300 }, fallback).x).toBeCloseTo(1);
    expect(aimDirection({ x: 610, y: 300 }, { x: 600, y: 300 }, fallback).x).toBeCloseTo(-1);
  });
});
