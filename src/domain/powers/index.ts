/**
 * Pokemon Powers domain
 * Pure functions for using Pokemon Powers
 *
 * Rules:
 * - Powers can be used before attacking (attacking ends the turn)
 * - Multiple different powers can be used in the same turn
 * - ALL status conditions block power usage (Paralyzed, Asleep, Confused, Poisoned)
 * - Powers work from bench unless they specify "while Active"
 * - If you have 2 Pokemon with the same power, each can use it
 * - Powers can be used the same turn you evolve
 */

import type { GameState, PokemonInPlay, GameCard } from "@/domain/match/types";
import type { PokemonPower, EnergyType, PokemonCard } from "@/domain/cards/types";
import { PokemonPowerType } from "@/domain/constants";
import { createGameEvent } from "@/lib/gameState";
import { isPokemonCard, isEnergyCard } from "@/domain/cards";

export * from "./types";

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Check if a Pokemon has any status condition that blocks powers
 */
export function hasBlockingStatus(pokemon: PokemonInPlay): boolean {
  const statuses = pokemon.statusConditions ?? [];
  return statuses.length > 0;
}

/**
 * Check if a Pokemon can use its power
 * @param pokemon - The Pokemon trying to use the power
 * @param isActive - Whether the Pokemon is the active Pokemon
 * @param usedPowersThisTurn - Set of Pokemon IDs that have already used their power this turn
 * @returns Error message if cannot use, null if can use
 */
export function canUsePower(
  pokemon: PokemonInPlay,
  isActive: boolean,
  usedPowersThisTurn?: string[]
): string | null {
  // Must have a power
  if (!isPokemonCard(pokemon.pokemon) || !pokemon.pokemon.power) {
    return "Este Pokémon no tiene un Poder Pokémon";
  }

  const power = pokemon.pokemon.power;

  // Check status conditions
  if (hasBlockingStatus(pokemon)) {
    return `${pokemon.pokemon.name} tiene un estado alterado y no puede usar su poder`;
  }

  // Check if power requires being active
  if (!power.worksFromBench && !isActive) {
    return `${power.name} solo puede usarse mientras ${pokemon.pokemon.name} esté activo`;
  }

  // Check if power was already used this turn (once-per-turn powers like HealFlip)
  if (usedPowersThisTurn && usedPowersThisTurn.includes(pokemon.pokemon.id)) {
    return `${power.name} ya fue usado este turno`;
  }

  return null;
}

/**
 * Check if a power of type unlimitedEnergyAttach can attach to a specific Pokemon
 */
export function canAttachWithPower(
  power: PokemonPower,
  targetPokemon: PokemonInPlay,
  energyCard: GameCard
): string | null {
  if (power.type !== PokemonPowerType.UnlimitedEnergyAttach) {
    return "Este poder no permite adjuntar energía";
  }

  // Check energy type matches
  if (!isEnergyCard(energyCard)) {
    return "La carta seleccionada no es una energía";
  }

  if (power.energyType && energyCard.energyType !== power.energyType) {
    return `Solo puedes adjuntar energía ${power.energyType} con ${power.name}`;
  }

  // Check target Pokemon type
  if (power.targetPokemonTypes && isPokemonCard(targetPokemon.pokemon)) {
    const pokemonTypes = targetPokemon.pokemon.types;
    const hasMatchingType = pokemonTypes.some(t =>
      power.targetPokemonTypes!.includes(t)
    );
    if (!hasMatchingType) {
      return `${power.name} solo puede adjuntar energía a Pokémon de tipo ${power.targetPokemonTypes.join("/")}`;
    }
  }

  return null;
}

// ============================================================================
// RAIN DANCE (Blastoise) - Unlimited Water Energy Attachment
// ============================================================================

/**
 * Check if Rain Dance can be used
 */
export function canUseRainDance(
  state: GameState,
  side: "player" | "opponent"
): { canUse: boolean; errorMessage?: string; pokemonWithPower: PokemonInPlay[] } {
  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  // Find all Pokemon with Rain Dance power
  const pokemonWithPower: PokemonInPlay[] = [];

  // Check active
  if (activePokemon && isPokemonCard(activePokemon.pokemon) &&
      activePokemon.pokemon.power?.type === PokemonPowerType.UnlimitedEnergyAttach) {
    const error = canUsePower(activePokemon, true);
    if (!error) {
      pokemonWithPower.push(activePokemon);
    }
  }

  // Check bench
  for (const benchPokemon of bench) {
    if (benchPokemon && isPokemonCard(benchPokemon.pokemon) &&
        benchPokemon.pokemon.power?.type === PokemonPowerType.UnlimitedEnergyAttach &&
        benchPokemon.pokemon.power.worksFromBench) {
      const error = canUsePower(benchPokemon, false);
      if (!error) {
        pokemonWithPower.push(benchPokemon);
      }
    }
  }

  if (pokemonWithPower.length === 0) {
    return {
      canUse: false,
      errorMessage: "No tienes Pokémon con Rain Dance disponible",
      pokemonWithPower: []
    };
  }

  return { canUse: true, pokemonWithPower };
}

/**
 * Attach energy using Rain Dance power (bypasses one-energy-per-turn limit)
 */
export function attachEnergyWithRainDance(
  state: GameState,
  side: "player" | "opponent",
  energyCardId: string,
  targetPokemonId: string
): GameState {
  const hand = side === "player" ? state.playerHand : state.opponentHand;
  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  // Check if Rain Dance can be used
  const { canUse, pokemonWithPower, errorMessage } = canUseRainDance(state, side);
  if (!canUse) {
    return {
      ...state,
      events: [...state.events, createGameEvent(errorMessage!, "info")],
    };
  }

  // Get the power definition from the first Pokemon with the power
  const powerPokemon = pokemonWithPower[0];
  const power = isPokemonCard(powerPokemon.pokemon) ? powerPokemon.pokemon.power : null;
  if (!power) return state;

  // Find energy card in hand
  const energyCard = hand.find(c => c.id === energyCardId);
  if (!energyCard || !isEnergyCard(energyCard)) {
    return {
      ...state,
      events: [...state.events, createGameEvent("No se encontró la carta de energía", "info")],
    };
  }

  // Find target Pokemon
  let targetPokemon: PokemonInPlay | null = null;
  let targetIsActive = false;
  let targetBenchIndex = -1;

  if (activePokemon?.pokemon.id === targetPokemonId) {
    targetPokemon = activePokemon;
    targetIsActive = true;
  } else {
    targetBenchIndex = bench.findIndex(p => p?.pokemon.id === targetPokemonId);
    if (targetBenchIndex !== -1) {
      targetPokemon = bench[targetBenchIndex];
    }
  }

  if (!targetPokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent("No se encontró el Pokémon objetivo", "info")],
    };
  }

  // Validate attachment
  const attachError = canAttachWithPower(power, targetPokemon, energyCard);
  if (attachError) {
    return {
      ...state,
      events: [...state.events, createGameEvent(attachError, "info")],
    };
  }

  // Perform attachment
  const newHand = hand.filter(c => c.id !== energyCardId);
  const updatedPokemon: PokemonInPlay = {
    ...targetPokemon,
    attachedEnergy: [...targetPokemon.attachedEnergy, energyCard],
  };

  const sideName = side === "player" ? "" : "Rival usó ";
  const newEvent = createGameEvent(
    `${sideName}${power.name}: adjuntó energía Water a ${targetPokemon.pokemon.name}`,
    "action"
  );

  if (side === "player") {
    let newState = {
      ...state,
      playerHand: newHand,
      events: [...state.events, newEvent],
    };

    if (targetIsActive) {
      newState.playerActivePokemon = updatedPokemon;
    } else {
      const newBench = [...bench];
      newBench[targetBenchIndex] = updatedPokemon;
      newState.playerBench = newBench;
    }

    return newState;
  } else {
    let newState = {
      ...state,
      opponentHand: newHand,
      events: [...state.events, newEvent],
    };

    if (targetIsActive) {
      newState.opponentActivePokemon = updatedPokemon;
    } else {
      const newBench = [...bench];
      newBench[targetBenchIndex] = updatedPokemon;
      newState.opponentBench = newBench;
    }

    return newState;
  }
}

// ============================================================================
// ENERGY TRANS (Venusaur) - Move Grass Energy
// ============================================================================

/**
 * Check if Energy Trans can be used
 */
export function canUseEnergyTrans(
  state: GameState,
  side: "player" | "opponent"
): { canUse: boolean; errorMessage?: string; pokemonWithPower: PokemonInPlay[] } {
  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  const pokemonWithPower: PokemonInPlay[] = [];

  // Check active
  if (activePokemon && isPokemonCard(activePokemon.pokemon) &&
      activePokemon.pokemon.power?.type === PokemonPowerType.MoveEnergy) {
    const error = canUsePower(activePokemon, true);
    if (!error) {
      pokemonWithPower.push(activePokemon);
    }
  }

  // Check bench
  for (const benchPokemon of bench) {
    if (benchPokemon && isPokemonCard(benchPokemon.pokemon) &&
        benchPokemon.pokemon.power?.type === PokemonPowerType.MoveEnergy &&
        benchPokemon.pokemon.power.worksFromBench) {
      const error = canUsePower(benchPokemon, false);
      if (!error) {
        pokemonWithPower.push(benchPokemon);
      }
    }
  }

  if (pokemonWithPower.length === 0) {
    return {
      canUse: false,
      errorMessage: "No tienes Pokémon con Energy Trans disponible",
      pokemonWithPower: []
    };
  }

  return { canUse: true, pokemonWithPower };
}

/**
 * Move energy using Energy Trans power
 */
export function moveEnergyWithEnergyTrans(
  state: GameState,
  side: "player" | "opponent",
  sourcePokemonId: string,
  targetPokemonId: string,
  energyCardId: string
): GameState {
  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  // Check if Energy Trans can be used
  const { canUse, pokemonWithPower, errorMessage } = canUseEnergyTrans(state, side);
  if (!canUse) {
    return {
      ...state,
      events: [...state.events, createGameEvent(errorMessage!, "info")],
    };
  }

  const powerPokemon = pokemonWithPower[0];
  const power = isPokemonCard(powerPokemon.pokemon) ? powerPokemon.pokemon.power : null;
  if (!power) return state;

  // Find source Pokemon and energy
  let sourcePokemon: PokemonInPlay | null = null;
  let sourceIsActive = false;
  let sourceBenchIndex = -1;

  if (activePokemon?.pokemon.id === sourcePokemonId) {
    sourcePokemon = activePokemon;
    sourceIsActive = true;
  } else {
    sourceBenchIndex = bench.findIndex(p => p?.pokemon.id === sourcePokemonId);
    if (sourceBenchIndex !== -1) {
      sourcePokemon = bench[sourceBenchIndex];
    }
  }

  if (!sourcePokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent("No se encontró el Pokémon origen", "info")],
    };
  }

  // Find the energy card
  const energyCard = sourcePokemon.attachedEnergy.find(e => e.id === energyCardId);
  if (!energyCard || !isEnergyCard(energyCard)) {
    return {
      ...state,
      events: [...state.events, createGameEvent("No se encontró la energía a mover", "info")],
    };
  }

  // Check energy type matches power requirement
  if (power.energyType && energyCard.energyType !== power.energyType) {
    return {
      ...state,
      events: [...state.events, createGameEvent(
        `${power.name} solo puede mover energía ${power.energyType}`,
        "info"
      )],
    };
  }

  // Find target Pokemon
  let targetPokemon: PokemonInPlay | null = null;
  let targetIsActive = false;
  let targetBenchIndex = -1;

  if (activePokemon?.pokemon.id === targetPokemonId) {
    targetPokemon = activePokemon;
    targetIsActive = true;
  } else {
    targetBenchIndex = bench.findIndex(p => p?.pokemon.id === targetPokemonId);
    if (targetBenchIndex !== -1) {
      targetPokemon = bench[targetBenchIndex];
    }
  }

  if (!targetPokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent("No se encontró el Pokémon destino", "info")],
    };
  }

  if (sourcePokemonId === targetPokemonId) {
    return {
      ...state,
      events: [...state.events, createGameEvent("Debes seleccionar un Pokémon diferente", "info")],
    };
  }

  // Move the energy
  const updatedSource: PokemonInPlay = {
    ...sourcePokemon,
    attachedEnergy: sourcePokemon.attachedEnergy.filter(e => e.id !== energyCardId),
  };

  const updatedTarget: PokemonInPlay = {
    ...targetPokemon,
    attachedEnergy: [...targetPokemon.attachedEnergy, energyCard],
  };

  const sideName = side === "player" ? "" : "Rival usó ";
  const newEvent = createGameEvent(
    `${sideName}${power.name}: movió energía Grass de ${sourcePokemon.pokemon.name} a ${targetPokemon.pokemon.name}`,
    "action"
  );

  // Build new state
  let newActivePokemon = activePokemon;
  let newBench = [...bench];

  // Update source
  if (sourceIsActive) {
    newActivePokemon = updatedSource;
  } else {
    newBench[sourceBenchIndex] = updatedSource;
  }

  // Update target
  if (targetIsActive) {
    newActivePokemon = updatedTarget;
  } else {
    newBench[targetBenchIndex] = updatedTarget;
  }

  if (side === "player") {
    return {
      ...state,
      playerActivePokemon: newActivePokemon,
      playerBench: newBench,
      events: [...state.events, newEvent],
    };
  } else {
    return {
      ...state,
      opponentActivePokemon: newActivePokemon,
      opponentBench: newBench,
      events: [...state.events, newEvent],
    };
  }
}

// ============================================================================
// DAMAGE SWAP (Alakazam) - Move Damage Counters
// ============================================================================

/**
 * Check if Damage Swap can be used
 */
export function canUseDamageSwap(
  state: GameState,
  side: "player" | "opponent"
): { canUse: boolean; errorMessage?: string; pokemonWithPower: PokemonInPlay[] } {
  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  const pokemonWithPower: PokemonInPlay[] = [];

  // Check active
  if (activePokemon && isPokemonCard(activePokemon.pokemon) &&
      activePokemon.pokemon.power?.type === PokemonPowerType.MoveDamage) {
    const error = canUsePower(activePokemon, true);
    if (!error) {
      pokemonWithPower.push(activePokemon);
    }
  }

  // Check bench
  for (const benchPokemon of bench) {
    if (benchPokemon && isPokemonCard(benchPokemon.pokemon) &&
        benchPokemon.pokemon.power?.type === PokemonPowerType.MoveDamage &&
        benchPokemon.pokemon.power.worksFromBench) {
      const error = canUsePower(benchPokemon, false);
      if (!error) {
        pokemonWithPower.push(benchPokemon);
      }
    }
  }

  if (pokemonWithPower.length === 0) {
    return {
      canUse: false,
      errorMessage: "No tienes Pokémon con Damage Swap disponible",
      pokemonWithPower: []
    };
  }

  return { canUse: true, pokemonWithPower };
}

/**
 * Move damage counters using Damage Swap power
 */
export function moveDamageWithDamageSwap(
  state: GameState,
  side: "player" | "opponent",
  sourcePokemonId: string,
  targetPokemonId: string,
  amount: number
): GameState {
  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  // Check if Damage Swap can be used
  const { canUse, pokemonWithPower, errorMessage } = canUseDamageSwap(state, side);
  if (!canUse) {
    return {
      ...state,
      events: [...state.events, createGameEvent(errorMessage!, "info")],
    };
  }

  const powerPokemon = pokemonWithPower[0];
  const power = isPokemonCard(powerPokemon.pokemon) ? powerPokemon.pokemon.power : null;
  if (!power) return state;

  // Validate amount (must be multiple of 10)
  if (amount <= 0 || amount % 10 !== 0) {
    return {
      ...state,
      events: [...state.events, createGameEvent("La cantidad debe ser múltiplo de 10", "info")],
    };
  }

  // Find source Pokemon
  let sourcePokemon: PokemonInPlay | null = null;
  let sourceIsActive = false;
  let sourceBenchIndex = -1;

  if (activePokemon?.pokemon.id === sourcePokemonId) {
    sourcePokemon = activePokemon;
    sourceIsActive = true;
  } else {
    sourceBenchIndex = bench.findIndex(p => p?.pokemon.id === sourcePokemonId);
    if (sourceBenchIndex !== -1) {
      sourcePokemon = bench[sourceBenchIndex];
    }
  }

  if (!sourcePokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent("No se encontró el Pokémon origen", "info")],
    };
  }

  // Check source has enough damage
  const sourceDamage = sourcePokemon.currentDamage ?? 0;
  if (sourceDamage < amount) {
    return {
      ...state,
      events: [...state.events, createGameEvent(
        `${sourcePokemon.pokemon.name} no tiene suficiente daño para mover`,
        "info"
      )],
    };
  }

  // Find target Pokemon
  let targetPokemon: PokemonInPlay | null = null;
  let targetIsActive = false;
  let targetBenchIndex = -1;

  if (activePokemon?.pokemon.id === targetPokemonId) {
    targetPokemon = activePokemon;
    targetIsActive = true;
  } else {
    targetBenchIndex = bench.findIndex(p => p?.pokemon.id === targetPokemonId);
    if (targetBenchIndex !== -1) {
      targetPokemon = bench[targetBenchIndex];
    }
  }

  if (!targetPokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent("No se encontró el Pokémon destino", "info")],
    };
  }

  if (sourcePokemonId === targetPokemonId) {
    return {
      ...state,
      events: [...state.events, createGameEvent("Debes seleccionar un Pokémon diferente", "info")],
    };
  }

  // Check target won't be KO'd (damage cannot exceed HP - 10)
  if (!isPokemonCard(targetPokemon.pokemon)) {
    return state;
  }

  const targetCurrentDamage = targetPokemon.currentDamage ?? 0;
  const targetHP = targetPokemon.pokemon.hp;
  const newTargetDamage = targetCurrentDamage + amount;

  if (newTargetDamage >= targetHP) {
    return {
      ...state,
      events: [...state.events, createGameEvent(
        `No puedes mover daño que noquearía a ${targetPokemon.pokemon.name}`,
        "info"
      )],
    };
  }

  // Move the damage
  const updatedSource: PokemonInPlay = {
    ...sourcePokemon,
    currentDamage: sourceDamage - amount,
  };

  const updatedTarget: PokemonInPlay = {
    ...targetPokemon,
    currentDamage: newTargetDamage,
  };

  const sideName = side === "player" ? "" : "Rival usó ";
  const newEvent = createGameEvent(
    `${sideName}${power.name}: movió ${amount} de daño de ${sourcePokemon.pokemon.name} a ${targetPokemon.pokemon.name}`,
    "action"
  );

  // Build new state
  let newActivePokemon = activePokemon;
  let newBench = [...bench];

  // Update source
  if (sourceIsActive) {
    newActivePokemon = updatedSource;
  } else {
    newBench[sourceBenchIndex] = updatedSource;
  }

  // Update target
  if (targetIsActive) {
    newActivePokemon = updatedTarget;
  } else {
    newBench[targetBenchIndex] = updatedTarget;
  }

  if (side === "player") {
    return {
      ...state,
      playerActivePokemon: newActivePokemon,
      playerBench: newBench,
      events: [...state.events, newEvent],
    };
  } else {
    return {
      ...state,
      opponentActivePokemon: newActivePokemon,
      opponentBench: newBench,
      events: [...state.events, newEvent],
    };
  }
}

// ============================================================================
// STATUS IMMUNITY (Snorlax) - Thick Skinned
// ============================================================================

/**
 * Check if a Pokemon has StatusImmunity power active.
 * Unlike other powers, StatusImmunity is NOT blocked by status conditions
 * (since it prevents status from being applied in the first place).
 */
export function hasStatusImmunity(pokemon: PokemonInPlay): boolean {
  if (!isPokemonCard(pokemon.pokemon)) return false;
  const power = pokemon.pokemon.power;
  return !!power && power.type === PokemonPowerType.StatusImmunity;
}

// ============================================================================
// DAMAGE BARRIER (Mr. Mime) - Invisible Wall
// ============================================================================

/**
 * Check if a Pokemon has DamageBarrier power that blocks the given damage.
 * Blocks attack damage of 30 or more. Only works while active.
 * Blocked by status conditions.
 */
export function isDamageBlocked(pokemon: PokemonInPlay, damage: number): boolean {
  if (!isPokemonCard(pokemon.pokemon)) return false;
  const power = pokemon.pokemon.power;
  if (!power || power.type !== PokemonPowerType.DamageBarrier) return false;
  if (hasBlockingStatus(pokemon)) return false;
  return damage >= 30;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get all Pokemon with usable powers for a side
 */
export function getPokemonWithUsablePowers(
  state: GameState,
  side: "player" | "opponent"
): PokemonInPlay[] {
  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  const result: PokemonInPlay[] = [];

  if (activePokemon && isPokemonCard(activePokemon.pokemon) && activePokemon.pokemon.power) {
    const error = canUsePower(activePokemon, true, state.usedPowersThisTurn);
    if (!error) {
      result.push(activePokemon);
    }
  }

  for (const benchPokemon of bench) {
    if (benchPokemon && isPokemonCard(benchPokemon.pokemon) && benchPokemon.pokemon.power) {
      if (benchPokemon.pokemon.power.worksFromBench) {
        const error = canUsePower(benchPokemon, false, state.usedPowersThisTurn);
        if (!error) {
          result.push(benchPokemon);
        }
      }
    }
  }

  return result;
}

/**
 * Check if player has any Pokemon with the Rain Dance power available
 */
export function hasRainDanceAvailable(state: GameState, side: "player" | "opponent"): boolean {
  const { canUse } = canUseRainDance(state, side);
  return canUse;
}

// ============================================================================
// STRIKES BACK (Machamp) - Damage Reaction
// ============================================================================

/**
 * Check if a Pokemon has a damage reaction power (like Strikes Back)
 */
export function hasDamageReactionPower(pokemon: PokemonInPlay): boolean {
  if (!isPokemonCard(pokemon.pokemon)) return false;
  const power = pokemon.pokemon.power;
  return power?.type === PokemonPowerType.DamageReaction && (power.reactionDamage ?? 0) > 0;
}

/**
 * Apply damage reaction (Strikes Back) after a Pokemon takes damage
 * Returns the damage to apply to the attacker, or 0 if no reaction
 */
export function getDamageReaction(
  damagedPokemon: PokemonInPlay,
  isActive: boolean
): { reactionDamage: number; powerName: string } | null {
  if (!isPokemonCard(damagedPokemon.pokemon)) return null;

  const power = damagedPokemon.pokemon.power;
  if (!power || power.type !== PokemonPowerType.DamageReaction) return null;

  // Check if power works from current position
  if (!isActive && !power.worksFromBench) return null;

  // Check if blocked by status
  if (hasBlockingStatus(damagedPokemon)) return null;

  const reactionDamage = power.reactionDamage ?? 0;
  if (reactionDamage <= 0) return null;

  return { reactionDamage, powerName: power.name };
}

// ============================================================================
// ENERGY BURN (Charizard) - Energy Conversion
// ============================================================================

/**
 * Check if Energy Burn can be activated
 */
export function canUseEnergyBurn(
  state: GameState,
  side: "player" | "opponent"
): { canUse: boolean; errorMessage?: string; pokemon: PokemonInPlay | null } {
  const activePokemon = side === "player"
    ? state.playerActivePokemon
    : state.opponentActivePokemon;

  if (!activePokemon || !isPokemonCard(activePokemon.pokemon)) {
    return { canUse: false, errorMessage: "No hay Pokémon activo", pokemon: null };
  }

  const power = activePokemon.pokemon.power;
  if (!power || power.type !== PokemonPowerType.EnergyConversion) {
    return { canUse: false, errorMessage: "Este Pokémon no tiene Energy Burn", pokemon: null };
  }

  // Already active this turn?
  if (activePokemon.energyConversionType) {
    return { canUse: false, errorMessage: "Energy Burn ya está activo este turno", pokemon: null };
  }

  const error = canUsePower(activePokemon, true);
  if (error) {
    return { canUse: false, errorMessage: error, pokemon: null };
  }

  return { canUse: true, pokemon: activePokemon };
}

/**
 * Activate Energy Burn - converts all attached energy to the power's energyType
 */
export function activateEnergyBurn(
  state: GameState,
  side: "player" | "opponent"
): GameState {
  const { canUse, errorMessage, pokemon } = canUseEnergyBurn(state, side);

  if (!canUse || !pokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent(errorMessage!, "info")],
    };
  }

  const power = (pokemon.pokemon as PokemonCard).power!;
  const targetType = power.energyType;

  if (!targetType) {
    return {
      ...state,
      events: [...state.events, createGameEvent("Energy Burn no tiene tipo de energía configurado", "info")],
    };
  }

  const updatedPokemon: PokemonInPlay = {
    ...pokemon,
    energyConversionType: targetType,
  };

  const event = createGameEvent(
    `${power.name}: Las energías de ${pokemon.pokemon.name} ahora cuentan como ${targetType}`,
    "action"
  );

  if (side === "player") {
    return {
      ...state,
      playerActivePokemon: updatedPokemon,
      events: [...state.events, event],
    };
  } else {
    return {
      ...state,
      opponentActivePokemon: updatedPokemon,
      events: [...state.events, event],
    };
  }
}

// ============================================================================
// BUZZAP (Electrode) - Self Sacrifice
// ============================================================================

/**
 * Check if Buzzap can be used
 */
export function canUseBuzzap(
  state: GameState,
  side: "player" | "opponent",
  electrodePokemonId: string
): { canUse: boolean; errorMessage?: string; pokemon: PokemonInPlay | null; validTargets: PokemonInPlay[] } {
  const activePokemon = side === "player"
    ? state.playerActivePokemon
    : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  // Find the Pokemon
  let pokemon: PokemonInPlay | null = null;
  let isActive = false;

  if (activePokemon?.pokemon.id === electrodePokemonId) {
    pokemon = activePokemon;
    isActive = true;
  } else {
    const found = bench.find(p => p?.pokemon.id === electrodePokemonId);
    if (found) pokemon = found;
  }

  if (!pokemon || !isPokemonCard(pokemon.pokemon)) {
    return { canUse: false, errorMessage: "Pokémon no encontrado", pokemon: null, validTargets: [] };
  }

  const power = pokemon.pokemon.power;
  if (!power || power.type !== PokemonPowerType.SelfSacrifice) {
    return { canUse: false, errorMessage: "Este Pokémon no tiene Buzzap", pokemon: null, validTargets: [] };
  }

  const error = canUsePower(pokemon, isActive);
  if (error) {
    return { canUse: false, errorMessage: error, pokemon: null, validTargets: [] };
  }

  // Find valid targets (all other Pokemon on our side)
  const validTargets: PokemonInPlay[] = [];

  if (activePokemon && activePokemon.pokemon.id !== electrodePokemonId) {
    validTargets.push(activePokemon);
  }

  for (const benchPokemon of bench) {
    if (benchPokemon && benchPokemon.pokemon.id !== electrodePokemonId) {
      validTargets.push(benchPokemon);
    }
  }

  if (validTargets.length === 0) {
    return {
      canUse: false,
      errorMessage: "No hay otro Pokémon para adjuntar la energía",
      pokemon: null,
      validTargets: []
    };
  }

  return { canUse: true, pokemon, validTargets };
}

// ============================================================================
// RETREAT REDUCTION (Dodrio) - Retreat Aid
// ============================================================================

/**
 * Calculate total retreat cost reduction from benched Pokemon with RetreatReduction power.
 * Each benched Pokemon with this power (and no status conditions) reduces retreat cost by 1.
 */
export function getRetreatCostReduction(bench: PokemonInPlay[]): number {
  let reduction = 0;
  for (const pokemon of bench) {
    if (!pokemon) continue;
    if (!isPokemonCard(pokemon.pokemon)) continue;
    const power = pokemon.pokemon.power;
    if (!power || power.type !== PokemonPowerType.RetreatReduction) continue;
    if (hasBlockingStatus(pokemon)) continue;
    reduction += 1;
  }
  return reduction;
}

/**
 * Execute Buzzap: KO Electrode, opponent takes prize, attach as energy to target
 */
export function executeBuzzap(
  state: GameState,
  side: "player" | "opponent",
  electrodePokemonId: string,
  chosenEnergyType: EnergyType,
  targetPokemonId: string
): GameState {
  const { canUse, errorMessage, pokemon, validTargets } = canUseBuzzap(state, side, electrodePokemonId);

  if (!canUse || !pokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent(errorMessage!, "info")],
    };
  }

  // Verify target is valid
  const targetPokemon = validTargets.find(p => p.pokemon.id === targetPokemonId);
  if (!targetPokemon) {
    return {
      ...state,
      events: [...state.events, createGameEvent("Pokémon destino no válido", "info")],
    };
  }

  const power = (pokemon.pokemon as PokemonCard).power!;
  const energyValue = power.becomesEnergyValue ?? 2;

  // Create the Buzzap energy card
  const buzzapEnergy: GameCard = {
    ...pokemon.pokemon,
    id: `buzzap-${pokemon.pokemon.id}-${Date.now()}`,
    buzzapSourceId: pokemon.pokemon.id,
    buzzapEnergyType: chosenEnergyType,
  };

  // Attach energy to target
  const updatedTarget: PokemonInPlay = {
    ...targetPokemon,
    attachedEnergy: [...targetPokemon.attachedEnergy, buzzapEnergy],
  };

  const activePokemon = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? [...state.playerBench] : [...state.opponentBench];
  const discard = side === "player" ? [...state.playerDiscard] : [...state.opponentDiscard];

  let newActivePokemon = activePokemon;
  let needsPromotion = false;
  const isElectrodeActive = activePokemon?.pokemon.id === electrodePokemonId;

  // Remove Electrode from play
  if (isElectrodeActive) {
    // Add attached energy and previous evolutions to discard
    if (pokemon.attachedEnergy.length > 0) {
      discard.push(...pokemon.attachedEnergy);
    }
    if (pokemon.previousEvolutions && pokemon.previousEvolutions.length > 0) {
      discard.push(...pokemon.previousEvolutions);
    }
    // Note: The main Pokemon card becomes energy, not discarded

    newActivePokemon = null;
    needsPromotion = true;
  } else {
    // Remove from bench
    const benchIndex = bench.findIndex(p => p?.pokemon.id === electrodePokemonId);
    if (benchIndex !== -1) {
      const benchPokemon = bench[benchIndex]!;
      if (benchPokemon.attachedEnergy.length > 0) {
        discard.push(...benchPokemon.attachedEnergy);
      }
      if (benchPokemon.previousEvolutions && benchPokemon.previousEvolutions.length > 0) {
        discard.push(...benchPokemon.previousEvolutions);
      }
      bench[benchIndex] = null as unknown as PokemonInPlay;
    }
  }

  // Update target Pokemon (could be active or bench)
  if (newActivePokemon?.pokemon.id === targetPokemonId) {
    newActivePokemon = updatedTarget;
  } else {
    const targetBenchIndex = bench.findIndex(p => p?.pokemon.id === targetPokemonId);
    if (targetBenchIndex !== -1) {
      bench[targetBenchIndex] = updatedTarget;
    }
  }

  const oppositeSide = side === "player" ? "opponent" : "player";
  const sideName = side === "player" ? "" : "Rival usó ";

  // Filter out null slots left by removing Electrode from bench
  const cleanBench = bench.filter((p): p is PokemonInPlay => p !== null);

  const events = [
    ...state.events,
    createGameEvent(
      `${sideName}Buzzap: ${pokemon.pokemon.name} se sacrificó y se convirtió en ${energyValue} energía ${chosenEnergyType}`,
      "action"
    ),
  ];

  if (side === "player") {
    return {
      ...state,
      playerActivePokemon: newActivePokemon,
      playerBench: cleanBench,
      playerDiscard: discard,
      playerNeedsToPromote: needsPromotion && cleanBench.length > 0,
      opponentCanTakePrize: true, // Opponent takes a prize for the KO
      events,
    };
  } else {
    return {
      ...state,
      opponentActivePokemon: newActivePokemon,
      opponentBench: cleanBench,
      opponentDiscard: discard,
      playerCanTakePrize: true, // Player takes a prize for the KO
      events,
    };
  }
}

// ============================================================================
// HEAL FLIP (Vileplume) - Heal
// ============================================================================

/**
 * Check if Heal power can be used.
 * Requires: Pokemon with HealFlip power, no blocking status, at least one Pokemon with damage.
 */
export function canUseHealFlip(
  state: GameState,
  side: "player" | "opponent" = "player"
): { canUse: boolean; errorMessage?: string; pokemonWithPower: PokemonInPlay[] } {
  const active = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;

  const pokemonWithPower: PokemonInPlay[] = [];

  const allPokemon = active ? [active, ...bench] : [...bench];
  for (const pokemon of allPokemon) {
    if (!isPokemonCard(pokemon.pokemon)) continue;
    const power = pokemon.pokemon.power;
    if (!power || power.type !== PokemonPowerType.HealFlip) continue;

    const isActive = pokemon === active;
    const error = canUsePower(pokemon, isActive);
    if (error) continue;

    pokemonWithPower.push(pokemon);
  }

  if (pokemonWithPower.length === 0) {
    return { canUse: false, errorMessage: "No hay Pokémon con el poder Curación disponible", pokemonWithPower: [] };
  }

  const hasDamagedPokemon = allPokemon.some(p => (p.currentDamage || 0) > 0);
  if (!hasDamagedPokemon) {
    return { canUse: false, errorMessage: "Ningún Pokémon tiene daño para curar", pokemonWithPower: [] };
  }

  return { canUse: true, pokemonWithPower };
}

/**
 * Execute Heal power: remove 1 damage counter (10 HP) from the target Pokemon.
 * Should only be called after a successful coin flip (heads).
 * @param targetPokemonId - The ID of the Pokemon to heal
 */
export function executeHealFlip(
  state: GameState,
  targetPokemonId: string,
  side: "player" | "opponent" = "player",
  sourcePokemonId?: string
): GameState {
  const active = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;
  const events = [...state.events];

  // Find the source Pokemon (Vileplume using the power)
  let sourceId = sourcePokemonId;
  if (!sourceId) {
    // If not provided, try to find a Vileplume with Heal power
    if (active && isPokemonCard(active.pokemon) && active.pokemon.power?.type === PokemonPowerType.HealFlip) {
      sourceId = active.pokemon.id;
    } else {
      for (const p of bench) {
        if (p && isPokemonCard(p.pokemon) && p.pokemon.power?.type === PokemonPowerType.HealFlip) {
          sourceId = p.pokemon.id;
          break;
        }
      }
    }
  }

  // Mark power as used
  const usedPowersThisTurn = [...(state.usedPowersThisTurn || [])];
  if (sourceId) {
    usedPowersThisTurn.push(sourceId);
  }

  // Try healing active Pokemon
  if (active && active.pokemon.id === targetPokemonId && (active.currentDamage || 0) > 0) {
    const healAmount = Math.min(10, active.currentDamage || 0);
    const newActive = {
      ...active,
      currentDamage: (active.currentDamage || 0) - healAmount,
    };
    events.push(
      createGameEvent(`Curación: ${active.pokemon.name} recuperó ${healAmount} HP`, "action")
    );
    return {
      ...state,
      ...(side === "player"
        ? { playerActivePokemon: newActive }
        : { opponentActivePokemon: newActive }),
      events,
      usedPowersThisTurn,
    };
  }

  // Try healing bench Pokemon
  const newBench = [...bench];
  for (let i = 0; i < newBench.length; i++) {
    const pokemon = newBench[i];
    if (pokemon && pokemon.pokemon.id === targetPokemonId && (pokemon.currentDamage || 0) > 0) {
      const healAmount = Math.min(10, pokemon.currentDamage || 0);
      newBench[i] = {
        ...pokemon,
        currentDamage: (pokemon.currentDamage || 0) - healAmount,
      };
      events.push(
        createGameEvent(`Curación: ${pokemon.pokemon.name} recuperó ${healAmount} HP`, "action")
      );
      return {
        ...state,
        ...(side === "player"
          ? { playerBench: newBench }
          : { opponentBench: newBench }),
        events,
        usedPowersThisTurn,
      };
    }
  }

  events.push(createGameEvent("No se pudo curar al Pokémon seleccionado", "info"));
  return { ...state, events, usedPowersThisTurn };
}

/**
 * Mark a Pokemon's power as used this turn (without executing any effect).
 * Used for powers that require coin flips where the power counts as used regardless of outcome.
 * @param pokemonId - The ID of the Pokemon whose power was used
 */
export function markPowerAsUsed(
  state: GameState,
  pokemonId: string
): GameState {
  const usedPowersThisTurn = [...(state.usedPowersThisTurn || [])];
  if (!usedPowersThisTurn.includes(pokemonId)) {
    usedPowersThisTurn.push(pokemonId);
  }
  return {
    ...state,
    usedPowersThisTurn,
  };
}
