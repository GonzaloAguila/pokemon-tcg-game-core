/**
 * Invariants checked after every action of a headless game. A violation is an engine bug
 * (or a rule question) — never something a player could legally cause.
 */

import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { GamePhase, PokemonStage, StatusCondition } from "@/domain/constants";
import { isPokemonCard, isTrainerInPlay } from "@/domain/cards";
import { getEffectiveHp, isAwaitingTransformTarget } from "@/domain/powers";

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
  /** What each card was at the start (id → kind and name), for the identity checks */
  initialCards?: Map<string, CardIdentity>;
};

export type CardIdentity = { kind: string; name: string };

/** id → kind and name of every card of both sides (call it on the initial state) */
export function cardIdentities(state: GameState): Map<string, CardIdentity> {
  const map = new Map<string, CardIdentity>();
  for (const side of ["player", "opponent"] as const) {
    const piles = side === "player"
      ? [state.playerDeck, state.playerHand, state.playerDiscard, state.playerPrizes]
      : [state.opponentDeck, state.opponentHand, state.opponentDiscard, state.opponentPrizes];
    for (const card of piles.flat()) map.set(card.id, { kind: card.kind, name: card.name });
  }
  return map;
}

/** Special Conditions (CannotAttack is an attack effect, not one of them) */
const SPECIAL_CONDITIONS: readonly StatusCondition[] = [
  StatusCondition.Asleep,
  StatusCondition.Confused,
  StatusCondition.Paralyzed,
  StatusCondition.Poisoned,
];
const ROTATING_CONDITIONS: readonly StatusCondition[] = [StatusCondition.Asleep, StatusCondition.Confused, StatusCondition.Paralyzed];

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
    } else if (damage >= getEffectiveHp(state, p) && state.gamePhase !== GamePhase.GameOver && !isAwaitingTransformTarget(state, p)) {
      problems.push(`${where} ${p.pokemon.name} has ${damage} damage >= ${getEffectiveHp(state, p)} HP and is still in play`);
    }
  }

  // Special Conditions: never on the Bench nor on a Trainer played as a Basic; Asleep,
  // Confused and Paralyzed replace each other; no condition twice
  for (const [where, p] of inPlay) {
    const conditions = p.statusConditions ?? [];
    const special = conditions.filter((c) => SPECIAL_CONDITIONS.includes(c));
    if (where.includes("bench") && special.length > 0) problems.push(`${where} ${p.pokemon.name} is ${special.join("+")} on the Bench`);
    if (isTrainerInPlay(p.pokemon) && special.length > 0) problems.push(`${where} ${p.pokemon.name} (a Trainer) is ${special.join("+")}`);
    if (conditions.filter((c) => ROTATING_CONDITIONS.includes(c)).length > 1) problems.push(`${where} ${p.pokemon.name} is ${conditions.join("+")}`);
    if (new Set(conditions).size !== conditions.length) problems.push(`${where} ${p.pokemon.name} has a repeated condition (${conditions.join("+")})`);
    // Attached Energy are Energy cards (or a Buzzap Electrode)
    for (const energy of p.attachedEnergy) {
      if (energy.kind !== "energy" && !energy.buzzapEnergyType) problems.push(`${where} ${p.pokemon.name} has ${energy.name} (${energy.kind}) attached as Energy`);
    }
    // An Evolution card in play sits on what it evolved from
    if (isPokemonCard(p.pokemon) && p.pokemon.stage !== PokemonStage.Basic && !isTrainerInPlay(p.pokemon) && !(p.previousEvolutions?.length)) {
      problems.push(`${where} ${p.pokemon.name} (${p.pokemon.stage}) has no previous evolution`);
    }
  }

  // Paralysis ends at the end of its owner's next turn (it needs the turn it started on);
  // PlusPower / Defender leave once their turn is over
  for (const [where, p] of inPlay) {
    if (!(p.statusConditions ?? []).includes(StatusCondition.Paralyzed)) continue;
    if (p.paralyzedOnTurn === undefined) problems.push(`${where} ${p.pokemon.name} is Paralyzed with no paralyzedOnTurn (it would never wear off)`);
    else if (state.turnNumber > p.paralyzedOnTurn + 1) {
      problems.push(`${where} ${p.pokemon.name} is still Paralyzed on turn ${state.turnNumber} (since turn ${p.paralyzedOnTurn})`);
    }
  }
  for (const modifier of state.activeModifiers) {
    if (modifier.expiresAfterTurn < state.turnNumber) {
      problems.push(`${modifier.card.name} (${modifier.playerId}) still active on turn ${state.turnNumber}, expired after turn ${modifier.expiresAfterTurn}`);
    }
  }

  // Prizes only leave; the turn number never goes back
  for (const side of ["player", "opponent"] as const) {
    const now = (side === "player" ? state.playerPrizes : state.opponentPrizes).length;
    const before = (side === "player" ? context.before.playerPrizes : context.before.opponentPrizes).length;
    if (now > before && context.before.gamePhase === GamePhase.Playing) problems.push(`${side} prizes went from ${before} to ${now}`);
  }
  if (state.turnNumber < context.before.turnNumber) problems.push(`turn number went back from ${context.before.turnNumber} to ${state.turnNumber}`);

  // Card identity: outside play every card is what it was at the start (a Mysterious Fossil
  // is the Trainer again, a Buzzap Electrode is an Electrode again); in play it keeps its name
  if (context.initialCards) {
    for (const side of ["player", "opponent"] as const) {
      const piles: [string, GameCard[]][] = side === "player"
        ? [["deck", state.playerDeck], ["hand", state.playerHand], ["discard", state.playerDiscard], ["prizes", state.playerPrizes]]
        : [["deck", state.opponentDeck], ["hand", state.opponentHand], ["discard", state.opponentDiscard], ["prizes", state.opponentPrizes]];
      for (const [pile, cards] of piles) {
        for (const card of cards) {
          const initial = context.initialCards.get(card.id);
          if (!initial) continue;
          // (A discarded Buzzap Electrode keeps buzzapEnergyType / buzzapSourceId: harmless
          // today, every pile search checks `kind`; not flagged)
          if (initial.kind !== card.kind || initial.name !== card.name) {
            problems.push(`${side} ${pile}: ${card.name} (${card.kind}) was ${initial.name} (${initial.kind})`);
          }
        }
      }
    }
    for (const [where, p] of inPlay) {
      const initial = context.initialCards.get(p.pokemon.id);
      if (initial && initial.name !== p.pokemon.name) problems.push(`${where} ${p.pokemon.name} was ${initial.name}`);
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
      state.pendingAttackChoice && "pendingAttackChoice",
      state.pendingPowerChoice && "pendingPowerChoice",
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
