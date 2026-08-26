/**
 * The intermediate representation that sits between Markdown and the game.
 *
 *   Markdown -> parseMarkdown() -> GameDefinition -> GameRuntime -> Phaser
 *
 * Nothing in this file knows that Phaser exists. Keep it that way: the parser
 * is unit-testable in plain Node because of it.
 */

export const ENEMY_TYPES = [
  'bug',
  'skeleton',
  'slime',
  'dependency',
  'null-pointer',
  'generic',
] as const;
export type EnemyType = (typeof ENEMY_TYPES)[number];

export const BOSS_TYPES = ['legacy-code', 'forgotten-king'] as const;
export type BossType = (typeof BOSS_TYPES)[number];

/** How a collected item behaves at runtime. */
export type ItemKind = 'weapon' | 'heal' | 'key' | 'gold' | 'trinket';

export interface ItemDefinition {
  /** Stable per-room id, e.g. `bug-basement:item:0`. */
  id: string;
  name: string;
  kind: ItemKind;
  /** Hearts restored by `heal` items, weapon tier for `weapon` items, else 0. */
  power: number;
}

export type QuestTrigger =
  | { kind: 'item'; item: string }
  | { kind: 'enemies'; room: string }
  | { kind: 'boss'; boss: string }
  | { kind: 'room'; room: string }
  | { kind: 'manual' };

export interface QuestDefinition {
  id: string;
  text: string;
  /** `- [x]` quests start completed. */
  done: boolean;
  trigger: QuestTrigger;
}

export interface NpcDefinition {
  id: string;
  /** Plain-text lines of the blockquote. */
  lines: string[];
}

/** One `enemy` directive: a *group* of identical enemies. */
export interface EnemyDefinition {
  id: string;
  type: EnemyType;
  count: number;
  health: number;
  damage: number;
}

export interface BossDefinition {
  id: string;
  type: BossType;
  name: string;
  health: number;
  damage: number;
}

export interface DoorDefinition {
  id: string;
  label: string;
  /** Room id this door leads to. */
  target: string;
  /** Item name required to pass, if any. */
  requires?: string;
  /** True when `target` matches no room; the runtime shows a broken-door prompt. */
  broken: boolean;
}

export interface RoomDefinition {
  id: string;
  title: string;
  narration: string[];
  items: ItemDefinition[];
  quests: QuestDefinition[];
  npcs: NpcDefinition[];
  enemies: EnemyDefinition[];
  boss?: BossDefinition;
  doors: DoorDefinition[];
}

export type WarningLevel = 'warn' | 'info';

export interface ParseWarning {
  level: WarningLevel;
  message: string;
  /** Room the warning came from, when applicable. */
  room?: string;
}

export interface GameDefinition {
  title: string;
  rooms: RoomDefinition[];
  warnings: ParseWarning[];
}

export const DEFAULT_TITLE = 'Untitled Dungeon';

export function emptyGame(title = DEFAULT_TITLE): GameDefinition {
  return { title, rooms: [], warnings: [] };
}

export function findRoom(
  game: GameDefinition,
  id: string | undefined,
): RoomDefinition | undefined {
  if (!id) return undefined;
  return game.rooms.find((room) => room.id === id);
}

/** Total enemy bodies in a room (groups expanded by `count`). */
export function roomEnemyCount(room: RoomDefinition): number {
  return room.enemies.reduce((sum, group) => sum + group.count, 0);
}
