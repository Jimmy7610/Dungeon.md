/** Deterministic 32-bit string hash (FNV-1a). Same room id -> same layout. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface Rng {
  next(): number;
  int(minInclusive: number, maxInclusive: number): number;
  pick<T>(items: readonly T[]): T | undefined;
  shuffle<T>(items: T[]): T[];
}

/** Small seeded PRNG (mulberry32) so generated rooms are reproducible. */
export function createRng(seed: number | string): Rng {
  let state = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (minInclusive, maxInclusive) =>
      minInclusive + Math.floor(next() * (maxInclusive - minInclusive + 1)),
    pick: (items) => (items.length === 0 ? undefined : items[Math.floor(next() * items.length)]),
    shuffle: (items) => {
      for (let index = items.length - 1; index > 0; index--) {
        const swap = Math.floor(next() * (index + 1));
        const a = items[index];
        const b = items[swap];
        if (a !== undefined && b !== undefined) {
          items[index] = b;
          items[swap] = a;
        }
      }
      return items;
    },
  };
}
