/**
 * Imported Markdown is untrusted. Every string that reaches the DOM or the
 * canvas goes through here first: tags are removed, entities are decoded to
 * their literal characters and control characters are dropped.
 *
 * The result is plain text only — it is never inserted as HTML anywhere in the
 * app (the UI uses textContent), so this is defence in depth rather than the
 * only line of defence.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
};

function decodeEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    const named = NAMED_ENTITIES[body.toLowerCase()];
    if (named !== undefined) return named;
    if (body.startsWith('#x') || body.startsWith('#X')) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? safeFromCodePoint(code) : match;
    }
    if (body.startsWith('#')) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? safeFromCodePoint(code) : match;
    }
    return match;
  });
}

function safeFromCodePoint(code: number): string {
  if (!Number.isInteger(code) || code < 0x20 || code > 0x10ffff) return '';
  try {
    return String.fromCodePoint(code);
  } catch {
    return '';
  }
}

/**
 * Strip HTML tags (including anything that looks like a script/style block),
 * decode entities and normalise whitespace.
 */
export function sanitizeText(input: string, maxLength = 400): string {
  if (!input) return '';
  const withoutBlocks = input.replace(
    /<(script|style|iframe|object|embed)[\s\S]*?(<\/\1\s*>|$)/gi,
    ' ',
  );
  const withoutTags = withoutBlocks.replace(/<\/?[a-zA-Z][^>]*>/g, ' ').replace(/<[^>]*>/g, ' ');
  const decoded = decodeEntities(withoutTags);
  // A second tag sweep: entity-encoded tags become real ones after decoding.
  const clean = decoded
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1).trimEnd()}…` : clean;
}

/** Strip inline Markdown emphasis/code/link syntax from already-sanitised text. */
export function stripInlineMarkdown(input: string): string {
  return input
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .trim();
}

export function sanitizeInline(input: string, maxLength = 400): string {
  return sanitizeText(stripInlineMarkdown(sanitizeText(input, maxLength * 2)), maxLength);
}
