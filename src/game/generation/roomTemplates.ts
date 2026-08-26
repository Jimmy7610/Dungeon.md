import { ROOM_COLS, ROOM_ROWS } from '../config.ts';

/**
 * Hand-authored room shapes. `#` is wall, `.` is floor.
 *
 * Templates are normalised on load: rows are padded/truncated to the room size
 * and the outer border is always forced to wall, so a typo in the art can never
 * produce a room the player can walk out of.
 */
export interface RoomTemplate {
  name: string;
  rows: string[];
}

const INTERIOR_WIDTH = ROOM_COLS - 2;
const OPEN = '.'.repeat(INTERIOR_WIDTH);

/** An interior row with `thickness` wall tiles on each side. */
const inset = (thickness: number): string =>
  '#'.repeat(thickness) + '.'.repeat(Math.max(0, INTERIOR_WIDTH - thickness * 2)) + '#'.repeat(thickness);
const PILLAR_ROW = '..##...##...##...##....';
const CORNER_ROW = '#######.........#######';
const DIVIDER_ROW = '...........#...........';

function room(name: string, interior: string[]): RoomTemplate {
  const border = '#'.repeat(ROOM_COLS);
  const rows = [border, ...interior.map((row) => `#${row}#`), border];
  return { name, rows };
}

const SQUARE = room(
  'square',
  Array.from({ length: ROOM_ROWS - 2 }, () => OPEN),
);

const PILLARS = room('pillars', [
  OPEN,
  OPEN,
  PILLAR_ROW,
  PILLAR_ROW,
  OPEN,
  OPEN,
  PILLAR_ROW,
  PILLAR_ROW,
  OPEN,
  OPEN,
  PILLAR_ROW,
  PILLAR_ROW,
  OPEN,
  OPEN,
  OPEN,
]);

const CROSS = room('cross', [
  CORNER_ROW,
  CORNER_ROW,
  CORNER_ROW,
  CORNER_ROW,
  OPEN,
  OPEN,
  OPEN,
  OPEN,
  OPEN,
  OPEN,
  OPEN,
  CORNER_ROW,
  CORNER_ROW,
  CORNER_ROW,
  CORNER_ROW,
]);

const ARENA = room('arena', [
  inset(4),
  inset(2),
  inset(1),
  OPEN,
  OPEN,
  OPEN,
  OPEN,
  OPEN,
  OPEN,
  OPEN,
  OPEN,
  OPEN,
  inset(1),
  inset(2),
  inset(4),
]);

const NARROW = room('narrow', [
  DIVIDER_ROW,
  DIVIDER_ROW,
  DIVIDER_ROW,
  DIVIDER_ROW,
  DIVIDER_ROW,
  DIVIDER_ROW,
  OPEN,
  OPEN,
  OPEN,
  DIVIDER_ROW,
  DIVIDER_ROW,
  DIVIDER_ROW,
  DIVIDER_ROW,
  DIVIDER_ROW,
  DIVIDER_ROW,
]);

const ALCOVES = room('alcoves', [
  OPEN,
  '..###.........###......',
  '..###.........###......',
  OPEN,
  OPEN,
  OPEN,
  '......###...###........',
  '......###...###........',
  OPEN,
  OPEN,
  OPEN,
  '..###.........###......',
  '..###.........###......',
  OPEN,
  OPEN,
]);

/** Selection order is stable; layouts are chosen by hashing the room id. */
export const ROOM_TEMPLATES: readonly RoomTemplate[] = [
  SQUARE,
  PILLARS,
  CROSS,
  ALCOVES,
  NARROW,
  ARENA,
];

/** Boss rooms always use the open arena so the fight has space. */
export const BOSS_TEMPLATE = ARENA;

/** Pad/trim to the room size and force a solid border. */
export function normalizeTemplate(template: RoomTemplate): boolean[][] {
  const walls: boolean[][] = [];
  for (let row = 0; row < ROOM_ROWS; row++) {
    const source = (template.rows[row] ?? '').padEnd(ROOM_COLS, '.').slice(0, ROOM_COLS);
    const line: boolean[] = [];
    for (let col = 0; col < ROOM_COLS; col++) {
      const isBorder = row === 0 || col === 0 || row === ROOM_ROWS - 1 || col === ROOM_COLS - 1;
      line.push(isBorder || source[col] === '#');
    }
    walls.push(line);
  }
  return walls;
}
