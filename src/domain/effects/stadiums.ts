/**
 * Stadium cards (Gym Heroes). Every Stadium is played the same way: it stays in play
 * (`state.stadium`), a new Stadium replaces it and the old one goes to the discard pile of
 * whoever played it, and a Stadium with the same name as the one in play can't be played.
 *
 * Any card with `trainerType === TrainerType.Stadium` without its own TRAINER_EFFECTS entry is
 * played with `playStadium` (see trainerDef in ./index.ts). A Stadium with an on-play effect
 * gets an explicit entry that wraps `playStadium`.
 */

import { createGameEvent, type GameState } from "@/lib/gameState";
import type { CardEffectDef } from "./types";

const discardPileOf = (side: "player" | "opponent") => (side === "player" ? "playerDiscard" : "opponentDiscard");

/** Any Stadium: it stays in play; a new one replaces it (to its player's discard pile); never two of the same name. */
export const playStadium: CardEffectDef = {
  canUse(state, cardId) {
    const card = state.playerHand.find((c) => c.id === cardId);
    if (!card) return "Esa carta no está en tu mano";
    if (state.stadium && state.stadium.card.name === card.name) return "Ya hay un Estadio con ese nombre en juego";
    return null;
  },
  getSteps: () => null,
  resolve(state, cardId) {
    const card = state.playerHand.find((c) => c.id === cardId)!;
    const previous = state.stadium ?? null;
    const next: GameState = {
      ...state,
      playerHand: state.playerHand.filter((c) => c.id !== cardId),
      stadium: { card, playedBy: "player" },
      events: [...state.events, createGameEvent(`Jugaste ${card.name}: el Estadio queda en juego`, "action")],
    };
    if (!previous) return next;
    const pile = discardPileOf(previous.playedBy);
    return {
      ...next,
      [pile]: [...next[pile], previous.card],
      events: [...next.events, createGameEvent(`${previous.card.name} se descarta`, "info")],
    };
  },
};
