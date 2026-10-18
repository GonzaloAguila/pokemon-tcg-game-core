/**
 * Table types. Absent `GameState.gameMode` = a standard game.
 *
 * Lucky Duel (docs/superpowers/specs/2026-10-18-lucky-duel-design.md): each player gets a random
 * Basic Pokémon from the whole catalog and a 60-card deck built around it; the Benches are locked
 * (treated as full but empty), there are no Prizes, a Knock Out of an Active ends the game and
 * both Actives Knocked Out at the same time is a draw.
 *
 * This file has no runtime imports so the engine core (lib/gameState.ts, board) can use it.
 */

export type GameMode = "standard" | "lucky-duel";

/** The game is a Lucky Duel. */
export function isLuckyDuel(state: { gameMode?: GameMode } | null | undefined): boolean {
  return state?.gameMode === "lucky-duel";
}
