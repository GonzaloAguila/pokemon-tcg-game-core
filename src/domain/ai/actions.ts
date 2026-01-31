/**
 * AI Actions - Generic Side-Agnostic Game Actions
 *
 * Funciones puras para ejecutar acciones del juego independientes del lado.
 * Usadas tanto por el jugador como por la IA.
 */

import type { GameState, GameCard, PokemonInPlay } from "@/domain/match";
import {
  createGameEvent,
  getEnergyTypeInSpanish,
  canEvolveInto,
  findValidEvolutionTargets,
  canUseAttack,
  hasEnoughEnergyToRetreat,
  canRetreat,
  getRetreatCost,
  getTotalEnergyValue,
  clearStatusConditionsOnRetreat,
} from "@/domain/match";
import { isPokemonCard, isEnergyCard } from "@/domain/cards";
import { GamePhase, PokemonStage } from "@/domain/constants";
import type { Side } from "./types";

/** Getters para acceder al estado según el lado */
function getHand(state: GameState, side: Side): GameCard[] {
  return side === "player" ? state.playerHand : state.opponentHand;
}

function getActivePokemon(state: GameState, side: Side): PokemonInPlay | null {
  return side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
}

function getBench(state: GameState, side: Side): PokemonInPlay[] {
  return side === "player" ? state.playerBench : state.opponentBench;
}

function getDiscard(state: GameState, side: Side): GameCard[] {
  return side === "player" ? state.playerDiscard : state.opponentDiscard;
}

/**
 * Jugar un Pokemon básico como activo
 */
export function playBasicToActive(
  state: GameState,
  side: Side,
  cardId: string
): GameState {
  const hand = getHand(state, side);
  const activePokemon = getActivePokemon(state, side);

  // Verificar que no hay Pokemon activo
  if (activePokemon) {
    return state;
  }

  // Encontrar la carta en la mano
  const card = hand.find((c) => c.id === cardId);
  if (!card || !isPokemonCard(card) || card.stage !== PokemonStage.Basic) {
    return state;
  }

  const sideName = side === "player" ? "Tú colocaste" : "Rival colocó";
  const newEvent = createGameEvent(
    `${sideName} ${card.name} como Pokémon activo`,
    "action"
  );

  // During SETUP phase, use turn 1 for playedOnTurn so Pokemon can't evolve on turn 1
  const effectiveTurnNumber = state.gamePhase === GamePhase.Setup ? 1 : state.turnNumber;

  const newPokemonInPlay: PokemonInPlay = {
    pokemon: card,
    attachedEnergy: [],
    attachedTrainers: [],
    previousEvolutions: [],
    currentDamage: 0,
    playedOnTurn: effectiveTurnNumber,
  };

  const newHand = hand.filter((c) => c.id !== cardId);

  if (side === "player") {
    return {
      ...state,
      playerHand: newHand,
      playerActivePokemon: newPokemonInPlay,
      events: [...state.events, newEvent],
    };
  } else {
    return {
      ...state,
      opponentHand: newHand,
      opponentActivePokemon: newPokemonInPlay,
      events: [...state.events, newEvent],
    };
  }
}

/**
 * Jugar un Pokemon básico en la banca
 */
export function playBasicToBench(
  state: GameState,
  side: Side,
  cardId: string,
  benchIndex: number
): GameState {
  const hand = getHand(state, side);
  const bench = getBench(state, side);

  // Verificar índice válido
  if (benchIndex < 0 || benchIndex >= 5) return state;

  // Verificar que el slot está vacío
  if (bench[benchIndex]) return state;

  // Encontrar la carta en la mano
  const card = hand.find((c) => c.id === cardId);
  if (!card || !isPokemonCard(card) || card.stage !== PokemonStage.Basic) {
    return state;
  }

  const sideName = side === "player" ? "Tú colocaste" : "Rival colocó";
  const newEvent = createGameEvent(
    `${sideName} ${card.name} en la banca`,
    "action"
  );

  // During SETUP phase, use turn 1 for playedOnTurn so Pokemon can't evolve on turn 1
  const effectiveTurnNumber = state.gamePhase === GamePhase.Setup ? 1 : state.turnNumber;

  const newPokemonInPlay: PokemonInPlay = {
    pokemon: card,
    attachedEnergy: [],
    attachedTrainers: [],
    previousEvolutions: [],
    currentDamage: 0,
    playedOnTurn: effectiveTurnNumber,
  };

  const newBench = [...bench];
  newBench[benchIndex] = newPokemonInPlay;

  const newHand = hand.filter((c) => c.id !== cardId);

  if (side === "player") {
    return {
      ...state,
      playerHand: newHand,
      playerBench: newBench,
      events: [...state.events, newEvent],
    };
  } else {
    return {
      ...state,
      opponentHand: newHand,
      opponentBench: newBench,
      events: [...state.events, newEvent],
    };
  }
}

/**
 * Adjuntar una energía a un Pokemon
 */
export function attachEnergy(
  state: GameState,
  side: Side,
  energyCardId: string,
  targetPokemonId: string,
  isBench: boolean,
  benchIndex?: number
): GameState {
  // Solo se puede adjuntar energía en fase PLAYING
  if (state.gamePhase !== GamePhase.Playing) return state;

  // Verificar límite de una energía por turno
  if (state.energyAttachedThisTurn) return state;

  const hand = getHand(state, side);
  const activePokemon = getActivePokemon(state, side);
  const bench = getBench(state, side);

  // Encontrar la carta de energía
  const energyCard = hand.find((c) => c.id === energyCardId);
  if (!energyCard || !isEnergyCard(energyCard)) return state;

  const newHand = hand.filter((c) => c.id !== energyCardId);
  const sideName = side === "player" ? "Tú adjuntaste" : "Rival adjuntó";

  if (isBench && benchIndex !== undefined) {
    const benchPokemon = bench[benchIndex];
    if (!benchPokemon) return state;

    const newEvent = createGameEvent(
      `${sideName} energía ${getEnergyTypeInSpanish(energyCard.energyType)} a ${benchPokemon.pokemon.name}`,
      "action"
    );

    const newBench = [...bench];
    newBench[benchIndex] = {
      ...benchPokemon,
      attachedEnergy: [...benchPokemon.attachedEnergy, energyCard],
    };

    if (side === "player") {
      return {
        ...state,
        playerHand: newHand,
        playerBench: newBench,
        energyAttachedThisTurn: true,
        events: [...state.events, newEvent],
      };
    } else {
      return {
        ...state,
        opponentHand: newHand,
        opponentBench: newBench,
        energyAttachedThisTurn: true,
        events: [...state.events, newEvent],
      };
    }
  } else {
    if (!activePokemon) return state;

    const newEvent = createGameEvent(
      `${sideName} energía ${getEnergyTypeInSpanish(energyCard.energyType)} a ${activePokemon.pokemon.name}`,
      "action"
    );

    const updatedActive: PokemonInPlay = {
      ...activePokemon,
      attachedEnergy: [...activePokemon.attachedEnergy, energyCard],
    };

    if (side === "player") {
      return {
        ...state,
        playerHand: newHand,
        playerActivePokemon: updatedActive,
        energyAttachedThisTurn: true,
        events: [...state.events, newEvent],
      };
    } else {
      return {
        ...state,
        opponentHand: newHand,
        opponentActivePokemon: updatedActive,
        energyAttachedThisTurn: true,
        events: [...state.events, newEvent],
      };
    }
  }
}

/**
 * Evolucionar un Pokemon
 */
export function evolve(
  state: GameState,
  side: Side,
  evolutionCardId: string,
  targetIndex: number // -1 = activo, 0-4 = banca
): GameState {
  const hand = getHand(state, side);
  const activePokemon = getActivePokemon(state, side);
  const bench = getBench(state, side);

  // Encontrar la carta de evolución
  const evolutionCard = hand.find((c) => c.id === evolutionCardId);
  if (!evolutionCard || !isPokemonCard(evolutionCard)) return state;

  // Verificar targets válidos
  const isPlayerTurn = side === "player";
  const validTargets = findValidEvolutionTargets(
    evolutionCard,
    activePokemon,
    bench,
    state.turnNumber,
    state.startingPlayer,
    isPlayerTurn
  );

  if (!validTargets.includes(targetIndex)) return state;

  let targetPokemon: PokemonInPlay | null = null;
  if (targetIndex === -1) {
    targetPokemon = activePokemon;
  } else {
    targetPokemon = bench[targetIndex];
  }

  if (!targetPokemon) return state;

  const sideName = side === "player" ? "" : "del rival ";
  const newEvent = createGameEvent(
    `${targetPokemon.pokemon.name} ${sideName}evolucionó a ${evolutionCard.name}`,
    "action"
  );

  // Construir cadena de evoluciones
  const previousEvolutions = [
    ...(targetPokemon.previousEvolutions || []),
    targetPokemon.pokemon,
  ];

  const evolvedPokemon: PokemonInPlay = {
    ...targetPokemon,
    pokemon: evolutionCard,
    previousEvolutions,
    statusConditions: [], // Evolucionar limpia estados
    paralyzedOnTurn: undefined,
    protection: undefined,
    playedOnTurn: state.turnNumber, // Evolution always uses current turn (not SETUP-adjusted)
  };

  const newHand = hand.filter((c) => c.id !== evolutionCardId);

  if (side === "player") {
    if (targetIndex === -1) {
      return {
        ...state,
        playerHand: newHand,
        playerActivePokemon: evolvedPokemon,
        events: [...state.events, newEvent],
      };
    } else {
      const newBench = [...bench];
      newBench[targetIndex] = evolvedPokemon;
      return {
        ...state,
        playerHand: newHand,
        playerBench: newBench,
        events: [...state.events, newEvent],
      };
    }
  } else {
    if (targetIndex === -1) {
      return {
        ...state,
        opponentHand: newHand,
        opponentActivePokemon: evolvedPokemon,
        events: [...state.events, newEvent],
      };
    } else {
      const newBench = [...bench];
      newBench[targetIndex] = evolvedPokemon;
      return {
        ...state,
        opponentHand: newHand,
        opponentBench: newBench,
        events: [...state.events, newEvent],
      };
    }
  }
}

/**
 * Obtener los básicos en la mano
 */
export function getBasicPokemonInHand(state: GameState, side: Side): GameCard[] {
  const hand = getHand(state, side);
  return hand.filter((c) => isPokemonCard(c) && c.stage === PokemonStage.Basic);
}

/**
 * Obtener las energías en la mano
 */
export function getEnergiesInHand(state: GameState, side: Side): GameCard[] {
  const hand = getHand(state, side);
  return hand.filter((c) => isEnergyCard(c));
}

/**
 * Obtener evoluciones jugables en la mano
 */
export function getPlayableEvolutions(
  state: GameState,
  side: Side
): Array<{ card: GameCard; targets: number[] }> {
  const hand = getHand(state, side);
  const activePokemon = getActivePokemon(state, side);
  const bench = getBench(state, side);

  const evolutions: Array<{ card: GameCard; targets: number[] }> = [];

  for (const card of hand) {
    if (!isPokemonCard(card)) continue;
    if (card.stage !== PokemonStage.Stage1 && card.stage !== PokemonStage.Stage2) continue;

    const isPlayerTurnForEvolution = side === "player";
    const targets = findValidEvolutionTargets(
      card,
      activePokemon,
      bench,
      state.turnNumber,
      state.startingPlayer,
      isPlayerTurnForEvolution
    );

    if (targets.length > 0) {
      evolutions.push({ card, targets });
    }
  }

  return evolutions;
}

/**
 * Obtener el primer slot vacío en la banca
 */
export function getFirstEmptyBenchSlot(state: GameState, side: Side): number {
  const bench = getBench(state, side);
  for (let i = 0; i < 5; i++) {
    if (!bench[i]) return i;
  }
  return -1; // Banca llena
}

/**
 * Verificar si un ataque puede noquear al defensor
 */
export function canKnockOut(
  state: GameState,
  side: Side,
  attackIndex: number
): boolean {
  const attacker = getActivePokemon(state, side);
  const defender = getActivePokemon(state, side === "player" ? "opponent" : "player");

  if (!attacker || !defender) return false;
  if (!isPokemonCard(attacker.pokemon) || !isPokemonCard(defender.pokemon)) return false;

  const attack = attacker.pokemon.attacks[attackIndex];
  if (!attack) return false;

  // Calcular daño base
  let damage = 0;
  if (typeof attack.damage === "number") {
    damage = attack.damage;
  } else if (typeof attack.damage === "string") {
    const numMatch = attack.damage.match(/(\d+)/);
    damage = numMatch ? parseInt(numMatch[1], 10) : 0;
  }

  // Aplicar debilidad
  const hasWeakness = defender.pokemon.weaknesses?.includes(attacker.pokemon.types[0]) ?? false;
  if (hasWeakness) {
    damage *= 2;
  }

  // Aplicar resistencia
  const hasResistance = defender.pokemon.resistances?.includes(attacker.pokemon.types[0]) ?? false;
  if (hasResistance) {
    damage = Math.max(0, damage - 30);
  }

  const defenderRemainingHP = defender.pokemon.hp - (defender.currentDamage || 0);
  return damage >= defenderRemainingHP;
}

/**
 * Calcular daño estimado de un ataque
 */
export function estimateAttackDamage(
  state: GameState,
  side: Side,
  attackIndex: number
): number {
  const attacker = getActivePokemon(state, side);
  const defender = getActivePokemon(state, side === "player" ? "opponent" : "player");

  if (!attacker || !defender) return 0;
  if (!isPokemonCard(attacker.pokemon) || !isPokemonCard(defender.pokemon)) return 0;

  const attack = attacker.pokemon.attacks[attackIndex];
  if (!attack) return 0;

  let damage = 0;
  if (typeof attack.damage === "number") {
    damage = attack.damage;
  } else if (typeof attack.damage === "string") {
    const numMatch = attack.damage.match(/(\d+)/);
    damage = numMatch ? parseInt(numMatch[1], 10) : 0;
  }

  // Debilidad/resistencia
  const hasWeakness = defender.pokemon.weaknesses?.includes(attacker.pokemon.types[0]) ?? false;
  if (hasWeakness) damage *= 2;

  const hasResistance = defender.pokemon.resistances?.includes(attacker.pokemon.types[0]) ?? false;
  if (hasResistance) damage = Math.max(0, damage - 30);

  return damage;
}

/**
 * Obtener todos los ataques usables del Pokemon activo
 */
export function getUsableAttacks(
  state: GameState,
  side: Side
): Array<{ index: number; damage: number; knocksOut: boolean }> {
  const activePokemon = getActivePokemon(state, side);
  if (!activePokemon || !isPokemonCard(activePokemon.pokemon)) return [];

  const usableAttacks: Array<{ index: number; damage: number; knocksOut: boolean }> = [];

  for (let i = 0; i < activePokemon.pokemon.attacks.length; i++) {
    if (canUseAttack(activePokemon, i)) {
      const damage = estimateAttackDamage(state, side, i);
      const knocksOut = canKnockOut(state, side, i);
      usableAttacks.push({ index: i, damage, knocksOut });
    }
  }

  return usableAttacks;
}

/**
 * Determinar la mejor energía para adjuntar a un Pokemon
 */
export function getBestEnergyTarget(
  state: GameState,
  side: Side
): { pokemonId: string; isBench: boolean; benchIndex?: number } | null {
  const activePokemon = getActivePokemon(state, side);
  const bench = getBench(state, side);
  const energies = getEnergiesInHand(state, side);

  if (energies.length === 0) return null;

  // Prioridad 1: Pokemon activo que le falta energía para atacar
  if (activePokemon && isPokemonCard(activePokemon.pokemon)) {
    const attacks = activePokemon.pokemon.attacks;
    for (const attack of attacks) {
      if (!canUseAttack(activePokemon, attacks.indexOf(attack))) {
        // Le falta energía, priorizar el activo
        return { pokemonId: activePokemon.pokemon.id, isBench: false };
      }
    }
  }

  // Prioridad 2: Pokemon en banca que le falta energía
  for (let i = 0; i < bench.length; i++) {
    const benchPokemon = bench[i];
    if (benchPokemon && isPokemonCard(benchPokemon.pokemon)) {
      // Si tiene ataques y no puede usarlos, darle energía
      const attacks = benchPokemon.pokemon.attacks;
      for (const attack of attacks) {
        if (!canUseAttack(benchPokemon, attacks.indexOf(attack))) {
          return { pokemonId: benchPokemon.pokemon.id, isBench: true, benchIndex: i };
        }
      }
    }
  }

  // Prioridad 3: Si el activo puede atacar, igual darle más energía (para ataques futuros)
  if (activePokemon) {
    return { pokemonId: activePokemon.pokemon.id, isBench: false };
  }

  return null;
}
