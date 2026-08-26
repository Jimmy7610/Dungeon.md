import Phaser from 'phaser';
import { EventBus } from '../core/EventBus.ts';
import { finalBossId } from '../markdown/parser.ts';
import { emptyGame, findRoom, type GameDefinition } from '../markdown/types.ts';
import { GAME_HEIGHT, GAME_WIDTH } from './config.ts';
import type { RuntimeEvents, SceneContext } from './events.ts';
import { BootScene } from './scenes/BootScene.ts';
import { DungeonScene } from './scenes/DungeonScene.ts';
import { GameState } from './systems/GameState.ts';
import { QuestSystem } from './systems/QuestSystem.ts';

/**
 * Owns the single Phaser instance for the whole page.
 *
 * Live editing never creates a second game: a new GameDefinition simply
 * restarts the dungeon scene, which is enough for Phaser to tear down every
 * object, tween, timer and input listener from the previous room.
 */
export class GameRuntime implements SceneContext {
  readonly bus = new EventBus<RuntimeEvents>();
  readonly state = new GameState();
  readonly reducedMotion: boolean;

  definition: GameDefinition = emptyGame();
  readonly quests: QuestSystem;

  private game: Phaser.Game | undefined;
  private parentObserver: ResizeObserver | undefined;
  private booted = false;
  private dungeonScene: DungeonScene | undefined;
  private paused = false;

  constructor(private readonly parent: HTMLElement) {
    this.reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.quests = new QuestSystem(this.definition, this.state);
  }

  /** Boot Phaser. Safe to call once; later calls are ignored. */
  start(definition: GameDefinition): void {
    this.definition = definition;
    this.quests.setDefinition(definition);
    if (this.game) {
      this.setDefinition(definition, { hard: true });
      return;
    }

    this.dungeonScene = new DungeonScene(this);
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.parent,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: '#0d1017',
      pixelArt: true,
      roundPixels: true,
      antialias: false,
      banner: false,
      audio: { noAudio: true },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 0 }, debug: false },
      },
      scene: [new BootScene(() => this.onBooted()), this.dungeonScene],
    });

    // Phaser's FIT mode polls for window resizes, but the game pane also
    // changes size when the layout switches between edit and play mode.
    // Re-measuring the parent explicitly is what makes the canvas follow.
    this.parentObserver = new ResizeObserver(() => {
      const scale = this.game?.scale;
      if (!scale) return;
      scale.getParentBounds();
      scale.refresh();
    });
    this.parentObserver.observe(this.parent);
  }

  private onBooted(): void {
    this.booted = true;
    this.bus.emit('ready', undefined);
    this.enterInitialRoom();
  }

  /* ------------------------------------------------------- definition flow */

  /**
   * Swap in freshly parsed Markdown. Progress is preserved when the ids it
   * refers to still exist; anything stale is pruned.
   */
  setDefinition(definition: GameDefinition, options: { hard?: boolean } = {}): void {
    const previousRoom = this.state.currentRoom;
    this.definition = definition;
    this.quests.setDefinition(definition);
    this.bus.emit('warnings', definition.warnings);

    if (options.hard) this.state.reset();
    this.state.pruneTo(definition);
    this.quests.reconcile();

    if (!this.booted) return;

    if (definition.rooms.length === 0) {
      this.stopDungeon();
      this.bus.emit('empty', true);
      this.bus.emit('boss', null);
      this.bus.emit('prompt', null);
      return;
    }

    const target = findRoom(definition, previousRoom) ?? definition.rooms[0];
    if (!target) return;
    this.state.currentRoom = target.id;
    this.bus.emit('empty', false);
    this.startDungeon(target.id);
  }

  private enterInitialRoom(): void {
    if (this.definition.rooms.length === 0) {
      this.bus.emit('empty', true);
      return;
    }
    const first = this.definition.rooms[0];
    if (!first) return;
    this.state.currentRoom = first.id;
    this.bus.emit('empty', false);
    this.startDungeon(first.id);
  }

  private startDungeon(roomId: string, fromRoom?: string): void {
    const manager = this.game?.scene;
    if (!manager) return;
    this.paused = false;
    if (manager.isActive('dungeon') || manager.isPaused('dungeon')) manager.stop('dungeon');
    manager.start('dungeon', fromRoom ? { roomId, fromRoom } : { roomId });
  }

  private stopDungeon(): void {
    this.game?.scene.stop('dungeon');
  }

  /* ------------------------------------------------- SceneContext contract */

  isFinalBoss(bossId: string): boolean {
    return finalBossId(this.definition) === bossId;
  }

  goToRoom(roomId: string, fromRoom: string): void {
    const room = findRoom(this.definition, roomId);
    if (!room) {
      // The Markdown changed under us: fall back to the first room.
      this.bus.emit('toast', { text: `Room "${roomId}" is gone — returning to the start.`, kind: 'warn' });
      const first = this.definition.rooms[0];
      if (!first) {
        this.stopDungeon();
        this.bus.emit('empty', true);
        return;
      }
      this.state.currentRoom = first.id;
      this.startDungeon(first.id);
      return;
    }
    this.state.currentRoom = room.id;
    this.startDungeon(room.id, fromRoom);
  }

  notifyDeath(roomTitle: string): void {
    this.pause();
    this.bus.emit('death', { roomTitle });
  }

  notifyVictory(bossName: string): void {
    this.state.won = true;
    this.pause();
    const quests = this.definition.rooms.flatMap((room) => room.quests);
    this.bus.emit('victory', {
      dungeonTitle: this.definition.title,
      bossName,
      questsDone: quests.filter((quest) => this.quests.isComplete(quest)).length,
      questsTotal: quests.length,
      gold: this.state.gold,
      keys: this.state.keys.size,
    });
  }

  publishHud(): void {
    const room = findRoom(this.definition, this.state.currentRoom);
    this.bus.emit(
      'hud',
      this.state.snapshot(this.definition, room?.title ?? '', this.game?.getTime() ?? 0),
    );
  }

  openDialog(lines: string[]): void {
    if (lines.length === 0) return;
    this.pause();
    this.bus.emit('dialog', { lines });
  }

  /* ---------------------------------------------------------------- control */

  pause(): void {
    if (!this.game || this.paused) return;
    this.paused = true;
    this.game.scene.pause('dungeon');
  }

  resume(): void {
    if (!this.game || !this.paused) return;
    this.paused = false;
    this.game.scene.resume('dungeon');
    this.resetKeys();
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Death screen: full health, same room, enemies restored. */
  restartRoom(): void {
    const roomId = this.state.currentRoom || this.definition.rooms[0]?.id;
    if (!roomId) return;
    this.state.health = this.state.maxHealth;
    for (const id of [...this.state.defeatedEnemies]) {
      if (id.startsWith(`${roomId}:`)) this.state.defeatedEnemies.delete(id);
    }
    this.startDungeon(roomId);
  }

  /** Victory screen / RESET: wipe progress and start from the first room. */
  restartRun(): void {
    this.state.reset();
    const first = this.definition.rooms[0];
    if (!first) {
      this.stopDungeon();
      this.bus.emit('empty', true);
      return;
    }
    this.state.currentRoom = first.id;
    this.bus.emit('boss', null);
    this.startDungeon(first.id);
  }

  /** Keyboard control is handed back to the page while the editor has focus. */
  setKeyboardEnabled(enabled: boolean): void {
    const keyboard = this.game?.input.keyboard;
    if (keyboard) keyboard.enabled = enabled;
    if (!enabled) this.resetKeys();
  }

  /** Clear held keys so the player never keeps walking after losing focus. */
  private resetKeys(): void {
    this.game?.scene.getScene('dungeon')?.input?.keyboard?.resetKeys();
  }

  destroy(): void {
    this.parentObserver?.disconnect();
    this.parentObserver = undefined;
    this.game?.destroy(true);
    this.game = undefined;
    this.bus.clear();
  }
}
