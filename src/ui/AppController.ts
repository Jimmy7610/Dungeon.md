import { DEVELOPER_DUNGEON } from '../demo/developerDungeon.ts';
import { GameRuntime } from '../game/GameRuntime.ts';
import { parseMarkdown } from '../markdown/parser.ts';
import { roomEnemyCount, type GameDefinition, type ParseWarning } from '../markdown/types.ts';
import { EditorController } from './EditorController.ts';
import { HelpModal } from './HelpModal.ts';
import { HudController } from './HudController.ts';
import { HudFrame } from './HudFrame.ts';
import { downloadText, exportFilename, markCompletedQuests } from './exportMarkdown.ts';

type Mode = 'edit' | 'play';

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`[dungeon.md] missing #${id}`);
  return node as T;
}

/**
 * Wires the DOM to the runtime: parse on edit, render overlays, and keep the
 * two modes (edit / play) honest about who owns the keyboard.
 */
export class AppController {
  private readonly app = element('app');
  private readonly runtime = new GameRuntime(element('game-host'));
  private readonly hud = new HudController(this.runtime.bus);
  private readonly help = new HelpModal();
  private readonly hudFrame = new HudFrame(element('stage'), element('hud'));
  private readonly editor: EditorController;

  private readonly emptyState = element('empty-state');
  private readonly dialogOverlay = element('dialog-overlay');
  private readonly dialogBody = element('dialog-body');
  private readonly deathOverlay = element('death-overlay');
  private readonly deathTitle = element('death-title');
  private readonly victoryOverlay = element('victory-overlay');
  private readonly victoryLog = element('victory-log');
  private readonly warnings = element('warnings');
  private readonly warningsList = element<HTMLUListElement>('warnings-list');
  private readonly warningsCount = element('warnings-count');
  private readonly warningsToggle = element<HTMLButtonElement>('warnings-toggle');
  private readonly editorMeta = element('editor-meta');
  private readonly dungeonName = element('dungeon-name');
  private readonly modeButton = element<HTMLButtonElement>('btn-mode');
  private readonly resetButton = element<HTMLButtonElement>('btn-reset');

  private mode: Mode = 'edit';
  private resetArmed = false;
  private resetTimer: number | undefined;

  constructor() {
    this.editor = new EditorController({
      onChange: (source) => this.rebuild(source),
      onFocusChange: (focused) => this.runtime.setKeyboardEnabled(!focused),
      onNotice: (message, kind) => this.hud.toast(message, kind === 'warn' ? 'warn' : 'info'),
    });

    this.bindRuntimeEvents();
    this.bindButtons();
    this.bindGlobalKeys();

    const definition = parseMarkdown(DEVELOPER_DUNGEON);
    this.editor.setValue(DEVELOPER_DUNGEON, { immediate: false });
    this.applyDefinitionMeta(definition);
    this.runtime.start(definition);
  }

  /* ------------------------------------------------------------- plumbing */

  private bindRuntimeEvents(): void {
    const bus = this.runtime.bus;
    bus.on('ready', () => this.hudFrame.attach());
    bus.on('empty', (isEmpty) => {
      this.emptyState.hidden = !isEmpty;
      if (isEmpty) this.hud.clearTransient();
    });
    bus.on('dialog', ({ lines }) => this.showDialog(lines));
    bus.on('death', ({ roomTitle }) => {
      this.deathTitle.textContent = roomTitle ? `You died in ${roomTitle}` : 'You died';
      this.deathOverlay.hidden = false;
    });
    bus.on('victory', (payload) => {
      this.victoryLog.textContent = [
        `✔ ${payload.dungeonTitle}`,
        `✔ ${payload.questsDone}/${payload.questsTotal} quests resolved`,
        `✔ ${payload.bossName} eliminated`,
        `✔ ${payload.keys} key item(s), ${payload.gold} gold`,
        '',
        '0 errors',
        '0 warnings',
      ].join('\n');
      this.victoryOverlay.hidden = false;
    });
    bus.on('warnings', (warnings) => this.renderWarnings(warnings));
  }

  private bindButtons(): void {
    this.modeButton.addEventListener('click', () => this.setMode(this.mode === 'edit' ? 'play' : 'edit'));
    element('btn-help').addEventListener('click', () => this.toggleHelp());
    element('btn-load').addEventListener('click', () => this.editor.openFilePicker());
    element('btn-export').addEventListener('click', () => this.exportMarkdown());
    this.resetButton.addEventListener('click', () => this.reset());

    element('dialog-close').addEventListener('click', () => this.closeDialog());
    element('btn-restart-room').addEventListener('click', () => {
      this.deathOverlay.hidden = true;
      this.hud.clearTransient();
      this.runtime.restartRoom();
    });
    element('btn-death-editor').addEventListener('click', () => {
      this.deathOverlay.hidden = true;
      this.hud.clearTransient();
      this.runtime.restartRoom();
      this.setMode('edit');
    });
    element('btn-play-again').addEventListener('click', () => {
      this.victoryOverlay.hidden = true;
      this.hud.clearTransient();
      this.runtime.restartRun();
    });
    element('btn-victory-editor').addEventListener('click', () => {
      this.victoryOverlay.hidden = true;
      this.hud.clearTransient();
      this.runtime.restartRun();
      this.setMode('edit');
    });

    this.warningsToggle.addEventListener('click', () => {
      const expanded = this.warningsToggle.getAttribute('aria-expanded') === 'true';
      this.warningsToggle.setAttribute('aria-expanded', String(!expanded));
      this.warningsList.hidden = expanded;
    });

    for (const tab of document.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
      tab.addEventListener('click', () => this.selectTab(tab.dataset['tab'] === 'game' ? 'game' : 'editor'));
    }
    this.selectTab('game');
  }

  private bindGlobalKeys(): void {
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (this.help.isOpen) {
        this.help.close();
        this.runtime.setKeyboardEnabled(true);
        return;
      }
      if (!this.dialogOverlay.hidden) {
        this.closeDialog();
        return;
      }
      if (this.mode === 'play') this.setMode('edit');
    });
  }

  /* --------------------------------------------------------------- actions */

  private rebuild(source: string): void {
    let definition: GameDefinition;
    try {
      definition = parseMarkdown(source);
    } catch (error) {
      // The parser is written not to throw; this is the last safety net so a
      // surprise can never white-screen the app.
      console.error('[dungeon.md] parse failed', error);
      this.hud.toast('That Markdown could not be parsed.', 'warn');
      return;
    }
    this.applyDefinitionMeta(definition);
    this.runtime.setDefinition(definition);
  }

  private applyDefinitionMeta(definition: GameDefinition): void {
    const enemies = definition.rooms.reduce((sum, room) => sum + roomEnemyCount(room), 0);
    const items = definition.rooms.reduce((sum, room) => sum + room.items.length, 0);
    const bosses = definition.rooms.filter((room) => room.boss).length;
    const plural = (count: number, word: string): string =>
      `${count} ${word}${count === 1 ? '' : 's'}`;
    this.editorMeta.textContent = [
      plural(definition.rooms.length, 'room'),
      plural(enemies, 'enemy').replace('enemys', 'enemies'),
      plural(items, 'item'),
      ...(bosses > 0 ? [plural(bosses, 'boss').replace('bosss', 'bosses')] : []),
    ].join(' · ');
    this.dungeonName.textContent = definition.title;
    this.renderWarnings(definition.warnings);
  }

  private renderWarnings(warnings: ParseWarning[]): void {
    if (warnings.length === 0) {
      this.warnings.hidden = true;
      this.warningsList.replaceChildren();
      return;
    }
    this.warnings.hidden = false;
    this.warningsCount.textContent = String(warnings.length);
    this.warningsList.replaceChildren();
    for (const warning of warnings) {
      const item = document.createElement('li');
      item.textContent = warning.room ? `${warning.room}: ${warning.message}` : warning.message;
      this.warningsList.append(item);
    }
  }

  private showDialog(lines: string[]): void {
    this.dialogBody.replaceChildren();
    for (const line of lines) {
      const paragraph = document.createElement('p');
      paragraph.textContent = line;
      this.dialogBody.append(paragraph);
    }
    this.dialogOverlay.hidden = false;
    element('dialog-close').focus();
  }

  private closeDialog(): void {
    if (this.dialogOverlay.hidden) return;
    this.dialogOverlay.hidden = true;
    this.runtime.resume();
  }

  private toggleHelp(): void {
    this.help.toggle();
    this.runtime.setKeyboardEnabled(!this.help.isOpen);
  }

  private setMode(mode: Mode): void {
    this.mode = mode;
    this.app.dataset['mode'] = mode;
    this.modeButton.textContent = mode === 'edit' ? '▶ Play' : '✎ Edit';
    this.modeButton.setAttribute(
      'aria-label',
      mode === 'edit' ? 'Switch to play mode' : 'Switch back to the editor',
    );
    if (mode === 'play') {
      (document.activeElement as HTMLElement | null)?.blur();
      this.runtime.setKeyboardEnabled(true);
      this.selectTab('game');
    } else {
      this.editor.focusEditor();
      this.selectTab('editor');
    }
  }

  private selectTab(tab: 'editor' | 'game'): void {
    this.app.dataset['tab'] = tab;
    for (const button of document.querySelectorAll<HTMLButtonElement>('[role="tab"]')) {
      button.setAttribute('aria-selected', String(button.dataset['tab'] === tab));
    }
  }

  private exportMarkdown(): void {
    const completed = this.runtime.definition.rooms
      .flatMap((room) => room.quests)
      .filter((quest) => this.runtime.quests.isComplete(quest))
      .map((quest) => quest.text);

    if (completed.length === 0) {
      this.hud.toast('No completed quests to export yet.', 'warn');
      return;
    }
    const updated = markCompletedQuests(this.editor.value, completed);
    downloadText(exportFilename(this.runtime.definition.title), updated);
    this.hud.toast(`Exported ${completed.length} completed quest(s)`, 'quest');
  }

  private reset(): void {
    if (!this.resetArmed) {
      this.resetArmed = true;
      this.resetButton.textContent = 'Confirm reset?';
      this.resetButton.classList.add('primary');
      this.resetTimer = window.setTimeout(() => this.disarmReset(), 4000);
      return;
    }
    this.disarmReset();
    this.deathOverlay.hidden = true;
    this.victoryOverlay.hidden = true;
    this.dialogOverlay.hidden = true;
    this.hud.clearTransient();
    const definition = parseMarkdown(DEVELOPER_DUNGEON);
    this.editor.setValue(DEVELOPER_DUNGEON, { immediate: false });
    this.applyDefinitionMeta(definition);
    this.runtime.start(definition);
    this.hud.toast('Reset to The Developer Dungeon', 'info');
  }

  private disarmReset(): void {
    window.clearTimeout(this.resetTimer);
    this.resetArmed = false;
    this.resetButton.textContent = 'Reset';
    this.resetButton.classList.remove('primary');
  }
}
