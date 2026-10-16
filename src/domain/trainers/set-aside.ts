/**
 * Hands set aside face down until the end of their owner's turn (Gym Heroes' Tickling Machine:
 * "your opponent sets aside all the cards in his or her hand face down. Nobody may look at those
 * cards. At the end of your opponent's next turn, your opponent puts those cards back into his
 * or her hand").
 *
 * Kept in `GameState.setAsideHands`, at most one non-empty pile per side (a second Tickling
 * Machine the same turn stacks onto it; an empty hand makes no pile). The pile is out of the hand, so everything that reads or moves a
 * hand (Clairvoyance, Erika's Perfume, Secret Mission, The Rocket's Trap, Sabrina's Gaze, hand
 * counts...) only sees the cards in the hand now. Every perspective swap must flip `side`
 * (`swapSetAsideHands`): board swapSides, the AI executor's views. Nobody may look at the cards:
 * no log line names them, the AI's knowledge view hides them (both sides), and consumers must
 * mask them for BOTH players (the API sends `{ id, hidden: true }`).
 *
 * Pure and type-only on the engine side, so lib/gameState.ts can import it.
 */

import type { GameCard, GameState } from "@/lib/gameState";

export const TICKLING_MACHINE = "Tickling Machine";

/** A hand set aside face down: `side`'s cards, back into its hand at the end of turn `returnsAfterTurn`. */
export type SetAsideHand = {
  side: "player" | "opponent";
  cards: GameCard[];
  returnsAfterTurn: number;
};

/** The cards `side` has set aside (empty when none). */
export function setAsideCards(state: GameState, side: "player" | "opponent"): GameCard[] {
  return state.setAsideHands?.find((p) => p.side === side)?.cards ?? [];
}

/** The same piles seen from the other side (swapSides). Absent stays absent. */
export function swapSetAsideHands(piles: SetAsideHand[] | undefined): SetAsideHand[] | undefined {
  if (!piles) return piles;
  return piles.map((p) => ({ ...p, side: p.side === "player" ? "opponent" : "player" }));
}

/**
 * `side` sets aside every card of its hand until the end of turn `returnsAfterTurn` (pure). A
 * pile already aside for that side keeps its cards and gets the new ones on top, returning at the
 * later of the two turns (in practice the same turn: a pile only exists during its owner's
 * opponent's turn and its owner's next turn).
 */
export function setAsideHand(state: GameState, side: "player" | "opponent", returnsAfterTurn: number): GameState {
  const hand = side === "player" ? state.playerHand : state.opponentHand;
  if (hand.length === 0) return state; // nothing to set aside: no (empty) pile
  const piles = state.setAsideHands ?? [];
  const existing = piles.find((p) => p.side === side);
  const pile: SetAsideHand = existing
    ? { side, cards: [...existing.cards, ...hand], returnsAfterTurn: Math.max(existing.returnsAfterTurn, returnsAfterTurn) }
    : { side, cards: [...hand], returnsAfterTurn };
  return {
    ...state,
    ...(side === "player" ? { playerHand: [] } : { opponentHand: [] }),
    setAsideHands: [...piles.filter((p) => p !== existing), pile],
  };
}

/**
 * End of `side`'s turn `turn` (endTurn, before the between-turns checkup): its pile due by then
 * goes back into its hand (pure). `returned`: how many cards came back (0: nothing was due), for
 * the caller's log line — which must never name them.
 */
export function returnSetAsideHand(state: GameState, side: "player" | "opponent", turn: number): { state: GameState; returned: number } {
  const pile = state.setAsideHands?.find((p) => p.side === side && p.returnsAfterTurn <= turn);
  if (!pile) return { state, returned: 0 };
  const rest = state.setAsideHands!.filter((p) => p !== pile);
  const next: GameState = side === "player"
    ? { ...state, playerHand: [...state.playerHand, ...pile.cards] }
    : { ...state, opponentHand: [...state.opponentHand, ...pile.cards] };
  if (rest.length > 0) next.setAsideHands = rest;
  else delete next.setAsideHands;
  return { state: next, returned: pile.cards.length };
}
