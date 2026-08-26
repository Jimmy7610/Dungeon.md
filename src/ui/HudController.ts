import type { EventBus } from '../core/EventBus.ts';
import type { RuntimeEvents } from '../game/events.ts';
import type { HudSnapshot, QuestView } from '../game/systems/GameState.ts';

const MAX_VISIBLE_QUESTS = 5;
const TOAST_MS = 2600;

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`[dungeon.md] missing #${id}`);
  return node as T;
}

/**
 * Renders the in-game HUD from runtime events. Everything is written with
 * `textContent`, so dungeon text from an imported file is never markup.
 */
export class HudController {
  private readonly hearts = element('hearts');
  private readonly armorRow = element('armor-row');
  private readonly weapon = element('weapon-label');
  private readonly armorLabel = element('armor-label');
  private readonly gold = element('gold-label');
  private readonly passives = element('passives');
  private readonly roomTitle = element('room-title');
  private readonly carry = element('carry-label');
  private readonly questLog = element('quest-log');
  private readonly questList = element<HTMLUListElement>('quest-list');
  private readonly bossBar = element('boss-bar');
  private readonly bossName = element('boss-name');
  private readonly bossFill = element('boss-fill');
  private readonly prompt = element('prompt');
  private readonly toasts = element('toasts');
  private readonly narration = element('narration');
  private readonly narrationTitle = element('narration-title');
  private readonly narrationBody = element('narration-body');

  constructor(bus: EventBus<RuntimeEvents>) {
    bus.on('hud', (snapshot) => this.renderHud(snapshot));
    bus.on('prompt', (text) => this.renderPrompt(text));
    bus.on('toast', ({ text, kind }) => this.toast(text, kind));
    bus.on('boss', (payload) => this.renderBoss(payload));
    bus.on('narration', ({ title, lines }) => this.renderNarration(title, lines));
  }

  private renderHud(snapshot: HudSnapshot): void {
    this.renderPips(this.hearts, snapshot.health, snapshot.maxHealth, 'heart', '♥', '♡');
    this.hearts.setAttribute('aria-label', `Health ${snapshot.health} of ${snapshot.maxHealth}`);

    // Armour only takes up room once the player actually has some.
    this.armorRow.hidden = snapshot.maxArmor === 0;
    if (snapshot.maxArmor > 0) {
      this.renderPips(this.armorRow, snapshot.armor, snapshot.maxArmor, 'shard', '◆', '◇');
      this.armorRow.setAttribute(
        'aria-label',
        `Armor ${snapshot.armor} of ${snapshot.maxArmor}${
          snapshot.armorName ? ` (${snapshot.armorName})` : ''
        }`,
      );
    }

    this.weapon.textContent = snapshot.weapon;
    this.armorLabel.textContent = snapshot.armorName;
    this.armorLabel.hidden = snapshot.armorName === '';

    this.roomTitle.textContent = snapshot.roomTitle;

    const carried: string[] = [];
    for (const key of snapshot.keys) carried.push(`⚿ ${titleCase(key)}`);
    this.carry.textContent = carried.length > 0 ? carried.join('  ') : 'No key items';
    this.carry.hidden = carried.length === 0;

    this.gold.textContent = `◆ ${snapshot.gold}`;
    this.gold.hidden = snapshot.gold === 0;

    this.passives.replaceChildren();
    this.passives.hidden = snapshot.passives.length === 0;
    for (const passive of snapshot.passives) {
      const chip = document.createElement('span');
      chip.className = `passive passive-${passive.id}`;
      chip.textContent = passive.label;
      chip.title = passive.detail;
      chip.setAttribute('aria-label', passive.detail);
      this.passives.append(chip);
    }

    this.renderQuests(snapshot.quests);
  }

  /** Hearts and armour shards share one renderer but never look alike. */
  private renderPips(
    host: HTMLElement,
    filled: number,
    total: number,
    className: string,
    fullGlyph: string,
    emptyGlyph: string,
  ): void {
    host.replaceChildren();
    for (let index = 0; index < total; index++) {
      const pip = document.createElement('span');
      const isFull = index < filled;
      pip.className = isFull ? className : `${className} empty`;
      pip.textContent = isFull ? fullGlyph : emptyGlyph;
      host.append(pip);
    }
  }

  private renderQuests(quests: QuestView[]): void {
    if (quests.length === 0) {
      this.questLog.hidden = true;
      return;
    }
    this.questLog.hidden = false;
    // Open quests first so the next objective is always visible.
    const ordered = [...quests].sort((a, b) => Number(a.done) - Number(b.done));
    const visible = ordered.slice(0, MAX_VISIBLE_QUESTS);

    this.questList.replaceChildren();
    for (const quest of visible) {
      const item = document.createElement('li');
      if (quest.done) item.className = 'done';
      const box = document.createElement('span');
      box.className = 'box';
      box.textContent = quest.done ? '[x]' : '[ ]';
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = quest.text;
      item.append(box, label);
      this.questList.append(item);
    }
    if (ordered.length > visible.length) {
      const more = document.createElement('li');
      more.className = 'quest-more';
      more.textContent = `+${ordered.length - visible.length} more`;
      this.questList.append(more);
    }
  }

  private renderPrompt(text: string | null): void {
    if (!text) {
      this.prompt.hidden = true;
      this.prompt.textContent = '';
      return;
    }
    this.prompt.hidden = false;
    this.prompt.textContent = text;
  }

  private renderBoss(payload: RuntimeEvents['boss']): void {
    if (!payload) {
      this.bossBar.hidden = true;
      return;
    }
    this.bossBar.hidden = false;
    this.bossName.textContent = payload.name;
    const ratio = payload.maxHealth > 0 ? payload.health / payload.maxHealth : 0;
    this.bossFill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
  }

  private renderNarration(title: string, lines: string[]): void {
    if (!title && lines.length === 0) {
      this.narration.hidden = true;
      return;
    }
    this.narration.hidden = false;
    this.narrationTitle.textContent = title;
    this.narrationBody.textContent = lines.join(' ');
  }

  toast(text: string, kind: 'item' | 'quest' | 'warn' | 'info'): void {
    const node = document.createElement('div');
    node.className = `toast ${kind}`;
    node.textContent = text;
    this.toasts.append(node);
    while (this.toasts.childElementCount > 4) this.toasts.firstElementChild?.remove();
    window.setTimeout(() => {
      node.classList.add('leaving');
      window.setTimeout(() => node.remove(), 260);
    }, TOAST_MS);
  }

  clearTransient(): void {
    this.renderPrompt(null);
    this.renderNarration('', []);
    this.toasts.replaceChildren();
  }
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (character) => character.toUpperCase());
}
