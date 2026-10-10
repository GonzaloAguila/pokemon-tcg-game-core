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
