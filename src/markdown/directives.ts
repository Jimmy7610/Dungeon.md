import { classifyItem } from './items.ts';
import { sanitizeInline } from './sanitize.ts';
import { anchorToId } from './slug.ts';
import { DEFAULT_THEME, isRoomTheme, type RoomTheme } from './themes.ts';
import {
  BOSS_TYPES,
  ENEMY_TYPES,
  type BossDefinition,
  type BossType,
  type DoorDefinition,
  type EnemyDefinition,
  type EnemyType,
  type ItemDefinition,
  type ParseWarning,
} from './types.ts';

/** Collects non-fatal parser feedback shown in the warnings drawer. */
export type WarnFn = (warning: ParseWarning) => void;

const ENEMY_TYPE_SET = new Set<string>(ENEMY_TYPES);
const BOSS_TYPE_SET = new Set<string>(BOSS_TYPES);

export const ENEMY_DEFAULTS = { count: 1, health: 30, damage: 1 } as const;
export const BOSS_DEFAULTS = { health: 200, damage: 2 } as const;

export const LIMITS = {
  enemyCount: { min: 1, max: 12 },
  enemyHealth: { min: 1, max: 999 },
  enemyDamage: { min: 0, max: 5 },
  bossHealth: { min: 10, max: 9999 },
  bossDamage: { min: 0, max: 5 },
} as const;

/**
 * Parse the body of a fenced directive as tolerant `key: value` lines.
 * Blank lines, comments (`#`) and junk lines are ignored rather than fatal.
 */
export function parseKeyValues(source: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (!key) continue;
    result[key] = value;
  }
  return result;
}

/**
 * Tolerant boolean parsing for directive flags. Anything unrecognised falls
 * back to `false` rather than throwing, matching the rest of the parser.
 */
export function parseBoolean(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  const normalised = value.trim().toLowerCase();
  if (normalised === '') return fallback;
  if (['true', 'yes', 'on', '1'].includes(normalised)) return true;
  if (['false', 'no', 'off', '0'].includes(normalised)) return false;
  return fallback;
}

function clampInt(
  value: string | undefined,
  fallback: number,
  range: { min: number; max: number },
): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(range.max, Math.max(range.min, parsed));
}

export function parseEnemyDirective(
  source: string,
  id: string,
  room: string,
  warn: WarnFn,
): EnemyDefinition {
  const fields = parseKeyValues(source);
  const rawType = (fields['type'] ?? 'bug').toLowerCase();
  let type: EnemyType = 'generic';
  if (ENEMY_TYPE_SET.has(rawType)) {
    type = rawType as EnemyType;
  } else {
    warn({
      level: 'warn',
      room,
      message: `Unknown enemy type "${sanitizeInline(rawType, 40) || '(empty)'}" — using a generic enemy.`,
    });
  }
  return {
    id,
    type,
    count: clampInt(fields['count'], ENEMY_DEFAULTS.count, LIMITS.enemyCount),
    health: clampInt(fields['health'], ENEMY_DEFAULTS.health, LIMITS.enemyHealth),
    damage: clampInt(fields['damage'], ENEMY_DEFAULTS.damage, LIMITS.enemyDamage),
    elite: parseBoolean(fields['elite']),
    healthExplicit: fields['health'] !== undefined && Number.isFinite(Number.parseInt(fields['health'], 10)),
  };
}

/**
 * `room` directives attach metadata to the H2 they appear under. Only `theme`
 * is supported today; unknown themes warn and fall back to the default.
 */
export function parseRoomDirective(
  source: string,
  room: string,
  warn: WarnFn,
): { theme: RoomTheme } {
  const fields = parseKeyValues(source);
  const raw = (fields['theme'] ?? '').trim().toLowerCase();
  if (!raw) return { theme: DEFAULT_THEME };
  if (isRoomTheme(raw)) return { theme: raw };
  warn({
    level: 'warn',
    room,
    message: `Unknown room theme "${sanitizeInline(raw, 40)}" - using "${DEFAULT_THEME}".`,
  });
  return { theme: DEFAULT_THEME };
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function parseBossDirective(
  source: string,
  id: string,
  room: string,
  warn: WarnFn,
): BossDefinition {
  const fields = parseKeyValues(source);
  const rawType = (fields['type'] ?? 'legacy-code').toLowerCase();
  let type: BossType = 'legacy-code';
  if (BOSS_TYPE_SET.has(rawType)) {
    type = rawType as BossType;
  } else if (fields['type'] !== undefined) {
    warn({
      level: 'warn',
      room,
      message: `Unknown boss type "${sanitizeInline(rawType, 40) || '(empty)'}" — using "legacy-code".`,
    });
  }
  const name = sanitizeInline(fields['name'] ?? '', 40) || titleCase(type);
  return {
    id,
    type,
    name,
    health: clampInt(fields['health'], BOSS_DEFAULTS.health, LIMITS.bossHealth),
    damage: clampInt(fields['damage'], BOSS_DEFAULTS.damage, LIMITS.bossDamage),
  };
}

/**
 * `door` directives are the only way to create a locked door. Returns null when
 * the directive has no usable target — the parser records a warning instead of
 * spawning a door that leads nowhere.
 */
export function parseDoorDirective(
  source: string,
  id: string,
  room: string,
  warn: WarnFn,
): DoorDefinition | null {
  const fields = parseKeyValues(source);
  const rawTarget = fields['target'] ?? '';
  const target = anchorToId(sanitizeInline(rawTarget, 80));
  if (!rawTarget.trim()) {
    warn({
      level: 'warn',
      room,
      message: 'A `door` directive is missing `target:` — the door was skipped.',
    });
    return null;
  }
  const requires = sanitizeInline(fields['requires'] ?? '', 40);
  const label = sanitizeInline(fields['label'] ?? '', 60) || `Enter ${titleCase(target)}`;
  const door: DoorDefinition = {
    id,
    label,
    target,
    hidden: parseBoolean(fields['hidden']),
    broken: false,
  };
  if (requires) door.requires = requires;
  return door;
}

export function createItem(rawName: string, id: string): ItemDefinition | null {
  const name = sanitizeInline(rawName, 40);
  if (!name) return null;
  const spec = classifyItem(name);
  return { id, name, specId: spec.id, category: spec.category };
}
