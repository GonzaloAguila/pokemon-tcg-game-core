/**
 * Engine-owned board actions: put a Basic into play, attach an Energy from the hand,
 * evolve. Like every engine function they act for the "player" side (the side whose
 * turn it is); callers acting for the other side swap perspective (see swapSides).
 *
 * Each action has a `canX` query returning a Spanish reason (null = legal); the action
 * itself throws IllegalActionError when called anyway (see shared/errors.ts).
 */

import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import {
  createGameEvent,
  canEvolveInto,
  findValidEvolutionTargets,
  getEnergyTypeInSpanish,
} from "@/lib/gameState";
import { isEnergyCard, isPlayableAsBasic, isPokemonCard } from "@/domain/cards";
import { GamePhase, PokemonStage } from "@/domain/constants";
import { attachEnergyWithRainDance, canAutoAttachEnergy } from "@/domain/powers";
import { assertLegal } from "@/shared/errors";
import { findInPlay, MAX_BENCH_SIZE } from "./locate";

export { findInPlay, findOwnPokemon, allOwnPokemon, MAX_BENCH_SIZE } from "./locate";
export type { InPlayLocation } from "./locate";
export { swapSides } from "./swap";

export type BoardPosition = "active" | "bench";

// ============================================================================
// SHARED CHECKS
// ============================================================================

/** Mulligan/Setup: both players place their Basics before the first turn. */
export function isSetupPhase(state: GameState): boolean {
  return state.gamePhase === GamePhase.Mulligan || state.gamePhase === GamePhase.Setup;
}

/**
 * Why the "player" side can't take a normal action right now (play cards, use powers,
 * attach, evolve, retreat), or null. During the PLAYING phase it must be the player's turn
 * and nothing may be waiting: an attack still resolving (switch, deck search, bench damage),
 * a promotion, or the player's own prize after a knockout (the attack already happened).
 */
export function getTurnActionBlocker(state: GameState): string | null {
  if (state.gamePhase === GamePhase.GameOver) return "La partida terminó";
  if (state.gamePhase !== GamePhase.Playing) return "La partida todavía no empezó";
  if (!state.isPlayerTurn) return "No es tu turno";
  if (state.pendingForceSwitch || state.pendingSelfSwitch || state.pendingDeckSearch || state.pendingBenchDamageSelection) {
    return "Primero resuelve el efecto pendiente del ataque";
  }
  if (state.playerNeedsToPromote || state.opponentNeedsToPromote) {
    return "Primero hay que elegir un nuevo Pokémon activo";
  }
  if (state.playerCanTakePrize) return "Primero toma tu premio";
  return null;
}

function newPokemonInPlay(card: GameCard, playedOnTurn: number): PokemonInPlay {
  return {
    pokemon: card,
    attachedEnergy: [],
    attachedTrainers: [],
    previousEvolutions: [],
    currentDamage: 0,
    statusConditions: [],
    playedOnTurn,
  };
}

// ============================================================================
// PLAY A BASIC
// ============================================================================

/**
 * Can the card be put into play as a Basic, as Active or on the Bench?
 * - Setup (MULLIGAN/SETUP): Active first (only if empty), then Bench.
 * - During the game: Bench only, on your turn (the Active spot is refilled by promoting).
 * - The Bench holds at most 5 Pokémon.
 */
export function canPlayBasicPokemon(state: GameState, cardId: string, position: BoardPosition): string | null {
  if (isSetupPhase(state)) {
    // setup: both players act at the same time, no turn check
  } else {
    const blocker = getTurnActionBlocker(state);
    if (blocker) return blocker;
  }
  const card = state.playerHand.find((c) => c.id === cardId);
  if (!card) return "La carta no está en tu mano";
  if (!isPlayableAsBasic(card)) return "Solo puedes poner en juego Pokémon Básicos";

  if (position === "active") {
    if (!isSetupPhase(state)) return "Durante la partida solo puedes poner Pokémon Básicos en la banca";
    if (state.playerActivePokemon) return "Ya tienes un Pokémon activo";
    return null;
  }
  if (!state.playerActivePokemon) return "Primero coloca tu Pokémon activo";
  if (state.playerBench.filter((p) => p != null).length >= MAX_BENCH_SIZE) return "Tu banca está llena";
  return null;
}

/**
 * Put a Basic Pokémon from the hand into play. `playedOnTurn` is the current turn number
 * during the game and 0 for Pokémon placed during setup (before turn 1).
 */
export function playBasicPokemon(state: GameState, cardId: string, position: BoardPosition): GameState {
  assertLegal(canPlayBasicPokemon(state, cardId, position));
  const card = state.playerHand.find((c) => c.id === cardId)!;
  const playedOnTurn = isSetupPhase(state) ? 0 : state.turnNumber;
  const pokemon = newPokemonInPlay(card, playedOnTurn);
  const playerHand = state.playerHand.filter((c) => c.id !== cardId);

  if (position === "active") {
    return {
      ...state,
      playerHand,
      playerActivePokemon: pokemon,
      events: [...state.events, createGameEvent(`Colocaste ${card.name} como Pokémon activo`, "action")],
    };
  }
  return {
    ...state,
    playerHand,
    playerBench: [...state.playerBench.filter((p) => p != null), pokemon],
    events: [...state.events, createGameEvent(`Colocaste ${card.name} en la banca`, "action")],
  };
}

// ============================================================================
// ATTACH ENERGY
// ============================================================================

/**
 * Hook for special energies that do something when attached FROM THE HAND (Rainbow Energy,
 * Full Heal Energy, Potion Energy in Team Rocket). Keyed by card name; runs after the
 * Energy is attached, with the target's id. Must return a new state.
 */
export type OnAttachFromHand = (state: GameState, energyCard: GameCard, targetPokemonId: string) => GameState;
export const ENERGY_ATTACH_EFFECTS: Record<string, OnAttachFromHand> = {};

/** Rain Dance-style power that allows this attachment without using the turn's attachment. */
function powerAttachment(state: GameState, energyCard: GameCard, target: PokemonInPlay): boolean {
  return canAutoAttachEnergy(state, "player", energyCard, target) !== null;
}

/**
 * One Energy card from the hand per turn, to one of your Pokémon (Active or Bench), during
 * your turn. Exception: an UnlimitedEnergyAttach power (Blastoise's Rain Dance) attaches
 * matching Energy without using the turn's attachment (it is used first when it applies).
 */
export function canAttachEnergy(state: GameState, energyCardId: string, targetPokemonId: string): string | null {
  const blocker = getTurnActionBlocker(state);
  if (blocker) return blocker;
  const card = state.playerHand.find((c) => c.id === energyCardId);
  if (!card) return "La carta no está en tu mano";
  if (!isEnergyCard(card)) return "Solo puedes adjuntar cartas de energía";
  const target = findInPlay(state, "player", targetPokemonId);
  if (!target) return "Debes elegir uno de tus Pokémon en juego";
  if (powerAttachment(state, card, target.pokemon)) return null;
  if (state.energyAttachedThisTurn) return "Solo puedes adjuntar una energía por turno";
  return null;
}

export function attachEnergyCard(state: GameState, energyCardId: string, targetPokemonId: string): GameState {
  assertLegal(canAttachEnergy(state, energyCardId, targetPokemonId));
  const card = state.playerHand.find((c) => c.id === energyCardId)!;
  const target = findInPlay(state, "player", targetPokemonId)!;

  let next: GameState;
  if (powerAttachment(state, card, target.pokemon)) {
    next = attachEnergyWithRainDance(state, "player", energyCardId, targetPokemonId);
  } else {
    const updated: PokemonInPlay = { ...target.pokemon, attachedEnergy: [...target.pokemon.attachedEnergy, card] };
    const energyName = isEnergyCard(card) ? getEnergyTypeInSpanish(card.energyType) : card.name;
    next = {
      ...state,
      playerHand: state.playerHand.filter((c) => c.id !== energyCardId),
      ...(target.location === "active"
        ? { playerActivePokemon: updated }
        : { playerBench: state.playerBench.map((p, i) => (i === target.benchIndex ? updated : p)) }),
      energyAttachedThisTurn: true,
      events: [...state.events, createGameEvent(`Adjuntaste energía ${energyName} a ${target.pokemon.pokemon.name}`, "action")],
    };
  }

  const onAttach = ENERGY_ATTACH_EFFECTS[card.name];
  return onAttach ? onAttach(next, card, targetPokemonId) : next;
}

// ============================================================================
// EVOLVE
// ============================================================================

/**
 * The Pokémon after evolving into `evolutionCard`: same damage, Energy and attached cards;
 * the previous card goes under it. Classic rule: evolving removes Special Conditions and
 * ends every effect of attacks on it (protection, Leer, Acid, Sand-attack, Minimize...).
 * `playedOnTurn` becomes the current turn (it can't evolve again this turn).
 * Shared by evolvePokemonCard and Pokémon Breeder.
 */
export function evolvePokemonInPlay(target: PokemonInPlay, evolutionCard: GameCard, turnNumber: number): PokemonInPlay {
  return {
    ...clearEffectsAsIfEvolved(target),
    pokemon: evolutionCard,
    previousEvolutions: [...(target.previousEvolutions ?? []), target.pokemon],
    playedOnTurn: turnNumber,
  };
}

/**
 * What evolving (or devolving: Devolution Spray "just as if you had evolved it") removes:
 * Special Conditions (and Toxic's poison damage) and every effect of attacks on the Pokémon.
 */
export function clearEffectsAsIfEvolved(target: PokemonInPlay): PokemonInPlay {
  return {
    ...target,
    statusConditions: [],
    paralyzedOnTurn: undefined,
    poisonDamage: undefined,
    protection: undefined,
    nextTurnBonusDamage: undefined,
    nextTurnDamageReduction: undefined,
    nextTurnEffectAppliedOnTurn: undefined,
    retreatPrevented: undefined,
    retreatPreventedOnTurn: undefined,
    destinyBondActive: undefined,
    destinyBondTurn: undefined,
    mustFlipToAttack: undefined,
    mustFlipToAttackTurn: undefined,
    modifiedWeakness: undefined,
    modifiedResistance: undefined,
  };
}

/**
 * Whether evolution is globally blocked for the player right now (Aerodactyl's Prehistoric
 * Power, Fossil). Returns the Spanish reason or null. Extension point for Stage B.
 */
export function getEvolutionBlocker(_state: GameState): string | null {
  return null;
}

/**
 * Can `evolutionCardId` (in hand) evolve the player's Pokémon `targetPokemonId`?
 * Rules: your turn; not on either player's first turn (turns 1 and 2, whoever started —
 * turns alternate, so this needs no perspective); the target was not put into play or
 * evolved this turn; the card says "Evolves from <target name>".
 */
export function canEvolve(state: GameState, evolutionCardId: string, targetPokemonId: string): string | null {
  const blocker = getTurnActionBlocker(state);
  if (blocker) return blocker;
  const card = state.playerHand.find((c) => c.id === evolutionCardId);
  if (!card) return "La carta no está en tu mano";
  if (!isPokemonCard(card) || card.stage === PokemonStage.Basic) return "Esa carta no es una evolución";
  const target = findInPlay(state, "player", targetPokemonId);
  if (!target) return "Debes elegir uno de tus Pokémon en juego";
  if (!canEvolveInto(card, target.pokemon.pokemon)) {
    return `${card.name} no evoluciona de ${target.pokemon.pokemon.name}`;
  }
  if (state.turnNumber <= 2) return "No puedes evolucionar en tu primer turno";
  if (target.pokemon.playedOnTurn === state.turnNumber) {
    return `${target.pokemon.pokemon.name} entró en juego o evolucionó este turno`;
  }
  const globalBlocker = getEvolutionBlocker(state);
  if (globalBlocker) return globalBlocker;
  // Same rules as the legacy helper (kept in sync for UIs still using it)
  const legacyTargets = findValidEvolutionTargets(card, state.playerActivePokemon, state.playerBench, state.turnNumber);
  const legacyIndex = target.location === "active" ? -1 : target.benchIndex;
  if (!legacyTargets.includes(legacyIndex)) return "No puedes evolucionar ese Pokémon ahora";
  return null;
}

/** Ids of the player's Pokémon that `evolutionCardId` can evolve right now. */
export function getEvolutionTargets(state: GameState, evolutionCardId: string): string[] {
  const own = [state.playerActivePokemon, ...state.playerBench].filter((p): p is PokemonInPlay => p != null);
  return own.map((p) => p.pokemon.id).filter((id) => canEvolve(state, evolutionCardId, id) === null);
}

export function evolvePokemonCard(state: GameState, evolutionCardId: string, targetPokemonId: string): GameState {
  assertLegal(canEvolve(state, evolutionCardId, targetPokemonId));
  const card = state.playerHand.find((c) => c.id === evolutionCardId)!;
  const target = findInPlay(state, "player", targetPokemonId)!;
  const evolved = evolvePokemonInPlay(target.pokemon, card, state.turnNumber);

  return {
    ...state,
    playerHand: state.playerHand.filter((c) => c.id !== evolutionCardId),
    ...(target.location === "active"
      ? { playerActivePokemon: evolved }
      : { playerBench: state.playerBench.map((p, i) => (i === target.benchIndex ? evolved : p)) }),
    events: [
      ...state.events,
      createGameEvent(`${target.pokemon.pokemon.name} evolucionó a ${card.name}`, "action"),
    ],
  };
}
