interface SyntaxRow {
  markdown: string;
  becomes: string;
  note: string;
}

/** Every row here is implemented by `src/markdown/parser.ts`. */
const SYNTAX: SyntaxRow[] = [
  { markdown: '# Title', becomes: 'Dungeon name', note: 'The first H1 names the dungeon.' },
  { markdown: '## Room Name', becomes: 'A playable room', note: 'Each H2 is one room.' },
  { markdown: 'Any paragraph', becomes: 'Room narration', note: 'Shown briefly on entry.' },
  { markdown: '- Git Key', becomes: 'Collectible item', note: 'Walk over it to pick it up.' },
  { markdown: '- [ ] Find the Git Key', becomes: 'Quest', note: 'Completes when you do it.' },
  { markdown: '- [x] Already done', becomes: 'Completed quest', note: 'Starts ticked.' },
  { markdown: '> Some text', becomes: 'Message stone', note: 'Press E to read it.' },
  { markdown: '[Go](#room-id)', becomes: 'Door', note: 'Links to another room heading.' },
  { markdown: '```enemy', becomes: 'Enemy spawn', note: 'type, count, health, damage.' },
  { markdown: '```boss', becomes: 'Boss fight', note: 'type, name, health, damage.' },
  { markdown: '```door', becomes: 'Locked door', note: 'label, target, requires.' },
];

const EXAMPLE = `# The Developer Dungeon

## The Repository

A forgotten project waits in the dark.

- Sword
- Coffee Potion

> The last commit was 1,827 days ago.

- [ ] Find the Git Key

[Descend into Bug Basement](#bug-basement)

## Bug Basement

\`\`\`enemy
type: bug
count: 4
health: 25
damage: 1
\`\`\`

- Git Key

\`\`\`door
label: Unlock the Vault
target: legacy-vault
requires: Git Key
\`\`\`

## Legacy Vault

\`\`\`boss
type: legacy-code
name: LEGACY CODE
health: 250
damage: 2
\`\`\``;

const ITEMS = [
  'Sword / Debugger — better melee damage',
  'Health Potion / Coffee Potion — restores hearts',
  'Git Key / Silver Key — opens `requires:` doors',
  'Gold — counter in the HUD',
  'Stack Overflow Scroll — temporary damage boost',
  'Rubber Duck — collectible',
  'Anything else — a generic collectible',
];

const ENEMY_TYPES = ['bug', 'skeleton', 'slime', 'dependency', 'null-pointer'];
const BOSS_TYPES = ['legacy-code', 'forgotten-king'];

function section(title: string, build: (host: HTMLElement) => void): HTMLElement {
  const host = document.createElement('section');
  host.className = 'help-section';
  const heading = document.createElement('h3');
  heading.textContent = title;
  host.append(heading);
  build(host);
  return host;
}

function list(values: string[]): HTMLUListElement {
  const ul = document.createElement('ul');
  for (const value of values) {
    const li = document.createElement('li');
    li.textContent = value;
    ul.append(li);
  }
  return ul;
}

/** The in-app syntax guide. Built from data so it cannot drift into fiction. */
export class HelpModal {
  private readonly root = document.getElementById('help-modal') as HTMLDivElement;
  private readonly panel = this.root.querySelector('.modal-panel') as HTMLDivElement;
  private readonly body = document.getElementById('help-body') as HTMLDivElement;
  private lastFocused: HTMLElement | null = null;

  constructor() {
    this.render();
    document.getElementById('help-close')?.addEventListener('click', () => this.close());
    this.root.addEventListener('mousedown', (event) => {
      if (event.target === this.root) this.close();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(): void {
    this.lastFocused = document.activeElement as HTMLElement | null;
    this.root.hidden = false;
    this.panel.focus();
  }

  close(): void {
    this.root.hidden = true;
    this.lastFocused?.focus();
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  private render(): void {
    const intro = document.createElement('p');
    intro.className = 'help-intro';
    intro.textContent =
      'Dungeon.md reads plain Markdown. Every construct below is supported by the parser — if it is not on this page, the game ignores it.';

    const table = document.createElement('table');
    table.className = 'help-table';
    const head = document.createElement('tr');
    for (const label of ['Markdown', 'Becomes', 'Notes']) {
      const th = document.createElement('th');
      th.textContent = label;
      head.append(th);
    }
    table.append(head);
    for (const row of SYNTAX) {
      const tr = document.createElement('tr');
      const md = document.createElement('td');
      const code = document.createElement('code');
      code.textContent = row.markdown;
      md.append(code);
      const becomes = document.createElement('td');
      becomes.textContent = row.becomes;
      const note = document.createElement('td');
      note.textContent = row.note;
      tr.append(md, becomes, note);
      table.append(tr);
    }

    const example = section('A complete little dungeon', (host) => {
      const pre = document.createElement('pre');
      pre.textContent = EXAMPLE;
      host.append(pre);
    });

    const values = section('Directive values', (host) => {
      const enemies = document.createElement('p');
      enemies.textContent = `enemy type: ${ENEMY_TYPES.join(', ')} (anything else becomes a generic creature)`;
      const bosses = document.createElement('p');
      bosses.textContent = `boss type: ${BOSS_TYPES.join(', ')}`;
      const numbers = document.createElement('p');
      numbers.textContent =
        'count 1–12 · enemy health 1–999 · boss health 10–9999 · damage 0–5. Missing fields fall back to sensible defaults.';
      host.append(enemies, bosses, numbers);
    });

    const items = section('Items the game understands', (host) => {
      host.append(list(ITEMS));
    });

    const controls = section('Controls', (host) => {
      host.append(
        list([
          'WASD or arrow keys — move',
          'Space or left mouse — attack',
          'E — interact with doors and message stones',
          'Esc — close a dialog or overlay',
        ]),
      );
    });

    this.body.replaceChildren(intro, table, example, values, items, controls);
  }
}
