import { describe, expect, it } from "vitest";
import { createSeededRng, hashSeed, mulberry32 } from "../src";

describe("createSeededRng", () => {
  it("draws the same sequence as mulberry32 for the same seed", () => {
    const seeded = createSeededRng(7);
    const plain = mulberry32(7);
    for (let i = 0; i < 20; i++) expect(seeded.next()).toBe(plain());
  });

  it("restored from state() continues the same sequence", () => {
    const original = createSeededRng(7);
    for (let i = 0; i < 5; i++) original.next();
    const saved = original.state();
    const expected = Array.from({ length: 10 }, () => original.next());
    const restored = createSeededRng(7, saved);
    expect(Array.from({ length: 10 }, () => restored.next())).toEqual(expected);
  });

  it("the state is a plain 32-bit number (persistable as JSON)", () => {
    const rng = createSeededRng(123456789);
    rng.next();
    const state = rng.state();
    expect(Number.isInteger(state)).toBe(true);
    expect(state).toBeGreaterThanOrEqual(0);
    expect(state).toBeLessThan(2 ** 32);
    expect(JSON.parse(JSON.stringify(state))).toBe(state);
  });
});

describe("hashSeed", () => {
  it("is stable (FNV-1a, 32 bits)", () => {
    expect(hashSeed("")).toBe(2166136261);
    expect(hashSeed("a:1")).toBe(hashSeed("a:1"));
    expect(hashSeed("a")).toBe(0xe40c292c);
  });

  it("differs for different texts", () => {
    expect(hashSeed("a:1")).not.toBe(hashSeed("a:2"));
    expect(hashSeed("seed:1:1")).not.toBe(hashSeed("seed:1:2"));
  });
});
