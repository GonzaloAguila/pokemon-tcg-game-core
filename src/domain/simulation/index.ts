/**
 * Headless simulation: bots play complete games to fuzz the engine.
 * See scripts/simulate.ts (`npm run simulate -- --games 200 --seed 1 --sets base-set,jungle --policy mixed`).
 */

import type { CardSetId } from "@/domain/catalog";
import { buildRandomDeck } from "./decks";
import { playAIGame, SimulationFailure, type GameOutcome } from "./game";
import { createGreedyPolicy, randomLegalPolicy, type Policy } from "./policies";
import { mulberry32 } from "./rng";

export { playAIGame, SimulationFailure } from "./game";
export type { GameOptions, GameOutcome, SideId } from "./game";
export { randomLegalPolicy, createGreedyPolicy, legalActions, randomAnswer, firstAnswer } from "./policies";
export type { Policy, ViewAction } from "./policies";
export { buildRandomDeck, DECK_SIZE, allSetIds } from "./decks";
export { checkInvariants, ownedCardIds } from "./invariants";
export { mulberry32, withRandom } from "./rng";
export type { Rng } from "./rng";
export { swapSides } from "@/domain/board";

export type PolicyName = "greedy" | "random";
/** "mixed" = greedy (A) vs random (B) */
export type PolicyPair = PolicyName | "mixed";

export function policyPair(pair: PolicyPair): [Policy, Policy] {
  const make = (name: PolicyName) => (name === "greedy" ? createGreedyPolicy() : randomLegalPolicy);
  if (pair === "mixed") return [make("greedy"), make("random")];
  return [make(pair), make(pair)];
}

export type BatchFailure = {
  gameIndex: number;
  seed: number;
  problem: string;
  action: string;
  turn: number;
  lastEvents: string[];
};

export type BatchResult = {
  games: number;
  outcomes: GameOutcome[];
  failures: BatchFailure[];
};

/**
 * Run `games` seeded games: game i uses seed `seed + i` for both its decks and its play,
 * so any failure replays with `--games 1 --seed <reported seed>`.
 */
export function runBatch(options: { games: number; seed: number; sets: CardSetId[]; policy: PolicyPair; maxTurns?: number }): BatchResult {
  const outcomes: GameOutcome[] = [];
  const failures: BatchFailure[] = [];
  for (let gameIndex = 0; gameIndex < options.games; gameIndex++) {
    const seed = options.seed + gameIndex;
    const rng = mulberry32(seed);
    const [policyA, policyB] = policyPair(options.policy);
    try {
      const deckA = buildRandomDeck(rng, options.sets, "A");
      const deckB = buildRandomDeck(rng, options.sets, "B");
      outcomes.push(playAIGame(deckA, deckB, { rng, policyA, policyB, maxTurns: options.maxTurns ?? 300 }));
    } catch (error) {
      if (error instanceof SimulationFailure) {
        failures.push({ gameIndex, seed, problem: error.problem, action: error.action, turn: error.turn, lastEvents: error.lastEvents });
      } else {
        failures.push({ gameIndex, seed, problem: `setup exception: ${String(error)}`, action: "-", turn: 0, lastEvents: [] });
      }
    }
  }
  return { games: options.games, outcomes, failures };
}
