import { describe, it, expect } from "vitest";
import { maxBenchSize, isBenchFull, playBasicPokemon } from "@/domain/board";
import { maxBenchSize as exportedFromIndex, isBenchFull as fullFromIndex } from "@/index";
import { IllegalActionError } from "@/shared/errors";
import { makeState, inPlay, gameCard, deepFreeze } from "./helpers/state";

const bench = (n: number) => Array.from({ length: n }, () => inPlay("Pikachu"));

describe("maxBenchSize / isBenchFull", () => {
  it("the Bench holds 5 Pokémon by default, for both sides", () => {
    const state = makeState({ player: { active: inPlay("Pikachu") }, opponent: { active: inPlay("Pikachu") } });
    expect(maxBenchSize(state, "player")).toBe(5);
    expect(maxBenchSize(state, "opponent")).toBe(5);
  });

  it("is full at 5 and not at 4, per side", () => {
    const state = deepFreeze(makeState({ player: { bench: bench(5) }, opponent: { bench: bench(4) } }));
    expect(isBenchFull(state, "player")).toBe(true);
    expect(isBenchFull(state, "opponent")).toBe(false);
  });

  it("is exported from the package entry", () => {
    expect(exportedFromIndex).toBe(maxBenchSize);
    expect(fullFromIndex).toBe(isBenchFull);
  });

  it("playBasicPokemon onto a full Bench throws the Spanish reason", () => {
    const basic = gameCard("Pikachu");
    const state = makeState({ player: { active: inPlay("Pikachu"), bench: bench(5), hand: [basic] } });
    expect(() => playBasicPokemon(state, basic.id, "bench")).toThrow(IllegalActionError);
    expect(() => playBasicPokemon(state, basic.id, "bench")).toThrow("Tu banca está llena");
  });
});
