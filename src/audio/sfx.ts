/**
 * Sound *recipes* and the rules for when they are allowed to play.
 *
 * This module is deliberately free of Web Audio, the DOM and Phaser: it is
 * plain data plus a little arithmetic, so it can be unit tested in Node and
 * reasoned about without a browser. `AudioService` is the only thing that
 * turns these recipes into actual sound.
 *
 * The palette is "retro terminal + corrupted software": square and saw blips,
 * filtered noise bursts and short downward glitches. Nothing rings for long,
 * nothing sits above ~1.4 kHz, and every peak gain is small - the mix is meant
 * to sit under the game, not on top of it.
 */

export const SFX_IDS = [
  'attack',
  'enemyHit',
  'enemyDeath',
  'playerHurt',
  'pickup',
  'equip',
  'door',
  'secret',
  'quest',
  'bossCharge',
  'bossVolley',
  'bossHit',
  'bossDeath',
  'denied',
  'uiClick',
] as const;

export type SfxId = (typeof SFX_IDS)[number];

/** A single voice inside a sound: one oscillator or one burst of noise. */
export interface SfxLayer {
  kind: 'tone' | 'noise';
  /** Oscillator shape. Ignored for noise layers. */
  wave?: OscillatorType;
  /** Starting frequency in Hz. */
  freq: number;
  /** Glide target in Hz. Omitted means "hold `freq`". */
  freqEnd?: number;
  /** Seconds from trigger before this layer starts. */
  delay?: number;
  /** Seconds to reach peak gain. */
  attack: number;
  /** Seconds from peak back to silence. */
  decay: number;
  /** Peak gain, 0..1, before the per-sound and master gains are applied. */
  gain: number;
  /** Optional shaping filter; noise layers nearly always want one. */
  filter?: {
    type: BiquadFilterType;
    freq: number;
    freqEnd?: number;
    q?: number;
  };
}

export interface SfxSpec {
  layers: SfxLayer[];
  /** Per-sound trim, applied on top of each layer's gain. */
  gain: number;
  /** Minimum gap between two plays of this id, in milliseconds. */
  throttleMs: number;
  /**
   * Random pitch spread in cents, applied per play. Repetition is what makes
   * a hit sound cheap, so the sounds that fire in bursts get the most spread.
   */
  detune?: number;
}

/** Hard ceilings the specs are checked against, and the mixer respects. */
export const AUDIO_LIMITS = {
  /** Master gain. Everything else is quieter than it looks because of this. */
  masterGain: 0.45,
  /** Nothing tonal may sit above this, to keep the mix off the ear. */
  maxFrequency: 1400,
  /** Longest a single layer may ring for. */
  maxDurationSeconds: 0.9,
  /** Concurrent layers allowed; extra requests are dropped, not queued. */
  maxVoices: 14,
} as const;

const SPECS: Record<SfxId, SfxSpec> = {
  /* ------------------------------------------------------------- player */

  // A short filtered whoosh with a low blip under it. Quiet on purpose: this
  // is the most frequently heard sound in the game.
  attack: {
    gain: 0.5,
    throttleMs: 45,
    detune: 90,
    layers: [
      {
        kind: 'noise',
        freq: 0,
        attack: 0.004,
        decay: 0.085,
        gain: 0.16,
        filter: { type: 'bandpass', freq: 1200, freqEnd: 420, q: 0.8 },
      },
      {
        kind: 'tone',
        wave: 'square',
        freq: 420,
        freqEnd: 180,
        attack: 0.003,
        decay: 0.06,
        gain: 0.05,
      },
    ],
  },

  // Distinct from an enemy hit: lower, slower and with an alarm-like second
  // voice, so taking damage never reads as dealing it.
  playerHurt: {
    gain: 0.85,
    throttleMs: 140,
    detune: 40,
    layers: [
      {
        kind: 'tone',
        wave: 'triangle',
        freq: 300,
        freqEnd: 110,
        attack: 0.004,
        decay: 0.24,
        gain: 0.2,
      },
      {
        kind: 'tone',
        wave: 'square',
        freq: 150,
        freqEnd: 62,
        delay: 0.02,
        attack: 0.004,
        decay: 0.2,
        gain: 0.12,
      },
      {
        kind: 'noise',
        freq: 0,
        attack: 0.002,
        decay: 0.09,
        gain: 0.1,
        filter: { type: 'lowpass', freq: 900, q: 0.7 },
      },
    ],
  },

  /* ------------------------------------------------------------ enemies */

  // Crunchy digital impact. The wide detune is what stops six slimes in one
  // swing from sounding like one loud click repeated.
  enemyHit: {
    gain: 0.6,
    throttleMs: 50,
    detune: 220,
    layers: [
      {
        kind: 'tone',
        wave: 'square',
        freq: 190,
        freqEnd: 72,
        attack: 0.002,
        decay: 0.075,
        gain: 0.16,
      },
      {
        kind: 'noise',
        freq: 0,
        attack: 0.001,
        decay: 0.035,
        gain: 0.1,
        filter: { type: 'highpass', freq: 900, q: 0.6 },
      },
    ],
  },

  // A small descending glitch: the thing stops running.
  enemyDeath: {
    gain: 0.55,
    throttleMs: 70,
    detune: 160,
    layers: [
      {
        kind: 'tone',
        wave: 'sawtooth',
        freq: 520,
        freqEnd: 88,
        attack: 0.003,
        decay: 0.18,
        gain: 0.12,
      },
      {
        kind: 'noise',
        freq: 0,
        delay: 0.02,
        attack: 0.002,
        decay: 0.14,
        gain: 0.09,
        filter: { type: 'bandpass', freq: 1300, freqEnd: 200, q: 1.2 },
      },
    ],
  },

  /* --------------------------------------------------------------- loot */

  // Two rising blips - a byte landing in the inventory.
  pickup: {
    gain: 0.5,
    throttleMs: 60,
    detune: 30,
    layers: [
      { kind: 'tone', wave: 'square', freq: 880, attack: 0.003, decay: 0.05, gain: 0.09 },
      {
        kind: 'tone',
        wave: 'triangle',
        freq: 1318,
        delay: 0.05,
        attack: 0.003,
        decay: 0.07,
        gain: 0.1,
      },
    ],
  },

  // Equipment is rarer and heavier, so it gets a three-note confirmation.
  equip: {
    gain: 0.6,
    throttleMs: 120,
    layers: [
      { kind: 'tone', wave: 'triangle', freq: 659, attack: 0.004, decay: 0.07, gain: 0.11 },
      {
        kind: 'tone',
        wave: 'triangle',
        freq: 880,
        delay: 0.06,
        attack: 0.004,
        decay: 0.07,
        gain: 0.11,
      },
      {
        kind: 'tone',
        wave: 'square',
        freq: 1174,
        delay: 0.12,
        attack: 0.004,
        decay: 0.12,
        gain: 0.09,
      },
      {
        kind: 'noise',
        freq: 0,
        delay: 0.12,
        attack: 0.003,
        decay: 0.1,
        gain: 0.05,
        filter: { type: 'bandpass', freq: 1100, q: 1.4 },
      },
    ],
  },

  /* -------------------------------------------------------------- world */

  // Mechanical thunk plus an airy sweep: a terminal accepting the command.
  door: {
    gain: 0.6,
    throttleMs: 200,
    detune: 40,
    layers: [
      {
        kind: 'tone',
        wave: 'square',
        freq: 210,
        freqEnd: 120,
        attack: 0.003,
        decay: 0.1,
        gain: 0.13,
      },
      {
        kind: 'noise',
        freq: 0,
        delay: 0.03,
        attack: 0.006,
        decay: 0.16,
        gain: 0.08,
        filter: { type: 'lowpass', freq: 500, freqEnd: 1100, q: 0.9 },
      },
    ],
  },

  // The one deliberately mysterious sound: a slow shimmer upward, two voices
  // a fifth apart. Long by this project's standards, and still under a second.
  secret: {
    gain: 0.7,
    throttleMs: 900,
    layers: [
      {
        kind: 'tone',
        wave: 'sine',
        freq: 300,
        freqEnd: 900,
        attack: 0.05,
        decay: 0.45,
        gain: 0.1,
      },
      {
        kind: 'tone',
        wave: 'sine',
        freq: 450,
        freqEnd: 1350,
        delay: 0.07,
        attack: 0.06,
        decay: 0.42,
        gain: 0.06,
      },
      {
        kind: 'noise',
        freq: 0,
        attack: 0.08,
        decay: 0.4,
        gain: 0.05,
        filter: { type: 'bandpass', freq: 600, freqEnd: 1400, q: 2.2 },
      },
    ],
  },

  // Short, positive, and pitched above the pickup so the two never blur.
  quest: {
    gain: 0.6,
    throttleMs: 140,
    layers: [
      { kind: 'tone', wave: 'triangle', freq: 784, attack: 0.004, decay: 0.08, gain: 0.11 },
      {
        kind: 'tone',
        wave: 'triangle',
        freq: 1046,
        delay: 0.07,
        attack: 0.004,
        decay: 0.16,
        gain: 0.11,
      },
    ],
  },

  /* --------------------------------------------------------------- boss */

  // Telegraph: a rising warning that runs under the wind-up animation.
  bossCharge: {
    gain: 0.7,
    throttleMs: 300,
    layers: [
      {
        kind: 'tone',
        wave: 'sawtooth',
        freq: 110,
        freqEnd: 330,
        attack: 0.03,
        decay: 0.34,
        gain: 0.13,
      },
      {
        kind: 'noise',
        freq: 0,
        attack: 0.04,
        decay: 0.3,
        gain: 0.06,
        filter: { type: 'bandpass', freq: 300, freqEnd: 1000, q: 1.6 },
      },
    ],
  },

  // Projectile launch: a fast downward zap.
  bossVolley: {
    gain: 0.55,
    throttleMs: 120,
    detune: 60,
    layers: [
      {
        kind: 'tone',
        wave: 'square',
        freq: 900,
        freqEnd: 260,
        attack: 0.002,
        decay: 0.1,
        gain: 0.1,
      },
      {
        kind: 'noise',
        freq: 0,
        attack: 0.002,
        decay: 0.07,
        gain: 0.06,
        filter: { type: 'highpass', freq: 700, q: 0.8 },
      },
    ],
  },

  // Heavier than a normal hit: lower, longer, with more body under it.
  bossHit: {
    gain: 0.75,
    throttleMs: 60,
    detune: 120,
    layers: [
      {
        kind: 'tone',
        wave: 'square',
        freq: 112,
        freqEnd: 48,
        attack: 0.003,
        decay: 0.14,
        gain: 0.18,
      },
      {
        kind: 'noise',
        freq: 0,
        attack: 0.002,
        decay: 0.06,
        gain: 0.1,
        filter: { type: 'lowpass', freq: 1200, q: 0.8 },
      },
    ],
  },

  // Corrupted collapse: everything slides down and the noise floor caves in.
  bossDeath: {
    gain: 0.9,
    throttleMs: 500,
    layers: [
      {
        kind: 'tone',
        wave: 'sawtooth',
        freq: 400,
        freqEnd: 40,
        attack: 0.01,
        decay: 0.7,
        gain: 0.16,
      },
      {
        kind: 'tone',
        wave: 'square',
        freq: 190,
        freqEnd: 30,
        delay: 0.06,
        attack: 0.01,
        decay: 0.62,
        gain: 0.1,
      },
      {
        kind: 'noise',
        freq: 0,
        attack: 0.01,
        decay: 0.6,
        gain: 0.12,
        filter: { type: 'bandpass', freq: 1200, freqEnd: 120, q: 1.1 },
      },
    ],
  },

  /* ----------------------------------------------------------------- ui */

  // Locked door: a flat, unmusical double buzz that reads as "no".
  denied: {
    gain: 0.55,
    throttleMs: 220,
    layers: [
      { kind: 'tone', wave: 'square', freq: 165, attack: 0.003, decay: 0.06, gain: 0.11 },
      {
        kind: 'tone',
        wave: 'square',
        freq: 124,
        delay: 0.08,
        attack: 0.003,
        decay: 0.09,
        gain: 0.11,
      },
    ],
  },

  // A tick, barely there, for the buttons in the app chrome.
  uiClick: {
    gain: 0.4,
    throttleMs: 40,
    layers: [
      { kind: 'tone', wave: 'square', freq: 1046, attack: 0.001, decay: 0.025, gain: 0.06 },
    ],
  },
};

export function sfxSpec(id: SfxId): SfxSpec {
  return SPECS[id];
}

export function allSfxSpecs(): ReadonlyArray<readonly [SfxId, SfxSpec]> {
  return SFX_IDS.map((id) => [id, SPECS[id]] as const);
}

/** How long a layer occupies a voice slot, in seconds. */
export function layerDuration(layer: SfxLayer): number {
  return (layer.delay ?? 0) + layer.attack + layer.decay;
}

/** How long the whole sound lasts, in seconds. */
export function specDuration(spec: SfxSpec): number {
  return spec.layers.reduce((longest, layer) => Math.max(longest, layerDuration(layer)), 0);
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * A random detune in cents, bounded by the spec.
 *
 * `random` is injected so the bounds can be tested at the extremes rather than
 * by sampling and hoping.
 */
export function detuneFor(spec: SfxSpec, random: () => number = Math.random): number {
  const spread = spec.detune ?? 0;
  if (spread <= 0) return 0;
  return (clamp(random(), 0, 1) * 2 - 1) * spread;
}

/**
 * Decides whether a sound may play right now.
 *
 * Two independent limits, both of which matter when a wide swing lands on a
 * room full of enemies: a per-id cooldown collapses the six identical hits
 * into one, and a voice budget stops any pile-up from turning into a wall of
 * sound. Voices are released by time rather than by callback, so a dropped or
 * interrupted sound can never leak a slot.
 */
export class SfxGate {
  private readonly lastPlayed = new Map<SfxId, number>();
  /** End timestamps (ms) of voices currently sounding. */
  private voices: number[] = [];

  constructor(private readonly maxVoices: number = AUDIO_LIMITS.maxVoices) {}

  /**
   * Returns true and books the voices if the sound may play.
   * Callers must treat a false result as "silently skip".
   */
  request(id: SfxId, now: number): boolean {
    const spec = sfxSpec(id);
    const last = this.lastPlayed.get(id);
    if (last !== undefined && now - last < spec.throttleMs) return false;

    this.release(now);
    const needed = spec.layers.length;
    if (this.voices.length + needed > this.maxVoices) return false;

    this.lastPlayed.set(id, now);
    const until = now + specDuration(spec) * 1000;
    for (let index = 0; index < needed; index++) this.voices.push(until);
    return true;
  }

  /** Drop voices that have finished. */
  private release(now: number): void {
    if (this.voices.length === 0) return;
    this.voices = this.voices.filter((until) => until > now);
  }

  activeVoices(now: number): number {
    this.release(now);
    return this.voices.length;
  }

  /** Forget all history - used when audio is muted or torn down. */
  reset(): void {
    this.lastPlayed.clear();
    this.voices = [];
  }
}
