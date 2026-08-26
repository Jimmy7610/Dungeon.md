import { describe, expect, it } from 'vitest';
import { DEVELOPER_DUNGEON } from './developerDungeon.ts';
import { finalBossId, parseMarkdown } from '../markdown/parser.ts';
import { classifyItem } from '../markdown/items.ts';
import { ROOM_THEMES } from '../markdown/themes.ts';
import { roomEnemyCount, type RoomDefinition } from '../markdown/types.ts';
import { getWeapon } from '../game/items/weapons.ts';

const game = parseMarkdown(DEVELOPER_DUNGEON);
const byId = new Map(game.rooms.map((room) => [room.id, room]));

const MAIN_ROOMS = [
  'the-repository',
  'bug-basement',
  'cache-corridor',
  'null-hall',
  'dependency-hell',
  'package-graveyard',
  'merge-chamber',
  'ci-gauntlet',
  'firewall-gate',
  'memory-leak',
  'deprecated-wing',
  'refactor-lab',
  'legacy-archive',
  'legacy-vault',
];

const SECRET_ROOMS = ['404-room', 'stash-overflow', 'root-cellar'];

/** Rooms reachable from the start by walking through non-hidden doors only. */
function reachable(startId: string, options: { includeHidden: boolean }): Set<string> {
  const seen = new Set<string>();
  const queue = [startId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const room = byId.get(id);
    if (!room) continue;
    for (const door of room.doors) {
      if (door.broken) continue;
      if (door.hidden && !options.includeHidden) continue;
      queue.push(door.target);
    }
  }
  return seen;
}

describe('the built-in campaign', () => {
  it('parses with no warnings', () => {
    expect(game.warnings).toEqual([]);
  });

  it('has 17 rooms: 14 main and 3 secret', () => {
    expect(game.rooms).toHaveLength(17);
    expect(MAIN_ROOMS).toHaveLength(14);
    expect(SECRET_ROOMS).toHaveLength(3);
    const ids = game.rooms.map((room) => room.id);
    for (const id of [...MAIN_ROOMS, ...SECRET_ROOMS]) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(17);
  });

  it('keeps the main rooms in campaign order', () => {
    const mainInOrder = game.rooms
      .map((room) => room.id)
      .filter((id) => MAIN_ROOMS.includes(id));
    expect(mainInOrder).toEqual(MAIN_ROOMS);
  });

  it('points every door at a room that exists', () => {
    for (const room of game.rooms) {
      for (const door of room.doors) {
        expect(door.broken, `${room.id} -> ${door.target}`).toBe(false);
        expect(byId.has(door.target)).toBe(true);
      }
    }
  });

  it('declares only known themes, and gives every room its own', () => {
    for (const room of game.rooms) {
      expect(ROOM_THEMES).toContain(room.theme);
    }
    for (const id of SECRET_ROOMS) {
      expect(byId.get(id)?.theme).toBe('secret');
    }
    expect(byId.get('firewall-gate')?.theme).toBe('firewall');
    expect(byId.get('legacy-vault')?.theme).toBe('vault');
    // The main path should not be visually repetitive.
    const mainThemes = MAIN_ROOMS.map((id) => byId.get(id)?.theme);
    expect(new Set(mainThemes).size).toBe(14);
  });

  it('reaches every main room through ordinary doors', () => {
    const walked = reachable('the-repository', { includeHidden: false });
    for (const id of MAIN_ROOMS) {
      expect(walked.has(id), `${id} unreachable`).toBe(true);
    }
  });

  it('hides every secret room behind a hidden door', () => {
    const walked = reachable('the-repository', { includeHidden: false });
    for (const id of SECRET_ROOMS) {
      expect(walked.has(id), `${id} should be secret`).toBe(false);
    }
    const withSecrets = reachable('the-repository', { includeHidden: true });
    for (const id of SECRET_ROOMS) {
      expect(withSecrets.has(id), `${id} undiscoverable`).toBe(true);
    }
  });

  it('gives every secret room a way back', () => {
    const returns: Record<string, string> = {
      '404-room': 'null-hall',
      'stash-overflow': 'package-graveyard',
      'root-cellar': 'legacy-archive',
    };
    for (const [secret, home] of Object.entries(returns)) {
      const room = byId.get(secret);
      expect(room, secret).toBeDefined();
      const back = room?.doors.find((door) => door.target === home);
      expect(back, `${secret} has no route back to ${home}`).toBeDefined();
      expect(back?.hidden).toBe(false);
    }
  });

  it('locks the Legacy Vault behind the Git Key, which the campaign contains', () => {
    const locked = game.rooms
      .flatMap((room) => room.doors)
      .filter((door) => door.requires !== undefined);
    expect(locked).toHaveLength(1);
    expect(locked[0]).toMatchObject({ target: 'legacy-vault', requires: 'Git Key' });
    const keyRoom = byId.get('bug-basement');
    expect(keyRoom?.items.some((item) => item.specId === 'git-key')).toBe(true);
  });

  it('ends on exactly one boss, in the Legacy Vault', () => {
    const bosses = game.rooms.filter((room) => room.boss);
    expect(bosses).toHaveLength(1);
    expect(bosses[0]?.id).toBe('legacy-vault');
    expect(finalBossId(game)).toBe('legacy-vault:boss');
    expect(byId.get('legacy-vault')?.boss).toMatchObject({
      type: 'legacy-code',
      name: 'LEGACY CODE',
      damage: 2,
    });
    const health = byId.get('legacy-vault')?.boss?.health ?? 0;
    expect(health).toBeGreaterThanOrEqual(400);
    expect(health).toBeLessThanOrEqual(500);
  });

  it('resolves every item to a real registry entry', () => {
    for (const room of game.rooms) {
      for (const item of room.items) {
        const spec = classifyItem(item.name);
        expect(spec.id, `${item.name} in ${room.id}`).toBe(item.specId);
        expect(spec.id).not.toBe('generic');
      }
    }
  });

  it('places the six weapons in ascending order of power', () => {
    const order: string[] = [];
    for (const room of game.rooms) {
      for (const item of room.items) {
        if (item.category === 'weapon') order.push(item.specId);
      }
    }
    expect(order).toEqual([
      'debugger',
      'refactor-blade',
      'stack-trace-spear',
      'dependency-hammer',
      'merge-axe',
      'root-access',
    ]);
    for (let index = 1; index < order.length; index++) {
      expect(getWeapon(order[index]!).damage).toBeGreaterThan(getWeapon(order[index - 1]!).damage);
    }
  });

  it('places the four armours in ascending order of protection', () => {
    const order = game.rooms
      .flatMap((room) => room.items)
      .filter((item) => item.category === 'armor')
      .map((item) => item.specId);
    expect(order).toEqual(['cache-jacket', 'firewall-vest', 'kernel-plate', 'root-armor']);
  });

  it('keeps the legendary secret loot off the mandatory path', () => {
    const mandatory = new Set(MAIN_ROOMS);
    for (const room of game.rooms) {
      if (!mandatory.has(room.id)) continue;
      for (const item of room.items) {
        expect(['root-access', 'root-armor', 'sudo'], `${item.name} in ${room.id}`).not.toContain(
          item.specId,
        );
      }
    }
    const cellar = byId.get('root-cellar');
    const cellarItems = cellar?.items.map((item) => item.specId) ?? [];
    expect(cellarItems).toContain('root-access');
    expect(cellarItems).toContain('root-armor');
    expect(cellarItems).toContain('sudo');
  });

  it('offers the recovery the mandatory path needs', () => {
    const mandatoryItems = MAIN_ROOMS.flatMap((id) => byId.get(id)?.items ?? []).map(
      (item) => item.specId,
    );
    expect(mandatoryItems.filter((id) => id === 'heart-upgrade')).toHaveLength(3);
    expect(mandatoryItems).toContain('full-restore');
    expect(mandatoryItems.filter((id) => id === 'patch-kit').length).toBeGreaterThanOrEqual(4);
  });

  it('escalates enemy pressure across the campaign', () => {
    const load = (room: RoomDefinition): number =>
      room.enemies.reduce((sum, group) => sum + group.count * group.health, 0);
    const early = MAIN_ROOMS.slice(1, 4).map((id) => load(byId.get(id)!));
    const late = MAIN_ROOMS.slice(9, 13).map((id) => load(byId.get(id)!));
    expect(Math.max(...early)).toBeLessThan(Math.min(...late));
  });

  it('introduces elites only after the opening rooms', () => {
    const eliteRooms = game.rooms
      .filter((room) => room.enemies.some((group) => group.elite))
      .map((room) => room.id);
    expect(eliteRooms.length).toBeGreaterThanOrEqual(6);
    for (const id of ['the-repository', 'bug-basement', 'cache-corridor']) {
      expect(eliteRooms).not.toContain(id);
    }
    expect(eliteRooms).toContain('null-hall');
    // The pre-boss room is the toughest, with two elites.
    const archive = byId.get('legacy-archive');
    expect(archive?.enemies.filter((group) => group.elite)).toHaveLength(2);
  });

  it('starts the player unarmed but hands them a weapon immediately', () => {
    const first = byId.get('the-repository');
    expect(first?.items.some((item) => item.specId === 'debugger')).toBe(true);
    expect(roomEnemyCount(first!)).toBe(0);
  });

  it('resolves every quest to an achievable trigger', () => {
    const quests = game.rooms.flatMap((room) => room.quests);
    expect(quests.length).toBeGreaterThan(0);
    for (const quest of quests) {
      expect(quest.trigger.kind, quest.text).not.toBe('manual');
    }
  });

  it('is deterministic', () => {
    const again = parseMarkdown(DEVELOPER_DUNGEON);
    expect(again.rooms.map((room) => room.id)).toEqual(game.rooms.map((room) => room.id));
    expect(again.rooms.map((room) => room.theme)).toEqual(game.rooms.map((room) => room.theme));
  });
});
