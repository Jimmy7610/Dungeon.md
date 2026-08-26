/**
 * A tiny Markdown highlighter for the editor.
 *
 * It escapes the source first and only ever emits `<span>` wrappers, so user
 * text can never become markup. It highlights exactly the constructs the
 * parser understands - nothing is coloured that the game ignores.
 */

const DIRECTIVE_LANGS = new Set(['enemy', 'boss', 'door']);

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function span(className: string, content: string): string {
  return `<span class="${className}">${content}</span>`;
}

/** Highlight `[label](#target)` inside already-escaped text. */
function highlightLinks(escaped: string): string {
  return escaped.replace(/\[([^\]]*)\]\(([^)\s]*)\)/g, (_match, label: string, href: string) =>
    span('tok-link', `[${label}](${href})`),
  );
}

export function highlightMarkdown(source: string): string {
  const lines = escapeHtml(source).split('\n');
  const out: string[] = [];
  let fenceLang: string | null = null;

  for (const line of lines) {
    const fenceMatch = /^(\s*)(```+|~~~+)(.*)$/.exec(line);

    if (fenceLang !== null) {
      if (fenceMatch) {
        fenceLang = null;
        out.push(span('tok-fence', line));
        continue;
      }
      if (DIRECTIVE_LANGS.has(fenceLang)) {
        const pair = /^(\s*[A-Za-z_][\w-]*\s*)(:)(.*)$/.exec(line);
        out.push(
          pair
            ? `${span('tok-key', pair[1] ?? '')}${span('tok-fence', ':')}${span('tok-value', pair[3] ?? '')}`
            : span('tok-code', line),
        );
        continue;
      }
      out.push(span('tok-code', line));
      continue;
    }

    if (fenceMatch) {
      const lang = (fenceMatch[3] ?? '').trim().toLowerCase();
      fenceLang = lang;
      out.push(
        DIRECTIVE_LANGS.has(lang)
          ? `${span('tok-fence', `${fenceMatch[1] ?? ''}${fenceMatch[2] ?? ''}`)}${span('tok-directive', fenceMatch[3] ?? '')}`
          : span('tok-fence', line),
      );
      continue;
    }

    const heading = /^(#{1,6})(\s.*)$/.exec(line);
    if (heading) {
      const level = (heading[1] ?? '#').length;
      const className = level === 1 ? 'tok-h1' : level === 2 ? 'tok-h2' : 'tok-h3';
      out.push(span(className, line));
      continue;
    }

    if (/^\s*&gt;/.test(line)) {
      out.push(span('tok-quote', line));
      continue;
    }

    const task = /^(\s*[-*+]\s+)(\[[ xX]\])(\s?)(.*)$/.exec(line);
    if (task) {
      const checked = (task[2] ?? '').toLowerCase() === '[x]';
      out.push(
        `${span('tok-fence', task[1] ?? '')}${span('tok-quest', task[2] ?? '')}${task[3] ?? ''}${span(
          checked ? 'tok-quest-done' : 'tok-quest',
          highlightLinks(task[4] ?? ''),
        )}`,
      );
      continue;
    }

    const bullet = /^(\s*[-*+]\s+)(.*)$/.exec(line);
    if (bullet) {
      out.push(
        `${span('tok-fence', bullet[1] ?? '')}${span('tok-item', highlightLinks(bullet[2] ?? ''))}`,
      );
      continue;
    }

    out.push(line ? span('tok-text', highlightLinks(line)) : '');
  }

  // A trailing newline keeps the highlighted block the same height as the
  // textarea when the document ends with a blank line.
  return `${out.join('\n')}\n`;
}
