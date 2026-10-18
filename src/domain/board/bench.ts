/**
 * Bench size as a rule: every place that asks "is the Bench full?" or "how many Basics fit?"
 * goes through here so a card effect (a Stadium) can change the limit in one place.
 */

import type { BenchTrim, GameState } from "@/lib/gameState";
import { stadiumBenchLimit } from "@/domain/stadiums/rules";
import { MAX_BENCH_SIZE } from "./locate";
import { isLuckyDuel } from "@/domain/lucky-duel/mode";

/**
 * How many Pokémon `side`'s Bench can hold right now (5; the Stadium in play may lower it for both
 * players; 0 in a Lucky Duel: the Benches are locked — full but empty).
 */
export function maxBenchSize(state: GameState, _side: "player" | "opponent"): number {
  if (isLuckyDuel(state)) return 0;
  return Math.min(MAX_BENCH_SIZE, stadiumBenchLimit(state) ?? MAX_BENCH_SIZE);
}

/** `side`'s Bench is at (or over) its limit. */
export function isBenchFull(state: GameState, side: "player" | "opponent"): boolean {
  const bench = side === "player" ? state.playerBench : state.opponentBench;
  return bench.filter((p) => p != null).length >= maxBenchSize(state, side);
}

/** The pending Bench trims seen from the other side (swapSides). Absent stays absent. */
export function swapBenchTrim(trims: BenchTrim[] | undefined): BenchTrim[] | undefined {
  return trims?.map((trim) => ({ ...trim, side: trim.side === "player" ? "opponent" : "player" }));
}
