import type { GameDefinition, QuestDefinition } from '../../markdown/types.ts';
import { roomEnemyCount } from '../../markdown/types.ts';
import type { GameState } from './GameState.ts';

export type QuestEvent =
  | { kind: 'item'; item: string }
  | { kind: 'enemies'; room: string }
  | { kind: 'boss'; boss: string }
  | { kind: 'room'; room: string };

/**
 * Matches gameplay events against the triggers the parser inferred.
 * Returns the quests that *just* completed so the UI can celebrate them once.
 */
export class QuestSystem {
  constructor(
    private game: GameDefinition,
    private readonly state: GameState,
  ) {}

  setDefinition(game: GameDefinition): void {
    this.game = game;
  }

  private allQuests(): QuestDefinition[] {
    return this.game.rooms.flatMap((room) => room.quests);
  }

  isComplete(quest: QuestDefinition): boolean {
    return quest.done || this.state.completedQuests.has(quest.id);
  }

  /** Evaluate one event and return newly completed quests. */
  report(event: QuestEvent): QuestDefinition[] {
    const completed: QuestDefinition[] = [];
    for (const quest of this.allQuests()) {
      if (this.isComplete(quest)) continue;
      if (!matches(quest, event)) continue;
      this.state.completedQuests.add(quest.id);
      completed.push(quest);
    }
    return completed;
  }

  /**
   * Re-check every quest against current state. Used after a live edit, where
   * events may have happened before the quest existed.
   */
  reconcile(): QuestDefinition[] {
    const completed: QuestDefinition[] = [];
    for (const room of this.game.rooms) {
      for (const quest of room.quests) {
        if (this.isComplete(quest)) continue;
        if (!this.satisfiedByState(quest)) continue;
        this.state.completedQuests.add(quest.id);
        completed.push(quest);
      }
    }
    return completed;
  }

  private satisfiedByState(quest: QuestDefinition): boolean {
    const trigger = quest.trigger;
    switch (trigger.kind) {
      case 'item': {
        if (this.state.keys.has(trigger.item)) return true;
        // Any collected item whose name matches also satisfies the quest.
        for (const room of this.game.rooms) {
          for (const item of room.items) {
            if (item.name.toLowerCase() === trigger.item && this.state.collectedItems.has(item.id)) {
              return true;
            }
          }
        }
        return false;
      }
      case 'boss':
        return this.state.defeatedBosses.has(trigger.boss);
      case 'room':
        return this.state.visitedRooms.has(trigger.room);
      case 'enemies': {
        const room = this.game.rooms.find((entry) => entry.id === trigger.room);
        if (!room) return false;
        const total = roomEnemyCount(room);
        if (total === 0) return false;
        let dead = 0;
        for (const id of this.state.defeatedEnemies) {
          if (id.startsWith(`${room.id}:enemy:`)) dead++;
        }
        return dead >= total;
      }
      case 'manual':
      default:
        return false;
    }
  }
}

function matches(quest: QuestDefinition, event: QuestEvent): boolean {
  const trigger = quest.trigger;
  if (trigger.kind !== event.kind) return false;
  switch (trigger.kind) {
    case 'item':
      return event.kind === 'item' && trigger.item === event.item;
    case 'enemies':
      return event.kind === 'enemies' && trigger.room === event.room;
    case 'boss':
      return event.kind === 'boss' && trigger.boss === event.boss;
    case 'room':
      return event.kind === 'room' && trigger.room === event.room;
    default:
      return false;
  }
}
