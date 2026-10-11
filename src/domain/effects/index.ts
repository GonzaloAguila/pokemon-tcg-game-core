/**
 * Card effect registry: generic entry points for Trainer cards and activated Pokémon Powers.
 *
 * Consumers (frontend SP/MP, API, AI, simulator) dispatch every Trainer and power through
 * these instead of per-card code:
 *
 *   const reason = canPlayTrainerCard(state, cardId);           // null = playable
 *   const coins = getTrainerCoinFlips(state, cardId);           // flip them (server in MP)
 *   getTrainerCoinFlippers(state, cardId, coins.length);        // who flipped each (captions)
 *   let step = getTrainerSteps(state, cardId, [], coins);       // ask, append answer, repeat
 *   const next = playTrainerCard(state, cardId, selections, { coinResults: coins });
 *
 * Same for powers with the id of the Pokémon in play using it (canUsePokemonPower,
 * getPowerCoinFlips, getPowerCoinFlippers, getPowerSteps, usePokemonPower). A step with
 * `chooser: "opponent"` is asked to the other player: show it with `stepForAnswerer(step)`.
 *
 * Errors: canX returns the Spanish reason; playTrainerCard / usePokemonPower throw
 * IllegalActionError when the card/power can't be used, the coins don't match what was
 * requested, or a selection isn't among the offered options (see shared/errors.ts).
 */

import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { checkKnockouts } from "@/lib/gameState";
import type { CoinFlipResult } from "@/domain/constants";
import { isPokemonCard } from "@/domain/cards";
import { canUsePower } from "@/domain/powers";
import { findInPlay, getTrainerBlocker, getTurnActionBlocker } from "@/domain/board";
import { IllegalActionError, assertLegal } from "@/shared/errors";
import type { CardEffectContext, CardEffectDef, CoinFlipper, CoinFlipRequirement, SelectionStep } from "./types";
import { checkCoins, checkSelections, coinRequirement } from "./validate";
import { TRAINER_EFFECTS } from "./trainers";
import { POWER_EFFECTS } from "./powers";

export type {
  SelectionOption,
  SelectionStep,
  CardEffectDef,
  CardEffectContext,
  CoinFlipRequirement,
  CoinFlipper,
} from "./types";
export { TRAINER_EFFECTS, UNSUPPORTED_TRAINERS, catalogTrainerNames, isPlayedAsBasic } from "./trainers";
export { POWER_EFFECTS, ACTIVATED_POWER_TYPES } from "./powers";
export { checkSelection, minSelectionsOf, stepForAnswerer } from "./validate";

// ============================================================================
// Shared runner
// ============================================================================

function runEffect(
  def: CardEffectDef,
  state: GameState,
  sourceId: string,
  selections: string[][],
  context: CardEffectContext
): GameState {
  const coins = context.coinResults ?? [];
  checkCoins(coinRequirement(def, state, sourceId), coins);
  checkSelections(def, state, sourceId, selections, coins.length > 0 ? coins : undefined);
  const next = def.resolve(state, sourceId, selections, { coinResults: coins });
  // The wrapped legacy functions return the same object when their own checks fail
  if (next === state) throw new IllegalActionError("No se pudo aplicar el efecto");
  // State-based Knock Outs (e.g. Gust of Wind changed what a transformed Ditto copies)
  return checkKnockouts(next);
}

// ============================================================================
// Trainers (sourceId = card id in the hand)
// ============================================================================

function trainerDef(state: GameState, cardId: string): { def?: CardEffectDef; reason: string | null } {
  const card = state.playerHand.find((c) => c.id === cardId);
  if (!card) return { reason: "La carta no está en tu mano" };
  if (card.kind !== "trainer") return { reason: "Esa carta no es un Entrenador" };
  if (card.playsAsBasic) return { reason: `${card.name} se juega como un Pokémon Básico: ponlo en tu Banca` };
  const def = TRAINER_EFFECTS[card.name];
  if (!def) return { reason: `${card.name} todavía no se puede jugar` };
  return { def, reason: null };
}

/** null when the Trainer in the hand can be played now, else the Spanish reason. */
export function canPlayTrainerCard(state: GameState, cardId: string): string | null {
  const blocker = getTurnActionBlocker(state);
  if (blocker) return blocker;
  const trainersBlocked = getTrainerBlocker(state);
  if (trainersBlocked) return trainersBlocked;
  const { def, reason } = trainerDef(state, cardId);
  if (!def) return reason;
  return def.canUse(state, cardId);
}

/** Next question to ask before playing the Trainer (null when ready to play). */
export function getTrainerSteps(
  state: GameState,
  cardId: string,
  selections: string[][],
  coinResults?: CoinFlipResult[]
): SelectionStep | null {
  const { def } = trainerDef(state, cardId);
  return def ? def.getSteps(state, cardId, selections, coinResults) : null;
}

/** Coins to flip before the Trainer's first step (0 = none). */
export function getTrainerCoinFlips(state: GameState, cardId: string, selections: string[][] = []): CoinFlipRequirement {
  const { def } = trainerDef(state, cardId);
  return def?.coinFlips?.(state, cardId, selections) ?? 0;
}

/** Who flipped each of `count` coins of an effect (default: its player). */
function flippersOf(def: CardEffectDef | undefined, count: number): CoinFlipper[] {
  return Array.from({ length: Math.max(0, count) }, (_, i) => def?.coinFlipper?.(i) ?? "self");
}

/**
 * Who flips each of the `count` coins of the Trainer `cardId` (its `getTrainerCoinFlips`
 * coins, in order), relative to the Trainer's player: Digger alternates "self", "opponent",
 * "self"…; every other Trainer is "self". For captions only (the caller still flips them all).
 */
export function getTrainerCoinFlippers(state: GameState, cardId: string, count: number): CoinFlipper[] {
  return flippersOf(trainerDef(state, cardId).def, count);
}

/** Play a Trainer from the hand with the answers to its steps and the coins it requested. */
export function playTrainerCard(
  state: GameState,
  cardId: string,
  selections: string[][] = [],
  context: CardEffectContext = {}
): GameState {
  assertLegal(canPlayTrainerCard(state, cardId));
  return runEffect(trainerDef(state, cardId).def!, state, cardId, selections, context);
}

// ============================================================================
// Pokémon Powers (sourceId = id of the Pokémon in play using it)
// ============================================================================

function powerDef(state: GameState, pokemonId: string): { def?: CardEffectDef; pokemon?: PokemonInPlay; reason: string | null } {
  const found = findInPlay(state, "player", pokemonId);
  if (!found) return { reason: "Debes elegir uno de tus Pokémon en juego" };
  const card = found.pokemon.pokemon;
  if (!isPokemonCard(card) || !card.power) return { reason: "Este Pokémon no tiene un Poder Pokémon" };
  const def = POWER_EFFECTS[card.power.name];
  if (!def) return { reason: `${card.power.name} no se activa: funciona solo` };
  return { def, pokemon: found.pokemon, reason: null };
}

/** null when this Pokémon can use its power now, else the Spanish reason. */
export function canUsePokemonPower(state: GameState, pokemonId: string): string | null {
  const blocker = getTurnActionBlocker(state);
  if (blocker) return blocker;
  const { def, pokemon, reason } = powerDef(state, pokemonId);
  if (!def || !pokemon) return reason;
  const statusReason = canUsePower(pokemon, state.playerActivePokemon?.pokemon.id === pokemonId, state.usedPowersThisTurn, state);
  if (statusReason) return statusReason;
  return def.canUse(state, pokemonId);
}

export function getPowerSteps(
  state: GameState,
  pokemonId: string,
  selections: string[][],
  coinResults?: CoinFlipResult[]
): SelectionStep | null {
  const { def } = powerDef(state, pokemonId);
  return def ? def.getSteps(state, pokemonId, selections, coinResults) : null;
}

export function getPowerCoinFlips(state: GameState, pokemonId: string, selections: string[][] = []): CoinFlipRequirement {
  const { def } = powerDef(state, pokemonId);
  return def?.coinFlips?.(state, pokemonId, selections) ?? 0;
}

/** Who flips each of the `count` coins of the power of `pokemonId`, relative to its owner (see getTrainerCoinFlippers). */
export function getPowerCoinFlippers(state: GameState, pokemonId: string, count: number): CoinFlipper[] {
  return flippersOf(powerDef(state, pokemonId).def, count);
}

/** Use the power of the player's Pokémon `pokemonId` with its answers and coins. */
export function usePokemonPower(
  state: GameState,
  pokemonId: string,
  selections: string[][] = [],
  context: CardEffectContext = {}
): GameState {
  assertLegal(canUsePokemonPower(state, pokemonId));
  return runEffect(powerDef(state, pokemonId).def!, state, pokemonId, selections, context);
}

/** Ids of the player's Pokémon that can use an activated power right now. */
export function getUsablePowerPokemonIds(state: GameState): string[] {
  const own = [state.playerActivePokemon, ...state.playerBench].filter((p): p is PokemonInPlay => p != null);
  return own.map((p) => p.pokemon.id).filter((id) => canUsePokemonPower(state, id) === null);
}
