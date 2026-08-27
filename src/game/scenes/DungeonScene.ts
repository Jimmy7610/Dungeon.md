import Phaser from 'phaser';
import { createRng, type Rng } from '../../core/rng.ts';
import { findRoom, type RoomDefinition } from '../../markdown/types.ts';
import {
  BOSS,
  ELITE,
  GAME_HEIGHT,
  GAME_WIDTH,
  NARRATION_MS,
  PLAYER,
  ROOM_COLS,
  ROOM_ROWS,
  TILE,
  TRANSITION_MS,
  shadeColor,
  themePalette,
  type ThemePalette,
} from '../config.ts';
import { Boss, type BossAction } from '../entities/Boss.ts';
import { Enemy } from '../entities/Enemy.ts';
import { DoorObject, NpcObject, type Interactable } from '../entities/Interactable.ts';
import { Pickup } from '../entities/Pickup.ts';
import { buildRoomLayout, type RoomLayout } from '../generation/RoomBuilder.ts';
import type { EquipPayload, SceneContext } from '../events.ts';
import { compareWeapons, deltaSymbol, getWeapon } from '../items/weapons.ts';
import { inMeleeArc, knockbackVelocity } from '../systems/CombatSystem.ts';
import { Player, type InputState } from '../entities/Player.ts';

export interface DungeonSceneData {
  roomId: string;
  fromRoom?: string;
}

type Keys = Record<
  'up' | 'down' | 'left' | 'right' | 'attack' | 'interact',
  Phaser.Input.Keyboard.Key
>;

/**
 * The whole game loop for one room. A room change is a scene restart, which
 * gives us a guaranteed clean slate: Phaser destroys every object, tween,
 * timer and listener created here.
 */
export class DungeonScene extends Phaser.Scene {
  private roomId = '';
  private fromRoom: string | undefined;
  private room!: RoomDefinition;
  private layout!: RoomLayout;
  private palette!: ThemePalette;

  private player!: Player;
  private keys: Keys | undefined;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys | undefined;
  private wallBodies: Phaser.GameObjects.Rectangle[] = [];
  private enemies: Enemy[] = [];
  private pickups: Pickup[] = [];
  private interactables: Interactable[] = [];
  private projectiles: Phaser.Physics.Arcade.Sprite[] = [];
  private boss: Boss | undefined;

  private currentPrompt: string | null = null;
  private currentEquipKey: string | null = null;
  private transitioning = false;
  private dead = false;
  private minionCount = 0;
  private pointerAttack = false;

  constructor(private readonly context: SceneContext) {
    super('dungeon');
  }

  init(data: DungeonSceneData): void {
    this.roomId = data.roomId;
    this.fromRoom = data.fromRoom;
    this.currentPrompt = null;
    this.currentEquipKey = null;
    this.transitioning = false;
    this.dead = false;
    this.minionCount = 0;
    this.pointerAttack = false;
    this.wallBodies = [];
    this.enemies = [];
    this.pickups = [];
    this.interactables = [];
    this.projectiles = [];
    this.boss = undefined;
    this.keys = undefined;
    this.cursors = undefined;
  }

  create(): void {
    const room = findRoom(this.context.definition, this.roomId);
    if (!room) {
      this.context.bus.emit('empty', true);
      return;
    }
    this.room = room;
    this.layout = buildRoomLayout(room);
    this.palette = themePalette(room.theme);

    this.physics.world.setBounds(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.cameras.main.setBackgroundColor('#0d1017');

    this.drawRoom();
    this.spawnDoors();
    this.spawnNpcs();
    this.spawnItems();
    this.spawnPlayer();
    this.spawnEnemies();
    this.spawnBoss();
    this.addLighting();
    this.bindInput();
    this.wireCollisions();

    this.context.state.currentRoom = room.id;
    this.context.state.visitedRooms.add(room.id);
    for (const quest of this.context.quests.report({ kind: 'room', room: room.id })) {
      this.context.bus.emit('toast', { text: `Quest complete — ${quest.text}`, kind: 'quest' });
    }
    this.reportRoomClearIfEmpty();

    this.context.publishHud();
    this.context.bus.emit('prompt', null);
    this.context.bus.emit('equip', null);
    this.context.bus.emit('boss', this.boss ? this.bossPayload(this.boss) : null);
    this.context.bus.emit('narration', { title: room.title, lines: room.narration.slice(0, 3) });
    this.time.delayedCall(NARRATION_MS, () => {
      this.context.bus.emit('narration', { title: '', lines: [] });
    });

    this.cameras.main.fadeIn(TRANSITION_MS, 4, 6, 11);
  }

  /* ------------------------------------------------------------- building */

  private drawRoom(): void {
    const rng = createRng(`${this.room.id}:decor`);
    const graphics = this.add.graphics();

    for (let row = 0; row < ROOM_ROWS; row++) {
      for (let col = 0; col < ROOM_COLS; col++) {
        const x = col * TILE;
        const y = row * TILE;
        if (this.layout.walls[row]?.[col]) continue;
        this.paintFloorTile(graphics, x, y, col, row, rng);
      }
    }

    // Grid lines keep the "developer tool" feel without fighting the art.
    graphics.lineStyle(1, 0x000000, 0.08);
    for (let col = 1; col < ROOM_COLS; col++) {
      graphics.lineBetween(col * TILE, 0, col * TILE, GAME_HEIGHT);
    }
    for (let row = 1; row < ROOM_ROWS; row++) {
      graphics.lineBetween(0, row * TILE, GAME_WIDTH, row * TILE);
    }

    this.drawDecor(graphics, rng);

    for (let row = 0; row < ROOM_ROWS; row++) {
      for (let col = 0; col < ROOM_COLS; col++) {
        if (!this.layout.walls[row]?.[col]) continue;
        this.paintWallTile(graphics, col, row, rng);
      }
    }

    // The whole room is static, so it is flattened into a single texture:
    // one draw call per frame instead of thousands of re-submitted rectangles.
    const canvas = this.add.renderTexture(0, 0, GAME_WIDTH, GAME_HEIGHT).setOrigin(0, 0);
    canvas.setDepth(0);
    canvas.draw(graphics);
    graphics.destroy();

    for (const rect of this.layout.wallRects) {
      const body = this.add
        .rectangle(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height)
        .setVisible(false);
      this.physics.add.existing(body, true);
      this.wallBodies.push(body);
    }
  }

  /** Floor tile with a little deterministic variation so it is not a flat field. */
  private paintFloorTile(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    col: number,
    row: number,
    rng: Rng,
  ): void {
    const palette = this.palette;
    graphics.fillStyle((col + row) % 2 === 0 ? palette.floor : palette.floorAlt, 1);
    graphics.fillRect(x, y, TILE, TILE);

    // Inset panel edge: a lighter top-left and darker bottom-right lip reads as
    // a real tile rather than a coloured square.
    graphics.fillStyle(palette.wallTop, 0.06);
    graphics.fillRect(x, y, TILE, 1);
    graphics.fillRect(x, y, 1, TILE);
    graphics.fillStyle(0x000000, 0.12);
    graphics.fillRect(x, y + TILE - 1, TILE, 1);
    graphics.fillRect(x + TILE - 1, y, 1, TILE);

    const roll = rng.next();
    if (roll < 0.07) {
      // A hairline crack.
      graphics.lineStyle(1, 0x000000, 0.2);
      const cx = x + rng.int(6, 22);
      const cy = y + rng.int(6, 22);
      graphics.lineBetween(cx, cy, cx + rng.int(-7, 7), cy + rng.int(3, 8));
    } else if (roll < 0.16) {
      graphics.fillStyle(palette.detail, 0.6);
      const size = rng.int(2, 3);
      graphics.fillRect(x + rng.int(5, 24), y + rng.int(5, 24), size, size);
    }
  }

  /**
   * Wall tile with a lit top face, a dark underside and corner shading, so
   * rooms read as built rather than outlined.
   */
  private paintWallTile(
    graphics: Phaser.GameObjects.Graphics,
    col: number,
    row: number,
    rng: Rng,
  ): void {
    const palette = this.palette;
    const x = col * TILE;
    const y = row * TILE;
    const openBelow = this.layout.walls[row + 1]?.[col] === false;
    const openAbove = this.layout.walls[row - 1]?.[col] === false;
    const openLeft = this.layout.walls[row]?.[col - 1] === false;
    const openRight = this.layout.walls[row]?.[col + 1] === false;

    // Walls are built from one themed colour in three values: a body darker
    // than the floor so the room is framed, a mid face, and a lit cap. That
    // reads as a raised block instead of a pale slab.
    const body = shadeColor(palette.wall, 0.42);
    const face = shadeColor(palette.wall, 0.78);

    graphics.fillStyle(body, 1);
    graphics.fillRect(x, y, TILE, TILE);

    // Brick-ish seams.
    graphics.fillStyle(0x000000, 0.18);
    const offset = (row % 2) * (TILE / 2);
    graphics.fillRect(x, y + TILE / 2 - 1, TILE, 1);
    graphics.fillRect(x + ((offset + TILE / 2) % TILE), y, 1, TILE / 2);
    graphics.fillRect(x + (offset % TILE), y + TILE / 2, 1, TILE / 2);

    if (openBelow) {
      // Lit cap along the top of an exposed wall, with a dark lip beneath it.
      graphics.fillStyle(face, 1);
      graphics.fillRect(x, y, TILE, 10);
      graphics.fillStyle(palette.wallTop, 1);
      graphics.fillRect(x, y, TILE, 3);
      graphics.fillStyle(0xffffff, 0.1);
      graphics.fillRect(x, y, TILE, 1);
      graphics.fillStyle(0x000000, 0.45);
      graphics.fillRect(x, y + TILE - 4, TILE, 4);
      if (rng.next() < 0.22) {
        graphics.fillStyle(palette.accent, 0.3);
        graphics.fillRect(x + rng.int(6, 22), y + 5, rng.int(3, 7), 2);
      }
    }
    if (openAbove) {
      graphics.fillStyle(0x000000, 0.22);
      graphics.fillRect(x, y, TILE, 3);
    }
    if (openLeft) {
      graphics.fillStyle(0x000000, 0.18);
      graphics.fillRect(x, y, 3, TILE);
    }
    if (openRight) {
      graphics.fillStyle(0x000000, 0.18);
      graphics.fillRect(x + TILE - 3, y, 3, TILE);
    }
  }

  /**
   * Purely cosmetic dressing, flattened into the room texture beneath every
   * entity and seeded from the room id so the same Markdown always paints the
   * same room.
   *
   * It never touches collision, and tiles used by doors, loot, enemies or the
   * player's landing spot are skipped, so decoration can never hide something
   * the player needs to see.
   */
  private drawDecor(decor: Phaser.GameObjects.Graphics, rng: Rng): void {
    const blocked = new Set<string>();
    const block = (x: number, y: number, radius = 1): void => {
      const col = Math.floor(x / TILE);
      const row = Math.floor(y / TILE);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) blocked.add(`${col + dx},${row + dy}`);
      }
    };
    for (const slot of this.layout.doors) {
      block(slot.x, slot.y, 2);
      block(slot.landing.x, slot.landing.y, 1);
    }
    for (const point of this.layout.itemPoints) block(point.x, point.y);
    for (const point of this.layout.npcPoints) block(point.x, point.y);
    for (const point of this.layout.enemyPoints) block(point.x, point.y, 0);
    block(this.layout.defaultSpawn.x, this.layout.defaultSpawn.y, 1);
    if (this.room.boss) block(this.layout.bossPoint.x, this.layout.bossPoint.y, 3);

    const tiles: { col: number; row: number }[] = [];
    for (let row = 1; row < ROOM_ROWS - 1; row++) {
      for (let col = 1; col < ROOM_COLS - 1; col++) {
        if (this.layout.walls[row]?.[col]) continue;
        if (blocked.has(`${col},${row}`)) continue;
        tiles.push({ col, row });
      }
    }

    const density = this.palette.decor === 'treasure' ? 0.12 : 0.075;
    const picks = rng
      .shuffle([...tiles])
      .slice(0, Math.min(16, Math.round(tiles.length * density)));
    for (const tile of picks) {
      this.paintDecor(decor, tile.col * TILE, tile.row * TILE, rng);
    }
  }

  /** One decoration stamp, in the current room's theme language. */
  private paintDecor(g: Phaser.GameObjects.Graphics, x: number, y: number, rng: Rng): void {
    const accent = this.palette.accent;
    const dark = this.palette.wallEdge;

    switch (this.palette.decor) {
      case 'code': {
        // Three repository motifs so the floor never turns into wallpaper:
        // a file card, a commit graph, or a terminal fragment.
        const motif = rng.int(0, 2);
        if (motif === 0) {
          g.fillStyle(dark, 0.35);
          g.fillRect(x + 8, y + 6, 17, 20);
          g.lineStyle(1, accent, 0.32);
          g.strokeRect(x + 8, y + 6, 17, 20);
          g.fillStyle(accent, 0.28);
          for (let line = 0; line < 3; line++) {
            g.fillRect(x + 11, y + 10 + line * 5, rng.int(4, 11), 2);
          }
        } else if (motif === 1) {
          g.lineStyle(1, accent, 0.3);
          g.lineBetween(x + 16, y + 3, x + 16, y + 29);
          for (let dot = 0; dot < 3; dot++) {
            const dy = y + 7 + dot * 8;
            g.fillStyle(dark, 0.8);
            g.fillCircle(x + 16, dy, 3);
            g.lineStyle(1, accent, 0.5);
            g.strokeCircle(x + 16, dy, 3);
            if (dot === 1) g.lineBetween(x + 16, dy, x + 25, dy - 4);
          }
        } else {
          g.fillStyle(dark, 0.45);
          g.fillRect(x + 5, y + 10, 22, 13);
          g.fillStyle(accent, 0.45);
          g.fillRect(x + 8, y + 13, 3, 2);
          g.fillStyle(accent, 0.25);
          g.fillRect(x + 13, y + 13, 9, 2);
          g.fillRect(x + 8, y + 18, 12, 2);
        }
        break;
      }
      case 'cables': {
        // Conduit with a junction box and the odd warning stud.
        g.lineStyle(3, dark, 0.55);
        g.lineBetween(x, y + 16, x + 32, y + 16);
        g.lineStyle(1, accent, 0.3);
        g.lineBetween(x, y + 15, x + 32, y + 15);
        g.fillStyle(dark, 0.7);
        g.fillRect(x + 12, y + 11, 9, 10);
        g.fillStyle(accent, 0.55);
        g.fillRect(x + 14, y + 13, 5, 2);
        if (rng.next() < 0.4) {
          g.fillStyle(0xffd24d, 0.5);
          g.fillRect(x + 24, y + 22, 3, 3);
        }
        break;
      }
      case 'blocks': {
        // Cache cells: some filled (hit), some hollow (miss).
        for (let cell = 0; cell < 4; cell++) {
          const cx = x + 5 + (cell % 2) * 12;
          const cy = y + 5 + Math.floor(cell / 2) * 12;
          g.lineStyle(1, accent, 0.3);
          g.strokeRect(cx, cy, 9, 9);
          if (rng.next() < 0.45) {
            g.fillStyle(accent, 0.22);
            g.fillRect(cx + 2, cy + 2, 5, 5);
          }
        }
        break;
      }
      case 'glitch': {
        // Torn scanline slabs, offset, with a chunk of floor simply missing.
        for (let band = 0; band < 3; band++) {
          const by = y + 5 + band * 8;
          const shift = rng.int(-6, 6);
          g.fillStyle(accent, 0.16);
          g.fillRect(x + 3 + shift, by, rng.int(10, 24), 4);
        }
        g.fillStyle(0x05070c, 0.55);
        g.fillRect(x + rng.int(4, 16), y + rng.int(4, 18), rng.int(5, 10), rng.int(4, 8));
        break;
      }
      case 'nodes': {
        // A module node wired to its neighbours.
        g.lineStyle(1, accent, 0.22);
        g.lineBetween(x + 16, y + 16, x + 32, y + rng.int(4, 28));
        g.lineBetween(x + 16, y + 16, x, y + rng.int(4, 28));
        g.fillStyle(dark, 0.7);
        g.fillRect(x + 10, y + 10, 12, 12);
        g.lineStyle(1, accent, 0.5);
        g.strokeRect(x + 10, y + 10, 12, 12);
        g.fillStyle(accent, 0.45);
        g.fillRect(x + 14, y + 14, 4, 4);
        break;
      }
      case 'debris': {
        // A package crate with a corner broken off, plus fragments.
        g.fillStyle(dark, 0.5);
        g.fillRect(x + 5, y + 10, 18, 14);
        g.lineStyle(1, accent, 0.3);
        g.strokeRect(x + 5, y + 10, 18, 14);
        g.fillStyle(this.palette.floor, 1);
        g.fillRect(x + 17, y + 10, 6, 6);
        g.fillStyle(accent, 0.25);
        g.fillRect(x + 8, y + 14, 8, 2);
        for (let bit = 0; bit < 3; bit++) {
          g.fillRect(x + rng.int(2, 28), y + rng.int(24, 29), 2, 2);
        }
        break;
      }
      case 'split': {
        // Two branches: cyan on the left of the room, orange on the right,
        // with conflict markers where they meet.
        const left = x < GAME_WIDTH / 2;
        const tone = left ? 0x63e0ff : 0xff9f1c;
        g.fillStyle(tone, 0.16);
        for (let line = 0; line < 3; line++) {
          const ly = y + 7 + line * 7;
          g.fillRect(left ? x + 3 : x + 32 - rng.int(10, 22), ly, rng.int(10, 22), 3);
        }
        if (Math.abs(x + 16 - GAME_WIDTH / 2) < TILE * 1.5) {
          g.fillStyle(0xffffff, 0.22);
          for (let mark = 0; mark < 3; mark++) g.fillRect(x + 8 + mark * 6, y + 4, 4, 24);
        }
        break;
      }
      case 'lines': {
        // Build lane with a pass/fail indicator.
        g.fillStyle(dark, 0.45);
        g.fillRect(x, y + 12, 32, 10);
        g.fillStyle(accent, 0.2);
        for (let dash = 0; dash < 4; dash++) g.fillRect(x + dash * 8 + 2, y + 16, 4, 2);
        const pass = rng.next() < 0.6;
        g.fillStyle(pass ? 0x7ee08a : 0xff5c4d, 0.75);
        g.fillRect(x + 26, y + 5, 4, 4);
        break;
      }
      case 'scan': {
        // Firewall: horizontal scan bars and a shield node.
        g.fillStyle(accent, 0.14);
        for (let bar = 0; bar < 4; bar++) g.fillRect(x, y + 3 + bar * 8, 32, 2);
        g.lineStyle(1, accent, 0.45);
        g.strokeRect(x + 11, y + 10, 11, 13);
        g.fillStyle(accent, 0.25);
        g.fillRect(x + 14, y + 14, 5, 5);
        break;
      }
      case 'leak': {
        // Memory pooling out of a block and dripping.
        g.fillStyle(accent, 0.13);
        g.fillCircle(x + 15, y + 14, rng.int(7, 12));
        g.fillStyle(accent, 0.22);
        g.fillRect(x + 10, y + 6, 10, 8);
        g.fillStyle(accent, 0.3);
        for (let drip = 0; drip < 3; drip++) {
          g.fillRect(x + 8 + drip * 6, y + 18 + rng.int(0, 8), 2, rng.int(2, 5));
        }
        break;
      }
      case 'rust': {
        // Deprecated: a faded, crossed-out interface fragment.
        g.fillStyle(dark, 0.4);
        g.fillRect(x + 5, y + 8, 20, 16);
        g.lineStyle(1, accent, 0.28);
        g.strokeRect(x + 5, y + 8, 20, 16);
        g.lineStyle(2, accent, 0.3);
        g.lineBetween(x + 6, y + 9, x + 24, y + 23);
        g.lineBetween(x + 24, y + 9, x + 6, y + 23);
        break;
      }
      case 'clean': {
        // Refactor: tidy indented blocks with bright guides.
        g.lineStyle(1, accent, 0.3);
        g.lineBetween(x + 7, y + 5, x + 7, y + 27);
        g.fillStyle(accent, 0.3);
        for (let line = 0; line < 4; line++) {
          g.fillRect(x + 10 + (line % 2) * 4, y + 7 + line * 5, rng.int(8, 15), 2);
        }
        break;
      }
      case 'shelves': {
        // Archive: file spines of varying height with amber labels.
        for (let spine = 0; spine < 5; spine++) {
          const sx = x + 3 + spine * 6;
          const height = rng.int(12, 24);
          g.fillStyle(dark, 0.55);
          g.fillRect(sx, y + 28 - height, 4, height);
          g.fillStyle(accent, 0.35);
          g.fillRect(sx, y + 28 - height + 2, 4, 2);
        }
        break;
      }
      case 'runes': {
        // Vault: fractured bracket structures.
        g.lineStyle(2, accent, 0.3);
        g.beginPath();
        g.moveTo(x + 12, y + 4);
        g.lineTo(x + 6, y + 10);
        g.lineTo(x + 6, y + 22);
        g.lineTo(x + 12, y + 28);
        g.strokePath();
        g.beginPath();
        g.moveTo(x + 20, y + 4);
        g.lineTo(x + 26, y + 10);
        g.lineTo(x + 26, y + 22);
        g.lineTo(x + 20, y + 28);
        g.strokePath();
        g.fillStyle(accent, 0.3);
        g.fillRect(x + 15, y + 14, 3, 4);
        break;
      }
      case 'treasure': {
        // Secret: a data-vault ornament with glinting shards.
        g.lineStyle(1, accent, 0.4);
        g.strokeRect(x + 8, y + 8, 16, 16);
        g.lineStyle(1, accent, 0.25);
        g.strokeRect(x + 11, y + 11, 10, 10);
        g.fillStyle(0xffe9a8, 0.35);
        g.fillRect(x + 15, y + 15, 3, 3);
        for (let glint = 0; glint < 2; glint++) {
          g.fillStyle(0xffffff, 0.28);
          g.fillRect(x + rng.int(2, 29), y + rng.int(2, 29), 2, 2);
        }
        break;
      }
    }
  }

  private addLighting(): void {
    this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'vignette').setDepth(40);

    for (const torch of this.layout.torches) {
      const glow = this.add
        .ellipse(torch.x, torch.y, 96, 96, this.palette.glow, this.palette.glowAlpha)
        .setDepth(1);
      if (!this.context.reducedMotion) {
        this.tweens.add({
          targets: glow,
          alpha: { from: this.palette.glowAlpha * 0.6, to: this.palette.glowAlpha * 1.5 },
          scale: { from: 0.9, to: 1.08 },
          duration: 1700 + Math.random() * 600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
    }
  }

  private spawnDoors(): void {
    for (const slot of this.layout.doors) {
      this.interactables.push(
        new DoorObject(this, slot.x, slot.y, slot.door, slot.side, this.context.reducedMotion, () =>
          this.context.state.hasKey(slot.door.requires ?? ''),
        ),
      );
    }
  }

  private spawnNpcs(): void {
    this.room.npcs.forEach((npc, index) => {
      const point = this.layout.npcPoints[index];
      if (!point) return;
      this.interactables.push(
        new NpcObject(this, point.x, point.y, npc, this.context.reducedMotion),
      );
    });
  }

  private spawnItems(): void {
    this.room.items.forEach((item, index) => {
      if (this.context.state.collectedItems.has(item.id)) return;
      const point = this.layout.itemPoints[index];
      if (!point) return;
      this.pickups.push(new Pickup(this, point.x, point.y, item, this.context.reducedMotion));
    });
  }

  private spawnPlayer(): void {
    const entry = this.fromRoom
      ? this.layout.doors.find((slot) => slot.door.target === this.fromRoom)
      : undefined;
    const spawn = entry?.landing ?? this.layout.defaultSpawn;
    this.player = new Player(this, spawn.x, spawn.y);
    this.player.setArmor(this.context.state.armorId);
    this.player.grantInvulnerability(this.time.now);
  }

  private spawnEnemies(): void {
    let pointIndex = 0;
    for (const group of this.room.enemies) {
      for (let index = 0; index < group.count; index++) {
        const bodyId = `${group.id}:${index}`;
        const point = this.layout.enemyPoints[pointIndex++];
        if (!point) continue;
        if (this.context.state.defeatedEnemies.has(bodyId)) continue;
        this.enemies.push(
          new Enemy(this, point.x, point.y, {
            bodyId,
            type: group.type,
            health: group.health,
            damage: group.damage,
            elite: group.elite,
            healthExplicit: group.healthExplicit,
            reducedMotion: this.context.reducedMotion,
          }),
        );
      }
    }
  }

  private spawnBoss(): void {
    const definition = this.room.boss;
    if (!definition) return;
    if (this.context.state.defeatedBosses.has(definition.id)) return;

    const point = this.layout.bossPoint;
    this.boss = new Boss(this, point.x, point.y, definition, this.context.reducedMotion, (action) =>
      this.onBossAction(action),
    );

    if (!this.context.reducedMotion) {
      this.boss.setScale(0);
      this.tweens.add({
        targets: this.boss,
        scale: BOSS.scale,
        duration: 600,
        ease: 'Back.easeOut',
      });
      this.cameras.main.shake(320, 0.006);
    }
    this.context.bus.emit('toast', { text: `${definition.name} awakens`, kind: 'warn' });
  }

  private bindInput(): void {
    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.cursors = keyboard.createCursorKeys();
      this.keys = {
        up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D),
        attack: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
        interact: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      };
      // Stop the page from scrolling while the game has focus.
      keyboard.addCapture([
        Phaser.Input.Keyboard.KeyCodes.SPACE,
        Phaser.Input.Keyboard.KeyCodes.UP,
        Phaser.Input.Keyboard.KeyCodes.DOWN,
        Phaser.Input.Keyboard.KeyCodes.LEFT,
        Phaser.Input.Keyboard.KeyCodes.RIGHT,
      ]);
    }
    // Mouse aim. POINTER_MOVE keeps the aim point fresh; POINTER_DOWN updates
    // it *before* flagging the attack, so a fast move-then-click never swings
    // at a stale target. Both are registered on the scene's input plugin, which
    // Phaser tears down on shutdown - so a room change or live rebuild cannot
    // leave a second listener behind and double-fire attacks.
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      this.rememberAim(pointer);
    });
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer) => {
      this.rememberAim(pointer);
      this.pointerAttack = true;
    });
  }

  /**
   * Convert a pointer to world coordinates through the camera, so the canvas's
   * responsive CSS scaling and any camera transform are accounted for - screen
   * pixels are never assumed to equal world units.
   */
  private rememberAim(pointer: Phaser.Input.Pointer): void {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.context.setAimPoint(world.x, world.y);
  }

  private wireCollisions(): void {
    this.physics.add.collider(this.player, this.wallBodies);
    this.physics.add.collider(this.enemies, this.wallBodies);
    this.physics.add.collider(this.enemies, this.enemies);
    if (this.boss) this.physics.add.collider(this.boss, this.wallBodies);

    this.physics.add.overlap(this.player, this.enemies, (_player, enemyObject) => {
      const enemy = enemyObject as Enemy;
      this.damagePlayer(enemy.damage, enemy.x, enemy.y, enemy);
    });

    if (this.boss) {
      this.physics.add.overlap(this.player, this.boss, (_player, bossObject) => {
        const boss = bossObject as Boss;
        if (this.time.now < boss.nextContactAt) return;
        boss.nextContactAt = this.time.now + BOSS.contactCooldownMs;
        this.damagePlayer(boss.definition.damage, boss.x, boss.y);
      });
    }

    this.physics.add.overlap(this.player, this.pickups, (_player, pickupObject) => {
      const pickup = pickupObject as Pickup;
      // Equipment waits for E; everything else is picked up by walking over it.
      if (!pickup.requiresInteract) this.collect(pickup);
    });

    this.physics.add.collider(this.projectiles, this.wallBodies, (projectile) => {
      this.destroyProjectile(projectile as Phaser.Physics.Arcade.Sprite);
    });

    this.physics.add.overlap(this.player, this.projectiles, (_player, projectile) => {
      const shard = projectile as Phaser.Physics.Arcade.Sprite;
      this.destroyProjectile(shard);
      this.damagePlayer(1, shard.x, shard.y);
    });
  }

  /* ---------------------------------------------------------------- loop */

  override update(time: number, delta: number): void {
    if (!this.player?.active || this.dead) return;

    const input = this.readInput();
    this.player.drive(input, delta, this.context.state.moveSpeed(time));

    // Re-aim from the current pointer position every frame: the mouse can sit
    // still while the player walks, and the direction between them still
    // changes. Applied before the attack check so a click uses this frame's aim.
    const aim = this.context.getAimPoint();
    if (aim) this.player.aimAt(aim.x, aim.y);

    for (const enemy of this.enemies) {
      if (!enemy.active) continue;
      enemy.think(time, this.player.x, this.player.y, true);
    }
    this.boss?.think(time, this.player.x, this.player.y);

    if (input.attack && this.player.canAttack(time) && !this.transitioning) {
      this.attack(time);
    }

    this.updatePrompt();

    const interactKey = this.keys?.interact;
    if (interactKey && Phaser.Input.Keyboard.JustDown(interactKey)) {
      this.interact();
    }
  }

  private readInput(): InputState {
    const cursors = this.cursors;
    const keys = this.keys;
    let x = 0;
    let y = 0;
    if (cursors?.left?.isDown || keys?.left.isDown) x -= 1;
    if (cursors?.right?.isDown || keys?.right.isDown) x += 1;
    if (cursors?.up?.isDown || keys?.up.isDown) y -= 1;
    if (cursors?.down?.isDown || keys?.down.isDown) y += 1;
    const attack = Boolean(keys?.attack.isDown) || this.pointerAttack;
    this.pointerAttack = false;
    return { x, y, attack };
  }

  /* ---------------------------------------------------------- interaction */

  private nearestEquipment(): Pickup | undefined {
    let best: Pickup | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const pickup of this.pickups) {
      if (!pickup.active || !pickup.requiresInteract) continue;
      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        pickup.x,
        pickup.y,
      );
      if (distance <= TILE * 1.9 && distance < bestDistance) {
        best = pickup;
        bestDistance = distance;
      }
    }
    return best;
  }

  private nearestInteractable(): Interactable | undefined {
    let best: Interactable | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const item of this.interactables) {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, item.x, item.y);
      if (distance <= item.radius && distance < bestDistance) {
        best = item;
        bestDistance = distance;
      }
    }
    return best;
  }

  private updatePrompt(): void {
    // Equipment takes priority: its card carries its own "E — Equip" line.
    const equipment = this.nearestEquipment();
    if (equipment) {
      if (this.currentPrompt !== null) {
        this.currentPrompt = null;
        this.context.bus.emit('prompt', null);
      }
      if (this.currentEquipKey !== equipment.definition.id) {
        this.currentEquipKey = equipment.definition.id;
        this.context.bus.emit('equip', this.equipPayload(equipment));
      }
      return;
    }
    if (this.currentEquipKey !== null) {
      this.currentEquipKey = null;
      this.context.bus.emit('equip', null);
    }

    const nearest = this.nearestInteractable();
    const text = nearest ? nearest.promptText() : null;
    if (text !== this.currentPrompt) {
      this.currentPrompt = text;
      this.context.bus.emit('prompt', text);
    }
  }

  /** Builds the compact comparison shown before equipping. */
  private equipPayload(pickup: Pickup): EquipPayload {
    const state = this.context.state;
    if (pickup.spec.category === 'armor') {
      const next = pickup.spec.armor ?? 0;
      const current = state.armorSpec;
      return {
        name: pickup.definition.name,
        kind: 'armor',
        stats: [
          {
            label: 'Armor',
            value: String(next),
            direction: next > state.maxArmor ? 'up' : next < state.maxArmor ? 'down' : 'same',
          },
        ],
        current: current
          ? `Current: ${current.name} — Armor ${state.maxArmor}`
          : 'Currently unarmored',
      };
    }
    const next = getWeapon(pickup.spec.id);
    const current = state.weapon;
    const comparison = compareWeapons(next, current);
    const direction = (value: string): 'up' | 'down' | 'same' =>
      value.startsWith('+') ? 'up' : value.startsWith('-') ? 'down' : 'same';
    const damage = deltaSymbol(comparison.damage);
    const range = deltaSymbol(comparison.range);
    const speed = deltaSymbol(comparison.speed);
    return {
      name: pickup.definition.name,
      kind: 'weapon',
      stats: [
        { label: 'Damage', value: damage, direction: direction(damage) },
        { label: 'Range', value: range, direction: direction(range) },
        { label: 'Speed', value: speed, direction: direction(speed) },
      ],
      current: `Current: ${current.name}`,
    };
  }

  private interact(): void {
    const equipment = this.nearestEquipment();
    if (equipment) {
      this.equip(equipment);
      return;
    }
    const target = this.nearestInteractable();
    if (!target) return;
    if (target.kind === 'npc') {
      this.context.openDialog((target as NpcObject).definition.lines);
      return;
    }
    const door = target as DoorObject;
    if (!door.canOpen()) {
      this.context.bus.emit('toast', { text: door.promptText(), kind: 'warn' });
      return;
    }
    this.leaveRoom(door.definition.target);
  }

  private equip(pickup: Pickup): void {
    const state = this.context.state;
    const spec = pickup.spec;
    if (spec.category === 'armor') {
      state.equipArmor(spec.id);
      this.player.setArmor(state.armorId);
    } else {
      state.equipWeapon(spec.id);
    }

    state.collectedItems.add(pickup.definition.id);
    this.burst(pickup.x, pickup.y, 0x63e0ff, 12);
    pickup.destroy();
    this.pickups = this.pickups.filter((entry) => entry.active);
    this.currentEquipKey = null;
    this.context.bus.emit('equip', null);
    this.context.bus.emit('toast', { text: `Equipped — ${pickup.definition.name}`, kind: 'quest' });
    for (const quest of this.context.quests.report({
      kind: 'item',
      item: pickup.definition.name.toLowerCase(),
    })) {
      this.context.bus.emit('toast', { text: `Quest complete — ${quest.text}`, kind: 'quest' });
    }
    this.context.publishHud();
  }

  private leaveRoom(targetRoom: string): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.context.bus.emit('prompt', null);
    this.context.bus.emit('equip', null);
    this.player.setVelocity(0, 0);
    this.cameras.main.fadeOut(TRANSITION_MS, 4, 6, 11);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.context.goToRoom(targetRoom, this.room.id);
    });
  }

  /* -------------------------------------------------------------- combat */

  private attack(time: number): void {
    const state = this.context.state;
    this.player.registerAttack(time, state.attackCooldownMs());
    const weapon = state.weapon;
    const facing = this.player.facing;
    const angle = Math.atan2(facing.y, facing.x);
    const range = state.attackRange();
    const arc = state.attackArcDegrees();
    const origin = { x: this.player.x, y: this.player.y };

    const reached = this.enemies.filter(
      (enemy) => enemy.active && inMeleeArc(origin, facing, { x: enemy.x, y: enemy.y }, range, arc),
    );
    const boss = this.boss;
    const bossInReach =
      boss?.active === true && inMeleeArc(origin, facing, { x: boss.x, y: boss.y }, range + 18, arc);

    // The overcharge is only spent on a swing that actually connects.
    const willHit = reached.length > 0 || bossInReach;
    const overcharged = willHit && state.consumeOvercharge();
    const damage = state.attackDamage({ overcharged });

    this.showSlash(angle, range, arc, weapon.accent, overcharged);

    for (const enemy of reached) {
      if (enemy.active) this.hitEnemy(enemy, damage);
    }

    if (boss?.active && bossInReach) {
      this.floatingNumber(boss.x, boss.y - 20, damage, overcharged ? '#ffd24d' : '#8dffb0');
      const died = boss.takeDamage(damage);
      this.context.bus.emit('boss', this.bossPayload(boss));
      if (died) this.killBoss(boss);
    }

    if (willHit) {
      const impact = weapon.impact;
      this.burst(
        this.player.x + Math.cos(angle) * 30,
        this.player.y + Math.sin(angle) * 30,
        overcharged ? 0xffd24d : weapon.accent,
        impact === 'heavy' ? 12 : impact === 'medium' ? 8 : 6,
      );
      if (!this.context.reducedMotion) {
        const strength = impact === 'heavy' ? 0.008 : impact === 'medium' ? 0.005 : 0.0035;
        this.cameras.main.shake(impact === 'heavy' ? 110 : 70, overcharged ? 0.012 : strength);
      }
      if (overcharged) {
        this.context.bus.emit('toast', { text: 'Overcharged strike!', kind: 'item' });
        this.context.publishHud();
      }
    }
  }

  private hitEnemy(enemy: Enemy, damage: number): void {
    this.floatingNumber(enemy.x, enemy.y, damage, enemy.elite ? '#ff9f1c' : '#ffd24d');
    const push = knockbackVelocity(
      { x: this.player.x, y: this.player.y },
      { x: enemy.x, y: enemy.y },
      this.context.state.knockback() * enemy.knockbackScale,
    );
    (enemy.body as Phaser.Physics.Arcade.Body | null)?.setVelocity(push.x, push.y);
    if (enemy.takeDamage(damage)) this.killEnemy(enemy);
  }

  /**
   * Weapon-specific swing art.
   *
   * Every shape is drawn from the *actual* range and arc used for the hit
   * test, so what you see is exactly what you hit - the spear really is long,
   * the axe really is wide.
   */
  private showSlash(
    angle: number,
    range: number,
    arcDegrees: number,
    color: number,
    overcharged: boolean,
  ): void {
    const weapon = this.context.state.weapon;
    const tint = overcharged ? 0xffd24d : color;
    const graphics = this.add.graphics().setDepth(22);
    const half = ((arcDegrees / 180) * Math.PI) / 2;
    const originX = this.player.x;
    const originY = this.player.y;

    if (weapon.id === 'stack-trace-spear') {
      // A thin forward thrust rather than a sweep.
      graphics.fillStyle(tint, 0.9);
      const width = 7;
      const nx = Math.cos(angle);
      const ny = Math.sin(angle);
      const px = -ny * width;
      const py = nx * width;
      graphics.beginPath();
      graphics.moveTo(originX + px * 0.5, originY + py * 0.5);
      graphics.lineTo(originX + nx * range, originY + ny * range);
      graphics.lineTo(originX - px * 0.5, originY - py * 0.5);
      graphics.closePath();
      graphics.fillPath();
      graphics.fillStyle(0xffffff, 0.8);
      graphics.fillRect(originX + nx * range - 2, originY + ny * range - 2, 4, 4);
    } else if (weapon.impact === 'heavy') {
      // Short, thick arc plus square shock fragments: weight over elegance.
      graphics.fillStyle(tint, 0.62);
      graphics.slice(originX, originY, range, angle - half, angle + half);
      graphics.fillPath();
      graphics.fillStyle(0xffffff, 0.4);
      graphics.slice(originX, originY, range * 0.62, angle - half * 0.8, angle + half * 0.8);
      graphics.fillPath();
      for (let index = 0; index < 5; index++) {
        const spread = angle - half + (half * 2 * index) / 4;
        const distance = range * (0.75 + (index % 2) * 0.2);
        graphics.fillStyle(tint, 0.9);
        graphics.fillRect(
          originX + Math.cos(spread) * distance - 3,
          originY + Math.sin(spread) * distance - 3,
          6,
          6,
        );
      }
    } else {
      // Crescent: a filled arc with a brighter inner sweep.
      graphics.fillStyle(tint, 0.62);
      graphics.slice(originX, originY, range, angle - half, angle + half);
      graphics.fillPath();
      graphics.fillStyle(0x000000, 0);
      graphics.fillStyle(tint, 0.35);
      graphics.slice(originX, originY, range * 0.55, angle - half, angle + half);
      graphics.fillPath();
    }

    if (weapon.id === 'root-access' || overcharged) {
      // Terminal fragments trailing the swing.
      for (let index = 0; index < 4; index++) {
        const spread = angle - half + (half * 2 * (index + 0.5)) / 4;
        const distance = range * 0.85;
        const chunk = this.add
          .image(
            originX + Math.cos(spread) * distance,
            originY + Math.sin(spread) * distance,
            'chunk',
          )
          .setTint(overcharged ? 0xffffff : 0xefe6ff)
          .setDepth(23);
        this.tweens.add({
          targets: chunk,
          x: chunk.x + Math.cos(spread) * 14,
          y: chunk.y + Math.sin(spread) * 14,
          alpha: 0,
          duration: 260,
          onComplete: () => chunk.destroy(),
        });
      }
    }

    this.tweens.add({
      targets: graphics,
      alpha: { from: overcharged ? 0.85 : 0.65, to: 0 },
      duration: PLAYER.attackDurationMs,
      onComplete: () => graphics.destroy(),
    });
  }

  private killEnemy(enemy: Enemy): void {
    this.context.state.defeatedEnemies.add(enemy.bodyId);
    this.burst(enemy.x, enemy.y, enemy.elite ? 0xff9f1c : 0xff6b52, enemy.elite ? 26 : 14);
    if (enemy.elite) {
      this.context.state.gold += ELITE.goldDrop;
      this.floatingNumber(enemy.x, enemy.y - 12, ELITE.goldDrop, '#f5b942');
    }
    enemy.destroy();
    this.enemies = this.enemies.filter((entry) => entry.active);
    this.reportRoomClearIfEmpty();
    this.context.publishHud();
  }

  private reportRoomClearIfEmpty(): void {
    if (this.enemies.some((enemy) => enemy.active)) return;
    const total = this.room.enemies.reduce((sum, group) => sum + group.count, 0);
    if (total === 0) return;
    for (const quest of this.context.quests.report({ kind: 'enemies', room: this.room.id })) {
      this.context.bus.emit('toast', { text: `Quest complete — ${quest.text}`, kind: 'quest' });
    }
  }

  private killBoss(boss: Boss): void {
    const definition = boss.definition;
    this.context.state.defeatedBosses.add(definition.id);
    this.burst(boss.x, boss.y, 0x8dffb0, 40);
    if (!this.context.reducedMotion) this.cameras.main.shake(420, 0.01);
    boss.destroy();
    this.boss = undefined;
    this.context.bus.emit('boss', null);

    for (const quest of this.context.quests.report({ kind: 'boss', boss: definition.id })) {
      this.context.bus.emit('toast', { text: `Quest complete — ${quest.text}`, kind: 'quest' });
    }
    this.context.publishHud();

    if (this.context.isFinalBoss(definition.id)) {
      this.transitioning = true;
      this.time.delayedCall(700, () => this.context.notifyVictory(definition.name));
    } else {
      this.context.bus.emit('toast', { text: `${definition.name} defeated`, kind: 'quest' });
    }
  }

  private onBossAction(action: BossAction): void {
    const boss = this.boss;
    if (!boss?.active) return;
    if (action === 'charge') {
      this.burst(boss.x, boss.y, 0xff5c4d, 10);
      return;
    }
    if (action === 'enrage') {
      this.context.bus.emit('toast', { text: 'It spawns more bugs!', kind: 'warn' });
      for (let index = 0; index < 2; index++) {
        this.enemies.push(
          new Enemy(this, boss.x + (index === 0 ? -60 : 60), boss.y + 40, {
            bodyId: `${this.room.id}:minion:${this.minionCount++}`,
            type: 'bug',
            health: BOSS.minionHealth,
            damage: 1,
            elite: false,
            healthExplicit: true,
            reducedMotion: this.context.reducedMotion,
          }),
        );
      }
      return;
    }
    // volley
    const base = Math.atan2(this.player.y - boss.y, this.player.x - boss.x);
    for (const offset of [-0.35, 0, 0.35]) {
      const shard = this.physics.add.sprite(boss.x, boss.y, 'shard').setDepth(19);
      shard.setScale(2.7);
      if (!this.context.reducedMotion) {
        this.tweens.add({ targets: shard, angle: 360, duration: 900, repeat: -1 });
      }
      const body = shard.body as Phaser.Physics.Arcade.Body | null;
      body?.setVelocity(
        Math.cos(base + offset) * BOSS.projectileSpeed,
        Math.sin(base + offset) * BOSS.projectileSpeed,
      );
      body?.setCircle(5);
      this.projectiles.push(shard);
      this.time.delayedCall(4000, () => this.destroyProjectile(shard));
    }
  }

  private destroyProjectile(shard: Phaser.Physics.Arcade.Sprite): void {
    if (!shard.active) return;
    this.burst(shard.x, shard.y, 0x9d7bff, 5);
    shard.destroy();
    this.projectiles = this.projectiles.filter((entry) => entry.active);
  }

  private damagePlayer(amount: number, sourceX: number, sourceY: number, enemy?: Enemy): void {
    if (this.dead || this.transitioning) return;
    if (enemy) {
      if (this.time.now < enemy.nextContactAt) return;
      enemy.nextContactAt = this.time.now + enemy.profile.contactCooldownMs;
    }
    if (this.player.isInvulnerable) return;

    const result = this.context.state.applyDamage(amount);
    this.player.grantInvulnerability(this.time.now);

    if (result.blocked) {
      this.burst(this.player.x, this.player.y, 0xcbd5e1, 14);
      this.context.bus.emit('toast', { text: 'Commit Shield held', kind: 'quest' });
      this.context.publishHud();
      return;
    }

    const push = knockbackVelocity(
      { x: sourceX, y: sourceY },
      { x: this.player.x, y: this.player.y },
      PLAYER.knockback,
    );
    (this.player.body as Phaser.Physics.Arcade.Body | null)?.setVelocity(push.x, push.y);
    const armorOnly = result.armorLost > 0 && result.healthLost === 0;
    this.burst(this.player.x, this.player.y, armorOnly ? 0x63e0ff : 0xff5c4d, 8);
    if (!this.context.reducedMotion) this.cameras.main.shake(130, 0.008);
    this.cameras.main.flash(120, armorOnly ? 30 : 90, 20, armorOnly ? 70 : 20);
    this.context.publishHud();

    if (result.revived) {
      this.player.grantInvulnerability(this.time.now + 700);
      this.burst(this.player.x, this.player.y, 0x7ee08a, 26);
      this.context.bus.emit('toast', { text: 'HOTFIX APPLIED', kind: 'quest' });
      this.context.publishHud();
      return;
    }
    if (result.died) this.playerDied();
  }

  private playerDied(): void {
    this.dead = true;
    this.player.setVelocity(0, 0);
    this.player.setActive(false);
    this.burst(this.player.x, this.player.y, 0x63e0ff, 20);
    this.tweens.add({ targets: this.player, alpha: 0, angle: 90, duration: 420 });
    this.physics.pause();
    this.context.bus.emit('prompt', null);
    this.context.bus.emit('equip', null);
    this.time.delayedCall(520, () => this.context.notifyDeath(this.room.title));
  }

  /* ------------------------------------------------------------- pickups */

  private collect(pickup: Pickup): void {
    if (!pickup.active) return;
    const item = pickup.definition;
    const result = this.context.state.collect(item, this.time.now);

    if (!result.consumed) {
      // Nothing would have been gained - leave it on the floor for later.
      this.context.notifyWasted(item.id, result.message);
      return;
    }

    this.context.state.collectedItems.add(item.id);
    this.burst(pickup.x, pickup.y, 0xf5b942, 10);
    pickup.destroy();
    this.pickups = this.pickups.filter((entry) => entry.active);

    this.context.bus.emit('toast', {
      text: result.message,
      kind: result.tone === 'good' ? 'item' : 'info',
    });
    for (const quest of this.context.quests.report({
      kind: 'item',
      item: item.name.toLowerCase(),
    })) {
      this.context.bus.emit('toast', { text: `Quest complete — ${quest.text}`, kind: 'quest' });
    }
    this.context.publishHud();
  }

  /* -------------------------------------------------------------- effects */

  private burst(x: number, y: number, color: number, count: number): void {
    if (this.context.reducedMotion) return;
    const emitter = this.add.particles(x, y, 'particle', {
      speed: { min: 40, max: 170 },
      lifespan: { min: 180, max: 420 },
      scale: { start: 0.9, end: 0 },
      quantity: count,
      tint: color,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    emitter.setDepth(25);
    emitter.explode(count, x, y);
    this.time.delayedCall(600, () => emitter.destroy());
  }

  private floatingNumber(x: number, y: number, amount: number, color: string): void {
    if (this.context.reducedMotion) return;
    const label = this.add
      .text(x, y - 18, String(amount), {
        fontFamily: 'ui-monospace, monospace',
        fontSize: '13px',
        color,
        stroke: '#05070c',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(30);
    this.tweens.add({
      targets: label,
      y: y - 46,
      alpha: 0,
      duration: 620,
      onComplete: () => label.destroy(),
    });
  }

  private bossPayload(boss: Boss): { name: string; health: number; maxHealth: number } {
    return {
      name: boss.definition.name,
      health: Math.max(0, boss.health),
      maxHealth: boss.maxHealth,
    };
  }
}
