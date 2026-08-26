/**
 * Room themes only change how a room is dressed - palette, ambient glow and
 * non-colliding decoration. They never affect physics, collision or doors.
 */
export const ROOM_THEMES = [
  'repository',
  'basement',
  'cache',
  'null',
  'dependency',
  'graveyard',
  'merge',
  'ci',
  'firewall',
  'memory',
  'deprecated',
  'refactor',
  'archive',
  'vault',
  'secret',
] as const;

export type RoomTheme = (typeof ROOM_THEMES)[number];

export const DEFAULT_THEME: RoomTheme = 'repository';

const THEME_SET = new Set<string>(ROOM_THEMES);

export function isRoomTheme(value: string): value is RoomTheme {
  return THEME_SET.has(value);
}
