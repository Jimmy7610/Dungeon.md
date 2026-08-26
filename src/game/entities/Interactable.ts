import Phaser from 'phaser';
import type { DoorDefinition, NpcDefinition } from '../../markdown/types.ts';
import { COLORS, TILE } from '../config.ts';
import type { Side } from '../generation/RoomBuilder.ts';

export type InteractKind = 'door' | 'npc';

/** Anything the player can walk up to and press E on. */
export interface Interactable {
  kind: InteractKind;
  x: number;
  y: number;
  radius: number;
  /** Prompt text, or null when interaction is currently blocked. */
  promptText(): string;
  destroy(): void;
}

/**
 * A doorway drawn into the room wall. The arch is Graphics rather than a
 * sprite so it can adopt the wall colour on any side of the room.
 */
export class DoorObject implements Interactable {
  readonly kind = 'door';
  readonly radius = TILE * 1.9;
  private readonly parts: Phaser.GameObjects.GameObject[] = [];

  constructor(
    scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    readonly definition: DoorDefinition,
    side: Side,
    private readonly hasRequirement: () => boolean,
  ) {
    const horizontal = side === 'north' || side === 'south';
    const width = horizontal ? TILE * 1.6 : TILE * 0.9;
    const height = horizontal ? TILE * 0.9 : TILE * 1.6;
    const locked = Boolean(definition.requires);
    const tone = definition.broken ? 0x6b7280 : locked ? COLORS.accentWarm : COLORS.accent;

    const frame = scene.add.rectangle(x, y, width + 8, height + 8, 0x0b0f18).setDepth(4);
    const glow = scene.add
      .rectangle(x, y, width, height, tone, 0.22)
      .setDepth(5)
      .setStrokeStyle(2, tone, 0.9);
    const icon = scene.add
      .text(x, y, definition.broken ? '?' : locked ? '\u{1F512}' : '▶', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '14px',
        color: definition.broken ? '#9aa4b2' : locked ? '#f5b942' : '#63e0ff',
      })
      .setOrigin(0.5)
      .setDepth(6);
    this.parts.push(frame, glow, icon);

    scene.tweens.add({
      targets: glow,
      alpha: { from: 0.16, to: 0.4 },
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  promptText(): string {
    if (this.definition.broken) {
      return `Missing room: #${this.definition.target}`;
    }
    if (this.definition.requires && !this.hasRequirement()) {
      return `Requires: ${this.definition.requires}`;
    }
    return `E — ${this.definition.label}`;
  }

  canOpen(): boolean {
    if (this.definition.broken) return false;
    if (this.definition.requires && !this.hasRequirement()) return false;
    return true;
  }

  destroy(): void {
    for (const part of this.parts) part.destroy();
    this.parts.length = 0;
  }
}

/** A blockquote, standing in the room as a glowing message stone. */
export class NpcObject implements Interactable {
  readonly kind = 'npc';
  readonly radius = TILE * 1.7;
  private readonly parts: Phaser.GameObjects.GameObject[] = [];

  constructor(
    scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    readonly definition: NpcDefinition,
    reducedMotion: boolean,
  ) {
    const base = scene.add.ellipse(x, y + 12, 30, 12, 0x000000, 0.35).setDepth(8);
    const stone = scene.add
      .rectangle(x, y, 20, 26, 0x2b3346)
      .setDepth(9)
      .setStrokeStyle(2, COLORS.accentWarm, 0.8);
    const mark = scene.add
      .text(x, y, '"', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '18px',
        color: '#f5b942',
      })
      .setOrigin(0.5, 0.7)
      .setDepth(10);
    this.parts.push(base, stone, mark);

    if (!reducedMotion) {
      scene.tweens.add({
        targets: [stone, mark],
        y: '-=3',
        duration: 1600,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  promptText(): string {
    return 'E — Read';
  }

  destroy(): void {
    for (const part of this.parts) part.destroy();
    this.parts.length = 0;
  }
}
