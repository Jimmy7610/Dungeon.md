/**
 * The item registry.
 *
 * One typed table describes every item the game understands: what category it
 * belongs to, and what it does. Gameplay code looks effects up here instead of
 * branching on names, and the parser uses the same table so a bullet in the
 * Markdown and the item in the world can never disagree.
 *
 * Plain data only - no Phaser, no DOM - so it stays unit-testable.
 */

export type ItemCategory =
  | 'weapon'
  | 'armor'
  | 'consumable'
  | 'key'
  | 'special'
  | 'currency'
  | 'generic';

export type SpecialEffect =
  | 'rubber-duck'
  | 'stack-overflow'
  | 'hotfix'
  | 'commit-shield'
  | 'sudo';

export interface ItemSpec {
  /** Stable registry id, e.g. `refactor-blade`. */
  id: string;
  /** Canonical display name. */
  name: string;
  category: ItemCategory;
  /** Armour capacity granted when equipped. */
  armor?: number;
  /** Hearts restored. */
  heal?: number;
  /** Armour points repaired, up to the equipped armour's capacity. */
  repair?: number;
  /** Refills health and armour completely. */
  fullRestore?: boolean;
  /** Permanent (per-run) maximum-health increase. */
  heartUpgrade?: number;
  /** Movement-speed boost: multiplier and duration in milliseconds. */
  haste?: { multiplier: number; durationMs: number };
  special?: SpecialEffect;
  gold?: number;
  /**
   * Weapons and armour are equipped deliberately with E, so walking over a
   * weapon never silently replaces the one you are holding.
   */
  interact?: boolean;
}

const SPECS: ItemSpec[] = [
  // ---------------------------------------------------------------- weapons
  { id: 'debugger', name: 'Debugger', category: 'weapon', interact: true },
  { id: 'refactor-blade', name: 'Refactor Blade', category: 'weapon', interact: true },
  { id: 'stack-trace-spear', name: 'Stack Trace Spear', category: 'weapon', interact: true },
  { id: 'dependency-hammer', name: 'Dependency Hammer', category: 'weapon', interact: true },
  { id: 'merge-axe', name: 'Merge Axe', category: 'weapon', interact: true },
  { id: 'root-access', name: 'Root Access', category: 'weapon', interact: true },
  // Kept so dungeons written against the original syntax still work.
  { id: 'sword', name: 'Sword', category: 'weapon', interact: true },

  // ----------------------------------------------------------------- armour
  { id: 'cache-jacket', name: 'Cache Jacket', category: 'armor', armor: 1, interact: true },
  { id: 'firewall-vest', name: 'Firewall Vest', category: 'armor', armor: 2, interact: true },
  { id: 'kernel-plate', name: 'Kernel Plate', category: 'armor', armor: 3, interact: true },
  { id: 'root-armor', name: 'Root Armor', category: 'armor', armor: 5, interact: true },

  // ------------------------------------------------------------ consumables
  { id: 'coffee-potion', name: 'Coffee Potion', category: 'consumable', heal: 2 },
  { id: 'health-potion', name: 'Health Potion', category: 'consumable', heal: 3 },
  {
    id: 'energy-drink',
    name: 'Energy Drink',
    category: 'consumable',
    heal: 1,
    haste: { multiplier: 1.2, durationMs: 4000 },
  },
  { id: 'patch-kit', name: 'Patch Kit', category: 'consumable', repair: 2 },
  { id: 'full-restore', name: 'Full Restore', category: 'consumable', fullRestore: true },
  { id: 'heart-upgrade', name: 'Heart Upgrade', category: 'consumable', heartUpgrade: 1 },

  // ---------------------------------------------------------------- special
  { id: 'rubber-duck', name: 'Rubber Duck', category: 'special', special: 'rubber-duck' },
  {
    id: 'stack-overflow-scroll',
    name: 'Stack Overflow Scroll',
    category: 'special',
    special: 'stack-overflow',
  },
  { id: 'hotfix', name: 'Hotfix', category: 'special', special: 'hotfix' },
  { id: 'commit-shield', name: 'Commit Shield', category: 'special', special: 'commit-shield' },
  { id: 'sudo', name: 'sudo', category: 'special', special: 'sudo' },

  // ------------------------------------------------------------- keys, gold
  { id: 'git-key', name: 'Git Key', category: 'key' },
  { id: 'silver-key', name: 'Silver Key', category: 'key' },
  { id: 'gold', name: 'Gold', category: 'currency', gold: 10 },
];

const BY_ID = new Map<string, ItemSpec>(SPECS.map((spec) => [spec.id, spec]));
const BY_NAME = new Map<string, ItemSpec>(SPECS.map((spec) => [spec.name.toLowerCase(), spec]));

/** Items whose name in Markdown differs from the canonical registry name. */
const ALIASES: Record<string, string> = {
  'stack overflow': 'stack-overflow-scroll',
  'stackoverflow scroll': 'stack-overflow-scroll',
  'git-key': 'git-key',
  'heart container': 'heart-upgrade',
  'max hp up': 'heart-upgrade',
  'energy drink can': 'energy-drink',
};

/** Fallback specs for names the registry does not know. */
const GENERIC: Record<string, ItemSpec> = {
  weapon: { id: 'generic-weapon', name: 'Weapon', category: 'weapon', interact: true },
  armor: { id: 'generic-armor', name: 'Armor', category: 'armor', armor: 1, interact: true },
  heal: { id: 'generic-potion', name: 'Potion', category: 'consumable', heal: 2 },
  key: { id: 'generic-key', name: 'Key', category: 'key' },
  currency: { id: 'generic-gold', name: 'Gold', category: 'currency', gold: 10 },
  generic: { id: 'generic', name: 'Collectible', category: 'generic' },
};

export function getItemSpec(specId: string): ItemSpec {
  return BY_ID.get(specId) ?? GENERIC['generic']!;
}

export function isKnownItem(name: string): boolean {
  const key = name.trim().toLowerCase();
  return BY_NAME.has(key) || key in ALIASES;
}

/**
 * Resolve a Markdown bullet to a registry entry.
 *
 * Exact names win; then aliases; then a few forgiving heuristics so
 * `- Rusty Blade` still behaves like a weapon. Anything else becomes a plain
 * collectible rather than an error.
 */
export function classifyItem(name: string): ItemSpec {
  const key = name.trim().toLowerCase();
  const exact = BY_NAME.get(key);
  if (exact) return exact;

  const aliased = ALIASES[key];
  if (aliased) return BY_ID.get(aliased) ?? GENERIC['generic']!;

  if (/\bkeys?\b|keycard|passphrase|token/.test(key)) return GENERIC['key']!;
  if (/\barmor\b|\barmour\b|vest|plate|jacket|shield vest|mail|kevlar/.test(key)) {
    return GENERIC['armor']!;
  }
  if (/potion|coffee|elixir|heal|medkit|bandage|restore|tonic/.test(key)) return GENERIC['heal']!;
  if (/sword|blade|axe|hammer|debugger|linter|dagger|spear|mace|wrench/.test(key)) {
    return GENERIC['weapon']!;
  }
  if (/\bgold\b|coin|treasure|credits?|bounty/.test(key)) return GENERIC['currency']!;
  return GENERIC['generic']!;
}

/** Every registry entry, for documentation and validation. */
export function allItemSpecs(): readonly ItemSpec[] {
  return SPECS;
}
