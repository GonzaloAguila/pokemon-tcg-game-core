import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAIAction, type AICoinRecord } from "@/domain/ai/executor";
import type { CoinFlipResult } from "@/domain/constants";
import { StatusCondition } from "@/domain/constants";
import { armedFor, attackIndex, gameCard, inPlay, makeState, names } from "./helpers/state";

afterEach(() => vi.restoreAllMocks());

/** A coin source that returns the scripted results in order (throws when it runs out). */
function scripted(results: CoinFlipResult[]): () => CoinFlipResult {
  const queue = [...results];
  return () => {
    const next = queue.shift();
    if (!next) throw new Error("no more scripted coins");
    return next;
  };
}

function aiTurn(extra: Parameters<typeof makeState>[0] = {}) {
  return makeState({ turnNumber: 4, isPlayerTurn: false, ...extra });
}

describe("AI executor coin source", () => {
  it("an attack's coins come from `flip` and are reported to onCoins", () => {
    // Math.random would say tails: the scripted heads must win
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const doduo = armedFor(inPlay("Doduo"), "Ataque furia");
    const state = aiTurn({ opponent: { active: doduo }, player: { active: inPlay("Onix") } });
    const records: AICoinRecord[] = [];
    const after = executeAIAction(
      state,
      { type: "attack", attackIndex: attackIndex(doduo, "Ataque furia") },
      { flip: scripted(["heads", "heads"]), onCoins: (r) => records.push(r) }
    );
    expect(after.playerActivePokemon?.currentDamage).toBe(20);
    expect(records).toEqual([{ purpose: "attack", label: "Ataque furia", results: ["heads", "heads"], flippedBy: ["self", "self"] }]);
  });

  it("a Confusion flip comes from `flip` before the attack's coins", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const doduo = armedFor(inPlay("Doduo", { statuses: [StatusCondition.Confused] }), "Ataque furia");
    const state = aiTurn({ opponent: { active: doduo }, player: { active: inPlay("Onix") } });
    const records: AICoinRecord[] = [];
    const after = executeAIAction(
      state,
      { type: "attack", attackIndex: attackIndex(doduo, "Ataque furia") },
      { flip: scripted(["heads", "heads", "tails"]), onCoins: (r) => records.push(r) }
    );
    expect(records.map((r) => [r.purpose, r.results])).toEqual([
      ["confusion", ["heads"]],
      ["attack", ["heads", "tails"]],
    ]);
    expect(after.playerActivePokemon?.currentDamage).toBe(10);
    expect(after.opponentActivePokemon?.currentDamage).toBe(0);
  });

  it("a coin Trainer the AI plays (Poké Ball) uses `flip`", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const ball = gameCard("Poké Ball", "jungle");
    const state = aiTurn({
      opponent: { active: inPlay("Onix"), hand: [ball], deck: [gameCard("Machop", "base"), gameCard("Fighting Energy", "base")] },
      player: { active: inPlay("Onix") },
    });
    const records: AICoinRecord[] = [];
    const after = executeAIAction(
      state,
      { type: "playTrainer", cardId: ball.id, trainerName: "Poké Ball", selections: [], answerAtPlay: true },
      { flip: scripted(["heads"]), onCoins: (r) => records.push(r) }
    );
    expect(records).toEqual([{ purpose: "trainer", label: "Poké Ball", results: ["heads"], flippedBy: ["self"] }]);
    expect(names(after.opponentHand)).toContain("Machop");
  });

  it("without options the executor still flips with Math.random", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const doduo = armedFor(inPlay("Doduo"), "Ataque furia");
    const state = aiTurn({ opponent: { active: doduo }, player: { active: inPlay("Onix") } });
    const after = executeAIAction(state, { type: "attack", attackIndex: attackIndex(doduo, "Ataque furia") });
    expect(after.playerActivePokemon?.currentDamage).toBe(20);
  });
});
