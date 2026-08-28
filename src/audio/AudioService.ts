import {
  AUDIO_LIMITS,
  clamp,
  detuneFor,
  sfxSpec,
  SfxGate,
  type SfxId,
  type SfxLayer,
} from './sfx.ts';

/** Storage is injected so the service can be constructed in a test. */
export interface AudioStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface AudioServiceOptions {
  /** Defaults to `window.localStorage` when it is usable. */
  storage?: AudioStorage | null;
  /** Defaults to `window.AudioContext`. Null disables audio entirely. */
  contextFactory?: (() => AudioContext) | null;
  now?: () => number;
  random?: () => number;
}

const STORAGE_KEY = 'dungeon.md:muted';
/** Noise is generated once and reused; regenerating it per hit is wasteful. */
const NOISE_SECONDS = 1;
/** Gestures that are allowed to open the AudioContext. */
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

/**
 * The whole audio layer: one AudioContext, one master chain, one mute flag.
 *
 * Three properties matter more than the sound design here:
 *
 * 1. It is *optional*. Every entry point degrades to a no-op if Web Audio is
 *    missing, blocked or throws. The game never depends on audio succeeding.
 * 2. It is *lazy*. No AudioContext exists until a real user gesture, which is
 *    what keeps browsers from logging autoplay warnings on first load.
 * 3. It is *single-instance*. The service is created once by AppController and
 *    subscribes to the runtime bus once, so live-editing the Markdown - which
 *    restarts the Phaser scene repeatedly - can never stack listeners or
 *    contexts. Nothing in this class is per-scene.
 */
export class AudioService {
  private readonly gate = new SfxGate();
  private readonly storage: AudioStorage | null;
  private readonly contextFactory: (() => AudioContext) | null;
  private readonly now: () => number;
  private readonly random: () => number;

  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  /** Set once Web Audio has failed, so we stop retrying on every swing. */
  private broken = false;
  /** The armed gesture handler, kept so it can be removed again. */
  private boundUnlock: (() => void) | null = null;
  private unlockTarget: EventTarget | null = null;
  private readonly changeListeners = new Set<(muted: boolean) => void>();

  constructor(options: AudioServiceOptions = {}) {
    this.storage = options.storage !== undefined ? options.storage : defaultStorage();
    this.contextFactory =
      options.contextFactory !== undefined ? options.contextFactory : defaultContextFactory();
    this.now = options.now ?? (() => Date.now());
    this.random = options.random ?? Math.random;
    this.muted = this.readStoredMute();
  }

  /* ---------------------------------------------------------------- mute */

  get isMuted(): boolean {
    return this.muted;
  }

  /** True once a gesture has actually opened an AudioContext. */
  get isUnlocked(): boolean {
    return this.context !== null && !this.broken;
  }

  /** True when audio can never work here; the UI uses this to explain itself. */
  get isUnavailable(): boolean {
    return this.contextFactory === null || this.broken;
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.muted = muted;
    if (muted) this.gate.reset();
    this.writeStoredMute(muted);
    if (this.master && this.context) {
      // A short ramp rather than a hard cut, so muting mid-swing does not click.
      const target = muted ? 0 : AUDIO_LIMITS.masterGain;
      try {
        this.master.gain.setTargetAtTime(target, this.context.currentTime, 0.015);
      } catch {
        this.master.gain.value = target;
      }
    }
    for (const listener of [...this.changeListeners]) listener(muted);
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** Subscribe to mute changes. Returns an unsubscribe function. */
  onChange(listener: (muted: boolean) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private readStoredMute(): boolean {
    try {
      return this.storage?.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  private writeStoredMute(muted: boolean): void {
    try {
      this.storage?.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch {
      // Private-mode storage can throw on write. The preference simply will
      // not persist; that is not worth breaking anything over.
    }
  }

  /* -------------------------------------------------------------- unlock */

  /**
   * Arm the one-shot unlock. The context is created *inside* the gesture
   * handler, which is what browsers require - creating it earlier yields a
   * suspended context and a console warning.
   */
  installUnlockHandlers(target: EventTarget | null = globalThis.document ?? null): void {
    if (!target || this.boundUnlock || this.contextFactory === null) return;
    const unlock = (): void => {
      this.ensureContext();
      // One gesture is all we need; drop the handlers whether or not it worked
      // so a broken environment is not probed on every click for ever.
      this.removeUnlockHandlers();
    };
    this.boundUnlock = unlock;
    this.unlockTarget = target;
    for (const type of UNLOCK_EVENTS) {
      target.addEventListener(type, unlock, { passive: true });
    }
  }

  private removeUnlockHandlers(): void {
    const unlock = this.boundUnlock;
    const target = this.unlockTarget;
    if (!unlock || !target) return;
    for (const type of UNLOCK_EVENTS) target.removeEventListener(type, unlock);
    this.boundUnlock = null;
    this.unlockTarget = null;
  }

  /**
   * Open the context immediately. Only valid inside a real user gesture -
   * the mute button calls this so the very first click both unmutes and
   * unlocks.
   */
  unlockNow(): void {
    this.ensureContext();
    this.removeUnlockHandlers();
  }

  /**
   * Create the context if it does not exist yet, or resume it if the browser
   * suspended it. Returns null when audio is unavailable.
   */
  private ensureContext(): AudioContext | null {
    if (this.broken || this.contextFactory === null) return null;
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
      return this.context;
    }
    try {
      const context = this.contextFactory();
      const master = context.createGain();
      master.gain.value = this.muted ? 0 : AUDIO_LIMITS.masterGain;
      // A gentle limiter is what keeps a room full of dying enemies from
      // adding up into something painful.
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -18;
      limiter.knee.value = 12;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.18;
      master.connect(limiter);
      limiter.connect(context.destination);

      this.context = context;
      this.master = master;
      this.noise = createNoiseBuffer(context, this.random);
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
      return context;
    } catch {
      // No Web Audio, or the browser refused. Stop trying.
      this.broken = true;
      this.context = null;
      this.master = null;
      return null;
    }
  }

  /* ---------------------------------------------------------------- play */

  /**
   * Play a sound, if it is allowed to play right now.
   *
   * Never throws and never returns a promise: gameplay calls this and moves
   * on. A false return means "skipped", which is a normal outcome (muted, not
   * yet unlocked, throttled, or out of voices).
   */
  play(id: SfxId): boolean {
    if (this.muted || this.broken || this.contextFactory === null) return false;
    // Deliberately does *not* create the context: that only ever happens in a
    // gesture handler. Sounds before the first interaction are simply dropped.
    const context = this.context;
    const master = this.master;
    if (!context || !master) return false;
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    if (!this.gate.request(id, this.now())) return false;

    try {
      const spec = sfxSpec(id);
      const detune = detuneFor(spec, this.random);
      const start = context.currentTime;
      for (const layer of spec.layers) {
        this.playLayer(context, master, layer, spec.gain, detune, start);
      }
      return true;
    } catch {
      this.broken = true;
      return false;
    }
  }

  private playLayer(
    context: AudioContext,
    master: GainNode,
    layer: SfxLayer,
    specGain: number,
    detuneCents: number,
    start: number,
  ): void {
    const at = start + (layer.delay ?? 0);
    const attack = Math.max(0.001, layer.attack);
    const decay = Math.max(0.005, layer.decay);
    const end = at + attack + decay;

    const amp = context.createGain();
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(
      Math.max(0.0002, clamp(layer.gain * specGain, 0, 1)),
      at + attack,
    );
    // Exponential ramps cannot reach zero, so land just above it and stop.
    amp.gain.exponentialRampToValueAtTime(0.0001, end);

    let tail: AudioNode = amp;
    if (layer.filter) {
      const filter = context.createBiquadFilter();
      filter.type = layer.filter.type;
      filter.Q.value = layer.filter.q ?? 1;
      const from = clamp(layer.filter.freq, 20, 20000);
      filter.frequency.setValueAtTime(from, at);
      if (layer.filter.freqEnd !== undefined) {
        filter.frequency.exponentialRampToValueAtTime(clamp(layer.filter.freqEnd, 20, 20000), end);
      }
      amp.connect(filter);
      tail = filter;
    }
    tail.connect(master);

    if (layer.kind === 'noise') {
      const buffer = this.noise;
      if (!buffer) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      // Start at a random offset so consecutive bursts are not identical.
      const offset = clamp(this.random(), 0, 0.98) * Math.max(0, buffer.duration - 0.02);
      source.connect(amp);
      source.start(at, offset, end - at);
      source.stop(end);
      return;
    }

    const osc = context.createOscillator();
    osc.type = layer.wave ?? 'square';
    const from = clamp(layer.freq, 20, AUDIO_LIMITS.maxFrequency);
    osc.frequency.setValueAtTime(from, at);
    if (layer.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        clamp(layer.freqEnd, 20, AUDIO_LIMITS.maxFrequency),
        end,
      );
    }
    if (detuneCents !== 0) osc.detune.setValueAtTime(detuneCents, at);
    osc.connect(amp);
    osc.start(at);
    osc.stop(end);
  }

  /** Release everything. Only used if the whole app is torn down. */
  destroy(): void {
    this.removeUnlockHandlers();
    this.changeListeners.clear();
    this.gate.reset();
    const context = this.context;
    this.context = null;
    this.master = null;
    this.noise = null;
    if (context) void context.close().catch(() => undefined);
  }
}

/* ------------------------------------------------------------- factories */

function defaultStorage(): AudioStorage | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    // Touch it once: Safari in private mode throws only on use.
    storage.getItem(STORAGE_KEY);
    return storage;
  } catch {
    return null;
  }
}

function defaultContextFactory(): (() => AudioContext) | null {
  const scope = globalThis as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
  if (!Ctor) return null;
  return () => new Ctor();
}

/** One second of white noise, shared by every noise layer. */
function createNoiseBuffer(context: AudioContext, random: () => number): AudioBuffer | null {
  try {
    const length = Math.floor(context.sampleRate * NOISE_SECONDS);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index++) data[index] = random() * 2 - 1;
    return buffer;
  } catch {
    return null;
  }
}
