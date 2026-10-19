/**
 * Per-side marks set by Gym Challenge Trainers, stored as a turn number per side (`SideTurns`,
 * "player" / "opponent" in the state's perspective; swapped by swapSides):
 * - `trainerLockUntilTurn` (Rocket's Secret Experiment's tails): that side can't play Trainer
 *   cards through that turn (the rest of this turn and all its next turn = T + 2).
 * - `benchProtectedUntilTurn` (Transparent Walls): attack damage to that side's Benched Pokémon
 *   is prevented through that turn (the end of the opponent's next turn = T + 1).
 * endTurn drops a mark once its turn is over.
 */

import type { GameState, PokemonInPlay, SideTurns } from "@/lib/gameState";

export type { SideTurns } from "@/lib/gameState";

/** The same marks with the sides swapped (swapSides). */
export function swapSideTurns(marks: SideTurns): SideTurns {
  return {
    ...(marks.opponent !== undefined && { player: marks.opponent }),
    ...(marks.player !== undefined && { opponent: marks.player }),
  };
}

/** `marks` with `side` set to `untilTurn` (a later mark wins). */
export function markSide(marks: SideTurns | undefined, side: "player" | "opponent", untilTurn: number): SideTurns {
  return { ...marks, [side]: Math.max(untilTurn, marks?.[side] ?? untilTurn) };
}

/** The marks still running at the start of turn `turnNumber` (undefined when none is left). */
export function expireSideTurns(marks: SideTurns | undefined, turnNumber: number): SideTurns | undefined {
  if (!marks) return undefined;
  const kept: SideTurns = {
    ...(marks.player !== undefined && marks.player >= turnNumber && { player: marks.player }),
    ...(marks.opponent !== undefined && marks.opponent >= turnNumber && { opponent: marks.opponent }),
  };
  return kept.player === undefined && kept.opponent === undefined ? undefined : kept;
}

const running = (marks: SideTurns | undefined, side: "player" | "opponent", turnNumber: number) =>
  marks?.[side] !== undefined && turnNumber <= marks[side]!;

/** Rocket's Secret Experiment: `side` can't play Trainer cards now. */
export function isTrainerLocked(state: GameState, side: "player" | "opponent" = "player"): boolean {
  return running(state.trainerLockUntilTurn, side, state.turnNumber);
}

/** Transparent Walls: `pokemon` is a Benched Pokémon whose side's Bench takes no attack damage now. */
export function isBenchProtected(state: GameState | undefined, pokemon: PokemonInPlay): boolean {
  if (!state?.benchProtectedUntilTurn) return false;
  const id = pokemon.pokemon.id;
  if (state.playerBench.some((p) => p?.pokemon.id === id)) return running(state.benchProtectedUntilTurn, "player", state.turnNumber);
  if (state.opponentBench.some((p) => p?.pokemon.id === id)) return running(state.benchProtectedUntilTurn, "opponent", state.turnNumber);
  return false;
}
