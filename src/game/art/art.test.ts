import { describe, expect, it } from 'vitest';
import { SPRITES } from './registry.ts';
import { ARMOR_TEXTURES, IDLE_CYCLE, WALK_CYCLE } from './player.ts';
import { BOSS_STATE_TEXTURES } from './bosses.ts';
import { ENEMY_PROFILES, itemTexture, THEME_PALETTES, themePalette } from '../config.ts';
import { ENEMY_TYPES, type EnemyType } from '../../markdown/types.ts';
import { ROOM_THEMES } from '../../markdown/themes.ts';
import { allItemSpecs } from '../../markdown/items.ts';
import { parseMarkdown } from '../../markdown/parser.ts';
import { DEVELOPER_DUNGEON } from '../../demo/developerDungeon.ts';

const keys = new Set(SPRITES.map((sprite) => sprite.key));

describe('sprite registry', () => {
  it('has unique keys', () => {
    expect(keys.size).toBe(SPRITES.length);
  });

  it('every sprite is a well-formed pixel grid', () => {
    for (const sprite of SPRITES) {
      expect(sprite.pixels.length, sprite.key).toBeGreaterThan(0);
      const width = sprite.width ?? sprite.pixels[0]!.length;
      expect(width, sprite.key).toBeGreaterThan(0);
      for (const row of sprite.pixels) {
        // Rows are padded at draw time, but nothing should be *longer* than
        // the declared width or pixels would be silently dropped.
        expect(row.length, `${sprite.key}: "${row}"`).toBeLessThanOrEqual(width);
        expect(/^[0-9a-f. ]*$/.test(row), `${sprite.key}: "${row}"`).toBe(true);
      }
    }
  });

  it('every pixel index exists in its palette', () => {
    for (const sprite of SPRITES) {
      for (const row of sprite.pixels) {
        for (const char of row) {
          if (char === '.' || char === ' ') continue;
          const index = Number.parseInt(char, 16);
          expect(sprite.palette[index], `${sprite.key} index ${char}`).toBeTruthy();
        }
      }
    }
  });

  it('every palette entry is a hex colour', () => {
    for (const sprite of SPRITES) {
      for (const color of sprite.palette) {
        expect(/^#[0-9a-fA-F]{6}$/.test(color), `${sprite.key}: ${color}`).toBe(true);
      }
    }
  });

  it('draws the player and enemies at the documented sizes', () => {
    const player = SPRITES.find((sprite) => sprite.key === 'player-idle');
    expect(player?.width).toBe(16);
    expect(player?.pixels).toHaveLength(16);
    const bug = SPRITES.find((sprite) => sprite.key === 'enemy-bug');
    expect(bug?.width).toBe(16);
    const boss = SPRITES.find((sprite) => sprite.key === 'boss-legacy-code');
    expect(boss?.width).toBe(40);
    expect(boss?.pixels).toHaveLength(40);
  });
});

describe('texture coverage', () => {
  it('every enemy type has both animation frames', () => {
    for (const type of ENEMY_TYPES) {
      const profile = ENEMY_PROFILES[type as EnemyType];
      expect(keys.has(profile.texture), `${type} idle`).toBe(true);
      expect(keys.has(`${profile.texture}-b`), `${type} frame b`).toBe(true);
    }
  });

  it('every player animation frame exists', () => {
    for (const frame of [...WALK_CYCLE, ...IDLE_CYCLE]) {
      expect(keys.has(frame), frame).toBe(true);
    }
  });

  it('every armour tier has an overlay texture', () => {
    for (const [specId, texture] of Object.entries(ARMOR_TEXTURES)) {
      expect(keys.has(texture), `${specId} -> ${texture}`).toBe(true);
    }
    const armorSpecs = allItemSpecs().filter((spec) => spec.category === 'armor');
    for (const spec of armorSpecs) {
      expect(ARMOR_TEXTURES[spec.id], spec.id).toBeTruthy();
    }
  });

  it('every boss state resolves to a real texture', () => {
    for (const [type, states] of Object.entries(BOSS_STATE_TEXTURES)) {
      for (const [state, key] of Object.entries(states)) {
        expect(keys.has(key), `${type}.${state} -> ${key}`).toBe(true);
      }
    }
  });

  it('every registry item resolves to a real texture', () => {
    for (const spec of allItemSpecs()) {
      const texture = itemTexture(spec.id, spec.category);
      expect(keys.has(texture), `${spec.id} -> ${texture}`).toBe(true);
    }
  });

  it('every item in the built-in campaign resolves to a real texture', () => {
    const game = parseMarkdown(DEVELOPER_DUNGEON);
    for (const room of game.rooms) {
      for (const item of room.items) {
        const texture = itemTexture(item.specId, item.category);
        expect(keys.has(texture), `${item.name} -> ${texture}`).toBe(true);
      }
    }
  });

  it('unknown items and enemies still resolve to a real texture', () => {
    expect(keys.has(itemTexture('not-a-real-item', 'generic'))).toBe(true);
    expect(keys.has(itemTexture('not-a-real-item', 'not-a-category'))).toBe(true);
    expect(keys.has(ENEMY_PROFILES.generic.texture)).toBe(true);
  });
});

describe('room themes', () => {
  it('every theme has a complete visual configuration', () => {
    for (const theme of ROOM_THEMES) {
      const palette = themePalette(theme);
      expect(palette, theme).toBeTruthy();
      for (const channel of ['floor', 'floorAlt', 'detail', 'wall', 'wallTop', 'wallEdge', 'accent', 'glow'] as const) {
        expect(typeof palette[channel], `${theme}.${channel}`).toBe('number');
        expect(palette[channel]).toBeGreaterThanOrEqual(0);
        expect(palette[channel]).toBeLessThanOrEqual(0xffffff);
      }
      expect(palette.glowAlpha).toBeGreaterThan(0);
      expect(palette.glowAlpha).toBeLessThan(1);
      expect(palette.decor.length).toBeGreaterThan(0);
    }
  });

  it('covers every declared theme and nothing else', () => {
    expect(Object.keys(THEME_PALETTES).sort()).toEqual([...ROOM_THEMES].sort());
  });

  it('falls back to a valid palette for an unknown theme', () => {
    // @ts-expect-error - runtime robustness against a theme that slipped through
    const fallback = themePalette('not-a-theme');
    expect(fallback).toBeTruthy();
    expect(typeof fallback.floor).toBe('number');
    expect(fallback.decor.length).toBeGreaterThan(0);
  });

  it('gives the campaign visual variety rather than one repeated look', () => {
    const game = parseMarkdown(DEVELOPER_DUNGEON);
    const decors = new Set(game.rooms.map((room) => themePalette(room.theme).decor));
    expect(decors.size).toBeGreaterThanOrEqual(10);
  });
});
