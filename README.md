# Dungeon.md

**Write Markdown. Play Games.**
_Your README is now a dungeon._

[![Deploy to GitHub Pages](https://github.com/Jimmy7610/Dungeon.md/actions/workflows/deploy.yml/badge.svg)](https://github.com/Jimmy7610/Dungeon.md/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-63e0ff.svg)](LICENSE)

**▶ [Play Dungeon.md in your browser](https://jimmy7610.github.io/Dungeon.md/)**

> **What if your README was the game?**
>
> **Dungeon.md turns ordinary Markdown into a playable action game — live.**
>
> Write on the left. Play on the right.
>
> `## Heading` → Room  
> `- Item` → Loot  
> `- [ ] Quest` → Quest  
> `[Door](#room)` → Door  
> fenced `enemy` → Enemy  
> fenced `boss` → Boss
>
> Change the Markdown and the dungeon rebuilds instantly.

**The Markdown isn't documentation for the game. The Markdown is the game.**

**17 rooms · 64 enemies · 51 items · 6 weapons · 3 secret rooms · 1 final boss**

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

## The campaign

The built-in **Developer Dungeon** is a 17-room run: 14 on the main path and 3 secret rooms you only
find by looking.

```text
The Repository → Bug Basement → Cache Corridor → Null Hall → Dependency Hell
  → Package Graveyard → Merge Chamber → CI Gauntlet → Firewall Gate → Memory Leak
  → Deprecated Wing → Refactor Lab → Legacy Archive → Legacy Vault
```

Secrets: **404 Room** (off Null Hall), **Stash Overflow** (off Package Graveyard) and **Root Cellar**
(off Legacy Archive). Each one has a door straight back, so you can never strand yourself.

Difficulty ramps by mixing enemy types, adding elites and moving equipment forward rather than by
inflating enemy counts. The mandatory path alone is enough to beat LEGACY CODE - the secret loot
(Root Access, Root Armor, `sudo`) makes the run easier and more fun, never obligatory.

## How Markdown maps to the game

| Markdown             | Dungeon.md         |
| -------------------- | ------------------ |
| `# Title`            | Dungeon            |
| `## Room`            | Room               |
| `- Item`             | Loot               |
| `- [ ] Quest`        | Quest              |
| `> Text`             | NPC/message        |
| `[Door](#room)`      | Door               |
| `- Merge Axe`        | Weapon             |
| `- Firewall Vest`    | Armor              |
| `enemy` fenced block | Enemy spawn        |
| `elite: true`        | Elite enemy        |
| `boss` fenced block  | Boss               |
| `door` fenced block  | Locked/custom door |
| `hidden: true`       | Secret door        |
| `room` fenced block  | Room theme         |

Plain paragraphs become room narration, shown briefly when you walk in. Text before the first `##`
becomes the first room's opening lines. Everything else in the document — other fenced code blocks,
tables, raw HTML — is ignored by the game.

---

## Features

- **A 17-room campaign.** 14 main rooms and 3 optional secret rooms, roughly 15-25 minutes, ending
  with the LEGACY CODE boss. All of it is defined by the built-in Markdown - there is no
  campaign-specific code in the game.
- **Live editing.** Edit the Markdown, and the dungeon rebuilds after a short debounce. Change
  `count: 3` to `count: 7` and seven slimes appear; flip `elite: false` to `true` and they grow an
  aura.
- **Equipment.** Six weapons that genuinely play differently (reach, arc, speed, knockback) and four
  armour tiers that absorb damage before your hearts. Walking over a weapon never swaps it: a
  comparison card appears and you press E.
- **Elites and secrets.** `elite: true` makes a bigger, tougher, visibly marked enemy. `hidden: true`
  turns a door into a seam in the wall that only reveals itself when you walk up to it.
- **A real game.** Movement, melee combat with knockback and hit flashes, invulnerability frames,
  chasing enemies, a boss with a telegraphed charge, a projectile volley and an enrage phase.
- **Quests that complete themselves.** The parser infers what each checkbox means — collect an item,
  clear a room, defeat the boss, reach a room — by matching the quest text against what the dungeon
  actually contains, case-insensitively.
- **Locked doors.** A `door` directive with `requires:` stays shut until you carry that item.
- **Deterministic rooms.** The room id is hashed to pick one of six hand-authored layouts and to
  seed object placement and decoration, so the same Markdown always produces the same dungeon.
- **Code-generated pixel art.** Every sprite, tile and effect is drawn from data in
  `src/game/art/` at boot. No image files and no asset packs - the art is as forkable as the code.
- **15 room themes.** A `room` directive repaints the floor, walls, ambient glow and decoration
  without touching collision, physics or doors.
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

| Input                    | Action                                               |
| ------------------------ | ---------------------------------------------------- |
| `W` `A` `S` `D` / arrows | Move                                                 |
| Mouse                    | Aim, full 360°                                       |
| Left mouse / `Space`     | Attack toward the aim                                |
| `E`                      | Interact with a door or a message stone              |
| `Esc`                    | Close a dialog, the syntax guide, or leave play mode |

Movement and aim are independent. The keys only move you and the mouse only points you, so you can
back away from an elite while still swinging at it. Until you touch the mouse, aim falls back to the
direction you are walking, and keyboard-only play works as it always did.

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

Walking over an item picks it up. **Weapons and armour are different**: standing next to one shows a
comparison card, and you press `E` to equip it, so a stray step never costs you your weapon.

Items that would be wasted are left on the floor - a Health Potion at full health stays put and says
so, rather than vanishing for nothing.

#### Weapons

One weapon slot. Every weapon multiplies the same swing, so they feel different rather than just
bigger. The Debugger is the 1.00x baseline.

| Weapon                | Damage | Speed  | Reach | Notes                          |
| --------------------- | ------ | ------ | ----- | ------------------------------ |
| `Debugger`            | 1.00x  | 1.00x  | 1.00x | Fast and dependable            |
| `Refactor Blade`      | 1.30x  | faster | 1.15x | A clean straight upgrade       |
| `Stack Trace Spear`   | 1.45x  | slower | 1.65x | Long reach, narrow arc         |
| `Dependency Hammer`   | 1.85x  | slow   | 1.00x | Enormous knockback             |
| `Merge Axe`           | 2.08x  | slow-ish | 1.26x | Wide arc, late-game workhorse |
| `Root Access`         | 2.40x  | ~1.00x | 1.35x | Secret; excellent, not broken  |

`Sword` from the original syntax still works, as a slightly weaker Debugger.

#### Armor

One armour slot. Armour absorbs damage **before** your hearts, and overflow carries into health:
with 1 armour, a 2-damage hit removes the armour and one heart. Equipping armour fills it.

| Armor           | Capacity |
| --------------- | -------- |
| `Cache Jacket`  | 1        |
| `Firewall Vest` | 2        |
| `Kernel Plate`  | 3        |
| `Root Armor`    | 5 (secret) |

#### Recovery

| Item             | Effect                                              |
| ---------------- | --------------------------------------------------- |
| `Coffee Potion`  | +2 hearts                                            |
| `Health Potion`  | +3 hearts                                            |
| `Energy Drink`   | +1 heart and ~20% movement speed for 4 seconds        |
| `Patch Kit`      | +2 armour, capped at your armour's capacity           |
| `Full Restore`   | Hearts and armour back to full                        |
| `Heart Upgrade`  | +1 maximum heart for the rest of the run              |

#### Special

| Item                    | Effect                                                    |
| ----------------------- | --------------------------------------------------------- |
| `Rubber Duck`           | Permanently ~10% faster attacks (does not stack)           |
| `Stack Overflow Scroll` | Your next *connecting* hit does 3x damage                  |
| `Hotfix`                | Survive one death with 2 hearts and brief invulnerability  |
| `Commit Shield`         | Blocks one incoming hit entirely, before armour            |
| `sudo`                  | +15% damage and +1 armour capacity (once)                  |
| `Git Key`, `Silver Key` | Opens doors with `requires:`                               |
| `Gold`                  | Score counter, shown on the victory screen                 |

Anything else becomes a generic collectible, and unknown names containing "key", "potion", "vest",
"sword" and friends inherit the matching behaviour.

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

Add `elite: true` for a tougher variant: ~1.35x larger, ~1.9x health (unless you set `health:`
yourself), +1 damage, slightly faster, resistant to knockback, and marked with an aura so it reads
at a glance. `elite` accepts `true/false/yes/no/on/off/1/0`; anything else is treated as `false`.

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

`target` is required; `label`, `requires` and `hidden` are optional. Without the required item the
door shows `Requires: Git Key` and refuses to open.

Add `hidden: true` to make a secret door. It renders as a faint seam instead of a lit archway, has a
slightly larger interaction radius so it is forgiving to stand next to, and its prompt is marked with
a ✦. It is findable, not invisible.

### Room theme directive

````md
```room
theme: firewall
```
````

Applies to the `##` room it appears under. Themes change the floor palette, wall accents, ambient
glow and non-colliding decoration only - never physics, collision, doors or spawns.

Available themes: `repository`, `basement`, `cache`, `null`, `dependency`, `graveyard`, `merge`,
`ci`, `firewall`, `memory`, `deprecated`, `refactor`, `archive`, `vault`, `secret`. An unknown theme
warns and falls back to `repository`.

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
    items.ts                  the item registry (categories + effects)
    themes.ts                 the room theme list
    slug.ts                   stable room ids
    sanitize.ts               untrusted text -> plain text
    directives.ts             enemy/boss/door/room directives
    parser.ts                 Markdown -> GameDefinition
    parser.test.ts            parser test suite
  game/
    config.ts                 every tunable number + theme palettes
    events.ts                 runtime event map + scene contract
    items/weapons.ts          weapon registry (damage/speed/reach/arc)
    GameRuntime.ts            owns Phaser, state, quests, room transitions
    art/
      palettes.ts             shared colour ramps
      player.ts               player frames + armour overlays
      enemies.ts              enemy sprites and animation frames
      items.ts                weapon, armour, recovery and special sprites
      bosses.ts               LEGACY CODE, generated from a fixed seed
      effects.ts              shadows, particles, projectiles, vignette
      registry.ts             every sprite, as plain testable data
      textures.ts             registry -> generated GPU textures
      art.test.ts             sprite/texture/theme coverage suite
    entities/                 Player, Enemy, Boss, Pickup, doors, NPCs
    generation/
      roomTemplates.ts        six hand-authored room shapes
      RoomBuilder.ts          template + seeded placement -> concrete layout
    scenes/
      BootScene.ts            generates textures
      DungeonScene.ts         the room game loop
    systems/
      GameState.ts            health, armour, equipment, specials, pickups
      gameState.test.ts       items, armour, weapons, damage pipeline
      QuestSystem.ts          trigger matching
      CombatSystem.ts         pure melee geometry and knockback maths
  ui/
    AppController.ts          wires DOM to runtime
    EditorController.ts       textarea, debounce, file load, drag & drop
    HudController.ts          hearts, quests, boss bar, toasts
    HudFrame.ts               keeps the HUD aligned to the canvas
    HelpModal.ts              in-app syntax guide (built from data)
    highlight.ts              editor syntax highlighting
    exportMarkdown.ts         tick completed checkboxes, download
    ui.test.ts                highlighter + export test suite
  demo/
    developerDungeon.ts       the built-in 17-room campaign
    campaign.test.ts          validates the campaign end to end
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

**GitHub Pages** — already wired up. [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
runs on every push to `main` (and on demand via *Actions → Deploy to GitHub Pages → Run workflow*):
it installs with `npm ci`, runs the tests and the typecheck, builds, and publishes `dist/` with the
official Pages actions. The repository's Pages source is set to **GitHub Actions**; a fork needs that
set once under *Settings → Pages* before its first deployment.

Vite's `base` is `./`, so the emitted asset URLs are relative and a project page served from
`/Dungeon.md/` resolves them correctly — no environment-specific build, and `npm run dev` and
`npm run preview` keep working unchanged at the root path.

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
from pixel data in this repository — no external assets, no hotlinked images, nothing downloaded.
Sprites live in `src/game/art/` as text grids (one character per pixel, indexing a palette) and
become textures when the game boots, so the whole look of the game is open-source and editable in a
text editor.
