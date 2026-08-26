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

export interface VictoryPayload {
  dungeonTitle: string;
  bossName: string;
  questsDone: number;
  questsTotal: number;
  gold: number;
  keys: number;
}

export interface RuntimeEvents {
  hud: HudSnapshot;
  prompt: string | null;
  toast: ToastPayload;
  narration: NarrationPayload;
  dialog: DialogPayload;
  boss: BossPayload | null;
  victory: VictoryPayload;
  death: { roomTitle: string };
  /** True when the current Markdown has no playable room. */
  empty: boolean;
  warnings: ParseWarning[];
  /** Fired once the Phaser game has booted and textures exist. */
  ready: undefined;
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
}
