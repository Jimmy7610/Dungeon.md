import { describe, expect, it } from 'vitest';
import { escapeHtml, highlightMarkdown } from './highlight.ts';
import { exportFilename, markCompletedQuests } from './exportMarkdown.ts';

describe('editor highlighting', () => {
  it('escapes every HTML-significant character', () => {
    expect(escapeHtml('<script>"x" & \'y\'</script>')).toBe(
      '&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;',
    );
  });

  it('never emits unescaped user markup', () => {
    const html = highlightMarkdown('# <img src=x onerror=alert(1)>\n- <b>loot</b>\n');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;img');
  });

  it('tags the constructs the parser supports', () => {
    const html = highlightMarkdown(
      ['# Title', '## Room', '- Sword', '- [ ] Quest', '- [x] Done', '> Voice', '[Go](#room)'].join(
        '\n',
      ),
    );
    for (const token of [
      'tok-h1',
      'tok-h2',
      'tok-item',
      'tok-quest',
      'tok-quest-done',
      'tok-quote',
      'tok-link',
    ]) {
      expect(html).toContain(token);
    }
  });

  it('highlights directive fences and their key/value pairs', () => {
    const html = highlightMarkdown('```enemy\ntype: bug\ncount: 3\n```\n');
    expect(html).toContain('tok-directive');
    expect(html).toContain('tok-key');
    expect(html).toContain('tok-value');
  });

  it('treats ordinary code fences as plain code', () => {
    const html = highlightMarkdown('```js\nconst a = 1;\n```\n');
    expect(html).not.toContain('tok-directive');
    expect(html).toContain('tok-code');
  });

  it('keeps one output line per input line', () => {
    const source = 'a\n\nb\nc';
    expect(highlightMarkdown(source).split('\n').length).toBe(source.split('\n').length + 1);
  });
});

describe('exporting completed quests', () => {
  const source = [
    '# Dungeon',
    '',
    '## Room',
    '- [ ] Find the Git Key',
    '- [ ] Defeat Legacy Code',
    '- [x] Read the README',
    '- Not a quest',
    '',
    'Text with - [ ] inline should not change.',
  ].join('\n');

  it('ticks only the quests that were completed', () => {
    const result = markCompletedQuests(source, ['Find the Git Key']);
    expect(result).toContain('- [x] Find the Git Key');
    expect(result).toContain('- [ ] Defeat Legacy Code');
  });

  it('leaves the rest of the document byte-identical', () => {
    const result = markCompletedQuests(source, ['Find the Git Key']);
    const changed = result
      .split('\n')
      .filter((line, index) => line !== source.split('\n')[index]);
    expect(changed).toEqual(['- [x] Find the Git Key']);
  });

  it('is case- and formatting-insensitive', () => {
    const result = markCompletedQuests('- [ ] **Find** the *Git Key*', ['find the git key']);
    expect(result).toBe('- [x] **Find** the *Git Key*');
  });

  it('returns the source unchanged when nothing is completed', () => {
    expect(markCompletedQuests(source, [])).toBe(source);
  });

  it('does not touch checkbox-like text inside a paragraph', () => {
    const result = markCompletedQuests(source, ['inline should not change']);
    expect(result).toBe(source);
  });

  it('builds a safe filename', () => {
    expect(exportFilename('The Developer Dungeon')).toBe('the-developer-dungeon.md');
    expect(exportFilename('***')).toBe('dungeon.md');
  });
});
