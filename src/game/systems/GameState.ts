import type { GameDefinition, ItemDefinition } from '../../markdown/types.ts';
import { PLAYER } from '../config.ts';

export interface QuestView {
  id: string;
  text: string;
  done: boolean;
  room: string;
}

export interface HudSnapshot {
  dungeonTitle: string;
  roomTitle: string;
  health: number;
  maxHealth: number;
  keys: string[];
  gold: number;
  trinkets: string[];
  weapon: string;
  quests: QuestView[];
  boosted: boolean;
}

export interface PickupResult {
  message: string;
  kind: 'key' | 'heal' | 'weapon' | 'gold' | 'trinket';
}

/**
 * Everything that survives a room transition. Owned by the runtime; the scene
 * reads and mutates it through methods rather than poking at fields.
 */
export class GameState {
  currentRoom = '';
  health: number = PLAYER.maxHealth;
  maxHealth: number = PLAYER.maxHealth;
  gold = 0;
  weaponTier = 0;
  weaponName = 'Bare Hands';
  boostUntil = 0;
  won = false;

  readonly keys = new Set<string>();
  readonly trinkets = new Set<string>();
  readonly collectedItems = new Set<string>();
  readonly completedQuests = new Set<string>();
  readonly defeatedEnemies = new Set<string>();
  readonly defeatedBosses = new Set<string>();
  readonly visitedRooms = new Set<string>();

  reset(): void {
    this.health = this.maxHealth;
    this.gold = 0;
    this.weaponTier = 0;
    this.weaponName = 'Bare Hands';
    this.boostUntil = 0;
    this.won = false;
    this.keys.clear();
    this.trinkets.clear();
    this.collectedItems.clear();
    this.completedQuests.clear();
    this.defeatedEnemies.clear();
    this.defeatedBosses.clear();
    this.visitedRooms.clear();
  }

  hasKey(itemName: string): boolean {
    return this.keys.has(itemName.trim().toLowerCase());
  }

  isBoosted(now: number): boolean {
    return now < this.boostUntil;
  }

  /** Apply an item's effect. Returns what to show in the pickup toast. */
  collect(item: ItemDefinition, now: number): PickupResult {
    this.collectedItems.add(item.id);
    switch (item.kind) {
      case 'key':
        this.keys.add(item.name.toLowerCase());
        return { message: `+ ${item.name}`, kind: 'key' };
      case 'heal': {
        const before = this.health;
        this.health = Math.min(this.maxHealth, this.health + Math.max(1, item.power));
        const gained = this.health - before;
        return {
          message: gained > 0 ? `+ ${gained} HP` : `${item.name} (already full)`,
          kind: 'heal',
        };
      }
      case 'weapon': {
        if (item.power > this.weaponTier) {
          this.weaponTier = Math.min(PLAYER.weaponDamage.length - 1, item.power);
          this.weaponName = item.name;
          return { message: `${item.name} equipped`, kind: 'weapon' };
        }
        return { message: `+ ${item.name}`, kind: 'weapon' };
      }
      case 'gold':
        this.gold += Math.max(1, item.power);
        return { message: `+ ${Math.max(1, item.power)} Gold`, kind: 'gold' };
      case 'trinket':
      default: {
        this.trinkets.add(item.name);
        if (item.power > 0) {
          this.boostUntil = now + PLAYER.scrollDurationMs;
          return { message: `${item.name}: damage up!`, kind: 'trinket' };
        }
        return { message: `+ ${item.name}`, kind: 'trinket' };
      }
    }
  }

  snapshot(game: GameDefinition, roomTitle: string, now: number): HudSnapshot {
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
    return {
      dungeonTitle: game.title,
      roomTitle,
      health: this.health,
      maxHealth: this.maxHealth,
      keys: [...this.keys],
      gold: this.gold,
      trinkets: [...this.trinkets],
      weapon: this.weaponName,
      quests,
      boosted: this.isBoosted(now),
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

    for (const id of [...this.completedQuests]) if (!questIds.has(id)) this.completedQuests.delete(id);
    for (const id of [...this.defeatedBosses]) if (!bossIds.has(id)) this.defeatedBosses.delete(id);
    for (const id of [...this.visitedRooms]) if (!roomIds.has(id)) this.visitedRooms.delete(id);
    for (const id of [...this.collectedItems]) if (!itemIds.has(id)) this.collectedItems.delete(id);
    for (const id of [...this.defeatedEnemies]) {
      const roomId = id.split(':')[0] ?? '';
      if (!roomIds.has(roomId)) this.defeatedEnemies.delete(id);
    }
  }
}
