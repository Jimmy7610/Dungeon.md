import type { SfxId } from '../audio/sfx.ts';
import type { EventBus } from '../core/EventBus.ts';
import type { GameDefinition, ParseWarning } from '../markdown/types.ts';
import type { GameState, HudSnapshot } from './systems/GameState.ts';
import type { QuestSystem } from './systems/QuestSystem.ts';

export type ToastKind = 'item' | 'quest' | 'warn' | 'info';

export interface ToastPayload {
  text: string;
  kind: ToastKind;
}

export interface NarrationPayload {
  title: string;
  lines: string[];
}

export interface BossPayload {
  name: string;
  health: number;
  maxHealth: number;
}

export interface DialogPayload {
  lines: string[];
}

export interface EquipStat {
  label: string;
  value: string;
  direction: 'up' | 'down' | 'same';
}

/** The compact comparison card shown when standing near equipment. */
export interface EquipPayload {
  name: string;
  kind: 'weapon' | 'armor';
  stats: EquipStat[];
  current: string;
}

export interface VictoryPayload {
  dungeonTitle: string;
  bossName: string;
  questsDone: number;
  questsTotal: number;
  gold: number;
  keys: number;
  roomsVisited: number;
  roomsTotal: number;
  weapon: string;
  armor: string;
}

export interface RuntimeEvents {
  hud: HudSnapshot;
  prompt: string | null;
  toast: ToastPayload;
  narration: NarrationPayload;
  dialog: DialogPayload;
  equip: EquipPayload | null;
  boss: BossPayload | null;
  victory: VictoryPayload;
  death: { roomTitle: string };
  /** True when the current Markdown has no playable room. */
  empty: boolean;
  warnings: ParseWarning[];
  /** Fired once the Phaser game has booted and textures exist. */
  ready: undefined;
  /**
   * A sound worth making just happened. Purely advisory: the runtime does
   * not care whether anything is listening, and audio never answers back.
   */
  sfx: SfxId;
}

/**
 * The slice of the runtime a scene is allowed to touch. Keeping it explicit
 * stops the scene from growing tendrils into the DOM layer.
 */
export interface SceneContext {
  readonly definition: GameDefinition;
  readonly state: GameState;
  readonly quests: QuestSystem;
  readonly bus: EventBus<RuntimeEvents>;
  readonly reducedMotion: boolean;
  isFinalBoss(bossId: string): boolean;
  goToRoom(roomId: string, fromRoom: string): void;
  notifyDeath(roomTitle: string): void;
  notifyVictory(bossName: string): void;
  publishHud(): void;
  openDialog(lines: string[]): void;
  /**
   * Last pointer position in world coordinates, or null if the mouse has not
   * been used yet. Held by the runtime so aim survives a room transition,
   * which restarts the scene.
   */
  getAimPoint(): { x: number; y: number } | null;
  setAimPoint(x: number, y: number): void;
  /** An item that would have been wasted was left on the floor. */
  notifyWasted(itemId: string, message: string): void;
}
