import { marked } from 'marked';
import {
  createItem,
  parseBossDirective,
  parseDoorDirective,
  parseEnemyDirective,
  parseRoomDirective,
  type WarnFn,
} from './directives.ts';
import { DEFAULT_THEME } from './themes.ts';
import { sanitizeInline, sanitizeText } from './sanitize.ts';
import { anchorToId, createSlugger, slugify } from './slug.ts';
import {
  DEFAULT_TITLE,
  type GameDefinition,
  type ParseWarning,
  type QuestDefinition,
  type QuestTrigger,
  type RoomDefinition,
} from './types.ts';

/**
 * Loose view of a `marked` token. The lexer's own union is large and shifts
 * between releases; this shape covers everything the game format needs and
 * keeps the walker readable without sprinkling `any` around.
 */
interface MdToken {
  type: string;
  raw?: string;
  text?: string;
  depth?: number;
  lang?: string;
  href?: string;
  task?: boolean;
  checked?: boolean;
  items?: MdToken[];
  tokens?: MdToken[];
}

const MAX_ROOMS = 200;
const MAX_OBJECTS_PER_ROOM = 60;
const MAX_NARRATION_LINES = 8;

function emptyRoom(id: string, title: string): RoomDefinition {
  return {
    id,
    title,
    theme: DEFAULT_THEME,
    narration: [],
    items: [],
    quests: [],
    npcs: [],
    enemies: [],
    doors: [],
  };
}

function isLocalAnchor(href: string | undefined): href is string {
  return typeof href === 'string' && href.startsWith('#') && href.length > 1;
}

/** Depth-first search for link tokens anywhere inside an inline token tree. */
function collectLinks(tokens: MdToken[] | undefined, out: MdToken[] = []): MdToken[] {
  if (!tokens) return out;
  for (const token of tokens) {
    if (token.type === 'link') out.push(token);
    if (token.tokens) collectLinks(token.tokens, out);
    if (token.items) collectLinks(token.items, out);
  }
  return out;
}

/**
 * Flatten inline tokens to plain text. Local-anchor links become doors, so
 * their label is dropped from narration - otherwise "Enter the Hall" would
 * appear twice: once as story text and once as a door.
 */
function inlineText(tokens: MdToken[] | undefined, fallback = ''): string {
  if (!tokens || tokens.length === 0) return fallback;
  let out = '';
  for (const token of tokens) {
    if (token.type === 'link' && isLocalAnchor(token.href)) continue;
    if (token.type === 'html') continue;
    if (token.tokens && token.type !== 'code' && token.type !== 'codespan') {
      out += inlineText(token.tokens, token.text ?? '');
    } else {
      out += token.text ?? '';
    }
  }
  return out;
}

function pushNarration(room: RoomDefinition, raw: string): void {
  const text = sanitizeInline(raw, 240);
  if (!text) return;
  if (room.narration.length >= MAX_NARRATION_LINES) return;
  room.narration.push(text);
}

interface DirectiveCounters {
  enemy: number;
  door: number;
  item: number;
  quest: number;
  npc: number;
}

function roomObjectCount(room: RoomDefinition): number {
  return (
    room.items.length +
    room.npcs.length +
    room.doors.length +
    room.enemies.length +
    room.quests.length
  );
}

/**
 * Markdown -> GameDefinition.
 *
 * Never throws: malformed input produces warnings and a best-effort dungeon.
 */
export function parseMarkdown(source: string): GameDefinition {
  const warnings: ParseWarning[] = [];
  const warn: WarnFn = (warning) => {
    if (warnings.length < 40) warnings.push(warning);
  };

  let tokens: MdToken[] = [];
  try {
    tokens = marked.lexer(typeof source === 'string' ? source : '') as unknown as MdToken[];
  } catch {
    warn({
      level: 'warn',
      message: 'This Markdown could not be tokenised - showing an empty dungeon.',
    });
    return { title: DEFAULT_TITLE, rooms: [], warnings };
  }

  const slugger = createSlugger();
  const rooms: RoomDefinition[] = [];
  let title = '';
  let truncated = false;

  // Content before the first `##` is buffered here and merged into the first
  // room, so a prologue paragraph is never silently lost.
  let current = emptyRoom('', '');
  let currentIsPrologue = true;
  let counters: DirectiveCounters = { enemy: 0, door: 0, item: 0, quest: 0, npc: 0 };

  const startRoom = (headingText: string): void => {
    if (rooms.length >= MAX_ROOMS) {
      truncated = true;
      return;
    }
    const roomTitle = sanitizeInline(headingText, 60) || 'Room';
    const room = emptyRoom(slugger(roomTitle), roomTitle);

    if (currentIsPrologue) {
      // Adopt the prologue content and re-key its ids to the new room.
      room.narration = current.narration.slice(0, MAX_NARRATION_LINES);
      room.items = current.items.map((item, index) => ({
        ...item,
        id: `${room.id}:item:${index}`,
      }));
      room.npcs = current.npcs.map((npc, index) => ({ ...npc, id: `${room.id}:npc:${index}` }));
      room.quests = current.quests.map((quest, index) => ({
        ...quest,
        id: `${room.id}:quest:${index}`,
      }));
      room.enemies = current.enemies.map((group, index) => ({
        ...group,
        id: `${room.id}:enemy:${index}`,
      }));
      room.doors = current.doors.map((door, index) => ({ ...door, id: `${room.id}:door:${index}` }));
      if (current.boss) room.boss = { ...current.boss, id: `${room.id}:boss` };
      if (current.theme !== DEFAULT_THEME) room.theme = current.theme;
      currentIsPrologue = false;
    }

    counters = {
      enemy: room.enemies.length,
      door: room.doors.length,
      item: room.items.length,
      quest: room.quests.length,
      npc: room.npcs.length,
    };
    rooms.push(room);
    current = room;
  };

  const addDoorsFromTokens = (tokenList: MdToken[] | undefined): void => {
    for (const link of collectLinks(tokenList)) {
      if (!isLocalAnchor(link.href)) continue;
      if (roomObjectCount(current) >= MAX_OBJECTS_PER_ROOM) continue;
      const label = sanitizeInline(inlineText(link.tokens, link.text ?? ''), 60) || 'Door';
      current.doors.push({
        id: `${current.id}:door:${counters.door++}`,
        label,
        target: anchorToId(link.href),
        hidden: false,
        broken: false,
      });
    }
  };

  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const depth = token.depth ?? 1;
        const headingText = inlineText(token.tokens, token.text ?? '');
        if (depth === 1) {
          if (!title) title = sanitizeInline(headingText, 60);
          else pushNarration(current, headingText);
        } else if (depth === 2) {
          startRoom(headingText);
        } else {
          pushNarration(current, headingText);
        }
        break;
      }

      case 'paragraph': {
        addDoorsFromTokens(token.tokens);
        pushNarration(current, inlineText(token.tokens, token.text ?? ''));
        break;
      }

      case 'blockquote': {
        const lines: string[] = [];
        const walk = (list: MdToken[] | undefined): void => {
          if (!list) return;
          for (const child of list) {
            if (child.type === 'paragraph' || child.type === 'text') {
              const text = sanitizeInline(inlineText(child.tokens, child.text ?? ''), 200);
              for (const line of text.split('\n')) {
                const trimmed = line.trim();
                if (trimmed) lines.push(trimmed);
              }
            } else if (child.tokens) {
              walk(child.tokens);
            }
          }
        };
        walk(token.tokens);
        addDoorsFromTokens(token.tokens);
        if (lines.length > 0 && roomObjectCount(current) < MAX_OBJECTS_PER_ROOM) {
          current.npcs.push({
            id: `${current.id}:npc:${counters.npc++}`,
            lines: lines.slice(0, 6),
          });
        }
        break;
      }

      case 'list': {
        for (const item of token.items ?? []) {
          if (roomObjectCount(current) >= MAX_OBJECTS_PER_ROOM) break;
          const rawText = inlineText(item.tokens, item.text ?? '');
          const text = sanitizeInline(rawText, 120);
          const links = collectLinks(item.tokens).filter((link) => isLocalAnchor(link.href));

          if (item.task) {
            current.quests.push({
              id: `${current.id}:quest:${counters.quest++}`,
              text: text || 'Quest',
              done: item.checked === true,
              trigger: { kind: 'manual' },
            });
            addDoorsFromTokens(item.tokens);
            continue;
          }

          if (links.length > 0) {
            // A bullet that contains a room link is a door, not loot.
            addDoorsFromTokens(item.tokens);
            continue;
          }

          const created = createItem(text, `${current.id}:item:${counters.item}`);
          if (created) {
            counters.item++;
            current.items.push(created);
          }
        }
        break;
      }

      case 'code': {
        const lang = (token.lang ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
        const body = token.text ?? '';
        if (lang === 'enemy') {
          if (roomObjectCount(current) >= MAX_OBJECTS_PER_ROOM) break;
          current.enemies.push(
            parseEnemyDirective(
              body,
              `${current.id}:enemy:${counters.enemy++}`,
              current.title,
              warn,
            ),
          );
        } else if (lang === 'boss') {
          if (current.boss) {
            warn({
              level: 'warn',
              room: current.title,
              message: 'Only one boss per room - the extra `boss` directive was ignored.',
            });
            break;
          }
          current.boss = parseBossDirective(body, `${current.id}:boss`, current.title, warn);
        } else if (lang === 'room') {
          current.theme = parseRoomDirective(body, current.title, warn).theme;
        } else if (lang === 'door') {
          if (roomObjectCount(current) >= MAX_OBJECTS_PER_ROOM) break;
          const door = parseDoorDirective(
            body,
            `${current.id}:door:${counters.door}`,
            current.title,
            warn,
          );
          if (door) {
            counters.door++;
            current.doors.push(door);
          }
        }
        // Any other fenced block is ordinary code in the document: ignored.
        break;
      }

      case 'html':
        // Raw HTML never becomes game content and is never rendered.
        break;

      case 'table': {
        pushNarration(current, sanitizeText(token.text ?? '', 120));
        break;
      }

      default:
        break;
    }
  }

  if (truncated) {
    warn({
      level: 'warn',
      message: `Only the first ${MAX_ROOMS} rooms are playable - the rest were ignored.`,
    });
  }

  if (!title) {
    title = DEFAULT_TITLE;
    if (rooms.length > 0) {
      warn({ level: 'info', message: `No "# Title" found - using "${DEFAULT_TITLE}".` });
    }
  }

  const game: GameDefinition = { title, rooms, warnings };
  validateDoors(game, warn);
  resolveQuestTriggers(game);
  return game;
}

function validateDoors(game: GameDefinition, warn: WarnFn): void {
  const ids = new Set(game.rooms.map((room) => room.id));
  for (const room of game.rooms) {
    for (const door of room.doors) {
      if (!ids.has(door.target)) {
        door.broken = true;
        warn({
          level: 'warn',
          room: room.title,
          message: `Door target "#${door.target}" was not found.`,
        });
      }
    }
  }
}

const DEFEAT_VERBS = /\b(defeat|kill|slay|destroy|beat|clear|crush|squash|debug|fix)\b/i;
const REACH_VERBS = /\b(reach|enter|escape|arrive|visit|explore|descend|survive)\b/i;

function includesWord(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return haystack.includes(needle.toLowerCase());
}

interface TriggerContext {
  itemNames: Set<string>;
  bosses: { id: string; name: string; type: string }[];
  roomsByTitle: { id: string; title: string }[];
  enemyWords: Set<string>;
}

/**
 * Quests are written in prose, so triggers are inferred by matching the quest
 * text against the things the dungeon actually contains. Matching is
 * case-insensitive and always falls back to a harmless manual quest.
 */
function resolveQuestTriggers(game: GameDefinition): void {
  const itemNames = new Set<string>();
  const bosses: { id: string; name: string; type: string }[] = [];
  const roomsByTitle: { id: string; title: string }[] = [];
  const enemyWords = new Set<string>();

  for (const room of game.rooms) {
    roomsByTitle.push({ id: room.id, title: room.title.toLowerCase() });
    for (const item of room.items) itemNames.add(item.name.toLowerCase());
    if (room.boss) {
      bosses.push({ id: room.boss.id, name: room.boss.name.toLowerCase(), type: room.boss.type });
    }
    for (const group of room.enemies) {
      enemyWords.add(group.type);
      enemyWords.add(`${group.type}s`);
      enemyWords.add(group.type.replace(/-/g, ' '));
    }
  }

  const ctx: TriggerContext = { itemNames, bosses, roomsByTitle, enemyWords };
  for (const room of game.rooms) {
    for (const quest of room.quests) {
      quest.trigger = inferTrigger(quest, room, ctx);
    }
  }
}

function inferTrigger(
  quest: QuestDefinition,
  room: RoomDefinition,
  ctx: TriggerContext,
): QuestTrigger {
  const text = quest.text.toLowerCase();

  for (const boss of ctx.bosses) {
    if (includesWord(text, boss.name) || includesWord(text, boss.type.replace(/-/g, ' '))) {
      return { kind: 'boss', boss: boss.id };
    }
  }
  if (/\bboss\b/.test(text) && ctx.bosses.length > 0) {
    const last = ctx.bosses[ctx.bosses.length - 1];
    if (last) return { kind: 'boss', boss: last.id };
  }

  // Prefer the longest item name so "Stack Overflow Scroll" beats "Scroll".
  const bestItem = [...ctx.itemNames]
    .filter((name) => includesWord(text, name))
    .sort((a, b) => b.length - a.length)[0];

  const isDefeatQuest = DEFEAT_VERBS.test(text);
  if (bestItem && !isDefeatQuest) return { kind: 'item', item: bestItem };

  if (isDefeatQuest) {
    if (room.enemies.length > 0) return { kind: 'enemies', room: room.id };
    // "Defeat the bugs" written in a room that has none: aim at a room the
    // quest names explicitly, if there is one.
    const named = matchRoomByTitle(ctx, text);
    if (named) return { kind: 'enemies', room: named };
  }

  if (bestItem) return { kind: 'item', item: bestItem };

  const bestRoom = matchRoomByTitle(ctx, text);
  if (bestRoom && (REACH_VERBS.test(text) || !isDefeatQuest)) {
    return { kind: 'room', room: bestRoom };
  }

  return { kind: 'manual' };
}

/** Longest room title named inside the quest text, if any. */
function matchRoomByTitle(ctx: TriggerContext, text: string): string | undefined {
  return ctx.roomsByTitle
    .filter((entry) => entry.title.length > 2 && includesWord(text, entry.title))
    .sort((a, b) => b.title.length - a.title.length)[0]?.id;
}

/** The last boss in source order ends the run when defeated. */
export function finalBossId(game: GameDefinition): string | undefined {
  for (let index = game.rooms.length - 1; index >= 0; index--) {
    const boss = game.rooms[index]?.boss;
    if (boss) return boss.id;
  }
  return undefined;
}

export { slugify };
