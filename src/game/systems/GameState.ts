import { getItemSpec, type ItemSpec } from '../../markdown/items.ts';
import type { GameDefinition, ItemDefinition } from '../../markdown/types.ts';
import { PLAYER } from '../config.ts';
import { getWeapon, UNARMED, type WeaponProfile } from '../items/weapons.ts';

export interface QuestView {
  id: string;
  text: string;
  done: boolean;
  room: string;
}

export interface PassiveView {
  id: string;
  label: string;
  detail: string;
}

export interface HudSnapshot {
  dungeonTitle: string;
  roomTitle: string;
  health: number;
  maxHealth: number;
  armor: number;
  maxArmor: number;
  armorName: string;
  weapon: string;
  weaponBlurb: string;
  keys: string[];
  gold: number;
  quests: QuestView[];
  passives: PassiveView[];
}

export interface PickupResult {
  /** False leaves the item on the floor - nothing was wasted. */
  consumed: boolean;
  message: string;
  tone: 'good' | 'neutral' | 'warn';
}

export interface DamageResult {
  /** The whole hit was cancelled by a Commit Shield. */
  blocked: boolean;
  armorLost: number;
  healthLost: number;
  /** A Hotfix spent itself to prevent death. */
  revived: boolean;
  died: boolean;
}

/**
 * Everything that survives a room transition.
 *
 * Deliberately free of Phaser so the damage pipeline, equipment rules and
 * pickup rules can be unit-tested directly.
 */
export class GameState {
  currentRoom = '';
  health: number = PLAYER.maxHealth;
  maxHealth: number = PLAYER.maxHealth;
  armor = 0;
  maxArmor = 0;
  armorId: string | null = null;
  weaponId: string = UNARMED.id;
  gold = 0;
  won = false;

  /** Permanent-for-this-run passives. Each applies once, no stacking. */
  hasRubberDuck = false;
  hasSudo = false;
  hotfixCharges = 0;
  shieldCharges = 0;
  overchargeCharges = 0;

  hasteUntil = 0;

  readonly keys = new Set<string>();
  readonly collectedItems = new Set<string>();
  readonly completedQuests = new Set<string>();
  readonly defeatedEnemies = new Set<string>();
  readonly defeatedBosses = new Set<string>();
  readonly visitedRooms = new Set<string>();

  reset(): void {
    this.health = PLAYER.maxHealth;
    this.maxHealth = PLAYER.maxHealth;
    this.armor = 0;
    this.maxArmor = 0;
    this.armorId = null;
    this.weaponId = UNARMED.id;
    this.gold = 0;
    this.won = false;
    this.hasRubberDuck = false;
    this.hasSudo = false;
    this.hotfixCharges = 0;
    this.shieldCharges = 0;
    this.overchargeCharges = 0;
    this.hasteUntil = 0;
    this.keys.clear();
    this.collectedItems.clear();
    this.completedQuests.clear();
    this.defeatedEnemies.clear();
    this.defeatedBosses.clear();
    this.visitedRooms.clear();
  }

  /* ------------------------------------------------------------- equipment */

  get weapon(): WeaponProfile {
    return getWeapon(this.weaponId);
  }

  get armorSpec(): ItemSpec | null {
    return this.armorId ? getItemSpec(this.armorId) : null;
  }

  /** sudo widens armour capacity by one on top of whatever is worn. */
  private armorCapacity(spec: ItemSpec | null): number {
    const base = spec?.armor ?? 0;
    if (base === 0) return 0;
    return base + (this.hasSudo ? PLAYER.sudoArmorBonus : 0);
  }

  equipWeapon(specId: string): void {
    this.weaponId = specId;
  }

  equipArmor(specId: string): void {
    this.armorId = specId;
    this.maxArmor = this.armorCapacity(getItemSpec(specId));
    // A fresh set of armour arrives intact.
    this.armor = this.maxArmor;
  }

  hasKey(itemName: string): boolean {
    return this.keys.has(itemName.trim().toLowerCase());
  }

  isHasted(now: number): boolean {
    return now < this.hasteUntil;
  }

  /* ---------------------------------------------------------------- combat */

  /**
   * Damage per swing, including weapon and sudo.
   *
   * `overcharged` is passed in rather than read from the charge counter: the
   * caller spends the charge with `consumeOvercharge()` first, so checking the
   * counter here would always see it already spent.
   */
  attackDamage(options: { overcharged?: boolean } = {}): number {
    let damage = PLAYER.baseDamage * this.weapon.damage;
    if (this.hasSudo) damage *= PLAYER.sudoDamageMultiplier;
    if (options.overcharged) damage *= PLAYER.overchargeMultiplier;
    return Math.max(1, Math.round(damage));
  }

  /** Never returns zero or a negative cooldown, whatever the multipliers say. */
  attackCooldownMs(): number {
    let cooldown = PLAYER.attackCooldownMs * this.weapon.cooldown;
    if (this.hasRubberDuck) cooldown *= PLAYER.rubberDuckCooldownMultiplier;
    return Math.max(PLAYER.minAttackCooldownMs, Math.round(cooldown));
  }

  attackRange(): number {
    return PLAYER.attackRange * this.weapon.range;
  }

  attackArcDegrees(): number {
    return Math.min(300, PLAYER.attackArcDegrees * this.weapon.arc);
  }

  knockback(): number {
    return PLAYER.knockback * this.weapon.knockback;
  }

  moveSpeed(now: number): number {
    return this.isHasted(now) ? PLAYER.speed * PLAYER.hasteMultiplier : PLAYER.speed;
  }

  consumeOvercharge(): boolean {
    if (this.overchargeCharges <= 0) return false;
    this.overchargeCharges--;
    return true;
  }

  /**
   * The single path damage takes: shield, then armour, then health, then a
   * Hotfix rather than death. Returns what actually happened so the scene can
   * show the right feedback.
   */
  applyDamage(amount: number): DamageResult {
    const incoming = Math.max(0, Math.floor(amount));
    if (incoming === 0) {
      return { blocked: false, armorLost: 0, healthLost: 0, revived: false, died: false };
    }

    if (this.shieldCharges > 0) {
      this.shieldCharges--;
      return { blocked: true, armorLost: 0, healthLost: 0, revived: false, died: false };
    }

    const armorLost = Math.min(this.armor, incoming);
    this.armor -= armorLost;
    const healthLost = Math.min(this.health, incoming - armorLost);
    this.health -= healthLost;

    if (this.health > 0) {
      return { blocked: false, armorLost, healthLost, revived: false, died: false };
    }

    if (this.hotfixCharges > 0) {
      this.hotfixCharges--;
      this.health = Math.min(this.maxHealth, PLAYER.hotfixHeal);
      return { blocked: false, armorLost, healthLost, revived: true, died: false };
    }

    return { blocked: false, armorLost, healthLost, revived: false, died: true };
  }

  /* --------------------------------------------------------------- pickups */

  /**
   * Apply an item. Items that would be wasted report `consumed: false` and are
   * left on the floor for later.
   */
  collect(item: ItemDefinition, now: number): PickupResult {
    const spec = getItemSpec(item.specId);

    if (spec.category === 'key') {
      this.keys.add(item.name.toLowerCase());
      return { consumed: true, message: `+ ${item.name}`, tone: 'good' };
    }

    if (spec.gold !== undefined) {
      this.gold += spec.gold;
      return { consumed: true, message: `+ ${spec.gold} Gold`, tone: 'neutral' };
    }

    if (spec.fullRestore) {
      if (this.health >= this.maxHealth && this.armor >= this.maxArmor) {
        return { consumed: false, message: 'Already at full strength', tone: 'warn' };
      }
      this.health = this.maxHealth;
      this.armor = this.maxArmor;
      return { consumed: true, message: 'Full Restore', tone: 'good' };
    }

    if (spec.heartUpgrade) {
      this.maxHealth += spec.heartUpgrade;
      this.health = Math.min(this.maxHealth, this.health + spec.heartUpgrade);
      return { consumed: true, message: `Max HP +${spec.heartUpgrade}`, tone: 'good' };
    }

    if (spec.repair !== undefined) {
      if (this.maxArmor === 0) {
        return { consumed: false, message: 'No armor to patch', tone: 'warn' };
      }
      if (this.armor >= this.maxArmor) {
        return { consumed: false, message: 'Armor full', tone: 'warn' };
      }
      const before = this.armor;
      this.armor = Math.min(this.maxArmor, this.armor + spec.repair);
      return { consumed: true, message: `+ ${this.armor - before} Armor`, tone: 'good' };
    }

    if (spec.heal !== undefined) {
      const wouldHeal = this.health < this.maxHealth;
      if (!wouldHeal && !spec.haste) {
        return { consumed: false, message: 'Health full', tone: 'warn' };
      }
      const before = this.health;
      this.health = Math.min(this.maxHealth, this.health + spec.heal);
      if (spec.haste) {
        this.hasteUntil = now + spec.haste.durationMs;
        const gained = this.health - before;
        return {
          consumed: true,
          message: gained > 0 ? `+${gained} HP · Speed up` : 'Speed up',
          tone: 'good',
        };
      }
      return { consumed: true, message: `+ ${this.health - before} HP`, tone: 'good' };
    }

    if (spec.special) return this.applySpecial(spec);

    return { consumed: true, message: `+ ${item.name}`, tone: 'neutral' };
  }

  private applySpecial(spec: ItemSpec): PickupResult {
    switch (spec.special) {
      case 'rubber-duck':
        if (this.hasRubberDuck) {
          return { consumed: false, message: 'The duck already listens', tone: 'warn' };
        }
        this.hasRubberDuck = true;
        return { consumed: true, message: 'Rubber Duck · faster attacks', tone: 'good' };
      case 'sudo':
        if (this.hasSudo) return { consumed: false, message: 'Already root', tone: 'warn' };
        this.hasSudo = true;
        // Widen the armour that is already worn.
        this.maxArmor = this.armorCapacity(this.armorSpec);
        this.armor = Math.min(this.maxArmor, this.armor + PLAYER.sudoArmorBonus);
        return { consumed: true, message: 'sudo · permission granted', tone: 'good' };
      case 'hotfix':
        if (this.hotfixCharges >= 1) {
          return { consumed: false, message: 'Hotfix already staged', tone: 'warn' };
        }
        this.hotfixCharges = 1;
        return { consumed: true, message: 'Hotfix staged', tone: 'good' };
      case 'commit-shield':
        if (this.shieldCharges >= 1) {
          return { consumed: false, message: 'Shield already up', tone: 'warn' };
        }
        this.shieldCharges = 1;
        return { consumed: true, message: 'Commit Shield ready', tone: 'good' };
      case 'stack-overflow':
        if (this.overchargeCharges >= PLAYER.maxOvercharge) {
          return { consumed: false, message: 'Already overcharged', tone: 'warn' };
        }
        this.overchargeCharges++;
        return { consumed: true, message: 'Overcharged strike ready', tone: 'good' };
      default:
        return { consumed: true, message: spec.name, tone: 'neutral' };
    }
  }

  /* ------------------------------------------------------------------ view */

  passives(): PassiveView[] {
    const out: PassiveView[] = [];
    if (this.hasRubberDuck) out.push({ id: 'duck', label: '🦆', detail: 'Rubber Duck' });
    if (this.hasSudo) out.push({ id: 'sudo', label: '#', detail: 'sudo' });
    if (this.hotfixCharges > 0) out.push({ id: 'hotfix', label: '✚', detail: 'Hotfix' });
    if (this.shieldCharges > 0) out.push({ id: 'shield', label: '⛨', detail: 'Commit Shield' });
    if (this.overchargeCharges > 0) {
      out.push({
        id: 'overcharge',
        label: `⚡${this.overchargeCharges > 1 ? this.overchargeCharges : ''}`,
        detail: 'Overcharged strike',
      });
    }
    return out;
  }

  snapshot(game: GameDefinition, roomTitle: string): HudSnapshot {
    const quests: QuestView[] = [];
    for (const room of game.rooms) {
      for (const quest of room.quests) {
        quests.push({
          id: quest.id,
          text: quest.text,
          done: quest.done || this.completedQuests.has(quest.id),
          room: room.title,
        });
      }
    }
    const weapon = this.weapon;
    return {
      dungeonTitle: game.title,
      roomTitle,
      health: this.health,
      maxHealth: this.maxHealth,
      armor: this.armor,
      maxArmor: this.maxArmor,
      armorName: this.armorSpec?.name ?? '',
      weapon: weapon.name,
      weaponBlurb: weapon.blurb,
      keys: [...this.keys],
      gold: this.gold,
      quests,
      passives: this.passives(),
    };
  }

  /**
   * Drop references to rooms/quests/enemies that no longer exist after a live
   * edit, so stale ids cannot keep a quest ticked or an enemy dead.
   */
  pruneTo(game: GameDefinition): void {
    const roomIds = new Set(game.rooms.map((room) => room.id));
    const questIds = new Set(game.rooms.flatMap((room) => room.quests.map((quest) => quest.id)));
    const bossIds = new Set(
      game.rooms.map((room) => room.boss?.id).filter((id): id is string => Boolean(id)),
    );
    const itemIds = new Set(game.rooms.flatMap((room) => room.items.map((item) => item.id)));

    for (const id of [...this.completedQuests]) {
      if (!questIds.has(id)) this.completedQuests.delete(id);
    }
    for (const id of [...this.defeatedBosses]) if (!bossIds.has(id)) this.defeatedBosses.delete(id);
    for (const id of [...this.visitedRooms]) if (!roomIds.has(id)) this.visitedRooms.delete(id);
    for (const id of [...this.collectedItems]) if (!itemIds.has(id)) this.collectedItems.delete(id);
    for (const id of [...this.defeatedEnemies]) {
      const roomId = id.split(':')[0] ?? '';
      if (!roomIds.has(roomId)) this.defeatedEnemies.delete(id);
    }
  }
}
