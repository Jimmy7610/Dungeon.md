/**
 * Deterministic, URL-ish ids for rooms. `## Bug Basement` -> `bug-basement`.
 */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    // Strip combining marks so "Café" -> "cafe" rather than "caf".
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'room';
}

/** Turn `#Bug Basement`, `#Bug%20Basement` or `bug-basement` into a room id. */
export function anchorToId(href: string): string {
  const raw = href.replace(/^#/, '');
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Malformed percent-encoding: fall back to the literal text.
  }
  return slugify(decoded);
}

/**
 * Slug generator that keeps duplicate headings distinct and stable:
 * `## Cave`, `## Cave` -> `cave`, `cave-2`.
 */
export function createSlugger(): (input: string) => string {
  const seen = new Map<string, number>();
  return (input: string) => {
    const base = slugify(input);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };
}
