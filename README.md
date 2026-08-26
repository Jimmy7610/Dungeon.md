# Dungeon.md

**Write Markdown. Play Games.**
_Your README is now a dungeon._

Dungeon.md turns ordinary Markdown into a playable top-down dungeon game. Headings become rooms,
lists become loot, checkboxes become quests, links become doors, and fenced directives spawn enemies
and bosses. You type on the left; the dungeon rebuilds itself on the right, live.

The Markdown is not documentation *for* the game. **The Markdown is the game.**

````md
## Bug Basement

Something is moving between the TODO comments.

```enemy
type: bug
count: 4
health: 25
```

- Git Key

- [ ] Squash the bugs

[Enter Dependency Hell](#dependency-hell)
````

That snippet is a real, playable room: four bugs that chase you, a key you can pick up, a quest that
ticks itself when the room is clear, and a door to the next chapter.

---

## Why this exists

Every developer already writes Markdown all day. Dungeon.md asks a simple question: what if that
file was a game instead of a document? The answer turned out to be a tiny, honest game engine —
a deterministic parser, a clean intermediate representation, and a Phaser runtime that never knows
Markdown exists.

It is deliberately **one mechanic done well** rather than a half-finished RPG.

---

## How Markdown maps to the game

| Markdown             | Dungeon.md         |
| -------------------- | ------------------ |
| `# Title`            | Dungeon            |
| `## Room`            | Room               |
| `- Item`             | Loot               |
| `- [ ] Quest`        | Quest              |
| `> Text`             | NPC/message        |
| `[Door](#room)`      | Door               |
| `enemy` fenced block | Enemy spawn        |
| `boss` fenced block  | Boss               |
| `door` fenced block  | Locked/custom door |

Plain paragraphs become room narration, shown briefly when you walk in. Text before the first `##`
becomes the first room's opening lines. Everything else in the document — other fenced code blocks,
tables, raw HTML — is ignored by the game.

---

## Features

- **Live editing.** Edit the Markdown, and the dungeon rebuilds after a short debounce. Change
  `count: 3` to `count: 7` and seven slimes appear.
- **A real game.** Movement, melee combat with knockback and hit flashes, invulnerability frames,
  chasing enemies, a boss with a telegraphed charge, a projectile volley and an enrage phase.
- **Quests that complete themselves.** The parser infers what each checkbox means — collect an item,
  clear a room, defeat the boss, reach a room — by matching the quest text against what the dungeon
  actually contains, case-insensitively.
- **Locked doors.** A `door` directive with `requires:` stays shut until you carry that item.
- **Deterministic rooms.** The room id is hashed to pick one of six hand-authored layouts and to
  seed object placement, so the same Markdown always produces the same dungeon.
- **Load your own `.md`.** File picker or drag-and-drop. Nothing is uploaded; there is no server.
- **Export your progress.** Ticks the checkboxes you completed and downloads the updated Markdown,
  leaving the rest of the document byte-for-byte identical.
- **Parser warnings.** Unknown enemy types, missing door targets and malformed directives surface in
  a small drawer instead of breaking the dungeon.
- **Accessible-ish by default.** Keyboard-operable UI, visible focus rings, real button labels, and
  `prefers-reduced-motion` support that turns off shake, particles and idle animation.

---

## Quick start

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>. The Developer Dungeon loads automatically — start playing, or
start typing.

---

## Controls

| Key                    | Action                                     |
| ---------------------- | ------------------------------------------ |
| `W` `A` `S` `D` / arrows | Move                                     |
| `Space` / left mouse   | Attack                                     |
| `E`                    | Interact with a door or a message stone    |
| `Esc`                  | Close a dialog, the syntax guide, or leave play mode |

The editor keeps the keyboard while it is focused; click the game (or press **▶ Play**) to hand the
controls back.

---

## Syntax reference

Everything below is implemented by the parser. If it is not listed here, the game ignores it.

### Title and rooms

```md
# The Developer Dungeon

## Bug Basement
```

The first `#` names the dungeon. Every `##` creates one room whose id is a slug of the heading
(`## Bug Basement` → `bug-basement`). Duplicate headings get `-2`, `-3` suffixes so ids stay unique
and stable.

### Narration

```md
The build server hums in the darkness.
```

Any paragraph inside a room becomes narration, shown for a few seconds on entry.

### Items

```md
- Debugger
- Coffee Potion
- Git Key
```

| Item                                       | Effect                                     |
| ------------------------------------------ | ------------------------------------------ |
| `Sword`                                    | Melee weapon                               |
| `Debugger`                                 | Stronger melee weapon                      |
| `Health Potion`, `Coffee Potion`           | Restores 2 hearts                          |
| `Git Key`, `Silver Key`                    | Key item; opens `requires:` doors          |
| `Gold`                                     | Adds to the gold counter                   |
| `Stack Overflow Scroll`                    | Temporary damage boost (20 s)              |
| `Rubber Duck`                              | Collectible                                |
| Anything else                              | Generic collectible                        |

Names are matched case-insensitively, and unknown names containing "key", "potion", "sword" or
"gold" inherit the matching behaviour.

### Quests

```md
- [ ] Find the Git Key
- [x] Read the README
```

An unchecked box is an open quest; a checked box starts completed. The parser infers the trigger
from the text:

- names an item in the dungeon → completes when you pick it up
- a "defeat/clear/squash" verb → completes when the room's enemies are dead
- names the boss (or says "boss") → completes when the boss dies
- names a room → completes when you enter it

A quest it cannot interpret still shows in the HUD; it simply never auto-completes.

### Messages

```md
> Nobody has touched this code since 2017.
```

Each blockquote becomes a message stone. Walk up to it, press `E`, read it.

### Doors

```md
[Enter Bug Basement](#bug-basement)
```

Any link to a local anchor becomes a door to that room. Broken targets do not crash anything: the
door renders as unusable, shows `Missing room: #target`, and the parser records a warning.

### Enemy directive

````md
```enemy
type: bug
count: 3
health: 30
damage: 1
```
````

All fields are optional (defaults: `bug`, `1`, `30`, `1`). Types: `bug`, `skeleton`, `slime`,
`dependency`, `null-pointer`. Anything else becomes a generic creature plus a warning. Values are
clamped (count 1–12, health 1–999, damage 0–5).

### Boss directive

````md
```boss
type: legacy-code
name: LEGACY CODE
health: 250
damage: 2
```
````

Types: `legacy-code`, `forgotten-king`. Defaults: health 200, damage 2, name derived from the type.
One boss per room; the **last** boss in the document is the final boss, and beating it ends the run.

### Locked door directive

````md
```door
label: Unlock the Legacy Vault
target: legacy-vault
requires: Git Key
```
````

`target` is required; `label` and `requires` are optional. Without the required item the door shows
`Requires: Git Key` and refuses to open.

---

## Make your own dungeon

1. Click **Load .md** (or drag a `.md` file onto the editor).
2. Or just start typing over the demo — the game rebuilds as you go.
3. Minimum viable dungeon:

````md
# My Dungeon

## Start

- Sword

[Go deeper](#pit)

## Pit

```enemy
type: slime
count: 3
```

- [ ] Clear the pit
````

Tips:

- Room ids come from headings, so `[Go](#pit)` needs a `## Pit` somewhere.
- Give the player a `Sword` or `Debugger` early; bare hands are slow.
- Put the final `boss` block in the last room.

---

## Architecture

```text
Markdown
   ↓  marked lexer + directive parsers
GameDefinition        (plain data: rooms, items, quests, doors, enemies, boss)
   ↓  GameRuntime     (owns state, quests, the single Phaser instance)
DungeonScene          (one room at a time; a room change is a scene restart)
   ↓
Phaser 3 (Arcade physics, procedurally generated textures)
```

Three rules keep it honest:

1. **The parser never imports Phaser.** It runs in plain Node, which is why it is easy to test.
2. **The game never touches the DOM.** It talks to the UI through a small typed `EventBus`.
3. **The DOM never touches the game.** The UI calls a handful of runtime methods and renders events.

Live editing re-parses, prunes state that no longer exists, and restarts the dungeon scene — Phaser
tears down every object, tween, timer and listener for us, so there are no leaks and never more than
one game instance.

---

## Project structure

```text
src/
  main.ts                     entry point + error boundary
  core/
    EventBus.ts               typed pub/sub between runtime and DOM
    rng.ts                    seeded PRNG + string hash (deterministic rooms)
  markdown/
    types.ts                  GameDefinition and friends
    slug.ts                   stable room ids
    sanitize.ts               untrusted text -> plain text
    directives.ts             enemy/boss/door directives + item catalogue
    parser.ts                 Markdown -> GameDefinition
    parser.test.ts            parser test suite
  game/
    config.ts                 every tunable number
    events.ts                 runtime event map + scene contract
    GameRuntime.ts            owns Phaser, state, quests, room transitions
    art/
      pixels.ts               hand-drawn pixel art as text
      textures.ts             art -> generated textures, vignette
    entities/                 Player, Enemy, Boss, Pickup, doors, NPCs
    generation/
      roomTemplates.ts        six hand-authored room shapes
      RoomBuilder.ts          template + seeded placement -> concrete layout
    scenes/
      BootScene.ts            generates textures
      DungeonScene.ts         the room game loop
    systems/
      GameState.ts            health, inventory, quests, defeated things
      QuestSystem.ts          trigger matching
      CombatSystem.ts         damage, melee arc, knockback
  ui/
    AppController.ts          wires DOM to runtime
    EditorController.ts       textarea, debounce, file load, drag & drop
    HudController.ts          hearts, quests, boss bar, toasts
    HudFrame.ts               keeps the HUD aligned to the canvas
    HelpModal.ts              in-app syntax guide (built from data)
    highlight.ts              editor syntax highlighting
    exportMarkdown.ts         tick completed checkboxes, download
    ui.test.ts                highlighter + export test suite
  demo/developerDungeon.ts    the built-in adventure
  styles/main.css             the whole UI
```

---

## Development

```bash
npm run dev        # Vite dev server
npm test           # Vitest (parser, highlighter, export)
npm run typecheck  # tsc --noEmit, strict mode
npm run build      # typecheck + production build
npm run preview    # serve the production build
```

TypeScript runs in strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.

---

## Security model

Imported Markdown is treated as untrusted input:

- Raw HTML blocks are dropped by the parser and never rendered.
- Every user-visible string is sanitised (tags stripped, entities decoded, control characters
  removed, length capped) before it reaches the DOM or the canvas.
- All DOM text is written with `textContent`; the only generated HTML is the editor highlighter,
  which escapes its input first and emits nothing but `<span>` wrappers.
- No `eval`, no `new Function`, no remote code, no network requests at runtime.
- Loading a file uses the browser File API only. Nothing is uploaded — there is no backend.

The parser is also written never to throw: malformed input produces warnings and a best-effort
dungeon, not a white screen.

---

## Deployment

The build is fully static and uses a relative base path, so it works from any sub-path.

**Vercel** — import the repo; framework preset "Vite", build command `npm run build`, output `dist`.
No server functions required.

**GitHub Pages** — `npm run build` and publish `dist/`, e.g. with an action that uploads
`./dist` as the Pages artifact. Because `base` is `./`, a project page at
`https://user.github.io/Dungeon.md/` works without extra configuration.

**Anything else** — it is a folder of static files.

---

## Contributing

Issues and pull requests are welcome. A few guidelines that keep the project pleasant:

- Keep the parser free of Phaser imports and the game free of DOM access.
- New syntax needs three things: parser support, a test, and a row in the in-app syntax guide
  (`src/ui/HelpModal.ts`). Never document syntax the parser does not implement.
- New tunables belong in `src/game/config.ts`, not inline in a scene.
- Run `npm test`, `npm run typecheck` and `npm run build` before opening a PR.

Good first contributions: a new room template, a new enemy type (art + profile + docs), or better
quest-trigger inference.

---

## Limitations

- One boss per room, and only the last boss in the document ends the run.
- Quest inference is heuristic. Phrasing that names nothing in the dungeon stays manual and never
  auto-completes.
- Progress is not persisted; a page reload starts the run over.
- There is no audio at all — the game runs with Phaser's audio subsystem disabled.
- Very large documents are capped at 200 rooms and 60 objects per room.
- Enemies chase directly rather than pathfinding, so they can bunch up on a wall corner.
- The layout targets desktop; narrow screens get tabs and a smaller canvas.

## Future ideas

- Generated Web Audio sound effects (nothing downloaded, still MIT-clean).
- More enemy types and room templates.
- Saving progress to `localStorage`.
- A shareable URL that encodes the dungeon.

---

## License

[MIT](LICENSE) © 2026 Jimmy Eliasson.

Built with [Vite](https://vite.dev), [TypeScript](https://www.typescriptlang.org),
[Phaser 3](https://phaser.io) and [marked](https://marked.js.org). All art is generated at runtime
from pixel data in this repository — no external assets, no hotlinked images.
