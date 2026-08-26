import { createRng } from '../../core/rng.ts';
import type { PixelSprite } from './types.ts';
import { OUTLINE } from './palettes.ts';

/**
 * LEGACY CODE and the forgotten king.
 *
 * A 40x40 boss is too large to hand-place pixel by pixel without the result
 * turning to mush, so the mass is *generated*: a symmetric silhouette carved
 * by a fixed seed, then dressed with brackets, error pixels and a core. The
 * seed is constant, so the art is identical on every run and every machine -
 * it is still authored art, just authored as a recipe.
 */

const SIZE = 40;

export interface BossVariant {
  key: string;
  palette: readonly string[];
  /** How much angry red corruption to mix in. */
  corruption: number;
  /** Brightness of the core. */
  core: number;
}

/* Palette layout for the mass:
   0 outline · 1 dark body · 2 mid body · 3 bright body · 4 core glow
   5 error red · 6 bracket glyph · 7 white-hot */
const MASS_BASE = [OUTLINE, '#123a26', '#276b45', '#49a86a', '#8dffb0', '#ff5c4d', '#0d2a1c', '#eafff1'];
const MASS_CHARGE = [OUTLINE, '#1a4a2c', '#378551', '#63c47f', '#d6ffe4', '#ff8a5c', '#12351f', '#ffffff'];
const MASS_ENRAGED = [OUTLINE, '#4a1a1a', '#8a2f22', '#c4523a', '#ffd0a3', '#ff2e2e', '#361212', '#fff1e6'];

const KING_BASE = [OUTLINE, '#3a4152', '#5b6472', '#98a3b5', '#e6ecf5', '#a78bfa', '#242a36', '#fbbf24'];

/** `{`, `}`, `<`, `>`, `;` drawn as 3x5 stamps of bracket-glyph pixels. */
const GLYPH_STAMPS: string[][] = [
  ['.11', '1..', '11.', '1..', '.11'], // {
  ['11.', '..1', '.11', '..1', '11.'], // }
  ['..1', '.1.', '1..', '.1.', '..1'], // <
  ['1..', '.1.', '..1', '.1.', '1..'], // >
  ['.1.', '.1.', '.1.', '...', '.1.'], // !
];

type Grid = string[][];

function blankGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => '.'));
}

function stamp(grid: Grid, x: number, y: number, rows: string[], value: string): void {
  rows.forEach((row, dy) => {
    [...row].forEach((cell, dx) => {
      if (cell === '.') return;
      const gy = y + dy;
      const gx = x + dx;
      if (gy < 0 || gx < 0 || gy >= SIZE || gx >= SIZE) return;
      if (grid[gy]?.[gx] === '.') return; // only draw on top of the body
      const line = grid[gy];
      if (line) line[gx] = value;
    });
  });
}

/**
 * Build the corrupted mass.
 *
 * The silhouette is deliberately *blocky*: the radius is quantised into steps
 * so the edge staircases like stacked code blocks instead of curving like a
 * pill, and a few slabs jut out to break the outline. That is what makes it
 * read as a mass of broken software at the size it is actually drawn.
 */
function buildMass(variant: BossVariant): string[] {
  const rng = createRng(`legacy-code:${variant.key}`);
  const grid = blankGrid();
  const centre = SIZE / 2;

  // Per-row half-width, quantised to 2px steps: a chunky, stepped outline.
  const halfWidths: number[] = [];
  for (let y = 0; y < SIZE; y++) {
    const ny = (y - centre + 0.5) / centre;
    const base = Math.sqrt(Math.max(0, 1 - ny * ny * 1.15));
    const jitter = y % 3 === 0 ? 0.06 : y % 5 === 0 ? -0.05 : 0;
    const raw = (base + jitter) * centre;
    halfWidths.push(Math.max(0, Math.round(raw / 2) * 2));
  }

  for (let y = 0; y < SIZE; y++) {
    const half = halfWidths[y] ?? 0;
    if (half <= 0) continue;
    for (let x = 0; x < centre; x++) {
      const distance = centre - x;
      if (distance > half) continue;
      const depth = (half - distance) / Math.max(1, half);

      // Three hard value bands rather than a smooth gradient.
      let value = '1';
      if (depth > 0.25) value = '2';
      if (depth > 0.62) value = '3';
      // Horizontal banding reads as stacked lines of source.
      if (y % 3 === 0 && depth > 0.15) value = '1';
      if (rng.next() < variant.corruption) value = '5';
      grid[y]![x] = value;
      grid[y]![SIZE - 1 - x] = value;
    }
  }

  // Slabs jutting out of the mass, so the outline is never a clean curve.
  const slabs: [number, number, number, number][] = [
    [2, 11, 7, 3],
    [1, 24, 6, 3],
    [4, 31, 9, 3],
    [6, 4, 8, 3],
  ];
  for (const [sx, sy, width, height] of slabs) {
    for (let y = sy; y < sy + height && y < SIZE; y++) {
      for (let x = sx; x < sx + width && x < centre; x++) {
        grid[y]![x] = '2';
        grid[y]![SIZE - 1 - x] = '2';
      }
    }
  }

  // Outline pass: any body pixel with an empty neighbour becomes outline.
  const outlined = grid.map((row) => [...row]);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (grid[y]![x] === '.') continue;
      const empty =
        grid[y - 1]?.[x] === '.' ||
        grid[y + 1]?.[x] === '.' ||
        grid[y]?.[x - 1] === '.' ||
        grid[y]?.[x + 1] === '.' ||
        y === 0 ||
        x === 0 ||
        y === SIZE - 1 ||
        x === SIZE - 1;
      if (empty) outlined[y]![x] = '0';
    }
  }

  // Bracket glyphs embedded in the mass, mirrored for balance.
  const glyphRng = createRng('legacy-code:glyphs');
  for (let index = 0; index < 4; index++) {
    const stampRows = GLYPH_STAMPS[index % GLYPH_STAMPS.length]!;
    const gx = glyphRng.int(6, 12);
    const gy = glyphRng.int(8, SIZE - 14);
    stamp(outlined, gx, gy, stampRows, '6');
    stamp(outlined, SIZE - gx - stampRows[0]!.length, gy + 3, stampRows, '6');
  }

  // Two large angry eyes: a dark angled brow over a bright core. The brow is
  // what makes the silhouette read as hostile rather than as a pattern.
  const eyeY = Math.round(SIZE * 0.38);
  const eyes: [number, number][] = [
    [Math.round(SIZE * 0.24), 1],
    [Math.round(SIZE * 0.58), -1],
  ];
  for (const [eyeX, direction] of eyes) {
    for (let dy = 0; dy < 6; dy++) {
      for (let dx = 0; dx < 9; dx++) {
        const line = outlined[eyeY + dy];
        if (!line || line[eyeX + dx] === '.') continue;
        // Angled brow: the inner top corner is cut away.
        const inner = direction > 0 ? 8 - dx : dx;
        if (dy < 2 && inner < 2 - dy) continue;
        const edge = dy === 0 || dy === 5 || dx === 0 || dx === 8;
        const core = dy >= 2 && dy <= 3 && dx >= 2 && dx <= 6;
        line[eyeX + dx] = edge ? '0' : core ? '7' : '4';
      }
    }
    // Heavy brow line above the socket.
    const brow = outlined[eyeY - 1];
    if (brow) {
      for (let dx = 0; dx < 9; dx++) {
        if (brow[eyeX + dx] !== '.') brow[eyeX + dx] = '0';
      }
    }
  }

  // A cracked seam across the lower body.
  const seamY = Math.round(SIZE * 0.68);
  for (let x = 6; x < SIZE - 6; x++) {
    const line = outlined[seamY + (x % 5 === 0 ? 1 : 0)];
    if (line && line[x] !== '.') line[x] = x % 3 === 0 ? '4' : '0';
  }

  return outlined.map((row) => row.join(''));
}

function buildKing(): string[] {
  const grid = buildMass({ key: 'forgotten-king', palette: KING_BASE, corruption: 0, core: 1 });
  // Give the king a crown of spikes across the top of the silhouette.
  const rows = grid.map((row) => [...row]);
  for (let x = 8; x < SIZE - 8; x += 5) {
    for (let y = 2; y < 7; y++) {
      const line = rows[y];
      if (!line) continue;
      if (line[x] !== '.' || y > 4) line[x] = '7';
      if (line[x + 1] !== '.' && y > 3) line[x + 1] = '7';
    }
  }
  return rows.map((row) => row.join(''));
}

const VARIANTS: BossVariant[] = [
  { key: 'boss-legacy-code', palette: MASS_BASE, corruption: 0.05, core: 1 },
  { key: 'boss-legacy-code-charge', palette: MASS_CHARGE, corruption: 0.08, core: 1.3 },
  { key: 'boss-legacy-code-enraged', palette: MASS_ENRAGED, corruption: 0.22, core: 1.5 },
];

export const BOSS_SPRITES: PixelSprite[] = [
  ...VARIANTS.map((variant) => ({
    key: variant.key,
    palette: variant.palette,
    pixels: buildMass(variant),
    width: SIZE,
  })),
  {
    key: 'boss-forgotten-king',
    palette: KING_BASE,
    pixels: buildKing(),
    width: SIZE,
  },
];

/** Boss type -> texture keys for its three visual states. */
export const BOSS_STATE_TEXTURES: Record<string, { idle: string; charge: string; enraged: string }> =
  {
    'legacy-code': {
      idle: 'boss-legacy-code',
      charge: 'boss-legacy-code-charge',
      enraged: 'boss-legacy-code-enraged',
    },
    'forgotten-king': {
      idle: 'boss-forgotten-king',
      charge: 'boss-forgotten-king',
      enraged: 'boss-forgotten-king',
    },
  };
