/**
 * Seeded randomness for headless games. The engine itself uses Math.random (shuffles,
 * sleep checkups, ids), so a run replaces Math.random with the seeded generator and
 * restores it afterwards — the same seed replays the same game.
 */

export type Rng = () => number;

/** mulberry32: small, fast, good enough for games. Returns floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A mulberry32 generator whose 32-bit state can be read and restored (persist it between steps). */
export type SeededRng = {
  /** The next float in [0, 1) */
  next: Rng;
  /** The internal state now: `createSeededRng(seed, state)` continues the same sequence */
  state(): number;
};

/**
 * mulberry32 with readable state (the same sequence as `mulberry32(seed)`). `state`: a value read
 * from `state()` to resume where that generator was (the seed is then ignored).
 */
export function createSeededRng(seed: number, state?: number): SeededRng {
  let a = (state ?? seed) >>> 0;
  return {
    next: () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state: () => a,
  };
}

/** A 32-bit seed from a text (FNV-1a over the UTF-16 code units): `hashSeed(runSeed + ":" + battle + ":" + attempt)`. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Run `fn` with Math.random replaced by `rng` (restored even if fn throws). */
export function withRandom<T>(rng: Rng, fn: () => T): T {
  const original = Math.random;
  Math.random = rng;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[randomInt(rng, items.length)];
}

/** Fisher–Yates with the given rng (new array). */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** A random subset of size in [min, max] (clamped to the items available). */
export function pickSome<T>(rng: Rng, items: readonly T[], min: number, max: number): T[] {
  const upper = Math.min(max, items.length);
  const lower = Math.min(min, upper);
  const count = lower + randomInt(rng, upper - lower + 1);
  return shuffled(rng, items).slice(0, count);
}

export function flipCoin(rng: Rng): "heads" | "tails" {
  return rng() < 0.5 ? "heads" : "tails";
}
