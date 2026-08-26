import Phaser from 'phaser';
import type { DoorDefinition, NpcDefinition } from '../../markdown/types.ts';
import { COLORS, TILE } from '../config.ts';

/** Padlock glyph for doors that need a key. */
const LOCK_GLYPH = '\u{1F512}';
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
  readonly radius: number;
  private readonly parts: Phaser.GameObjects.GameObject[] = [];

  constructor(
    scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    readonly definition: DoorDefinition,
    side: Side,
    reducedMotion: boolean,
    private readonly hasRequirement: () => boolean,
  ) {
    const horizontal = side === 'north' || side === 'south';
    const width = horizontal ? TILE * 1.6 : TILE * 0.9;
    const height = horizontal ? TILE * 0.9 : TILE * 1.6;
    const locked = Boolean(definition.requires);
    const secret = definition.hidden && !definition.broken;
    // Secret doors are easy to walk past but forgiving to stand next to.
    this.radius = secret ? TILE * 2.3 : TILE * 1.9;
    const tone = definition.broken
      ? 0x6b7280
      : secret
        ? 0x8a93a7
        : locked
          ? COLORS.accentWarm
          : COLORS.accent;

    if (secret) {
      // No frame and no arrow: just a hairline seam in the masonry.
      const seam = scene.add
        .rectangle(x, y, width * 0.75, height * 0.75, tone, 0.06)
        .setDepth(5)
        .setStrokeStyle(1, tone, 0.35);
      const crack = scene.add
        .rectangle(x, y, horizontal ? width * 0.5 : 2, horizontal ? 2 : height * 0.5, tone, 0.4)
        .setDepth(6);
      this.parts.push(seam, crack);
      if (!reducedMotion) {
        scene.tweens.add({
          targets: crack,
          alpha: { from: 0.18, to: 0.5 },
          duration: 2200,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
      return;
    }

    // A framed portal: dark recess, lit jambs, a glowing threshold and a
    // status glyph. Locked doors read amber, broken ones grey.
    const recess = scene.add.rectangle(x, y, width + 10, height + 10, 0x080c14).setDepth(4);
    const jamb = scene.add
      .rectangle(x, y, width + 6, height + 6, tone, 0.08)
      .setDepth(4)
      .setStrokeStyle(2, tone, 0.85);
    const threshold = scene.add.rectangle(x, y, width, height, tone, 0.22).setDepth(5);
    const inner = scene.add
      .rectangle(x, y, width * 0.55, height * 0.55, 0x05080f, 0.75)
      .setDepth(5);
    const icon = scene.add
      .text(x, y, definition.broken ? '?' : locked ? LOCK_GLYPH : '\u25b6', {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color: definition.broken ? '#9aa4b2' : locked ? '#f5b942' : '#63e0ff',
        stroke: '#05080f',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(6);
    this.parts.push(recess, jamb, threshold, inner, icon);

    // Corner rivets sell the frame as built rather than drawn.
    for (const [ox, oy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const rivet = scene.add
        .rectangle(x + (ox * (width + 6)) / 2, y + (oy * (height + 6)) / 2, 3, 3, tone, 0.9)
        .setDepth(6);
      this.parts.push(rivet);
    }

    if (!reducedMotion) {
      scene.tweens.add({
        targets: threshold,
        alpha: { from: 0.14, to: 0.42 },
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      scene.tweens.add({
        targets: icon,
        y: y - 2,
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }

  promptText(): string {
    if (this.definition.broken) {
      return `Missing room: #${this.definition.target}`;
    }
    if (this.definition.requires && !this.hasRequirement()) {
      return `Requires: ${this.definition.requires}`;
    }
    const prefix = this.definition.hidden ? 'E — ✦ ' : 'E — ';
    return `${prefix}${this.definition.label}`;
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
    // A small terminal beacon: a dark housing with a lit screen and a blinking
    // cursor, rather than a generic marker.
    const shadow = scene.add
      .image(x, y + 13, 'shadow')
      .setDepth(8)
      .setDisplaySize(26, 10)
      .setAlpha(0.6);
    const post = scene.add.rectangle(x, y + 8, 6, 12, 0x121a28).setDepth(9);
    const housing = scene.add
      .rectangle(x, y - 2, 22, 20, 0x1b2434)
      .setDepth(9)
      .setStrokeStyle(2, COLORS.accentWarm, 0.85);
    const screen = scene.add.rectangle(x, y - 2, 14, 12, 0x0b1a12).setDepth(10);
    const line = scene.add.rectangle(x - 3, y - 5, 7, 2, COLORS.accentWarm, 0.8).setDepth(11);
    const cursor = scene.add.rectangle(x - 4, y + 1, 3, 4, 0xf5b942, 1).setDepth(11);
    this.parts.push(shadow, post, housing, screen, line, cursor);

    if (!reducedMotion) {
      scene.tweens.add({
        targets: cursor,
        alpha: { from: 1, to: 0.1 },
        duration: 620,
        yoyo: true,
        repeat: -1,
        ease: 'Stepped',
      });
      scene.tweens.add({
        targets: housing,
        y: y - 4,
        duration: 1800,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      scene.tweens.add({
        targets: [screen, line, cursor],
        y: '-=2',
        duration: 1800,
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
