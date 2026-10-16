/**
 * Bench size as a rule: every place that asks "is the Bench full?" or "how many Basics fit?"
 * goes through here so a card effect (Narrow Gym) can change the limit in one place.
 */

import type { GameState } from "@/lib/gameState";
import { MAX_BENCH_SIZE } from "./locate";

/** How many Pokémon `side`'s Bench can hold right now. */
export function maxBenchSize(_state: GameState, _side: "player" | "opponent"): number {
  return MAX_BENCH_SIZE;
}

/** `side`'s Bench is at (or over) its limit. */
export function isBenchFull(state: GameState, side: "player" | "opponent"): boolean {
  const bench = side === "player" ? state.playerBench : state.opponentBench;
  return bench.filter((p) => p != null).length >= maxBenchSize(state, side);
}
