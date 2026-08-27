#!/usr/bin/env node
/**
 * Competition demo capture.
 *
 * Capture-only tooling: nothing here is imported by the game and the script
 * never edits project sources. It builds the app, serves `dist/` locally,
 * drives a real Chrome over the DevTools Protocol, records the viewport with
 * `Page.startScreencast`, and encodes with the static ffmpeg binary from the
 * `ffmpeg-static` dev dependency.
 *
 *   npm run capture:competition
 *
 * Chrome runs *headed* by default: headless falls back to software rendering,
 * which starves the screencast (measured 4.8 fps versus 45.9 fps headed).
 *
 * Flags:
 *   --headless    force headless (much choppier video; useful on a server)
 *   --skip-build  reuse the existing dist/
 *   --no-gif      skip the GIF
 */

import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'competition');
const WORK = join(OUT, '.work');
const PORT = 5399;
const DEBUG_PORT = 9333;
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;

const args = new Set(process.argv.slice(2));
const HEADLESS = args.has('--headless');
const SKIP_BUILD = args.has('--skip-build');
const MAKE_GIF = !args.has('--no-gif');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...parts) => console.log('[capture]', ...parts);

/** A clock that lets each beat land at an absolute second, absorbing CDP latency. */
function makeClock() {
  const start = Date.now();
  return {
    elapsed: () => (Date.now() - start) / 1000,
    async until(seconds) {
      const wait = seconds * 1000 - (Date.now() - start);
      if (wait > 0) await sleep(wait);
    },
  };
}

/* ------------------------------------------------------------------ markdown */

const FENCE = '`'.repeat(3);

/** The controlled demo document the video edits on camera. */
const DEMO_MARKDOWN = `# Live Demo

## Firewall Lab

${FENCE}room
theme: firewall
${FENCE}

Something is moving behind the build server.

- Debugger

${FENCE}enemy
type: slime
count: 1
health: 30
damage: 1
${FENCE}

Edit the Markdown. Change the game.
`;

/* --------------------------------------------------------------- environment */

function findChrome() {
  const candidates = [
    process.env['CHROME_PATH'],
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    `${process.env['LOCALAPPDATA']}/Google/Chrome/Application/chrome.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const candidate of candidates) if (candidate && existsSync(candidate)) return candidate;
  throw new Error('Could not find Chrome. Set CHROME_PATH to the executable.');
}

function startStaticServer(root, port) {
  const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  };
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    try {
      const body = await readFile(join(root, rel));
      res.writeHead(200, { 'Content-Type': TYPES[extname(rel)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  // Fall forward if the port is busy, so a stray process never blocks a capture.
  return new Promise((ok, fail) => {
    let attempt = 0;
    const tryPort = (candidate) => {
      server.once('error', (error) => {
        if (error.code === 'EADDRINUSE' && attempt < 12) {
          attempt += 1;
          tryPort(candidate + 1);
        } else {
          fail(error);
        }
      });
      server.listen(candidate, '127.0.0.1', () => ok({ server, port: candidate }));
    };
    tryPort(port);
  });
}

/* ---------------------------------------------------------------- cdp client */

class Cdp {
  #ws;
  #nextId = 1;
  #pending = new Map();
  #handlers = new Map();

  static async attach(port) {
    let target = null;
    for (let attempt = 0; attempt < 80 && !target; attempt++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = list.find((entry) => entry.type === 'page');
      } catch {
        /* chrome still starting */
      }
      if (!target) await sleep(250);
    }
    if (!target) throw new Error('No DevTools page target appeared.');
    const client = new Cdp();
    await client.#connect(target.webSocketDebuggerUrl);
    return client;
  }

  async #connect(url) {
    this.#ws = new WebSocket(url);
    this.#ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.#pending.has(message.id)) {
        const { resolve, reject } = this.#pending.get(message.id);
        this.#pending.delete(message.id);
        if (message.error) reject(new Error(JSON.stringify(message.error)));
        else resolve(message.result);
        return;
      }
      const handler = this.#handlers.get(message.method);
      if (handler) handler(message.params);
    });
    await new Promise((ok, fail) => {
      this.#ws.addEventListener('open', ok, { once: true });
      this.#ws.addEventListener('error', fail, { once: true });
    });
  }

  on(method, handler) {
    this.#handlers.set(method, handler);
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(
        `Page error: ${result.exceptionDetails.exception?.description ?? 'unknown'}`,
      );
    }
    return result.result.value;
  }

  close() {
    try {
      this.#ws.close();
    } catch {
      /* already gone */
    }
  }
}

/* -------------------------------------------------------------- input helpers */

async function mouseMove(cdp, x, y) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x, y, button: 'none', buttons: 0,
  });
  await cdp.eval(`window.__cap.cursor(${x}, ${y})`);
}

async function mouseClick(cdp, x, y) {
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1,
  });
  await sleep(40);
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1,
  });
}

const KEY = { KeyA: { code: 'KeyA', key: 'a', vk: 65 }, KeyD: { code: 'KeyD', key: 'd', vk: 68 } };

async function keyDown(cdp, name) {
  const spec = KEY[name];
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown', code: spec.code, key: spec.key,
    windowsVirtualKeyCode: spec.vk, nativeVirtualKeyCode: spec.vk,
  });
}

async function keyUp(cdp, name) {
  const spec = KEY[name];
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp', code: spec.code, key: spec.key,
    windowsVirtualKeyCode: spec.vk, nativeVirtualKeyCode: spec.vk,
  });
}

/* ------------------------------------------------------- in-page capture help */

/** Evaluated into the page for the duration of the capture only. */
const PAGE_HELPERS = String.raw`
(() => {
  const ta = document.getElementById('markdown-input');
  const runtime = window.dungeonMd.runtime;

  const ensure = (id, css) => {
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement('div');
      node.id = id;
      node.style.cssText = css;
      document.body.appendChild(node);
    }
    return node;
  };

  // A screencast does not record the OS pointer, so the mouse-aim section would
  // be unreadable without a stand-in crosshair.
  const dot = ensure('__capture_cursor', [
    'position:fixed','z-index:9998','pointer-events:none',
    'width:22px','height:22px','margin:-11px 0 0 -11px','opacity:0',
    'transition:opacity .18s ease',
    'background:linear-gradient(#63e0ff,#63e0ff) center/2px 22px no-repeat,' +
      'linear-gradient(#63e0ff,#63e0ff) center/22px 2px no-repeat',
    'filter:drop-shadow(0 0 3px rgba(0,0,0,.9))',
  ].join(';'));

  const card = ensure('__capture_endcard', [
    'position:fixed','inset:0','z-index:9999','display:grid','place-items:center',
    'background:radial-gradient(1200px 700px at 50% 42%, #101725, #05070c 72%)',
    'opacity:0','transition:opacity .45s ease','pointer-events:none',
    'font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
  ].join(';'));
  if (!card.dataset.filled) {
    card.dataset.filled = '1';
    card.innerHTML =
      '<div style="text-align:center">' +
      '<div style="font-size:88px;font-weight:700;letter-spacing:-.03em;color:#f2f7ff;line-height:1">' +
      'Dungeon<span style="color:#63e0ff;text-shadow:0 0 36px rgba(99,224,255,.5)">.md</span></div>' +
      '<div style="margin-top:24px;font-size:25px;font-weight:600;letter-spacing:.22em;' +
      'text-transform:uppercase;color:#93a2b8">Write Markdown. Play Games.</div>' +
      '<div style="margin-top:18px;font-size:19px;color:#5f6b7f;font-style:italic">' +
      'Your README is now a dungeon.</div></div>';
  }

  const dispatchInput = () => ta.dispatchEvent(new Event('input', { bubbles: true }));

  window.__cap = {
    ta,
    runtime,
    cursor(x, y) { dot.style.left = x + 'px'; dot.style.top = y + 'px'; },
    showCursor(on) { dot.style.opacity = on ? '1' : '0'; },
    endCard(on) { card.style.opacity = on ? '1' : '0'; },
    setValue(value) { ta.value = value; dispatchInput(); },
    find(needle) { return ta.value.indexOf(needle); },
    blurEditor() { ta.blur(); },
    select(start, end) { ta.focus(); ta.setSelectionRange(start, end); },
    replace(start, end, text) {
      const value = ta.value;
      ta.value = value.slice(0, start) + text + value.slice(end);
      const caret = start + text.length;
      ta.setSelectionRange(caret, caret);
      dispatchInput();
    },
    /** Types inside the page so per-character timing is not at the mercy of CDP latency. */
    async typeInto(index, text, delayMs) {
      ta.focus();
      for (let i = 0; i < text.length; i++) {
        this.replace(index + i, index + i, text[i]);
        await new Promise((r) => setTimeout(r, delayMs));
      }
      return 'typed';
    },
    scene() { return runtime.game.scene.getScene('dungeon'); },
    /**
     * Keep the footage clean: enemies still move and animate, but their contact
     * damage is pushed out of reach so the screen never flashes red mid-take.
     * Re-applied after every rebuild, because each rebuild restarts the scene.
     */
    pacify() {
      const scene = this.scene();
      if (!scene) return 0;
      runtime.state.maxHealth = 20;
      runtime.state.health = 20;
      for (const enemy of scene.enemies) enemy.nextContactAt = Number.MAX_SAFE_INTEGER;
      if (scene.boss) scene.boss.nextContactAt = Number.MAX_SAFE_INTEGER;
      return scene.enemies.length;
    },
    /** What the game currently contains - used to verify each beat landed. */
    snapshot() {
      const scene = this.scene();
      return {
        theme: scene?.room?.theme ?? null,
        enemies: scene?.enemies.length ?? 0,
        elites: scene?.enemies.filter((e) => e.elite).length ?? 0,
        items: scene?.pickups.map((p) => p.definition.specId) ?? [],
      };
    },
    /** World -> page coordinates, read from the live canvas rect. */
    toPage(wx, wy) {
      const c = document.querySelector('#game-host canvas').getBoundingClientRect();
      return [Math.round(c.left + (wx / 800) * c.width), Math.round(c.top + (wy / 544) * c.height)];
    },
    /** Puts the shipped campaign into the Legacy Vault using existing runtime APIs. */
    async toBossRoom() {
      document.getElementById('btn-reset').click();
      document.getElementById('btn-reset').click();
      await new Promise((r) => setTimeout(r, 900));
      runtime.state.maxHealth = 12;
      runtime.state.health = 12;
      runtime.state.equipWeapon('root-access');
      runtime.state.equipArmor('root-armor');
      runtime.goToRoom('legacy-vault', 'legacy-archive');
      await new Promise((r) => setTimeout(r, 1300));
      const scene = this.scene();
      scene.player.setArmor('root-armor');
      scene.player.setPosition(470, 300);
      if (scene.boss) scene.boss.setPosition(610, 250);
      return 'vault';
    },
  };
  return 'ready';
})()
`;

/* ----------------------------------------------------------------- screencast */

class Recorder {
  constructor(cdp) {
    this.cdp = cdp;
    this.frames = [];
    this.active = false;
    cdp.on('Page.screencastFrame', async (params) => {
      if (this.active) this.frames.push({ data: params.data, at: Date.now() });
      try {
        await cdp.send('Page.screencastFrameAck', { sessionId: params.sessionId });
      } catch {
        /* stopped */
      }
    });
  }

  async start() {
    this.frames = [];
    this.stoppedAt = 0;
    this.active = true;
    await this.cdp.send('Page.startScreencast', {
      format: 'jpeg', quality: 92, maxWidth: WIDTH, maxHeight: HEIGHT, everyNthFrame: 1,
    });
  }

  async stop() {
    this.active = false;
    this.stoppedAt = Date.now();
    await this.cdp.send('Page.stopScreencast');
    return { frames: this.frames, stoppedAt: this.stoppedAt };
  }
}

/* -------------------------------------------------------------------- encoding */

/** Turn one run of screencast frames into a constant-rate segment. */
async function encodeSegment(frames, name, stoppedAt) {
  const dir = join(WORK, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  // Frames only arrive when the page repaints, so each is held until the next.
  // That keeps the segment's timing faithful to what actually happened.
  const list = [];
  for (let index = 0; index < frames.length; index++) {
    const file = `f${String(index).padStart(5, '0')}.jpg`;
    await writeFile(join(dir, file), Buffer.from(frames[index].data, 'base64'));
    // The last frame is held until recording actually stopped - a static end
    // card stops repainting, so without this the tail is simply missing.
    const next = frames[index + 1]?.at ?? stoppedAt;
    // Use the true gap. Flooring at 1/FPS would stretch the video whenever the
    // capture runs faster than the output rate (headed Chrome records ~49 fps).
    const hold = Math.max(0.001, (next - frames[index].at) / 1000);
    list.push(`file '${file}'`, `duration ${hold.toFixed(4)}`);
  }
  list.push(`file 'f${String(frames.length - 1).padStart(5, '0')}.jpg'`);
  await writeFile(join(dir, 'list.txt'), list.join('\n'));

  const output = join(WORK, `${name}.mp4`);
  execFileSync(ffmpegPath, [
    '-y', '-f', 'concat', '-safe', '0', '-i', join(dir, 'list.txt'),
    '-vf', `fps=${FPS},scale=${WIDTH}:${HEIGHT}:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', output,
  ], { stdio: 'pipe' });
  return output;
}

async function finish(segments) {
  const concatList = join(WORK, 'segments.txt');
  await writeFile(concatList, segments.map((file) => `file '${file.replace(/\\/g, '/')}'`).join('\n'));

  const mp4 = join(OUT, 'dungeon-md-competition.mp4');
  log('joining segments…');
  execFileSync(ffmpegPath, [
    '-y', '-f', 'concat', '-safe', '0', '-i', concatList,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4,
  ], { stdio: 'pipe' });

  const webm = join(OUT, 'dungeon-md-competition.webm');
  log('encoding webm…');
  execFileSync(ffmpegPath, [
    '-y', '-i', mp4,
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34',
    '-row-mt', '1', '-cpu-used', '5', '-deadline', 'good',
    webm,
  ], { stdio: 'pipe' });

  let gif = null;
  if (MAKE_GIF) {
    log('encoding gif…');
    gif = join(OUT, 'dungeon-md-competition.gif');
    const palette = join(WORK, 'palette.png');
    execFileSync(ffmpegPath, [
      '-y', '-i', mp4, '-vf', 'fps=12,scale=900:-1:flags=lanczos,palettegen=max_colors=128', palette,
    ], { stdio: 'pipe' });
    execFileSync(ffmpegPath, [
      '-y', '-i', mp4, '-i', palette,
      '-lavfi', 'fps=12,scale=900:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3',
      gif,
    ], { stdio: 'pipe' });
  }
  return { mp4, webm, gif };
}

/** Ask ffmpeg what the encoded file actually is, rather than trusting the clock. */
function encodedDuration(file) {
  let text = '';
  try {
    execFileSync(ffmpegPath, ['-i', file], { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    text = error.stderr?.toString() ?? '';
  }
  const match = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(text);
  if (!match) return null;
  return Number(
    (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])).toFixed(2),
  );
}

/* ------------------------------------------------------------------- sequences */

/** Segment A: the Markdown edits, each landing on an absolute beat. */
async function recordMarkdownSegment(cdp, recorder) {
  const marks = {};
  await recorder.start();
  const clock = makeClock();
  const beat = (name) => {
    marks[name] = Number(clock.elapsed().toFixed(2));
  };

  beat('hold');
  await cdp.eval(`window.__cap.pacify()`);
  await clock.until(1.8);

  // count: 1 -> count: 6
  beat('countEdit');
  const countAt = await cdp.eval(`window.__cap.find('count: 1') + 'count: '.length`);
  await cdp.eval(`window.__cap.select(${countAt}, ${countAt + 1})`);
  await clock.until(2.35);
  await cdp.eval(`window.__cap.replace(${countAt}, ${countAt + 1}, '6')`);
  await clock.until(3.1);
  marks['sixEnemies'] = await cdp.eval(`window.__cap.pacify()`);
  await clock.until(4.2);

  // elite: true
  beat('elite');
  const damageEnd = await cdp.eval(`window.__cap.find('damage: 1') + 'damage: 1'.length`);
  await cdp.eval(`window.__cap.typeInto(${damageEnd}, '\\nelite: true', 45)`);
  await clock.until(6.2);
  // Prove the elite flag actually reached the runtime, not just the editor.
  marks['eliteCount'] = (await cdp.eval(`window.__cap.snapshot()`)).elites;
  await cdp.eval(`window.__cap.pacify()`);
  await clock.until(6.4);

  // - Root Access
  beat('rootAccess');
  const debuggerEnd = await cdp.eval(`window.__cap.find('- Debugger') + '- Debugger'.length`);
  await cdp.eval(`window.__cap.typeInto(${debuggerEnd}, '\\n- Root Access', 45)`);
  await clock.until(8.4);
  // Prove the new loot line spawned a real pickup in the room.
  marks['loot'] = (await cdp.eval(`window.__cap.snapshot()`)).items.includes('root-access');
  await clock.until(8.6);

  // theme: firewall -> theme: memory
  beat('theme');
  const themeAt = await cdp.eval(`window.__cap.find('theme: firewall') + 'theme: '.length`);
  await cdp.eval(`window.__cap.select(${themeAt}, ${themeAt + 8})`);
  await clock.until(9.15);
  await cdp.eval(`window.__cap.replace(${themeAt}, ${themeAt + 8}, 'memory')`);
  await clock.until(9.8);
  await cdp.eval(`window.__cap.pacify()`);
  marks['finalTheme'] = (await cdp.eval(`window.__cap.snapshot()`)).theme;
  await clock.until(10.9);

  beat('end');
  const { frames, stoppedAt } = await recorder.stop();
  return { frames, stoppedAt, marks, seconds: clock.elapsed() };
}

/** Segment B: the boss fought on camera, then the end card. */
async function recordBossSegment(cdp, recorder) {
  const marks = {};
  await cdp.eval(`window.__cap.pacify()`);
  const bossPoint = await cdp.eval(`window.__cap.toPage(660, 250)`);
  await mouseMove(cdp, bossPoint[0], bossPoint[1]);
  await cdp.eval(`window.__cap.showCursor(true)`);
  await sleep(150);

  await recorder.start();
  const clock = makeClock();
  marks['boss'] = 0;

  // The mouse stays on LEGACY CODE while the player retreats left and swings.
  await keyDown(cdp, 'KeyA');
  for (let swing = 0; swing < 7; swing += 1) {
    await mouseClick(cdp, bossPoint[0], bossPoint[1]);
    await clock.until(0.25 + swing * 0.34);
  }
  await keyUp(cdp, 'KeyA');
  await clock.until(2.75);

  marks['endCard'] = Number(clock.elapsed().toFixed(2));
  await cdp.eval(`window.__cap.showCursor(false)`);
  await cdp.eval(`window.__cap.endCard(true)`);
  await clock.until(4.3);

  marks['end'] = Number(clock.elapsed().toFixed(2));
  const { frames, stoppedAt } = await recorder.stop();
  return { frames, stoppedAt, marks, seconds: clock.elapsed() };
}

/* ---------------------------------------------------------------- screenshots */

async function captureStills(cdp, url) {
  log('capturing hero screenshot…');
  await cdp.send('Page.navigate', { url });
  await sleep(5400);
  const hero = join(OUT, 'dungeon-md-hero.png');
  const heroShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(hero, Buffer.from(heroShot.data, 'base64'));

  log('capturing boss screenshot…');
  await cdp.eval(PAGE_HELPERS);
  await cdp.eval(`window.__cap.toBossRoom()`);
  const bossPoint = await cdp.eval(`window.__cap.toPage(660, 250)`);
  await mouseMove(cdp, bossPoint[0], bossPoint[1]);
  await cdp.eval(`window.__cap.showCursor(true)`);
  await sleep(400);
  await cdp.eval(`(() => { const s = window.__cap.scene(); s.attack(s.time.now); return 'swing'; })()`);
  await sleep(55);
  const bossShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const boss = join(OUT, 'dungeon-md-boss.png');
  await writeFile(boss, Buffer.from(bossShot.data, 'base64'));
  return { hero, boss };
}

/* ------------------------------------------------------------------------ main */

async function main() {
  if (!SKIP_BUILD || !existsSync(join(DIST, 'index.html'))) {
    log('building production bundle…');
    execFileSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'pipe', shell: true });
  }
  await mkdir(OUT, { recursive: true });
  await mkdir(WORK, { recursive: true });

  const { server, port } = await startStaticServer(DIST, PORT);
  const url = `http://127.0.0.1:${port}/`;
  log(`serving dist at ${url}`);

  const chrome = findChrome();
  const chromeArgs = [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${join(OUT, '.chrome-profile')}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    '--window-position=0,0',
    '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-infobars', '--disable-features=Translate',
    '--app=' + url,
  ];
  if (HEADLESS) chromeArgs.unshift('--headless=new', '--disable-gpu', '--enable-unsafe-swiftshader');
  log(`launching chrome (${HEADLESS ? 'headless' : 'headed'})…`);
  const browser = spawn(chrome, chromeArgs, { stdio: 'ignore' });

  let cdp;
  try {
    cdp = await Cdp.attach(DEBUG_PORT);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false,
    });

    log('loading app…');
    await cdp.send('Page.navigate', { url });
    await sleep(5400);
    await cdp.eval(PAGE_HELPERS);
    await cdp.eval(`window.__cap.setValue(${JSON.stringify(DEMO_MARKDOWN)})`);
    await sleep(1500);

    const recorder = new Recorder(cdp);

    log('recording markdown segment…');
    const partA = await recordMarkdownSegment(cdp, recorder);
    log(`  ${partA.frames.length} frames / ${partA.seconds.toFixed(1)}s`);

    // Off camera: restore the shipped campaign and enter the Legacy Vault.
    log('staging boss scene (not recorded)…');
    await cdp.eval(`window.__cap.blurEditor()`);
    await cdp.eval(`window.__cap.toBossRoom()`);
    await sleep(300);

    log('recording boss segment…');
    const partB = await recordBossSegment(cdp, recorder);
    log(`  ${partB.frames.length} frames / ${partB.seconds.toFixed(1)}s`);

    const totalFrames = partA.frames.length + partB.frames.length;
    if (totalFrames < 200) throw new Error(`Only ${totalFrames} frames captured - is the page rendering?`);

    log('encoding segments…');
    const segments = [
      await encodeSegment(partA.frames, 'a-markdown', partA.stoppedAt),
      await encodeSegment(partB.frames, 'b-boss', partB.stoppedAt),
    ];
    const media = await finish(segments);
    const stills = await captureStills(cdp, url);

    const report = {
      resolution: `${WIDTH}x${HEIGHT}`,
      fps: FPS,
      markdownSeconds: Number(partA.seconds.toFixed(2)),
      bossSeconds: Number(partB.seconds.toFixed(2)),
      totalSeconds: encodedDuration(media.mp4),
      frames: totalFrames,
      captureFps: Number((totalFrames / (partA.seconds + partB.seconds)).toFixed(1)),
      marks: { markdown: partA.marks, boss: partB.marks },
      outputs: { ...media, ...stills },
    };
    await writeFile(join(OUT, 'capture-report.json'), JSON.stringify(report, null, 2));

    log('');
    log('outputs:');
    for (const file of [media.mp4, media.webm, media.gif, stills.hero, stills.boss]) {
      if (file) log('  ' + file);
    }
    log(`duration ~${report.totalSeconds}s at ${report.captureFps} captured fps`);
  } finally {
    try { cdp?.close(); } catch { /* ignore */ }
    try { browser.kill(); } catch { /* ignore */ }
    server.close();
    await sleep(300);
  }
}

main().catch((error) => {
  console.error('[capture] failed:', error.message);
  process.exitCode = 1;
});
