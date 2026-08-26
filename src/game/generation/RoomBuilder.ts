import { createRng, hashString } from '../../core/rng.ts';
import type { DoorDefinition, RoomDefinition } from '../../markdown/types.ts';
import { ROOM_COLS, ROOM_ROWS, TILE } from '../config.ts';
import { BOSS_TEMPLATE, ROOM_TEMPLATES, normalizeTemplate } from './roomTemplates.ts';

export type Side = 'north' | 'east' | 'south' | 'west';

export interface Point {
  x: number;
  y: number;
}

export interface WallRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DoorSlot {
  door: DoorDefinition;
  /** Centre of the arch, in pixels. */
  x: number;
  y: number;
  side: Side;
  /** Where the player stands when arriving through this door. */
  landing: Point;
}

export interface RoomLayout {
  templateName: string;
  walls: boolean[][];
  wallRects: WallRect[];
  doors: DoorSlot[];
  itemPoints: Point[];
  npcPoints: Point[];
  enemyPoints: Point[];
  bossPoint: Point;
  defaultSpawn: Point;
  torches: Point[];
}

const SIDE_ORDER: Side[] = ['east', 'south', 'west', 'north'];

function tileCentre(col: number, row: number): Point {
  return { x: col * TILE + TILE / 2, y: row * TILE + TILE / 2 };
}

/** Open a small pocket of floor so a door is always reachable. */
function carve(walls: boolean[][], col: number, row: number, radius: number): void {
  for (let r = row - radius; r <= row + radius; r++) {
    for (let c = col - radius; c <= col + radius; c++) {
      if (r <= 0 || c <= 0 || r >= ROOM_ROWS - 1 || c >= ROOM_COLS - 1) continue;
      const line = walls[r];
      if (line) line[c] = false;
    }
  }
}

/** Merge horizontal runs of wall tiles into as few collision bodies as possible. */
function buildWallRects(walls: boolean[][]): WallRect[] {
  const rects: WallRect[] = [];
  for (let row = 0; row < ROOM_ROWS; row++) {
    let runStart = -1;
    for (let col = 0; col <= ROOM_COLS; col++) {
      const solid = col < ROOM_COLS && walls[row]?.[col] === true;
      if (solid && runStart === -1) runStart = col;
      if (!solid && runStart !== -1) {
        rects.push({
          x: runStart * TILE,
          y: row * TILE,
          width: (col - runStart) * TILE,
          height: TILE,
        });
        runStart = -1;
      }
    }
  }
  return rects;
}

function isFloor(walls: boolean[][], col: number, row: number): boolean {
  return walls[row]?.[col] === false;
}

/** Floor tiles with no wall in the 4 neighbours - safe for spawning things. */
function openFloorTiles(walls: boolean[][]): Point[] {
  const tiles: Point[] = [];
  for (let row = 1; row < ROOM_ROWS - 1; row++) {
    for (let col = 1; col < ROOM_COLS - 1; col++) {
      if (!isFloor(walls, col, row)) continue;
      if (
        !isFloor(walls, col - 1, row) ||
        !isFloor(walls, col + 1, row) ||
        !isFloor(walls, col, row - 1) ||
        !isFloor(walls, col, row + 1)
      ) {
        continue;
      }
      tiles.push({ x: col, y: row });
    }
  }
  return tiles;
}

function sideAnchor(side: Side): { col: number; row: number; landing: Point } {
  const midCol = Math.floor(ROOM_COLS / 2);
  const midRow = Math.floor(ROOM_ROWS / 2);
  switch (side) {
    case 'north':
      return { col: midCol, row: 0, landing: tileCentre(midCol, 2) };
    case 'south':
      return { col: midCol, row: ROOM_ROWS - 1, landing: tileCentre(midCol, ROOM_ROWS - 3) };
    case 'west':
      return { col: 0, row: midRow, landing: tileCentre(2, midRow) };
    case 'east':
      return { col: ROOM_COLS - 1, row: midRow, landing: tileCentre(ROOM_COLS - 3, midRow) };
  }
}

/**
 * Deterministically turn a room definition into a concrete playable layout.
 * The same room id always produces the same template, door sides and object
 * placement, so live-editing the Markdown never shuffles the dungeon around.
 */
export function buildRoomLayout(room: RoomDefinition): RoomLayout {
  const rng = createRng(`${room.id}:layout`);
  const template = room.boss
    ? BOSS_TEMPLATE
    : (ROOM_TEMPLATES[hashString(room.id) % ROOM_TEMPLATES.length] ?? ROOM_TEMPLATES[0]!);

  const walls = normalizeTemplate(template);
  const occupied = new Set<string>();
  const keyOf = (point: Point): string => `${point.x},${point.y}`;

  // 1. Doors claim wall anchors first; the pocket in front of them is carved
  //    open so nothing can seal an exit.
  const doors: DoorSlot[] = [];
  room.doors.forEach((door, index) => {
    const side = SIDE_ORDER[index % SIDE_ORDER.length] ?? 'east';
    const offsetPairs = Math.floor(index / SIDE_ORDER.length);
    const anchor = sideAnchor(side);
    const shift = offsetPairs === 0 ? 0 : (offsetPairs % 2 === 1 ? 1 : -1) * (2 + offsetPairs);

    let col = anchor.col;
    let row = anchor.row;
    let landing = { ...anchor.landing };
    if (side === 'north' || side === 'south') {
      col = Math.min(ROOM_COLS - 3, Math.max(2, anchor.col + shift * 2));
      landing = { x: col * TILE + TILE / 2, y: landing.y };
    } else {
      row = Math.min(ROOM_ROWS - 3, Math.max(2, anchor.row + shift * 2));
      landing = { x: landing.x, y: row * TILE + TILE / 2 };
    }

    const inner = {
      col: side === 'west' ? col + 1 : side === 'east' ? col - 1 : col,
      row: side === 'north' ? row + 1 : side === 'south' ? row - 1 : row,
    };
    carve(walls, inner.col, inner.row, 1);

    const centre = tileCentre(col, row);
    doors.push({ door, x: centre.x, y: centre.y, side, landing });
    occupied.add(keyOf({ x: inner.col, y: inner.row }));
  });

  // 2. Everything else is placed on open floor, away from doors and the centre.
  const wallRects = buildWallRects(walls);
  const centreCol = Math.floor(ROOM_COLS / 2);
  const centreRow = Math.floor(ROOM_ROWS / 2);
  const bossPoint = tileCentre(centreCol, centreRow);
  const defaultSpawnTile =
    openFloorTiles(walls).find((tile) => tile.x >= 3 && tile.y === centreRow) ??
    ({ x: 3, y: centreRow } as Point);
  const defaultSpawn = tileCentre(defaultSpawnTile.x, defaultSpawnTile.y);

  const doorTiles = doors.map((slot) => ({
    x: Math.round((slot.landing.x - TILE / 2) / TILE),
    y: Math.round((slot.landing.y - TILE / 2) / TILE),
  }));

  const nearDoor = (tile: Point): boolean =>
    doorTiles.some(
      (door) => Math.abs(door.x - tile.x) <= 1 && Math.abs(door.y - tile.y) <= 1,
    );

  const candidates = rng.shuffle(
    openFloorTiles(walls).filter((tile) => {
      if (nearDoor(tile)) return false;
      if (Math.abs(tile.x - defaultSpawnTile.x) <= 1 && Math.abs(tile.y - defaultSpawnTile.y) <= 1) {
        return false;
      }
      if (room.boss && Math.abs(tile.x - centreCol) <= 2 && Math.abs(tile.y - centreRow) <= 2) {
        return false;
      }
      return true;
    }),
  );

  let cursor = 0;
  const take = (count: number, spacing = 1): Point[] => {
    const points: Point[] = [];
    while (points.length < count && cursor < candidates.length) {
      const tile = candidates[cursor++];
      if (!tile) break;
      if (occupied.has(keyOf(tile))) continue;
      points.push(tileCentre(tile.x, tile.y));
      for (let dy = -spacing; dy <= spacing; dy++) {
        for (let dx = -spacing; dx <= spacing; dx++) {
          occupied.add(keyOf({ x: tile.x + dx, y: tile.y + dy }));
        }
      }
    }
    // Fall back to the room centre rather than dropping objects entirely.
    while (points.length < count) points.push({ ...bossPoint });
    return points;
  };

  const npcPoints = take(room.npcs.length, 1);
  const itemPoints = take(room.items.length, 1);
  const enemyTotal = room.enemies.reduce((sum, group) => sum + group.count, 0);
  const enemyPoints = take(enemyTotal, 0);
  const torches = take(Math.min(3, Math.max(1, Math.floor(candidates.length / 40))), 2);

  return {
    templateName: template.name,
    walls,
    wallRects,
    doors,
    itemPoints,
    npcPoints,
    enemyPoints,
    bossPoint,
    defaultSpawn,
    torches,
  };
}
