/**
 * Bench trim: when a Stadium lowers the Bench limit, each player over it returns
 * Benched Pokémon — with every card attached to / under them — to the hand, one player after
 * the other (`state.pendingBenchTrim`, the opponent of whoever played it first). Nothing else
 * happens until every listed player has answered (getTurnActionBlocker, endTurn).
 *
 * Sides in the queue are relative to the view, like every other field: swapSides swaps them, so
 * a player can answer on its own view (where its entry's side is "player") or on the other one.
 */

import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { checkKnockouts, createGameEvent } from "@/lib/gameState";
import { modifiersAttachedTo } from "@/lib/modifiers";
import { cardsLeavingPlay } from "@/domain/cards";
import type { SelectionStep } from "@/domain/effects/types";
import { checkSelection } from "@/domain/effects/validate";
import { IllegalActionError } from "@/shared/errors";
import { getStadium } from "./stadium";

type Side = "player" | "opponent";

const benchOf = (state: GameState, side: Side): PokemonInPlay[] => (side === "player" ? state.playerBench : state.opponentBench);

/**
 * Queue a trim down to `keep` for every player whose Bench holds more: the opponent first, then
 * the player (the side whose view this is, who played the card). No one over: the state as is.
 */
export function requireBenchTrims(state: GameState, keep: number): GameState {
  const sides = (["opponent", "player"] as const).filter((side) => benchOf(state, side).length > keep);
  if (sides.length === 0) return state;
  return { ...state, pendingBenchTrim: sides.map((side) => ({ side, keep })) };
}

/**
 * The question for the first player in `pendingBenchTrim` (null when nothing is pending): which
 * Benched Pokémon go back to the hand. Worded for that player: show it to them (their view).
 */
export function getBenchTrimStep(state: GameState): SelectionStep | null {
  const trim = state.pendingBenchTrim?.[0];
  if (!trim) return null;
  const bench = benchOf(state, trim.side);
  const count = Math.max(0, bench.length - trim.keep);
  return {
    title: getStadium(state)?.card.name ?? "Banca llena",
    description: `Elige ${count} Pokémon de tu Banca: ${count === 1 ? "vuelve" : "vuelven"} a tu mano con todas sus cartas (la Banca admite ${trim.keep})`,
    options: bench.map((p) => ({ id: p.pokemon.id, label: p.pokemon.name, sublabel: "Banca" })),
    maxSelections: count,
    thumbnails: bench.map((p) => p.pokemon),
    disableAutoSelect: true,
  };
}

/**
 * Answer the first entry of `pendingBenchTrim`: `pokemonIds` are that player's Benched Pokémon
 * (exactly as many as the Bench is over the limit; never an Active) — each goes to its owner's
 * hand with its Energy, Trainers and the cards under it (a Trainer played as a Basic as the
 * Trainer card). Works on either view. Throws IllegalActionError on a wrong answer or when
 * nothing is pending.
 */
export function resolveBenchTrim(state: GameState, pokemonIds: string[]): GameState {
  const trim = state.pendingBenchTrim?.[0];
  const step = getBenchTrimStep(state);
  if (!trim || !step) throw new IllegalActionError("No hay Pokémon que devolver de la Banca");
  checkSelection(step, pokemonIds);

  const bench = benchOf(state, trim.side);
  const returned = bench.filter((p) => pokemonIds.includes(p.pokemon.id));
  let activeModifiers = state.activeModifiers;
  const cards: GameCard[] = [];
  for (const pokemon of returned) {
    // An attached Defender is one of its cards (kept as a modifier by the engine)
    const { attached, rest } = modifiersAttachedTo({ ...state, activeModifiers }, pokemon);
    activeModifiers = rest;
    cards.push(...cardsLeavingPlay(pokemon), ...attached.map((m) => m.card));
  }
  const remaining = bench.filter((p) => !pokemonIds.includes(p.pokemon.id));
  const queue = state.pendingBenchTrim!.slice(1);
  const message = `${step.title}: ${returned.map((p) => p.pokemon.name).join(", ")} ${returned.length === 1 ? "vuelve" : "vuelven"} a la mano con todas sus cartas`;
  const next: GameState = {
    ...state,
    ...(trim.side === "player"
      ? { playerBench: remaining, playerHand: [...state.playerHand, ...cards] }
      : { opponentBench: remaining, opponentHand: [...state.opponentHand, ...cards] }),
    activeModifiers,
    pendingBenchTrim: queue.length > 0 ? queue : undefined,
    events: [...state.events, createGameEvent(message, "action")],
  };
  return checkKnockouts(next);
}
