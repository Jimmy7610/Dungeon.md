import Phaser from 'phaser';
import { createRng } from '../../core/rng.ts';
import { findRoom, type RoomDefinition } from '../../markdown/types.ts';
import {
  BOSS,
  COLORS,
  GAME_HEIGHT,
  GAME_WIDTH,
  NARRATION_MS,
  PLAYER,
  ROOM_COLS,
  ROOM_ROWS,
  TILE,
  TRANSITION_MS,
} from '../config.ts';
import { Boss, type BossAction } from '../entities/Boss.ts';
import { Enemy } from '../entities/Enemy.ts';
import { DoorObject, NpcObject, type Interactable } from '../entities/Interactable.ts';
import { Pickup } from '../entities/Pickup.ts';
import { buildRoomLayout, type RoomLayout } from '../generation/RoomBuilder.ts';
import type { SceneContext } from '../events.ts';
import { applyKnockback, inMeleeArc, playerAttackDamage } from '../systems/CombatSystem.ts';
import { Player, type InputState } from '../entities/Player.ts';

export interface DungeonSceneData {
  roomId: string;
  fromRoom?: string;
}

type Keys = Record<'up' | 'down' | 'left' | 'right' | 'attack' | 'interact', Phaser.Input.Keyboard.Key>;

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
    this.context.bus.emit('boss', this.boss ? this.bossPayload(this.boss) : null);
    this.context.bus.emit('narration', {
      title: room.title,
      lines: room.narration.slice(0, 3),
    });
    this.time.delayedCall(NARRATION_MS, () => {
      this.context.bus.emit('narration', { title: '', lines: [] });
    });

    this.cameras.main.fadeIn(TRANSITION_MS, 4, 6, 11);
  }

  /* ------------------------------------------------------------- building */

  private drawRoom(): void {
    const rng = createRng(`${this.room.id}:decor`);
    const floor = this.add.graphics().setDepth(0);
    const walls = this.add.graphics().setDepth(2);

    for (let row = 0; row < ROOM_ROWS; row++) {
      for (let col = 0; col < ROOM_COLS; col++) {
        const x = col * TILE;
        const y = row * TILE;
        if (this.layout.walls[row]?.[col]) continue;
        floor.fillStyle((col + row) % 2 === 0 ? COLORS.floor : COLORS.floorAlt, 1);
        floor.fillRect(x, y, TILE, TILE);
        if (rng.next() < 0.09) {
          floor.fillStyle(COLORS.floorDetail, 1);
          const size = rng.int(2, 4);
          floor.fillRect(x + rng.int(4, 24), y + rng.int(4, 24), size, size);
        }
      }
    }

    // Grid lines keep the "developer tool" feel without fighting the art.
    floor.lineStyle(1, 0x000000, 0.10);
    for (let col = 1; col < ROOM_COLS; col++) {
      floor.lineBetween(col * TILE, 0, col * TILE, GAME_HEIGHT);
    }
    for (let row = 1; row < ROOM_ROWS; row++) {
      floor.lineBetween(0, row * TILE, GAME_WIDTH, row * TILE);
    }

    for (let row = 0; row < ROOM_ROWS; row++) {
      for (let col = 0; col < ROOM_COLS; col++) {
        if (!this.layout.walls[row]?.[col]) continue;
        const x = col * TILE;
        const y = row * TILE;
        walls.fillStyle(COLORS.wall, 1);
        walls.fillRect(x, y, TILE, TILE);
        const exposed = this.layout.walls[row + 1]?.[col] === false;
        if (exposed) {
          walls.fillStyle(COLORS.wallTop, 1);
          walls.fillRect(x, y, TILE, 7);
          walls.fillStyle(COLORS.wallEdge, 1);
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

  private addLighting(): void {
    this.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'vignette')
      .setDepth(40)
      .setBlendMode(Phaser.BlendModes.NORMAL);

    for (const torch of this.layout.torches) {
      const glow = this.add
        .ellipse(torch.x, torch.y, 96, 96, 0xffb45c, 0.06)
        .setDepth(1);
      if (!this.context.reducedMotion) {
        this.tweens.add({
          targets: glow,
          alpha: { from: 0.04, to: 0.1 },
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
      this.interactables.push(new NpcObject(this, point.x, point.y, npc, this.context.reducedMotion));
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
    this.boss = new Boss(
      this,
      point.x,
      point.y,
      definition,
      this.context.reducedMotion,
      (action) => this.onBossAction(action),
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
      this.collect(pickupObject as Pickup);
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
    this.player.drive(input, delta);

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

  private updatePrompt(): void {
    const nearest = this.nearestInteractable();
    const text = nearest ? nearest.promptText() : null;
    if (text !== this.currentPrompt) {
      this.currentPrompt = text;
      this.context.bus.emit('prompt', text);
    }
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

  private interact(): void {
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

  private leaveRoom(targetRoom: string): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.context.bus.emit('prompt', null);
    this.player.setVelocity(0, 0);
    this.cameras.main.fadeOut(TRANSITION_MS, 4, 6, 11);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.context.goToRoom(targetRoom, this.room.id);
    });
  }

  /* -------------------------------------------------------------- combat */

  private attack(time: number): void {
    this.player.registerAttack(time);
    const damage = playerAttackDamage(this.context.state, time);
    const facing = this.player.facing;
    const angle = Math.atan2(facing.y, facing.x);

    this.showSlash(angle);

    let hitSomething = false;
    for (const enemy of [...this.enemies]) {
      if (!enemy.active) continue;
      if (
        !inMeleeArc(
          this.player.x,
          this.player.y,
          facing,
          enemy.x,
          enemy.y,
          PLAYER.attackRange,
          PLAYER.attackArcDegrees,
        )
      ) {
        continue;
      }
      hitSomething = true;
      this.floatingNumber(enemy.x, enemy.y, damage, '#ffd24d');
      applyKnockback(
        enemy.body as Phaser.Physics.Arcade.Body,
        this.player.x,
        this.player.y,
        enemy.x,
        enemy.y,
        PLAYER.knockback,
      );
      if (enemy.takeDamage(damage)) this.killEnemy(enemy);
    }

    const boss = this.boss;
    if (
      boss?.active &&
      inMeleeArc(
        this.player.x,
        this.player.y,
        facing,
        boss.x,
        boss.y,
        PLAYER.attackRange + 18,
        PLAYER.attackArcDegrees,
      )
    ) {
      hitSomething = true;
      this.floatingNumber(boss.x, boss.y - 20, damage, '#8dffb0');
      const died = boss.takeDamage(damage);
      this.context.bus.emit('boss', this.bossPayload(boss));
      if (died) this.killBoss(boss);
    }

    if (hitSomething) {
      this.burst(this.player.x + Math.cos(angle) * 30, this.player.y + Math.sin(angle) * 30, 0xffd24d, 6);
      if (!this.context.reducedMotion) this.cameras.main.shake(70, 0.0035);
    }
  }

  private showSlash(angle: number): void {
    const slash = this.add.graphics().setDepth(22);
    slash.fillStyle(0xffffff, 0.85);
    slash.slice(
      this.player.x,
      this.player.y,
      PLAYER.attackRange,
      angle - Phaser.Math.DegToRad(PLAYER.attackArcDegrees) / 2,
      angle + Phaser.Math.DegToRad(PLAYER.attackArcDegrees) / 2,
    );
    slash.fillPath();
    this.tweens.add({
      targets: slash,
      alpha: { from: 0.55, to: 0 },
      duration: PLAYER.attackDurationMs,
      onComplete: () => slash.destroy(),
    });
  }

  private killEnemy(enemy: Enemy): void {
    this.context.state.defeatedEnemies.add(enemy.bodyId);
    this.burst(enemy.x, enemy.y, 0xff6b52, 14);
    enemy.destroy();
    this.enemies = this.enemies.filter((entry) => entry.active);
    this.reportRoomClearIfEmpty();
    this.context.publishHud();
  }

  private reportRoomClearIfEmpty(): void {
    const alive = this.enemies.some((enemy) => enemy.active);
    if (alive) return;
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
        const enemy = new Enemy(
          this,
          boss.x + (index === 0 ? -60 : 60),
          boss.y + 40,
          {
            bodyId: `${this.room.id}:minion:${this.minionCount++}`,
            type: 'bug',
            health: BOSS.minionHealth,
            damage: 1,
          },
        );
        this.enemies.push(enemy);
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

    const state = this.context.state;
    state.health = Math.max(0, state.health - Math.max(1, amount));
    this.player.grantInvulnerability(this.time.now);
    applyKnockback(
      this.player.body as Phaser.Physics.Arcade.Body,
      sourceX,
      sourceY,
      this.player.x,
      this.player.y,
      PLAYER.knockback,
    );
    this.burst(this.player.x, this.player.y, 0xff5c4d, 8);
    if (!this.context.reducedMotion) this.cameras.main.shake(130, 0.008);
    this.cameras.main.flash(120, 90, 20, 20);
    this.context.publishHud();

    if (state.health <= 0) this.playerDied();
  }

  private playerDied(): void {
    this.dead = true;
    this.player.setVelocity(0, 0);
    this.player.setActive(false);
    this.burst(this.player.x, this.player.y, 0x63e0ff, 20);
    this.tweens.add({
      targets: this.player,
      alpha: 0,
      angle: 90,
      duration: 420,
    });
    this.physics.pause();
    this.context.bus.emit('prompt', null);
    this.time.delayedCall(520, () => this.context.notifyDeath(this.room.title));
  }

  /* ------------------------------------------------------------- pickups */

  private collect(pickup: Pickup): void {
    if (!pickup.active) return;
    const item = pickup.definition;
    const result = this.context.state.collect(item, this.time.now);
    this.burst(pickup.x, pickup.y, 0xf5b942, 10);
    pickup.destroy();
    this.pickups = this.pickups.filter((entry) => entry.active);

    this.context.bus.emit('toast', { text: result.message, kind: 'item' });
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
