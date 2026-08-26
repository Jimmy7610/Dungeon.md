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
    const palette = this.palette;
    const floor = this.add.graphics().setDepth(0);
    const decor = this.add.graphics().setDepth(1);
    const walls = this.add.graphics().setDepth(2);

    for (let row = 0; row < ROOM_ROWS; row++) {
      for (let col = 0; col < ROOM_COLS; col++) {
        const x = col * TILE;
        const y = row * TILE;
        if (this.layout.walls[row]?.[col]) continue;
        floor.fillStyle((col + row) % 2 === 0 ? palette.floor : palette.floorAlt, 1);
        floor.fillRect(x, y, TILE, TILE);
        if (rng.next() < 0.09) {
          floor.fillStyle(palette.detail, 1);
          const size = rng.int(2, 4);
          floor.fillRect(x + rng.int(4, 24), y + rng.int(4, 24), size, size);
        }
      }
    }

    // Grid lines keep the "developer tool" feel without fighting the art.
    floor.lineStyle(1, 0x000000, 0.1);
    for (let col = 1; col < ROOM_COLS; col++) {
      floor.lineBetween(col * TILE, 0, col * TILE, GAME_HEIGHT);
    }
    for (let row = 1; row < ROOM_ROWS; row++) {
      floor.lineBetween(0, row * TILE, GAME_WIDTH, row * TILE);
    }

    this.drawDecor(decor, rng);

    for (let row = 0; row < ROOM_ROWS; row++) {
      for (let col = 0; col < ROOM_COLS; col++) {
        if (!this.layout.walls[row]?.[col]) continue;
        const x = col * TILE;
        const y = row * TILE;
        walls.fillStyle(palette.wall, 1);
        walls.fillRect(x, y, TILE, TILE);
        if (this.layout.walls[row + 1]?.[col] === false) {
          walls.fillStyle(palette.wallTop, 1);
          walls.fillRect(x, y, TILE, 7);
          walls.fillStyle(palette.wallEdge, 1);
          walls.fillRect(x, y + TILE - 5, TILE, 5);
        }
      }
    }

    for (const rect of this.layout.wallRects) {
      const body = this.add
        .rectangle(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height)
        .setVisible(false);
      this.physics.add.existing(body, true);
      this.wallBodies.push(body);
    }
  }

  /**
   * Purely cosmetic dressing, drawn beneath every entity and seeded from the
   * room id so the same Markdown always paints the same room. It never touches
   * collision, doors or spawn points.
   */
  private drawDecor(decor: Phaser.GameObjects.Graphics, rng: Rng): void {
    const palette = this.palette;
    const tiles: { x: number; y: number }[] = [];
    for (let row = 1; row < ROOM_ROWS - 1; row++) {
      for (let col = 1; col < ROOM_COLS - 1; col++) {
        if (this.layout.walls[row]?.[col]) continue;
        tiles.push({ x: col * TILE, y: row * TILE });
      }
    }
    const picks = rng.shuffle([...tiles]).slice(0, Math.min(26, Math.floor(tiles.length * 0.16)));
    const accent = palette.accent;

    for (const tile of picks) {
      const x = tile.x + 4;
      const y = tile.y + 4;
      switch (palette.decor) {
        case 'code':
          decor.fillStyle(accent, 0.12);
          for (let line = 0; line < 3; line++) {
            decor.fillRect(x, y + line * 6, rng.int(6, 20), 2);
          }
          break;
        case 'cables':
          decor.lineStyle(2, accent, 0.14);
          decor.beginPath();
          decor.moveTo(x, y + 12);
          decor.lineTo(x + 10, y + 4);
          decor.lineTo(x + 20, y + 18);
          decor.strokePath();
          break;
        case 'blocks':
          decor.lineStyle(1, accent, 0.18);
          decor.strokeRect(x, y, 16, 12);
          decor.strokeRect(x + 4, y + 8, 12, 10);
          break;
        case 'glitch':
          decor.fillStyle(accent, 0.14);
          decor.fillRect(x, y + rng.int(0, 10), rng.int(8, 22), 3);
          decor.fillStyle(0xff5c4d, 0.08);
          decor.fillRect(x + 2, y + rng.int(4, 16), rng.int(6, 14), 2);
          break;
        case 'nodes':
          decor.fillStyle(accent, 0.2);
          decor.fillCircle(x + 4, y + 6, 2.5);
          decor.fillCircle(x + 18, y + 16, 2.5);
          decor.lineStyle(1, accent, 0.12);
          decor.lineBetween(x + 4, y + 6, x + 18, y + 16);
          break;
        case 'debris':
          decor.fillStyle(accent, 0.1);
          decor.fillRect(x, y + 10, rng.int(8, 16), rng.int(4, 8));
          decor.fillRect(x + 12, y + 2, 6, 6);
          break;
        case 'split':
          decor.fillStyle(tile.x < GAME_WIDTH / 2 ? 0x63e0ff : accent, 0.1);
          decor.fillRect(x, y, 18, 3);
          decor.fillRect(x, y + 10, 12, 3);
          break;
        case 'lines':
          decor.fillStyle(accent, 0.12);
          decor.fillRect(tile.x, y + 8, TILE, 2);
          decor.fillStyle(accent, 0.35);
          decor.fillCircle(x + 20, y + 9, 2);
          break;
        case 'leak':
          decor.fillStyle(accent, 0.1);
          decor.fillCircle(x + 10, y + 10, rng.int(5, 11));
          decor.fillStyle(accent, 0.16);
          decor.fillCircle(x + 6, y + 6, 2);
          break;
        case 'rust':
          decor.fillStyle(accent, 0.12);
          for (let dot = 0; dot < 5; dot++) {
            decor.fillRect(x + rng.int(0, 20), y + rng.int(0, 20), 2, 2);
          }
          break;
        case 'clean':
          decor.lineStyle(1, accent, 0.16);
          decor.lineBetween(x + 8, y + 2, x + 8, y + 14);
          decor.lineBetween(x + 2, y + 8, x + 14, y + 8);
          break;
        case 'shelves':
          decor.fillStyle(accent, 0.1);
          decor.fillRect(x, y, 4, 20);
          decor.fillRect(x + 6, y + 3, 4, 17);
          decor.fillRect(x + 12, y + 1, 4, 19);
          break;
        case 'runes':
          decor.lineStyle(1, accent, 0.2);
          decor.strokeRect(x + 2, y + 2, 6, 16);
          decor.strokeRect(x + 14, y + 2, 6, 16);
          break;
        case 'treasure':
          decor.fillStyle(accent, 0.22);
          decor.fillCircle(x + 8, y + 12, 3);
          decor.fillCircle(x + 14, y + 15, 2);
          decor.fillStyle(0xffffff, 0.25);
          decor.fillRect(x + 7, y + 4, 2, 2);
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
    this.input.on(Phaser.Input.Events.POINTER_DOWN, () => {
      this.pointerAttack = true;
    });
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
    if (spec.category === 'armor') state.equipArmor(spec.id);
    else state.equipWeapon(spec.id);

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

  private showSlash(
    angle: number,
    range: number,
    arcDegrees: number,
    color: number,
    overcharged: boolean,
  ): void {
    const slash = this.add.graphics().setDepth(22);
    slash.fillStyle(overcharged ? 0xffd24d : color, 0.85);
    const half = ((arcDegrees / 180) * Math.PI) / 2;
    slash.slice(this.player.x, this.player.y, range, angle - half, angle + half);
    slash.fillPath();
    this.tweens.add({
      targets: slash,
      alpha: { from: overcharged ? 0.8 : 0.55, to: 0 },
      duration: PLAYER.attackDurationMs,
      onComplete: () => slash.destroy(),
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
      shard.setScale(1.6);
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
