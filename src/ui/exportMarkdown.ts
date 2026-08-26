import { sanitizeInline } from '../markdown/sanitize.ts';

const TASK_LINE = /^(\s*[-*+]\s+)\[ \](\s*)(.*)$/;

function normalise(text: string): string {
  return sanitizeInline(text, 200).toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Tick the checkboxes of quests that were completed in-game.
 *
 * Line-based on purpose: only `- [ ]` lines whose text matches a completed
 * quest are touched, so the rest of the document survives byte for byte.
 */
export function markCompletedQuests(source: string, completedTexts: Iterable<string>): string {
  const completed = new Set<string>();
  for (const text of completedTexts) {
    const key = normalise(text);
    if (key) completed.add(key);
  }
  if (completed.size === 0) return source;

  return source
    .split('\n')
    .map((line) => {
      const match = TASK_LINE.exec(line);
      if (!match) return line;
      const label = normalise(match[3] ?? '');
      if (!label || !completed.has(label)) return line;
      return `${match[1] ?? ''}[x]${match[2] ?? ''}${match[3] ?? ''}`;
    })
    .join('\n');
}

/** Offer a string to the user as a file download. Everything stays local. */
export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `The Developer Dungeon` -> `the-developer-dungeon.md` */
export function exportFilename(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'dungeon'}.md`;
}
