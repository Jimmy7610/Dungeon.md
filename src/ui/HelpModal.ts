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
  { markdown: '- Merge Axe', becomes: 'Weapon', note: 'Press E to equip it.' },
  { markdown: '- Kernel Plate', becomes: 'Armor', note: 'Press E to equip it.' },
  { markdown: '- [ ] Find the Git Key', becomes: 'Quest', note: 'Completes when you do it.' },
  { markdown: '- [x] Already done', becomes: 'Completed quest', note: 'Starts ticked.' },
  { markdown: '> Some text', becomes: 'Message stone', note: 'Press E to read it.' },
  { markdown: '[Go](#room-id)', becomes: 'Door', note: 'Links to another room heading.' },
  { markdown: '```room', becomes: 'Room theme', note: 'theme: one of the list below.' },
  { markdown: '```enemy', becomes: 'Enemy spawn', note: 'type, count, health, damage, elite.' },
  { markdown: 'elite: true', becomes: 'Elite enemy', note: 'Bigger, tougher, marked with an aura.' },
  { markdown: '```boss', becomes: 'Boss fight', note: 'type, name, health, damage.' },
  { markdown: '```door', becomes: 'Locked door', note: 'label, target, requires, hidden.' },
  { markdown: 'hidden: true', becomes: 'Secret door', note: 'Dressed down; find it by walking near.' },
];

const EXAMPLE = `# The Developer Dungeon

## Firewall Gate

\`\`\`room
theme: firewall
\`\`\`

The last security layer is still running.

- Firewall Vest
- Patch Kit

\`\`\`enemy
type: dependency
count: 4
health: 60
\`\`\`

\`\`\`enemy
type: null-pointer
count: 1
health: 120
damage: 2
elite: true
\`\`\`

- [ ] Survive the Firewall Gate

\`\`\`door
label: Pry open the loose panel
target: root-cellar
hidden: true
\`\`\`

[Enter Memory Leak](#memory-leak)`;

const WEAPONS = [
  'Debugger - the baseline: fast and reliable',
  'Refactor Blade - stronger, slightly faster, a little longer',
  'Stack Trace Spear - long reach, narrow arc, slower',
  'Dependency Hammer - heavy damage, huge knockback, slow',
  'Merge Axe - very strong with a wide arc',
  'Root Access - the secret one',
];

const ARMOR = [
  'Cache Jacket - 1 armor',
  'Firewall Vest - 2 armor',
  'Kernel Plate - 3 armor',
  'Root Armor - 5 armor (secret)',
];

const RECOVERY = [
  'Coffee Potion - +2 hearts',
  'Health Potion - +3 hearts',
  'Energy Drink - +1 heart and a short speed boost',
  'Patch Kit - +2 armor, up to your armor capacity',
  'Full Restore - refills hearts and armor',
  'Heart Upgrade - +1 maximum heart for the rest of the run',
];

const SPECIAL = [
  'Rubber Duck - permanently faster attacks',
  'Stack Overflow Scroll - your next connecting hit does triple damage',
  'Hotfix - survives one death with 2 hearts',
  'Commit Shield - blocks one incoming hit completely',
  'sudo - more damage and one extra point of armor capacity',
  'Git Key / Silver Key - opens doors with `requires:`',
  'Gold - counts towards your final score',
];

const ENEMY_TYPES = ['bug', 'skeleton', 'slime', 'dependency', 'null-pointer'];
const BOSS_TYPES = ['legacy-code', 'forgotten-king'];
const THEMES = [
  'repository', 'basement', 'cache', 'null', 'dependency', 'graveyard', 'merge',
  'ci', 'firewall', 'memory', 'deprecated', 'refactor', 'archive', 'vault', 'secret',
];

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
      const themes = document.createElement('p');
      themes.textContent = `room theme: ${THEMES.join(', ')}`;
      const numbers = document.createElement('p');
      numbers.textContent =
        'count 1–12 · enemy health 1–999 · boss health 10–9999 · damage 0–5. elite and hidden accept true/false. Missing fields fall back to sensible defaults.';
      host.append(enemies, bosses, themes, numbers);
    });

    const items = section('Weapons', (host) => host.append(list(WEAPONS)));
    const armor = section('Armor', (host) => {
      const intro = document.createElement('p');
      intro.textContent = 'Armor absorbs damage before your hearts do. One armor slot.';
      host.append(intro, list(ARMOR));
    });
    const recovery = section('Recovery', (host) => host.append(list(RECOVERY)));
    const special = section('Special items', (host) => host.append(list(SPECIAL)));

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

    this.body.replaceChildren(
      intro,
      table,
      example,
      values,
      items,
      armor,
      recovery,
      special,
      controls,
    );
  }
}
