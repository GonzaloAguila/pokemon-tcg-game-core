/**
 * Stadium cards (Gym Heroes). Every Stadium is played the same way: it stays in play
 * (`state.stadium`), a new Stadium replaces it and the old one goes to the discard pile of
 * whoever played it, and a Stadium with the same name as the one in play can't be played.
 *
 * Any card with `trainerType === TrainerType.Stadium` without its own TRAINER_EFFECTS entry is
 * played with `playStadium` (see trainerDef in ./index.ts). A Stadium with an on-play effect
 * gets an entry in STADIUM_EFFECTS (merged into TRAINER_EFFECTS) that wraps `playStadium`.
 * Continuous rules live in domain/stadiums/rules.ts; `withHandDiscardCost` applies No Removal
 * Gym's cost to the Trainers it names.
 */

import { createGameEvent, type GameState } from "@/lib/gameState";
import { requireBenchTrims } from "@/domain/board";
import { NARROW_GYM_BENCH_SIZE } from "@/domain/stadiums/rules";
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

/**
 * Stadiums with an effect when played (key = card name).
 *
 * | Stadium | selections |
 * |---|---|
 * | Narrow Gym | [] — then each player with 5 Benched returns 1 (pendingBenchTrim, resolveBenchTrim) |
 */
export const STADIUM_EFFECTS: Record<string, CardEffectDef> = {
  "Narrow Gym": {
    ...playStadium,
    resolve(state, cardId, selections, context) {
      return requireBenchTrims(playStadium.resolve(state, cardId, selections, context), NARROW_GYM_BENCH_SIZE);
    },
  },
};

/**
 * `def` with a cost of `count` cards discarded from the hand before playing it (No Removal Gym
 * on Energy Removal / Super Energy Removal): one more step first (the cards, from the hand), the
 * card's own steps after it, and the cards go to the discard pile before its effect.
 */
export function withHandDiscardCost(def: CardEffectDef, count: number): CardEffectDef {
  const otherCards = (state: GameState, cardId: string) => state.playerHand.filter((c) => c.id !== cardId);
  return {
    ...def,
    canUse(state, cardId) {
      if (otherCards(state, cardId).length < count) return `Necesitas descartar ${count} cartas de tu mano para jugar esta carta`;
      return def.canUse(state, cardId);
    },
    getSteps(state, cardId, selections, coinResults) {
      if (selections.length === 0) {
        return {
          title: state.stadium?.card.name ?? "Coste",
          description: `Selecciona ${count} cartas de tu mano para descartar`,
          options: otherCards(state, cardId).map((c) => ({ id: c.id, label: c.name })),
          maxSelections: count,
          source: "hand",
        };
      }
      return def.getSteps(state, cardId, selections.slice(1), coinResults);
    },
    ...(def.coinFlips && {
      coinFlips: (state: GameState, cardId: string, selections: string[][]) => def.coinFlips!(state, cardId, selections.slice(1)),
    }),
    resolve(state, cardId, selections, context) {
      const discarded = state.playerHand.filter((c) => selections[0].includes(c.id));
      const paid: GameState = {
        ...state,
        playerHand: state.playerHand.filter((c) => !selections[0].includes(c.id)),
        playerDiscard: [...state.playerDiscard, ...discarded],
        events: [
          ...state.events,
          createGameEvent(`Descartaste ${discarded.map((c) => c.name).join(" y ")} (${state.stadium?.card.name ?? "coste"})`, "action"),
        ],
      };
      return def.resolve(paid, cardId, selections.slice(1), context);
    },
  };
}
