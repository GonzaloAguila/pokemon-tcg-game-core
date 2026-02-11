/**
 * Trainers domain — Pure functions for playing Trainer cards
 * All Base Set trainers except Clefairy Doll (requires engine changes to act as Pokemon)
 */

import type { GameState, GameModifier, GameCard, PokemonInPlay } from "@/domain/match/types";
import {
  createGameEvent,
  drawCard,
  clearStatusConditionsOnRetreat,
  clearAllStatusConditions,
  shuffle,
} from "@/lib/gameState";
import { baseSetCards } from "@/domain/catalog";
import { isBasicEnergy, isPokemonCard } from "@/domain/cards";
import { GamePhase, CardKind, PokemonStage } from "@/domain/constants";

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Verifica si se puede jugar una carta trainer.
 * Condiciones: fase PLAYING, es turno del jugador, la carta está en la mano.
 */
export function canPlayTrainer(state: GameState, cardId: string): boolean {
  if (state.gamePhase !== GamePhase.Playing) return false;
  if (!state.isPlayerTurn) return false;

  const card = state.playerHand.find((c) => c.id === cardId);
  if (!card) return false;
  if (card.kind !== CardKind.Trainer) return false;

  return true;
}

// ============================================================================
// BILL (#91) — Draw 2 cards
// ============================================================================

export function playBill(state: GameState, cardId: string): GameState {
  if (!canPlayTrainer(state, cardId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;

  let newHand = state.playerHand.filter((c) => c.id !== cardId);
  const newDiscard = [...state.playerDiscard, card];
  let newDeck = [...state.playerDeck];
  const events = [
    ...state.events,
    createGameEvent(`Jugaste Bill`, "action"),
  ];

  let cardsDrawn = 0;
  for (let i = 0; i < 2; i++) {
    const result = drawCard(newDeck, newHand);
    if (result.success) {
      newDeck = result.newDeck;
      newHand = result.newHand;
      cardsDrawn++;
    } else {
      break;
    }
  }

  if (cardsDrawn > 0) {
    events.push(
      createGameEvent(`Robaste ${cardsDrawn} carta${cardsDrawn > 1 ? "s" : ""} con Bill`, "info")
    );
  }

  return {
    ...state,
    playerHand: newHand,
    playerDeck: newDeck,
    playerDiscard: newDiscard,
    events,
  };
}

// ============================================================================
// SWITCH (#95) — Swap active Pokemon with a bench Pokemon (no retreat cost)
// ============================================================================

export function canPlaySwitch(state: GameState, cardId: string): boolean {
  if (!canPlayTrainer(state, cardId)) return false;
  if (!state.playerActivePokemon) return false;
  if (state.playerBench.length === 0) return false;
  return true;
}

export function playSwitch(state: GameState, cardId: string, benchIndex: number): GameState {
  if (!canPlaySwitch(state, cardId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const activePokemon = state.playerActivePokemon!;
  const benchPokemon = state.playerBench[benchIndex];

  if (!benchPokemon) {
    return {
      ...state,
      events: [
        ...state.events,
        createGameEvent("No hay Pokémon en esa posición de la banca", "info"),
      ],
    };
  }

  const newHand = state.playerHand.filter((c) => c.id !== cardId);
  const newDiscard = [...state.playerDiscard, card];
  // Clear status, attack effects, and Conversion when going to bench
  const pokemonGoingToBench: PokemonInPlay = {
    ...clearStatusConditionsOnRetreat(activePokemon),
    modifiedWeakness: undefined,
    modifiedResistance: undefined,
  };

  const newBench = [...state.playerBench];
  newBench.splice(benchIndex, 1);
  newBench.push(pokemonGoingToBench);

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Switch`, "action"),
    createGameEvent(
      `${activePokemon.pokemon.name} fue a la banca, ${benchPokemon.pokemon.name} es ahora tu Pokémon activo`,
      "info"
    ),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDiscard: newDiscard,
    playerActivePokemon: benchPokemon,
    playerBench: newBench,
    events,
  };
}

// ============================================================================
// GUST OF WIND (#93) — Force opponent to swap active with bench
// ============================================================================

export function canPlayGustOfWind(state: GameState, cardId: string): boolean {
  if (!canPlayTrainer(state, cardId)) return false;
  if (!state.opponentActivePokemon) return false;
  if (state.opponentBench.length === 0) return false;
  return true;
}

export function playGustOfWind(
  state: GameState,
  cardId: string,
  opponentBenchIndex: number
): GameState {
  if (!canPlayGustOfWind(state, cardId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const opponentActive = state.opponentActivePokemon!;
  const opponentBenchPokemon = state.opponentBench[opponentBenchIndex];

  if (!opponentBenchPokemon) {
    return {
      ...state,
      events: [
        ...state.events,
        createGameEvent("No hay Pokémon rival en esa posición de la banca", "info"),
      ],
    };
  }

  const newHand = state.playerHand.filter((c) => c.id !== cardId);
  const newDiscard = [...state.playerDiscard, card];

  // Clear attack effects and status when forced to bench (per TCG rules: benching clears all attack effects)
  const clearedOpponentActive: PokemonInPlay = {
    ...clearStatusConditionsOnRetreat(opponentActive),
    modifiedWeakness: undefined,
    modifiedResistance: undefined,
  };

  const newOpponentBench = [...state.opponentBench];
  newOpponentBench.splice(opponentBenchIndex, 1);
  newOpponentBench.push(clearedOpponentActive);

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Gust of Wind`, "action"),
    createGameEvent(
      `${opponentBenchPokemon.pokemon.name} del rival fue forzado a salir como Pokémon activo`,
      "info"
    ),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDiscard: newDiscard,
    opponentActivePokemon: opponentBenchPokemon,
    opponentBench: newOpponentBench,
    events,
  };
}

// ============================================================================
// PLUSPOWER (#84) — +10 damage this turn
// ============================================================================

export function playPlusPower(state: GameState, cardId: string): GameState {
  if (!canPlayTrainer(state, cardId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const newHand = state.playerHand.filter((c) => c.id !== cardId);

  const modifier: GameModifier = {
    id: `mod-${Date.now()}-${Math.random()}`,
    source: "plusPower",
    card,
    amount: 10,
    expiresAfterTurn: state.turnNumber,
    playerId: "player",
  };

  const events = [
    ...state.events,
    createGameEvent(`Jugaste PlusPower (+10 daño este turno)`, "action"),
  ];

  return {
    ...state,
    playerHand: newHand,
    activeModifiers: [...state.activeModifiers, modifier],
    events,
  };
}

// ============================================================================
// DEFENDER (#80) — Reduce damage by 20 until end of opponent's next turn
// ============================================================================

export function canPlayDefender(state: GameState, cardId: string, targetPokemonId: string): boolean {
  if (!canPlayTrainer(state, cardId)) return false;
  if (state.playerActivePokemon?.pokemon.id === targetPokemonId) return true;
  if (state.playerBench.some((p) => p?.pokemon.id === targetPokemonId)) return true;
  return false;
}

export function playDefender(
  state: GameState,
  cardId: string,
  targetPokemonId: string
): GameState {
  if (!canPlayDefender(state, cardId, targetPokemonId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const newHand = state.playerHand.filter((c) => c.id !== cardId);

  let targetName = "";
  if (state.playerActivePokemon?.pokemon.id === targetPokemonId) {
    targetName = state.playerActivePokemon.pokemon.name;
  } else {
    const benchTarget = state.playerBench.find((p) => p?.pokemon.id === targetPokemonId);
    targetName = benchTarget?.pokemon.name ?? "";
  }

  const modifier: GameModifier = {
    id: `mod-${Date.now()}-${Math.random()}`,
    source: "defender",
    card,
    targetPokemonId,
    amount: -20,
    expiresAfterTurn: state.turnNumber + 1,
    playerId: "player",
  };

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Defender en ${targetName} (-20 daño recibido)`, "action"),
  ];

  return {
    ...state,
    playerHand: newHand,
    activeModifiers: [...state.activeModifiers, modifier],
    events,
  };
}

// ============================================================================
// POTION (#94) — Remove 20 damage from 1 of your Pokemon
// ============================================================================

export function canPlayPotion(state: GameState, cardId: string, targetPokemonId: string): boolean {
  if (!canPlayTrainer(state, cardId)) return false;

  // Target must be one of player's Pokemon with damage
  const findTarget = (): PokemonInPlay | undefined => {
    if (state.playerActivePokemon?.pokemon.id === targetPokemonId) {
      return state.playerActivePokemon;
    }
    return state.playerBench.find((p) => p?.pokemon.id === targetPokemonId);
  };

  const target = findTarget();
  if (!target) return false;
  if (!target.currentDamage || target.currentDamage <= 0) return false;
  return true;
}

export function playPotion(
  state: GameState,
  cardId: string,
  targetPokemonId: string
): GameState {
  if (!canPlayPotion(state, cardId, targetPokemonId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const newHand = state.playerHand.filter((c) => c.id !== cardId);
  const newDiscard = [...state.playerDiscard, card];

  const healAmount = 20;
  let newActive = state.playerActivePokemon;
  let newBench = [...state.playerBench];
  let targetName = "";

  if (state.playerActivePokemon?.pokemon.id === targetPokemonId) {
    const currentDamage = state.playerActivePokemon.currentDamage ?? 0;
    const healed = Math.min(healAmount, currentDamage);
    targetName = state.playerActivePokemon.pokemon.name;
    newActive = {
      ...state.playerActivePokemon,
      currentDamage: currentDamage - healed,
    };
  } else {
    const idx = state.playerBench.findIndex((p) => p?.pokemon.id === targetPokemonId);
    if (idx !== -1) {
      const benchPokemon = state.playerBench[idx];
      const currentDamage = benchPokemon.currentDamage ?? 0;
      const healed = Math.min(healAmount, currentDamage);
      targetName = benchPokemon.pokemon.name;
      newBench = [...state.playerBench];
      newBench[idx] = {
        ...benchPokemon,
        currentDamage: currentDamage - healed,
      };
    }
  }

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Potion`, "action"),
    createGameEvent(`${targetName} fue curado 20 de daño`, "info"),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDiscard: newDiscard,
    playerActivePokemon: newActive,
    playerBench: newBench,
    events,
  };
}

// ============================================================================
// SUPER POTION (#90) — Discard 1 energy from your Pokemon, remove 40 damage
// ============================================================================

export function canPlaySuperPotion(
  state: GameState,
  cardId: string,
  targetPokemonId: string,
  energyIdToDiscard: string
): boolean {
  if (!canPlayTrainer(state, cardId)) return false;

  const findTarget = (): PokemonInPlay | undefined => {
    if (state.playerActivePokemon?.pokemon.id === targetPokemonId) {
      return state.playerActivePokemon;
    }
    return state.playerBench.find((p) => p?.pokemon.id === targetPokemonId);
  };

  const target = findTarget();
  if (!target) return false;
  if (!target.currentDamage || target.currentDamage <= 0) return false;
  if (!target.attachedEnergy.some((e) => e.id === energyIdToDiscard)) return false;
  return true;
}

export function playSuperPotion(
  state: GameState,
  cardId: string,
  targetPokemonId: string,
  energyIdToDiscard: string
): GameState {
  if (!canPlaySuperPotion(state, cardId, targetPokemonId, energyIdToDiscard)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const newHand = state.playerHand.filter((c) => c.id !== cardId);
  let newDiscard = [...state.playerDiscard, card];

  const healAmount = 40;
  let newActive = state.playerActivePokemon;
  let newBench = [...state.playerBench];
  let targetName = "";

  const healPokemon = (pokemon: PokemonInPlay): PokemonInPlay => {
    const discardedEnergy = pokemon.attachedEnergy.find((e) => e.id === energyIdToDiscard);
    if (discardedEnergy) {
      newDiscard = [...newDiscard, discardedEnergy];
    }
    const currentDamage = pokemon.currentDamage ?? 0;
    const healed = Math.min(healAmount, currentDamage);
    targetName = pokemon.pokemon.name;
    return {
      ...pokemon,
      attachedEnergy: pokemon.attachedEnergy.filter((e) => e.id !== energyIdToDiscard),
      currentDamage: currentDamage - healed,
    };
  };

  if (state.playerActivePokemon?.pokemon.id === targetPokemonId) {
    newActive = healPokemon(state.playerActivePokemon);
  } else {
    const idx = state.playerBench.findIndex((p) => p?.pokemon.id === targetPokemonId);
    if (idx !== -1) {
      newBench = [...state.playerBench];
      newBench[idx] = healPokemon(state.playerBench[idx]);
    }
  }

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Super Potion`, "action"),
    createGameEvent(`${targetName} fue curado 40 de daño (descartando 1 energía)`, "info"),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDiscard: newDiscard,
    playerActivePokemon: newActive,
    playerBench: newBench,
    events,
  };
}

// ============================================================================
// FULL HEAL (#82) — Remove all status conditions from active Pokemon
// ============================================================================

export function canPlayFullHeal(state: GameState, cardId: string): boolean {
  if (!canPlayTrainer(state, cardId)) return false;
  if (!state.playerActivePokemon) return false;
  const statuses = state.playerActivePokemon.statusConditions ?? [];
  if (statuses.length === 0) return false;
  return true;
}

export function playFullHeal(state: GameState, cardId: string): GameState {
  if (!canPlayFullHeal(state, cardId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const newHand = state.playerHand.filter((c) => c.id !== cardId);
  const newDiscard = [...state.playerDiscard, card];

  const clearedPokemon = clearAllStatusConditions(state.playerActivePokemon!);

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Full Heal`, "action"),
    createGameEvent(
      `${clearedPokemon.pokemon.name} fue curado de todos los estados especiales`,
      "info"
    ),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDiscard: newDiscard,
    playerActivePokemon: clearedPokemon,
    events,
  };
}

// ============================================================================
// ENERGY REMOVAL (#92) — Discard 1 energy from opponent's active Pokemon
// ============================================================================

export function canPlayEnergyRemoval(state: GameState, cardId: string, energyId: string): boolean {
  if (!canPlayTrainer(state, cardId)) return false;
  if (!state.opponentActivePokemon) return false;
  if (!state.opponentActivePokemon.attachedEnergy.some((e) => e.id === energyId)) return false;
  return true;
}

export function playEnergyRemoval(
  state: GameState,
  cardId: string,
  energyId: string
): GameState {
  if (!canPlayEnergyRemoval(state, cardId, energyId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const newHand = state.playerHand.filter((c) => c.id !== cardId);
  let newDiscard = [...state.playerDiscard, card];

  const opponent = state.opponentActivePokemon!;
  const removedEnergy = opponent.attachedEnergy.find((e) => e.id === energyId);
  const newOpponentDiscard = [...state.opponentDiscard];
  if (removedEnergy) {
    newOpponentDiscard.push(removedEnergy);
  }

  const newOpponentActive: PokemonInPlay = {
    ...opponent,
    attachedEnergy: opponent.attachedEnergy.filter((e) => e.id !== energyId),
  };

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Energy Removal`, "action"),
    createGameEvent(
      `Se descartó 1 energía de ${opponent.pokemon.name} del rival`,
      "info"
    ),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDiscard: newDiscard,
    opponentActivePokemon: newOpponentActive,
    opponentDiscard: newOpponentDiscard,
    events,
  };
}

// ============================================================================
// SUPER ENERGY REMOVAL (#79) — Discard 1 own energy, discard up to 2 from any opponent Pokemon
// ============================================================================

export function canPlaySuperEnergyRemoval(
  state: GameState,
  cardId: string,
  ownPokemonId: string,
  ownEnergyId: string,
  opponentPokemonId: string,
  opponentEnergyIds: string[]
): boolean {
  if (!canPlayTrainer(state, cardId)) return false;

  // Must discard 1 own energy
  const findOwnPokemon = (): PokemonInPlay | undefined => {
    if (state.playerActivePokemon?.pokemon.id === ownPokemonId) return state.playerActivePokemon;
    return state.playerBench.find((p) => p?.pokemon.id === ownPokemonId);
  };
  const ownPokemon = findOwnPokemon();
  if (!ownPokemon) return false;
  if (!ownPokemon.attachedEnergy.some((e) => e.id === ownEnergyId)) return false;

  // Find opponent Pokemon (active or bench)
  const findOpponentPokemon = (): PokemonInPlay | undefined => {
    if (state.opponentActivePokemon?.pokemon.id === opponentPokemonId) return state.opponentActivePokemon;
    return state.opponentBench.find((p) => p?.pokemon.id === opponentPokemonId) ?? undefined;
  };
  const opponentPokemon = findOpponentPokemon();
  if (!opponentPokemon) return false;

  // Must choose up to 2 energies from opponent Pokemon
  if (opponentEnergyIds.length === 0 || opponentEnergyIds.length > 2) return false;
  const oppEnergies = opponentPokemon.attachedEnergy;
  for (const id of opponentEnergyIds) {
    if (!oppEnergies.some((e) => e.id === id)) return false;
  }

  return true;
}

export function playSuperEnergyRemoval(
  state: GameState,
  cardId: string,
  ownPokemonId: string,
  ownEnergyId: string,
  opponentPokemonId: string,
  opponentEnergyIds: string[]
): GameState {
  if (!canPlaySuperEnergyRemoval(state, cardId, ownPokemonId, ownEnergyId, opponentPokemonId, opponentEnergyIds))
    return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const newHand = state.playerHand.filter((c) => c.id !== cardId);
  let newPlayerDiscard = [...state.playerDiscard, card];
  let newOpponentDiscard = [...state.opponentDiscard];

  // Discard own energy
  let newActive = state.playerActivePokemon;
  let newBench = [...state.playerBench];

  if (state.playerActivePokemon?.pokemon.id === ownPokemonId) {
    const discarded = state.playerActivePokemon.attachedEnergy.find((e) => e.id === ownEnergyId);
    if (discarded) newPlayerDiscard.push(discarded);
    newActive = {
      ...state.playerActivePokemon,
      attachedEnergy: state.playerActivePokemon.attachedEnergy.filter((e) => e.id !== ownEnergyId),
    };
  } else {
    const idx = state.playerBench.findIndex((p) => p?.pokemon.id === ownPokemonId);
    if (idx !== -1) {
      const benchPokemon = state.playerBench[idx];
      const discarded = benchPokemon.attachedEnergy.find((e) => e.id === ownEnergyId);
      if (discarded) newPlayerDiscard.push(discarded);
      newBench = [...state.playerBench];
      newBench[idx] = {
        ...benchPokemon,
        attachedEnergy: benchPokemon.attachedEnergy.filter((e) => e.id !== ownEnergyId),
      };
    }
  }

  // Find opponent Pokemon (active or bench)
  let newOpponentActive = state.opponentActivePokemon;
  let newOpponentBench = [...state.opponentBench];
  let targetPokemon: PokemonInPlay | null = null;

  if (state.opponentActivePokemon?.pokemon.id === opponentPokemonId) {
    targetPokemon = state.opponentActivePokemon;
    const removedEnergies = targetPokemon.attachedEnergy.filter((e) => opponentEnergyIds.includes(e.id));
    newOpponentDiscard.push(...removedEnergies);
    newOpponentActive = {
      ...targetPokemon,
      attachedEnergy: targetPokemon.attachedEnergy.filter((e) => !opponentEnergyIds.includes(e.id)),
    };
  } else {
    const idx = state.opponentBench.findIndex((p) => p?.pokemon.id === opponentPokemonId);
    if (idx !== -1 && state.opponentBench[idx]) {
      targetPokemon = state.opponentBench[idx]!;
      const removedEnergies = targetPokemon.attachedEnergy.filter((e) => opponentEnergyIds.includes(e.id));
      newOpponentDiscard.push(...removedEnergies);
      newOpponentBench[idx] = {
        ...targetPokemon,
        attachedEnergy: targetPokemon.attachedEnergy.filter((e) => !opponentEnergyIds.includes(e.id)),
      };
    }
  }

  const removedCount = opponentEnergyIds.length;
  const events = [
    ...state.events,
    createGameEvent(`Jugaste Super Energy Removal`, "action"),
    createGameEvent(
      `Descartaste 1 energía propia y ${removedCount} energía${removedCount > 1 ? "s" : ""} de ${targetPokemon?.pokemon.name ?? "rival"}`,
      "info"
    ),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDiscard: newPlayerDiscard,
    playerActivePokemon: newActive,
    playerBench: newBench,
    opponentActivePokemon: newOpponentActive,
    opponentBench: newOpponentBench,
    opponentDiscard: newOpponentDiscard,
    events,
  };
}

// ============================================================================
// PROFESSOR OAK (#88) — Discard hand, draw 7 cards
// ============================================================================

export function playProfessorOak(state: GameState, cardId: string): GameState {
  if (!canPlayTrainer(state, cardId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;

  // Discard entire hand (including Professor Oak itself)
  const remainingHand = state.playerHand.filter((c) => c.id !== cardId);
  let newDiscard = [...state.playerDiscard, card, ...remainingHand];
  let newHand: GameCard[] = [];
  let newDeck = [...state.playerDeck];

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Professor Oak`, "action"),
    createGameEvent(`Descartaste ${remainingHand.length} carta${remainingHand.length !== 1 ? "s" : ""} de tu mano`, "info"),
  ];

  // Draw 7 cards
  let cardsDrawn = 0;
  for (let i = 0; i < 7; i++) {
    const result = drawCard(newDeck, newHand);
    if (result.success) {
      newDeck = result.newDeck;
      newHand = result.newHand;
      cardsDrawn++;
    } else {
      break;
    }
  }

  events.push(
    createGameEvent(`Robaste ${cardsDrawn} carta${cardsDrawn !== 1 ? "s" : ""} con Professor Oak`, "info")
  );

  return {
    ...state,
    playerHand: newHand,
    playerDeck: newDeck,
    playerDiscard: newDiscard,
    events,
  };
}

// ============================================================================
// IMPOSTER PROFESSOR OAK (#73) — Opponent shuffles hand into deck, draws 7
// ============================================================================

export function playImposterProfessorOak(state: GameState, cardId: string): GameState {
  if (!canPlayTrainer(state, cardId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const newHand = state.playerHand.filter((c) => c.id !== cardId);
  const newDiscard = [...state.playerDiscard, card];

  // Opponent shuffles hand into deck
  const opponentCombined = [...state.opponentHand, ...state.opponentDeck];
  const shuffledOpponentDeck = shuffle(opponentCombined);

  // Opponent draws 7
  let opponentNewHand: GameCard[] = [];
  let opponentNewDeck = shuffledOpponentDeck;
  let cardsDrawn = 0;
  for (let i = 0; i < 7; i++) {
    const result = drawCard(opponentNewDeck, opponentNewHand);
    if (result.success) {
      opponentNewDeck = result.newDeck;
      opponentNewHand = result.newHand;
      cardsDrawn++;
    } else {
      break;
    }
  }

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Imposter Professor Oak`, "action"),
    createGameEvent(`El rival barajó su mano en su mazo y robó ${cardsDrawn} cartas`, "info"),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDiscard: newDiscard,
    opponentHand: opponentNewHand,
    opponentDeck: opponentNewDeck,
    events,
  };
}

// ============================================================================
// LASS (#75) — Both players shuffle all Trainer cards from hand into deck
// ============================================================================

export function playLass(state: GameState, cardId: string): GameState {
  if (!canPlayTrainer(state, cardId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;

  // Remove Lass from hand first
  const handWithoutLass = state.playerHand.filter((c) => c.id !== cardId);

  // Separate player's trainers from non-trainers
  const playerTrainers = handWithoutLass.filter((c) => c.kind === CardKind.Trainer);
  const playerNonTrainers = handWithoutLass.filter((c) => c.kind !== CardKind.Trainer);

  // Separate opponent's trainers
  const opponentTrainers = state.opponentHand.filter((c) => c.kind === CardKind.Trainer);
  const opponentNonTrainers = state.opponentHand.filter((c) => c.kind !== CardKind.Trainer);

  // Shuffle trainers back into decks
  const newPlayerDeck = shuffle([...state.playerDeck, ...playerTrainers]);
  const newOpponentDeck = shuffle([...state.opponentDeck, ...opponentTrainers]);

  // Lass goes to discard
  const newDiscard = [...state.playerDiscard, card];

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Lass`, "action"),
    createGameEvent(
      `Barajaste ${playerTrainers.length} Trainer${playerTrainers.length !== 1 ? "s" : ""} en tu mazo`,
      "info"
    ),
    createGameEvent(
      `El rival barajó ${opponentTrainers.length} Trainer${opponentTrainers.length !== 1 ? "s" : ""} en su mazo`,
      "info"
    ),
  ];

  return {
    ...state,
    playerHand: playerNonTrainers,
    playerDeck: newPlayerDeck,
    playerDiscard: newDiscard,
    opponentHand: opponentNonTrainers,
    opponentDeck: newOpponentDeck,
    events,
  };
}

// ============================================================================
// POKEMON CENTER (#85) — Remove all damage from all your Pokemon,
//                         discard all energy attached to healed Pokemon
// ============================================================================

export function playPokemonCenter(state: GameState, cardId: string): GameState {
  if (!canPlayTrainer(state, cardId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const newHand = state.playerHand.filter((c) => c.id !== cardId);
  let newDiscard = [...state.playerDiscard, card];

  let totalHealed = 0;
  let totalEnergyDiscarded = 0;

  // Heal active Pokemon
  let newActive = state.playerActivePokemon;
  if (newActive && (newActive.currentDamage ?? 0) > 0) {
    totalHealed += newActive.currentDamage ?? 0;
    totalEnergyDiscarded += newActive.attachedEnergy.length;
    newDiscard = [...newDiscard, ...newActive.attachedEnergy];
    newActive = {
      ...newActive,
      currentDamage: 0,
      attachedEnergy: [],
    };
  }

  // Heal bench Pokemon
  const newBench = state.playerBench.map((pokemon) => {
    if ((pokemon.currentDamage ?? 0) > 0) {
      totalHealed += pokemon.currentDamage ?? 0;
      totalEnergyDiscarded += pokemon.attachedEnergy.length;
      newDiscard = [...newDiscard, ...pokemon.attachedEnergy];
      return {
        ...pokemon,
        currentDamage: 0,
        attachedEnergy: [],
      };
    }
    return pokemon;
  });

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Pokémon Center`, "action"),
    createGameEvent(
      `Curado ${totalHealed} de daño total, descartadas ${totalEnergyDiscarded} energía${totalEnergyDiscarded !== 1 ? "s" : ""}`,
      "info"
    ),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDiscard: newDiscard,
    playerActivePokemon: newActive,
    playerBench: newBench,
    events,
  };
}

// ============================================================================
// ENERGY RETRIEVAL (#81) — Discard 1 card, put up to 2 basic Energy from discard to hand
// ============================================================================

export function canPlayEnergyRetrieval(
  state: GameState,
  cardId: string,
  discardCardId: string,
  energyCardIds: string[]
): boolean {
  if (!canPlayTrainer(state, cardId)) return false;

  // Must discard 1 card from hand (not Energy Retrieval itself)
  const discardCard = state.playerHand.find(c => c.id === discardCardId && c.id !== cardId);
  if (!discardCard) return false;

  if (energyCardIds.length === 0 || energyCardIds.length > 2) return false;

  // All selected cards must be basic energy in player discard
  for (const id of energyCardIds) {
    const found = state.playerDiscard.find(
      (c) => c.id === id && isBasicEnergy(c)
    );
    if (!found) return false;
  }

  return true;
}

export function playEnergyRetrieval(
  state: GameState,
  cardId: string,
  discardCardId: string,
  energyCardIds: string[]
): GameState {
  if (!canPlayEnergyRetrieval(state, cardId, discardCardId, energyCardIds)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const discardCard = state.playerHand.find((c) => c.id === discardCardId)!;

  // Remove Energy Retrieval and the discarded card from hand
  let newHand = state.playerHand.filter((c) => c.id !== cardId && c.id !== discardCardId);

  // Move Energy Retrieval and discarded card to discard
  let newDiscard = [...state.playerDiscard, card, discardCard];

  // Retrieve selected energies from discard
  const retrievedCards: GameCard[] = [];
  for (const id of energyCardIds) {
    const idx = newDiscard.findIndex((c) => c.id === id);
    if (idx !== -1) {
      retrievedCards.push(newDiscard[idx]);
      newDiscard = [...newDiscard.slice(0, idx), ...newDiscard.slice(idx + 1)];
    }
  }

  // Add retrieved cards to the LEFT of the hand
  newHand = [...retrievedCards, ...newHand];

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Energy Retrieval`, "action"),
    createGameEvent(`Descartaste ${discardCard.name}`, "info"),
    createGameEvent(
      `Recuperaste ${retrievedCards.length} energía${retrievedCards.length > 1 ? "s" : ""} del descarte`,
      "info"
    ),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDiscard: newDiscard,
    events,
  };
}

// ============================================================================
// MAINTENANCE (#83) — Shuffle 2 cards from hand into deck, draw 1
// ============================================================================

export function canPlayMaintenance(
  state: GameState,
  cardId: string,
  cardIdsToReturn: string[]
): boolean {
  if (!canPlayTrainer(state, cardId)) return false;
  if (cardIdsToReturn.length !== 2) return false;

  // Cards to return must be in hand and not be Maintenance itself
  const handWithout = state.playerHand.filter((c) => c.id !== cardId);
  for (const id of cardIdsToReturn) {
    if (!handWithout.some((c) => c.id === id)) return false;
  }
  // Must be different cards
  if (cardIdsToReturn[0] === cardIdsToReturn[1]) return false;

  return true;
}

export function playMaintenance(
  state: GameState,
  cardId: string,
  cardIdsToReturn: string[]
): GameState {
  if (!canPlayMaintenance(state, cardId, cardIdsToReturn)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;

  // Remove Maintenance + 2 selected cards from hand
  const cardsToReturn = state.playerHand.filter((c) => cardIdsToReturn.includes(c.id));
  let newHand = state.playerHand.filter(
    (c) => c.id !== cardId && !cardIdsToReturn.includes(c.id)
  );
  const newDiscard = [...state.playerDiscard, card];

  // Shuffle returned cards into deck
  let newDeck = shuffle([...state.playerDeck, ...cardsToReturn]);

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Maintenance`, "action"),
    createGameEvent(`Barajaste 2 cartas en tu mazo`, "info"),
  ];

  // Draw 1 card
  const result = drawCard(newDeck, newHand);
  if (result.success) {
    newDeck = result.newDeck;
    newHand = result.newHand;
    events.push(createGameEvent(`Robaste 1 carta con Maintenance`, "info"));
  }

  return {
    ...state,
    playerHand: newHand,
    playerDeck: newDeck,
    playerDiscard: newDiscard,
    events,
  };
}

// ============================================================================
// REVIVE (#89) — Put 1 Basic Pokemon from discard to bench with half HP (rounded down to nearest 10)
// ============================================================================

export function canPlayRevive(state: GameState, cardId: string, targetCardId: string): boolean {
  if (!canPlayTrainer(state, cardId)) return false;

  // Bench must have space
  if (state.playerBench.length >= 5) return false;

  // Target must be a basic Pokemon in discard
  const target = state.playerDiscard.find((c) => c.id === targetCardId);
  if (!target) return false;
  if (target.kind !== CardKind.Pokemon) return false;
  if (target.stage !== PokemonStage.Basic) return false;

  return true;
}

export function playRevive(
  state: GameState,
  cardId: string,
  targetCardId: string
): GameState {
  if (!canPlayRevive(state, cardId, targetCardId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const newHand = state.playerHand.filter((c) => c.id !== cardId);

  // Remove Revive to discard, remove target from discard
  let newDiscard = [...state.playerDiscard, card];
  const targetIdx = newDiscard.findIndex((c) => c.id === targetCardId);
  const target = newDiscard[targetIdx];
  newDiscard = [...newDiscard.slice(0, targetIdx), ...newDiscard.slice(targetIdx + 1)];

  // Place on bench with half HP damage (rounded down to nearest 10)
  const maxHp = target.kind === "pokemon" ? target.hp : 0;
  const halfHpDamage = Math.floor(maxHp / 2 / 10) * 10;

  const newBench = [
    ...state.playerBench,
    {
      pokemon: target,
      attachedEnergy: [],
      attachedTrainers: [],
      previousEvolutions: [],
      currentDamage: halfHpDamage,
      playedOnTurn: state.turnNumber,
    } as PokemonInPlay,
  ];

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Revive`, "action"),
    createGameEvent(
      `${target.name} fue revivido en la banca con ${maxHp - halfHpDamage} PS`,
      "info"
    ),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDiscard: newDiscard,
    playerBench: newBench,
    events,
  };
}

// ============================================================================
// POKEMON FLUTE (#86) — Put 1 Basic Pokemon from opponent's discard to their bench
// ============================================================================

export function canPlayPokemonFlute(state: GameState, cardId: string, targetCardId: string): boolean {
  if (!canPlayTrainer(state, cardId)) return false;

  // Opponent bench must have space
  if (state.opponentBench.length >= 5) return false;

  // Target must be a basic Pokemon in opponent's discard
  const target = state.opponentDiscard.find((c) => c.id === targetCardId);
  if (!target) return false;
  if (target.kind !== CardKind.Pokemon) return false;
  if (target.stage !== PokemonStage.Basic) return false;

  return true;
}

export function playPokemonFlute(
  state: GameState,
  cardId: string,
  targetCardId: string
): GameState {
  if (!canPlayPokemonFlute(state, cardId, targetCardId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const newHand = state.playerHand.filter((c) => c.id !== cardId);
  const newPlayerDiscard = [...state.playerDiscard, card];

  // Remove target from opponent's discard
  const targetIdx = state.opponentDiscard.findIndex((c) => c.id === targetCardId);
  const target = state.opponentDiscard[targetIdx];
  const newOpponentDiscard = [
    ...state.opponentDiscard.slice(0, targetIdx),
    ...state.opponentDiscard.slice(targetIdx + 1),
  ];

  // Place on opponent's bench with 0 damage
  const newOpponentBench = [
    ...state.opponentBench,
    {
      pokemon: target,
      attachedEnergy: [],
      attachedTrainers: [],
      previousEvolutions: [],
      currentDamage: 0,
      playedOnTurn: state.turnNumber,
    } as PokemonInPlay,
  ];

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Pokémon Flute`, "action"),
    createGameEvent(
      `${target.name} fue colocado en la banca del rival desde su descarte`,
      "info"
    ),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDiscard: newPlayerDiscard,
    opponentDiscard: newOpponentDiscard,
    opponentBench: newOpponentBench,
    events,
  };
}

// ============================================================================
// ITEM FINDER (#74) — Discard 2 cards from hand, get 1 Trainer from discard
// ============================================================================

export function canPlayItemFinder(
  state: GameState,
  cardId: string,
  discardCardIds: string[],
  trainerCardId: string
): boolean {
  if (!canPlayTrainer(state, cardId)) return false;
  if (discardCardIds.length !== 2) return false;

  // Cards to discard must be in hand, not Item Finder itself, and be distinct
  const handWithout = state.playerHand.filter((c) => c.id !== cardId);
  for (const id of discardCardIds) {
    if (!handWithout.some((c) => c.id === id)) return false;
  }
  if (discardCardIds[0] === discardCardIds[1]) return false;

  // Trainer to retrieve must be in discard
  const target = state.playerDiscard.find(
    (c) => c.id === trainerCardId && c.kind === CardKind.Trainer
  );
  if (!target) return false;

  return true;
}

export function playItemFinder(
  state: GameState,
  cardId: string,
  discardCardIds: string[],
  trainerCardId: string
): GameState {
  if (!canPlayItemFinder(state, cardId, discardCardIds, trainerCardId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const cardsToDiscard = state.playerHand.filter((c) => discardCardIds.includes(c.id));
  let newHand = state.playerHand.filter(
    (c) => c.id !== cardId && !discardCardIds.includes(c.id)
  );

  // Send Item Finder + 2 cards to discard
  let newDiscard = [...state.playerDiscard, card, ...cardsToDiscard];

  // Retrieve trainer from discard - cartas nuevas van a la izquierda
  const targetIdx = newDiscard.findIndex((c) => c.id === trainerCardId);
  const retrieved = newDiscard[targetIdx];
  newDiscard = [...newDiscard.slice(0, targetIdx), ...newDiscard.slice(targetIdx + 1)];
  newHand = [retrieved, ...newHand];

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Item Finder`, "action"),
    createGameEvent(
      `Descartaste 2 cartas y recuperaste ${retrieved.name} del descarte`,
      "info"
    ),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDiscard: newDiscard,
    events,
  };
}

// ============================================================================
// COMPUTER SEARCH (#71) — Discard 2 cards from hand, search deck for any card
// ============================================================================

export function canPlayComputerSearch(
  state: GameState,
  cardId: string,
  discardCardIds: string[],
  deckCardId: string
): boolean {
  if (!canPlayTrainer(state, cardId)) return false;
  if (discardCardIds.length !== 2) return false;

  const handWithout = state.playerHand.filter((c) => c.id !== cardId);
  for (const id of discardCardIds) {
    if (!handWithout.some((c) => c.id === id)) return false;
  }
  if (discardCardIds[0] === discardCardIds[1]) return false;

  // Card to search must be in deck
  if (!state.playerDeck.some((c) => c.id === deckCardId)) return false;

  return true;
}

export function playComputerSearch(
  state: GameState,
  cardId: string,
  discardCardIds: string[],
  deckCardId: string
): GameState {
  if (!canPlayComputerSearch(state, cardId, discardCardIds, deckCardId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const cardsToDiscard = state.playerHand.filter((c) => discardCardIds.includes(c.id));
  let newHand = state.playerHand.filter(
    (c) => c.id !== cardId && !discardCardIds.includes(c.id)
  );

  const newDiscard = [...state.playerDiscard, card, ...cardsToDiscard];

  // Take card from deck, shuffle remaining - cartas nuevas van a la izquierda
  const found = state.playerDeck.find((c) => c.id === deckCardId)!;
  const deckWithout = state.playerDeck.filter((c) => c.id !== deckCardId);
  const newDeck = shuffle(deckWithout);
  newHand = [found, ...newHand];

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Computer Search`, "action"),
    createGameEvent(`Descartaste 2 cartas y buscaste 1 carta de tu mazo`, "info"),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDeck: newDeck,
    playerDiscard: newDiscard,
    events,
  };
}

// ============================================================================
// DEVOLUTION SPRAY (#72) — Devolve 1 evolved Pokemon, return evolution to hand
// ============================================================================

export function canPlayDevolutionSpray(
  state: GameState,
  cardId: string,
  targetIndex: number // -1 = active, 0+ = bench
): boolean {
  if (!canPlayTrainer(state, cardId)) return false;

  const target =
    targetIndex === -1
      ? state.playerActivePokemon
      : state.playerBench[targetIndex];

  if (!target) return false;
  // Must be an evolved Pokemon (has previousEvolutions)
  if (!target.previousEvolutions || target.previousEvolutions.length === 0) return false;

  return true;
}

export function playDevolutionSpray(
  state: GameState,
  cardId: string,
  targetIndex: number
): GameState {
  if (!canPlayDevolutionSpray(state, cardId, targetIndex)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  let newHand = state.playerHand.filter((c) => c.id !== cardId);
  const newDiscard = [...state.playerDiscard, card];

  const target =
    targetIndex === -1
      ? state.playerActivePokemon!
      : state.playerBench[targetIndex];

  // Return the current evolution card to hand - cartas nuevas van a la izquierda
  const evolutionCard = target.pokemon;
  newHand = [evolutionCard, ...newHand];

  // The previous stage becomes the active card
  const previousEvos = target.previousEvolutions!;
  const previousStage = previousEvos[previousEvos.length - 1];
  const remainingEvos = previousEvos.slice(0, -1);

  const devolvedPokemon: PokemonInPlay = {
    ...target,
    pokemon: previousStage,
    previousEvolutions: remainingEvos.length > 0 ? remainingEvos : undefined,
    // Keep damage, energy, etc. but cap damage to new HP
    // If damage >= new HP, the Pokemon is knocked out (handled by caller)
  };

  let newActive = state.playerActivePokemon;
  let newBench = [...state.playerBench];

  if (targetIndex === -1) {
    newActive = devolvedPokemon;
  } else {
    newBench = [...state.playerBench];
    newBench[targetIndex] = devolvedPokemon;
  }

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Devolution Spray`, "action"),
    createGameEvent(
      `${evolutionCard.name} devolvió a ${previousStage.name}`,
      "info"
    ),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDiscard: newDiscard,
    playerActivePokemon: newActive,
    playerBench: newBench,
    events,
  };
}

// ============================================================================
// POKEMON BREEDER (#76) — Put Stage 2 from hand directly onto corresponding Basic
//                          (skipping Stage 1). Counts as evolving.
// ============================================================================

export function canPlayPokemonBreeder(
  state: GameState,
  cardId: string,
  stage2CardId: string,
  targetIndex: number // -1 = active, 0+ = bench
): boolean {
  if (!canPlayTrainer(state, cardId)) {
    console.log("[Breeder] canPlayTrainer failed");
    return false;
  }

  // Stage 2 card must be in hand
  const stage2 = state.playerHand.find((c) => c.id === stage2CardId);
  if (!stage2) {
    console.log("[Breeder] stage2 not found in hand");
    return false;
  }
  if (stage2.kind !== CardKind.Pokemon) {
    console.log("[Breeder] stage2 is not pokemon");
    return false;
  }
  if (stage2.stage !== PokemonStage.Stage2) {
    console.log("[Breeder] stage2 is not stage-2, it is:", stage2.stage);
    return false;
  }

  // Target must be a basic Pokemon (not Stage 1)
  const target =
    targetIndex === -1
      ? state.playerActivePokemon
      : state.playerBench[targetIndex];

  if (!target) {
    console.log("[Breeder] target not found at index:", targetIndex);
    return false;
  }
  if (target.pokemon.kind !== CardKind.Pokemon) {
    console.log("[Breeder] target.pokemon is not pokemon");
    return false;
  }
  if (target.pokemon.stage !== PokemonStage.Basic) {
    console.log("[Breeder] target is not basic, it is:", target.pokemon.stage);
    return false;
  }

  // Can't evolve on first turn of the game
  if (state.turnNumber === 1) {
    console.log("[Breeder] Can't evolve on turn 1");
    return false;
  }

  // Can't evolve on same turn it was played
  if (target.playedOnTurn === state.turnNumber) {
    console.log("[Breeder] Can't evolve on same turn it was played");
    return false;
  }

  // Validate evolution chain: Stage 2 → Stage 1 → Basic
  // Use catalog to find intermediate Stage 1 and verify chain connects.
  if (!stage2.evolvesFrom) {
    console.log("[Breeder] stage2.evolvesFrom is missing");
    return false;
  }
  const stage1InCatalog = baseSetCards.find(
    (c) => c.kind === CardKind.Pokemon && c.name === stage2.evolvesFrom
  );
  if (!stage1InCatalog || stage1InCatalog.kind !== CardKind.Pokemon) {
    console.log("[Breeder] stage1InCatalog not found for:", stage2.evolvesFrom);
    return false;
  }
  console.log("[Breeder] Checking chain:", {
    stage2: stage2.name,
    stage2EvolvesFrom: stage2.evolvesFrom,
    stage1Found: stage1InCatalog.name,
    stage1EvolvesFrom: stage1InCatalog.kind === CardKind.Pokemon ? stage1InCatalog.evolvesFrom : undefined,
    targetName: target.pokemon.name,
  });
  if (stage1InCatalog.evolvesFrom !== target.pokemon.name) {
    console.log("[Breeder] Evolution chain doesn't match");
    return false;
  }

  console.log("[Breeder] All validations passed!");
  return true;
}

export function playPokemonBreeder(
  state: GameState,
  cardId: string,
  stage2CardId: string,
  targetIndex: number
): GameState {
  if (!canPlayPokemonBreeder(state, cardId, stage2CardId, targetIndex)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const stage2Card = state.playerHand.find((c) => c.id === stage2CardId)!;

  // Remove Breeder and Stage 2 from hand
  const newHand = state.playerHand.filter(
    (c) => c.id !== cardId && c.id !== stage2CardId
  );
  const newDiscard = [...state.playerDiscard, card];

  const target =
    targetIndex === -1
      ? state.playerActivePokemon!
      : state.playerBench[targetIndex];

  // Evolve: basic → stage 2 (skipping stage 1)
  const previousEvolutions = [
    ...(target.previousEvolutions || []),
    target.pokemon,
  ];

  const evolvedPokemon: PokemonInPlay = {
    ...target,
    pokemon: stage2Card,
    previousEvolutions,
    statusConditions: [],
    paralyzedOnTurn: undefined,
    protection: undefined,
    playedOnTurn: state.turnNumber,
  };

  let newActive = state.playerActivePokemon;
  let newBench = [...state.playerBench];

  if (targetIndex === -1) {
    newActive = evolvedPokemon;
  } else {
    newBench = [...state.playerBench];
    newBench[targetIndex] = evolvedPokemon;
  }

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Pokémon Breeder`, "action"),
    createGameEvent(
      `${target.pokemon.name} evolucionó directamente a ${stage2Card.name}`,
      "info"
    ),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDiscard: newDiscard,
    playerActivePokemon: newActive,
    playerBench: newBench,
    events,
  };
}

// ============================================================================
// POKEMON TRADER (#77) — Swap 1 Pokemon from hand with 1 Pokemon from deck
// ============================================================================

export function canPlayPokemonTrader(
  state: GameState,
  cardId: string,
  handPokemonId: string,
  deckPokemonId: string
): boolean {
  if (!canPlayTrainer(state, cardId)) return false;

  // Hand Pokemon must be in hand and be a Pokemon (not the Trader itself)
  const handPokemon = state.playerHand.find(
    (c) => c.id === handPokemonId && c.kind === CardKind.Pokemon
  );
  if (!handPokemon) return false;
  if (handPokemonId === cardId) return false;

  // Deck Pokemon must be in deck and be a Pokemon
  const deckPokemon = state.playerDeck.find(
    (c) => c.id === deckPokemonId && c.kind === CardKind.Pokemon
  );
  if (!deckPokemon) return false;

  return true;
}

export function playPokemonTrader(
  state: GameState,
  cardId: string,
  handPokemonId: string,
  deckPokemonId: string
): GameState {
  if (!canPlayPokemonTrader(state, cardId, handPokemonId, deckPokemonId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const handPokemon = state.playerHand.find((c) => c.id === handPokemonId)!;
  const deckPokemon = state.playerDeck.find((c) => c.id === deckPokemonId)!;

  // Remove Trader and the swapped Pokemon from hand
  let newHand = state.playerHand.filter(
    (c) => c.id !== cardId && c.id !== handPokemonId
  );
  // Add the deck Pokemon to hand - cartas nuevas van a la izquierda
  newHand = [deckPokemon, ...newHand];

  // Remove found card from deck, add the hand Pokemon, shuffle
  const deckWithout = state.playerDeck.filter((c) => c.id !== deckPokemonId);
  const newDeck = shuffle([...deckWithout, handPokemon]);

  // Trader goes to discard
  const newDiscard = [...state.playerDiscard, card];

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Pokémon Trader`, "action"),
    createGameEvent(
      `Intercambiaste ${handPokemon.name} por ${deckPokemon.name} de tu mazo`,
      "info"
    ),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDeck: newDeck,
    playerDiscard: newDiscard,
    events,
  };
}

// ============================================================================
// SCOOP UP (#78) — Return 1 Pokemon to hand (only basic card returns, attached cards discarded)
// ============================================================================

export function canPlayScoopUp(
  state: GameState,
  cardId: string,
  targetIndex: number // -1 = active, 0+ = bench
): boolean {
  if (!canPlayTrainer(state, cardId)) return false;

  const target =
    targetIndex === -1
      ? state.playerActivePokemon
      : state.playerBench[targetIndex];

  if (!target) return false;

  // If scooping active, must have bench to promote
  if (targetIndex === -1 && state.playerBench.length === 0) return false;

  return true;
}

export function playScoopUp(
  state: GameState,
  cardId: string,
  targetIndex: number
): GameState {
  if (!canPlayScoopUp(state, cardId, targetIndex)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  let newHand = state.playerHand.filter((c) => c.id !== cardId);
  let newDiscard = [...state.playerDiscard, card];

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Scoop Up`, "action"),
  ];

  // Return Pokemon to hand - only the Basic card returns, attached cards are discarded
  const target =
    targetIndex === -1
      ? state.playerActivePokemon!
      : state.playerBench[targetIndex];

  // Find the basic Pokemon card (either the current one if basic, or the first in previousEvolutions)
  let basicCard: GameCard;
  if (isPokemonCard(target.pokemon) && target.pokemon.stage === PokemonStage.Basic) {
    basicCard = target.pokemon;
  } else if (target.previousEvolutions && target.previousEvolutions.length > 0) {
    // The first card in previousEvolutions is always the basic
    basicCard = target.previousEvolutions[0];
  } else {
    // Fallback - shouldn't happen
    basicCard = target.pokemon;
  }

  // Only the basic card returns to hand
  newHand = [basicCard, ...newHand];

  // Discard all attached cards and evolution cards (everything except the basic)
  const cardsToDiscard: GameCard[] = [
    ...target.attachedEnergy,
    ...(target.attachedTrainers || []),
  ];
  // If Pokemon was evolved, discard the evolution cards (not the basic)
  if (target.previousEvolutions && target.previousEvolutions.length > 0) {
    // Add evolution cards to discard (skip the first one which is the basic that goes to hand)
    cardsToDiscard.push(...target.previousEvolutions.slice(1));
    // Add the current evolution card
    if (target.pokemon.id !== basicCard.id) {
      cardsToDiscard.push(target.pokemon);
    }
  }
  newDiscard = [...newDiscard, ...cardsToDiscard];

  let newActive = state.playerActivePokemon;
  let newBench = [...state.playerBench];

  if (targetIndex === -1) {
    // Active pokemon was scooped — player must choose new active from bench
    events.push(
      createGameEvent(
        `${basicCard.name} volvió a tu mano`,
        "info"
      )
    );
    return {
      ...state,
      playerHand: newHand,
      playerDiscard: newDiscard,
      playerActivePokemon: null,
      playerBench: newBench,
      playerNeedsToPromote: newBench.length > 0,
      events,
    };
  } else {
    newBench = [...state.playerBench];
    newBench.splice(targetIndex, 1);
    events.push(
      createGameEvent(
        `${basicCard.name} volvió a tu mano (cartas adjuntas descartadas)`,
        "info"
      )
    );
  }

  return {
    ...state,
    playerHand: newHand,
    playerDiscard: newDiscard,
    playerActivePokemon: newActive,
    playerBench: newBench,
    events,
  };
}

// ============================================================================
// POKEDEX (#87) — Look at top 5 cards of deck, rearrange in any order
//                 newOrder is an array of indices (0-4) representing the new order
// ============================================================================

export function canPlayPokedex(state: GameState, cardId: string): boolean {
  if (!canPlayTrainer(state, cardId)) return false;
  if (state.playerDeck.length === 0) return false;
  return true;
}

export function playPokedex(
  state: GameState,
  cardId: string,
  newOrder: number[]
): GameState {
  if (!canPlayPokedex(state, cardId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  const newHand = state.playerHand.filter((c) => c.id !== cardId);
  const newDiscard = [...state.playerDiscard, card];

  const topCount = Math.min(5, state.playerDeck.length);

  // Validate newOrder: must be a permutation of 0..topCount-1
  if (newOrder.length !== topCount) return state;
  const sorted = [...newOrder].sort();
  for (let i = 0; i < topCount; i++) {
    if (sorted[i] !== i) return state;
  }

  const topCards = state.playerDeck.slice(0, topCount);
  const restDeck = state.playerDeck.slice(topCount);

  // Rearrange top cards according to newOrder
  const reordered = newOrder.map((i) => topCards[i]);
  const newDeck = [...reordered, ...restDeck];

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Pokédex`, "action"),
    createGameEvent(`Reordenaste las ${topCount} cartas superiores de tu mazo`, "info"),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDeck: newDeck,
    playerDiscard: newDiscard,
    events,
  };
}

// ============================================================================
// HELPERS — Evolved Pokemon utilities (for Devolution Spray, etc.)
// ============================================================================

export function hasEvolvedPokemon(state: GameState): boolean {
  if (state.playerActivePokemon?.previousEvolutions?.length) {
    return true;
  }
  for (const pokemon of state.playerBench) {
    if (pokemon?.previousEvolutions?.length) {
      return true;
    }
  }
  return false;
}

export function getEvolvedPokemonTargets(state: GameState): Array<{ index: number; pokemon: PokemonInPlay }> {
  const targets: Array<{ index: number; pokemon: PokemonInPlay }> = [];

  if (state.playerActivePokemon?.previousEvolutions?.length) {
    targets.push({ index: -1, pokemon: state.playerActivePokemon });
  }

  state.playerBench.forEach((pokemon, i) => {
    if (pokemon?.previousEvolutions?.length) {
      targets.push({ index: i, pokemon });
    }
  });

  return targets;
}

// ============================================================================
// POKÉ BALL (Jungle #64) — Flip coin, heads = search deck for Pokemon
// ============================================================================

export function canPlayPokeBall(state: GameState, cardId: string): boolean {
  if (!canPlayTrainer(state, cardId)) return false;
  return state.playerDeck.length > 0;
}

/**
 * Play Poké Ball: if coin flip is heads, take a Pokemon (basic or evolution) from deck.
 * If tails, just discard the card.
 */
export function playPokeBall(
  state: GameState,
  cardId: string,
  deckCardId: string | null,
  isHeads: boolean
): GameState {
  if (!canPlayPokeBall(state, cardId)) return state;

  const card = state.playerHand.find((c) => c.id === cardId)!;
  let newHand = state.playerHand.filter((c) => c.id !== cardId);
  const newDiscard = [...state.playerDiscard, card];

  if (!isHeads || !deckCardId) {
    // Tails: just discard
    const events = [
      ...state.events,
      createGameEvent(`Jugaste Poké Ball`, "action"),
      createGameEvent(`Salió cruz — no se encontró ninguna carta`, "info"),
    ];
    return { ...state, playerHand: newHand, playerDiscard: newDiscard, events };
  }

  // Heads: take the selected Pokemon card from deck
  const found = state.playerDeck.find((c) => c.id === deckCardId);
  if (!found || found.kind !== CardKind.Pokemon) {
    return { ...state, playerHand: newHand, playerDiscard: newDiscard };
  }

  const deckWithout = state.playerDeck.filter((c) => c.id !== deckCardId);
  const newDeck = shuffle(deckWithout);
  newHand = [found, ...newHand];

  const events = [
    ...state.events,
    createGameEvent(`Jugaste Poké Ball`, "action"),
    createGameEvent(`Salió cara — encontraste ${found.name} en tu mazo`, "info"),
  ];

  return {
    ...state,
    playerHand: newHand,
    playerDeck: newDeck,
    playerDiscard: newDiscard,
    events,
  };
}
