/**
 * Invariants checked after every action of a headless game. A violation is an engine bug
 * (or a rule question) — never something a player could legally cause.
 */

import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { GamePhase } from "@/domain/constants";
import { isPokemonCard } from "@/domain/cards";
import { getEffectiveHp } from "@/domain/powers";

/** Ids of every card a side owns, wherever it is (Buzzap energy counts as its Electrode). */
export function ownedCardIds(state: GameState, side: "player" | "opponent"): string[] {
  const ids: string[] = [];
  const addCard = (card: GameCard) => ids.push(card.buzzapSourceId ?? card.id);
  const addInPlay = (p: PokemonInPlay | null | undefined) => {
    if (!p) return;
    addCard(p.pokemon);
    p.attachedEnergy.forEach(addCard);
    (p.attachedTrainers ?? []).forEach(addCard);
    (p.previousEvolutions ?? []).forEach(addCard);
  };
  const isPlayer = side === "player";
  (isPlayer ? state.playerDeck : state.opponentDeck).forEach(addCard);
  (isPlayer ? state.playerHand : state.opponentHand).forEach(addCard);
  (isPlayer ? state.playerDiscard : state.opponentDiscard).forEach(addCard);
  (isPlayer ? state.playerPrizes : state.opponentPrizes).forEach(addCard);
  addInPlay(isPlayer ? state.playerActivePokemon : state.opponentActivePokemon);
  (isPlayer ? state.playerBench : state.opponentBench).forEach(addInPlay);
  for (const modifier of state.activeModifiers) {
    if (modifier.playerId === side) addCard(modifier.card);
  }
  return ids;
}

export type InvariantContext = {
  /** Card ids each side started with (from the "player" = A perspective state) */
  initialIds: { player: string[]; opponent: string[] };
  /** State before the action */
  before: GameState;
};

/** Returns the list of violated invariants (empty = OK). `state` is in A's perspective. */
export function checkInvariants(state: GameState, context: InvariantContext): string[] {
  const problems: string[] = [];

  // Card conservation: each side always owns exactly its own 60 cards
  for (const side of ["player", "opponent"] as const) {
    const now = [...ownedCardIds(state, side)].sort();
    const initial = context.initialIds[side];
    if (now.length !== initial.length || now.some((id, i) => id !== initial[i])) {
      const missing = initial.filter((id) => !now.includes(id));
      const extra = now.filter((id) => !initial.includes(id));
      const duplicated = now.filter((id, i) => now[i + 1] === id);
      problems.push(
        `card conservation (${side}): ${now.length}/${initial.length} cards; missing [${missing.slice(0, 3).join(", ")}] ` +
          `extra [${extra.slice(0, 3).join(", ")}] duplicated [${duplicated.slice(0, 3).join(", ")}]`
      );
    }
  }

  // Pokémon in play: damage >= 0, multiple of 10, below HP (KOs are processed by every action)
  const inPlay: [string, PokemonInPlay][] = [];
  for (const side of ["player", "opponent"] as const) {
    const active = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
    if (active) inPlay.push([`${side} active`, active]);
    (side === "player" ? state.playerBench : state.opponentBench).forEach((p, i) => {
      if (!p) problems.push(`${side} bench slot ${i} is empty (sparse bench)`);
      else inPlay.push([`${side} bench ${i}`, p]);
    });
    const benchSize = (side === "player" ? state.playerBench : state.opponentBench).length;
    if (benchSize > 5) problems.push(`${side} bench has ${benchSize} Pokémon`);
  }
  for (const [where, p] of inPlay) {
    const damage = p.currentDamage ?? 0;
    if (damage < 0 || damage % 10 !== 0) problems.push(`${where} ${p.pokemon.name} has damage ${damage}`);
    if (!isPokemonCard(p.pokemon)) {
      problems.push(`${where} is not a Pokémon card (${p.pokemon.name})`);
    } else if (damage >= getEffectiveHp(state, p) && state.gamePhase !== GamePhase.GameOver) {
      problems.push(`${where} ${p.pokemon.name} has ${damage} damage >= ${getEffectiveHp(state, p)} HP and is still in play`);
    }
  }

  // Turn change: nothing may be left pending, both sides have an Active
  const turnChanged = state.turnNumber !== context.before.turnNumber && state.gamePhase === GamePhase.Playing;
  if (turnChanged && state.gameResult === null) {
    const pending = [
      state.pendingForceSwitch && "pendingForceSwitch",
      state.pendingSelfSwitch && "pendingSelfSwitch",
      state.pendingDeckSearch && "pendingDeckSearch",
      state.pendingBenchDamageSelection && "pendingBenchDamageSelection",
      state.pendingTypeShift && "pendingTypeShift",
      state.playerCanTakePrize && "playerCanTakePrize",
      state.opponentCanTakePrize && "opponentCanTakePrize",
      state.playerNeedsToPromote && "playerNeedsToPromote",
      state.opponentNeedsToPromote && "opponentNeedsToPromote",
      state.attackedThisTurn && "attackedThisTurn",
    ].filter(Boolean);
    if (pending.length > 0) problems.push(`pending across the turn change: ${pending.join(", ")}`);
    if (!state.playerActivePokemon || !state.opponentActivePokemon) problems.push("a side has no Active Pokémon after the turn change");
  }

  // The result and the phase agree
  if ((state.gameResult !== null) !== (state.gamePhase === GamePhase.GameOver)) {
    problems.push(`gameResult ${state.gameResult} with phase ${state.gamePhase}`);
  }

  return problems;
}
