import { describe, expect, it } from 'vitest';
import { AudioService, type AudioStorage } from './AudioService.ts';
import {
  allSfxSpecs,
  AUDIO_LIMITS,
  clamp,
  detuneFor,
  layerDuration,
  sfxSpec,
  SfxGate,
  SFX_IDS,
  specDuration,
  type SfxId,
} from './sfx.ts';

/** localStorage stand-in; the real one does not exist in the node test env. */
function memoryStorage(initial: Record<string, string> = {}): AudioStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

function throwingStorage(): AudioStorage {
  return {
    getItem() {
      throw new Error('storage disabled');
    },
    setItem() {
      throw new Error('storage disabled');
    },
  };
}

describe('sound specs', () => {
  it('defines every declared id exactly once', () => {
    expect(new Set(SFX_IDS).size).toBe(SFX_IDS.length);
    expect(allSfxSpecs()).toHaveLength(SFX_IDS.length);
    for (const id of SFX_IDS) expect(sfxSpec(id), id).toBeTruthy();
  });

  it('keeps every sound short', () => {
    for (const [id, spec] of allSfxSpecs()) {
      expect(specDuration(spec), id).toBeGreaterThan(0);
      expect(specDuration(spec), id).toBeLessThanOrEqual(AUDIO_LIMITS.maxDurationSeconds);
    }
  });

  it('never asks for a piercing frequency', () => {
    for (const [id, spec] of allSfxSpecs()) {
      for (const layer of spec.layers) {
        if (layer.kind !== 'tone') continue;
        expect(layer.freq, `${id} freq`).toBeLessThanOrEqual(AUDIO_LIMITS.maxFrequency);
        expect(layer.freq, `${id} freq`).toBeGreaterThan(0);
        if (layer.freqEnd !== undefined) {
          expect(layer.freqEnd, `${id} freqEnd`).toBeLessThanOrEqual(AUDIO_LIMITS.maxFrequency);
          // Exponential ramps cannot pass through or land on zero.
          expect(layer.freqEnd, `${id} freqEnd`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('keeps every layer quiet enough to mix', () => {
    for (const [id, spec] of allSfxSpecs()) {
      expect(spec.gain, `${id} spec gain`).toBeGreaterThan(0);
      expect(spec.gain, `${id} spec gain`).toBeLessThanOrEqual(1);
      // The loudest thing that can reach the master bus at once.
      const peak = spec.layers.reduce((sum, layer) => sum + layer.gain * spec.gain, 0);
      expect(peak, `${id} summed peak`).toBeLessThanOrEqual(0.5);
      for (const layer of spec.layers) {
        expect(layer.gain, `${id} layer gain`).toBeGreaterThan(0);
        expect(layer.gain, `${id} layer gain`).toBeLessThanOrEqual(0.3);
        expect(layer.attack, `${id} attack`).toBeGreaterThanOrEqual(0);
        expect(layer.decay, `${id} decay`).toBeGreaterThan(0);
      }
    }
  });

  it('gives noise layers a shaping filter', () => {
    for (const [id, spec] of allSfxSpecs()) {
      for (const layer of spec.layers) {
        if (layer.kind === 'noise') expect(layer.filter, `${id} noise filter`).toBeTruthy();
      }
    }
  });

  it('throttles the sounds that fire in bursts', () => {
    for (const [id, spec] of allSfxSpecs()) {
      expect(spec.throttleMs, id).toBeGreaterThan(0);
    }
    // A single swing can land on a whole room; these must collapse.
    expect(sfxSpec('enemyHit').throttleMs).toBeGreaterThanOrEqual(40);
    expect(sfxSpec('attack').throttleMs).toBeGreaterThanOrEqual(40);
  });

  it('fits the voice budget for any single sound', () => {
    for (const [id, spec] of allSfxSpecs()) {
      expect(spec.layers.length, id).toBeLessThanOrEqual(AUDIO_LIMITS.maxVoices);
    }
  });

  it('measures layer duration including its delay', () => {
    expect(
      layerDuration({ kind: 'tone', freq: 100, attack: 0.01, decay: 0.1, gain: 0.1 }),
    ).toBeCloseTo(0.11);
    expect(
      layerDuration({ kind: 'tone', freq: 100, delay: 0.05, attack: 0.01, decay: 0.1, gain: 0.1 }),
    ).toBeCloseTo(0.16);
  });
});

describe('clamp', () => {
  it('bounds values on both sides', () => {
    expect(clamp(5, 0, 1)).toBe(1);
    expect(clamp(-5, 0, 1)).toBe(0);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });

  it('falls back to the minimum for values that are not numbers', () => {
    expect(clamp(Number.NaN, 0, 1)).toBe(0);
    expect(clamp(Number.POSITIVE_INFINITY, 0, 1)).toBe(0);
  });
});

describe('detune', () => {
  it('stays inside the spec spread at both extremes', () => {
    const spec = sfxSpec('enemyHit');
    const spread = spec.detune ?? 0;
    expect(spread).toBeGreaterThan(0);
    expect(detuneFor(spec, () => 0)).toBeCloseTo(-spread);
    expect(detuneFor(spec, () => 1)).toBeCloseTo(spread);
    expect(detuneFor(spec, () => 0.5)).toBeCloseTo(0);
  });

  it('is silent about specs that do not ask for variation', () => {
    expect(detuneFor(sfxSpec('equip'), () => 1)).toBe(0);
  });

  it('never escapes the spread even for an out-of-range random source', () => {
    const spec = sfxSpec('enemyHit');
    const spread = spec.detune ?? 0;
    for (const random of [() => -4, () => 9, () => Number.NaN]) {
      expect(Math.abs(detuneFor(spec, random))).toBeLessThanOrEqual(spread);
    }
  });
});

describe('SfxGate', () => {
  it('collapses a burst of identical hits into one sound', () => {
    const gate = new SfxGate();
    // One swing landing on six enemies in the same frame.
    const results = Array.from({ length: 6 }, () => gate.request('enemyHit', 1000));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('allows the same sound again once the cooldown has passed', () => {
    const gate = new SfxGate();
    const cooldown = sfxSpec('enemyHit').throttleMs;
    expect(gate.request('enemyHit', 0)).toBe(true);
    expect(gate.request('enemyHit', cooldown - 1)).toBe(false);
    expect(gate.request('enemyHit', cooldown)).toBe(true);
  });

  it('throttles each sound independently', () => {
    const gate = new SfxGate();
    expect(gate.request('attack', 0)).toBe(true);
    expect(gate.request('enemyHit', 0)).toBe(true);
    expect(gate.request('attack', 0)).toBe(false);
  });

  it('refuses to exceed the voice budget', () => {
    const gate = new SfxGate(4);
    // 'secret' has three layers, so a second one cannot fit in a budget of 4.
    expect(gate.request('secret', 0)).toBe(true);
    expect(gate.activeVoices(0)).toBe(3);
    // Still inside the shimmer, so its three voices are still booked.
    expect(gate.request('bossDeath', 100)).toBe(false);
  });

  it('frees voices as sounds finish, without needing a callback', () => {
    const gate = new SfxGate(4);
    expect(gate.request('secret', 0)).toBe(true);
    const after = specDuration(sfxSpec('secret')) * 1000 + 1;
    expect(gate.activeVoices(after)).toBe(0);
    expect(gate.request('bossDeath', after)).toBe(true);
  });

  it('forgets everything on reset', () => {
    const gate = new SfxGate();
    expect(gate.request('attack', 0)).toBe(true);
    expect(gate.request('attack', 0)).toBe(false);
    gate.reset();
    expect(gate.request('attack', 0)).toBe(true);
  });
});

describe('AudioService without Web Audio', () => {
  it('constructs and plays as a no-op rather than throwing', () => {
    const audio = new AudioService({ contextFactory: null, storage: null });
    expect(audio.isUnavailable).toBe(true);
    expect(audio.isUnlocked).toBe(false);
    for (const id of SFX_IDS) expect(audio.play(id), id).toBe(false);
  });

  it('still tracks mute so the button stays truthful', () => {
    const audio = new AudioService({ contextFactory: null, storage: null });
    expect(audio.isMuted).toBe(false);
    expect(audio.toggleMuted()).toBe(true);
    expect(audio.isMuted).toBe(true);
  });

  it('installs no unlock handlers when audio can never work', () => {
    const audio = new AudioService({ contextFactory: null, storage: null });
    let added = 0;
    audio.installUnlockHandlers({
      addEventListener: () => {
        added += 1;
      },
      removeEventListener: () => undefined,
      dispatchEvent: () => true,
    });
    expect(added).toBe(0);
  });
});

describe('AudioService mute state', () => {
  it('defaults to sound on', () => {
    const audio = new AudioService({ contextFactory: null, storage: memoryStorage() });
    expect(audio.isMuted).toBe(false);
  });

  it('restores a stored mute preference', () => {
    const storage = memoryStorage({ 'dungeon.md:muted': '1' });
    expect(new AudioService({ contextFactory: null, storage }).isMuted).toBe(true);
  });

  it('treats any other stored value as unmuted', () => {
    const storage = memoryStorage({ 'dungeon.md:muted': 'yes please' });
    expect(new AudioService({ contextFactory: null, storage }).isMuted).toBe(false);
  });

  it('persists both directions', () => {
    const storage = memoryStorage();
    const audio = new AudioService({ contextFactory: null, storage });
    audio.setMuted(true);
    expect(storage.data['dungeon.md:muted']).toBe('1');
    audio.setMuted(false);
    expect(storage.data['dungeon.md:muted']).toBe('0');
  });

  it('survives storage that throws on both read and write', () => {
    const audio = new AudioService({ contextFactory: null, storage: throwingStorage() });
    expect(audio.isMuted).toBe(false);
    expect(() => audio.setMuted(true)).not.toThrow();
    expect(audio.isMuted).toBe(true);
  });

  it('notifies subscribers only on a real change', () => {
    const audio = new AudioService({ contextFactory: null, storage: null });
    const seen: boolean[] = [];
    const off = audio.onChange((muted) => seen.push(muted));
    audio.setMuted(true);
    audio.setMuted(true);
    audio.setMuted(false);
    off();
    audio.setMuted(true);
    expect(seen).toEqual([true, false]);
  });
});

describe('AudioService with a stub AudioContext', () => {
  /** Records what the service asks Web Audio to build. */
  function stubContext() {
    const started: { when: number }[] = [];
    const gains: number[] = [];
    const context = {
      state: 'running' as AudioContextState,
      currentTime: 0,
      sampleRate: 48000,
      destination: {},
      createGain: () => ({
        gain: {
          value: 0,
          setValueAtTime: () => undefined,
          exponentialRampToValueAtTime: (value: number) => gains.push(value),
          setTargetAtTime: () => undefined,
        },
        connect: () => undefined,
      }),
      createBiquadFilter: () => ({
        type: 'lowpass' as BiquadFilterType,
        Q: { value: 1 },
        frequency: {
          setValueAtTime: () => undefined,
          exponentialRampToValueAtTime: () => undefined,
        },
        connect: () => undefined,
      }),
      createDynamicsCompressor: () => ({
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 },
        connect: () => undefined,
      }),
      createOscillator: () => ({
        type: 'square' as OscillatorType,
        frequency: {
          setValueAtTime: () => undefined,
          exponentialRampToValueAtTime: () => undefined,
        },
        detune: { setValueAtTime: () => undefined },
        connect: () => undefined,
        start: (when: number) => started.push({ when }),
        stop: () => undefined,
      }),
      createBuffer: (_channels: number, length: number) => ({
        duration: 1,
        getChannelData: () => new Float32Array(length),
      }),
      createBufferSource: () => ({
        buffer: null,
        connect: () => undefined,
        start: (when: number) => started.push({ when }),
        stop: () => undefined,
      }),
      resume: () => Promise.resolve(),
      close: () => Promise.resolve(),
    };
    return { context: context as unknown as AudioContext, started, gains };
  }

  function serviceWithStub(now: () => number) {
    const stub = stubContext();
    const audio = new AudioService({
      contextFactory: () => stub.context,
      storage: null,
      now,
      random: () => 0.5,
    });
    return { audio, stub };
  }

  it('stays silent until a gesture unlocks it', () => {
    const { audio, stub } = serviceWithStub(() => 0);
    expect(audio.play('attack')).toBe(false);
    expect(stub.started).toHaveLength(0);
    expect(audio.isUnlocked).toBe(false);
  });

  it('plays once unlocked, and builds one node per layer', () => {
    const { audio, stub } = serviceWithStub(() => 0);
    audio.unlockNow();
    expect(audio.isUnlocked).toBe(true);
    expect(audio.play('attack')).toBe(true);
    expect(stub.started).toHaveLength(sfxSpec('attack').layers.length);
  });

  it('plays nothing at all while muted', () => {
    const { audio, stub } = serviceWithStub(() => 0);
    audio.unlockNow();
    audio.setMuted(true);
    for (const id of SFX_IDS) expect(audio.play(id), id).toBe(false);
    expect(stub.started).toHaveLength(0);
  });

  it('resumes playing after unmuting', () => {
    const { audio } = serviceWithStub(() => 0);
    audio.unlockNow();
    audio.setMuted(true);
    expect(audio.play('quest')).toBe(false);
    audio.setMuted(false);
    expect(audio.play('quest')).toBe(true);
  });

  it('collapses a swing that lands on a crowd into a single hit sound', () => {
    let clock = 0;
    const { audio, stub } = serviceWithStub(() => clock);
    audio.unlockNow();
    const played = Array.from({ length: 8 }, () => audio.play('enemyHit'));
    expect(played.filter(Boolean)).toHaveLength(1);
    expect(stub.started).toHaveLength(sfxSpec('enemyHit').layers.length);
    clock += sfxSpec('enemyHit').throttleMs;
    expect(audio.play('enemyHit')).toBe(true);
  });

  it('never lets a sustained fight exceed the voice budget', () => {
    const { audio } = serviceWithStub(() => 0);
    audio.unlockNow();
    // Every distinct id fired in the same millisecond, worst case.
    const played = SFX_IDS.map((id: SfxId) => audio.play(id)).filter(Boolean).length;
    expect(played).toBeGreaterThan(0);
    expect(played).toBeLessThan(SFX_IDS.length);
  });

  it('degrades permanently and quietly if Web Audio throws', () => {
    const audio = new AudioService({
      contextFactory: () => {
        throw new Error('AudioContext blocked');
      },
      storage: null,
    });
    expect(() => audio.unlockNow()).not.toThrow();
    expect(audio.isUnavailable).toBe(true);
    expect(audio.play('attack')).toBe(false);
  });

  it('creates no context before a gesture, even when asked to play', () => {
    let built = 0;
    const stub = stubContext();
    const audio = new AudioService({
      contextFactory: () => {
        built += 1;
        return stub.context;
      },
      storage: null,
    });
    for (let index = 0; index < 20; index++) audio.play('attack');
    expect(built).toBe(0);
    audio.unlockNow();
    expect(built).toBe(1);
  });

  it('opens exactly one context no matter how many gestures arrive', () => {
    let built = 0;
    const stub = stubContext();
    const audio = new AudioService({
      contextFactory: () => {
        built += 1;
        return stub.context;
      },
      storage: null,
    });
    audio.unlockNow();
    audio.unlockNow();
    audio.unlockNow();
    expect(built).toBe(1);
  });
});
