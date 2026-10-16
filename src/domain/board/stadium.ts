/**
 * The Stadium in play (Gym Heroes). One at a time, shared by both players; rules that depend
 * on it (retreat, Resistance, Bench size...) read it through these helpers.
 */

import type { GameState, StadiumInPlay } from "@/lib/gameState";

/** The Stadium in play, or null. */
export function getStadium(state: GameState): StadiumInPlay | null {
  return state.stadium ?? null;
}

/** The Stadium in play has this name. */
export function stadiumNamed(state: GameState, name: string): boolean {
  return getStadium(state)?.card.name === name;
}

/** The same Stadium seen from the other side (swapSides). Absent stays absent. */
export function swapStadium(stadium: StadiumInPlay | null | undefined): StadiumInPlay | null | undefined {
  if (!stadium) return stadium;
  return { ...stadium, playedBy: stadium.playedBy === "player" ? "opponent" : "player" };
}
