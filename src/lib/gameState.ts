import { baseSetCards, getCardImageUrl as getCatalogImageUrl } from "@/domain/catalog";
import type { Card, ProtectionType, EnergyType, Attack, PokemonCard, AttackEffect } from "@/domain/cards";
import { isEnergyCard, isPokemonCard } from "@/domain/cards";
import {
  StatusCondition,
  GamePhase,
  CardKind,
  EnergyType as EnergyTypeEnum,
  PokemonStage,
  AttackEffectType,
  AttackTarget,
  BenchDamageTarget,
  PokemonPowerType,
} from "@/domain/constants";
import { decks, type Deck, type DeckEntry } from "@/domain/decks";
import { getDamageReaction, getRetreatCostReduction, hasStatusImmunity, isDamageBlocked } from "@/domain/powers";

// ============================================================================
// TIPOS
// ============================================================================

export type GameCard = Card & {
  id: string; // ID único para cada instancia de carta
  /** For Buzzap energy: ID of the original Electrode Pokemon */
  buzzapSourceId?: string;
  /** For Buzzap energy: the energy type chosen by the player */
  buzzapEnergyType?: EnergyType;
};

// Re-export StatusCondition from constants for backward compatibility
export { StatusCondition } from "@/domain/constants";

export type PokemonInPlay = {
  pokemon: GameCard;
  attachedEnergy: GameCard[];
  attachedTrainers?: GameCard[];
  previousEvolutions?: GameCard[];
  currentDamage?: number;
  statusConditions?: StatusCondition[];
  paralyzedOnTurn?: number; // Turno en que fue paralizado (se cura al final del siguiente turno del dueño)
  playedOnTurn?: number; // Turno en que fue jugado o evolucionado (no puede evolucionar el mismo turno)
  usedOnceAttacks?: string[]; // Ataques ya usados (para ataques "useOnce" como Bofetada Puerro de Farfetch'd)
  poisonDamage?: number; // Daño de veneno personalizado (default 10, Tóxico usa 20)
  protection?: {
    type: ProtectionType;       // "damageOnly" o "damageAndEffects"
    expiresAfterTurn: number;   // Turno después del cual expira la protección
    threshold?: number;         // Si se establece, solo bloquea daño <= este valor (ej: Onix Endurecimiento bloquea <=30)
  };
  /** Energy Burn: treat all attached energy as this type until end of turn */
  energyConversionType?: EnergyType;
  /** Conversion 1 (Porygon): overrides the opponent's weakness type. Clears when leaving active. */
  modifiedWeakness?: EnergyType;
  /** Conversion 2 (Porygon): overrides this Pokemon's resistance type. Clears when leaving active. */
  modifiedResistance?: EnergyType;
  /** Swords Dance: bonus damage added to next attack. Clears after attacking, retreating, or end of owner's next turn. */
  nextTurnBonusDamage?: number;
  /** Minimize / Screech: reduce incoming damage by this amount. Clears after being attacked, retreating, or end of opponent's next turn. */
  nextTurnDamageReduction?: number;
  /** Turn number when the "next turn" effect was applied (for expiration tracking) */
  nextTurnEffectAppliedOnTurn?: number;
  /** Acid (Victreebel): prevents retreat until end of opponent's next turn. Cleared by Switch/evolve/going to bench. */
  retreatPrevented?: boolean;
  /** Turn number when retreat was prevented (for expiration in endTurn) */
  retreatPreventedOnTurn?: number;
  /** Shift (Venomoth): temporary type change until end of turn */
  shiftedType?: EnergyType;
  /** Mirror Move: stores the final damage received from the last attack (set on attack, cleared on endTurn) */
  lastDamageReceived?: number;
};

export type GameEvent = {
  id: string;
  timestamp: number;
  message: string;
  type: "info" | "action" | "system";
};

// Re-export GamePhase from constants for backward compatibility
export { GamePhase } from "@/domain/constants";

export type GameModifier = {
  id: string;
  source: "plusPower" | "defender";
  card: GameCard;
  targetPokemonId?: string; // Para Defender: qué pokemon protege
  amount: number; // +10 para PlusPower, -20 para Defender
  expiresAfterTurn: number; // Turno en que expira
  playerId: "player" | "opponent"; // Quién jugó este modifier
};

export type GameResult = "victory" | "defeat" | null;

export type GameState = {
  playerDeck: GameCard[];
  playerHand: GameCard[];
  playerPrizes: GameCard[];
  playerDiscard: GameCard[];
  playerActivePokemon: PokemonInPlay | null;
  playerBench: PokemonInPlay[]; // Máximo 5 Pokémon en la banca
  opponentDeck: GameCard[];
  opponentHand: GameCard[];
  opponentPrizes: GameCard[];
  opponentDiscard: GameCard[];
  opponentActivePokemon: PokemonInPlay | null;
  opponentBench: PokemonInPlay[];
  selectedDeckId: string | null;
  turnNumber: number;
  startingPlayer: "player" | "opponent" | null;
  isPlayerTurn: boolean;
  gameStarted: boolean;
  gamePhase: GamePhase;
  playerReady: boolean;
  opponentReady: boolean;
  energyAttachedThisTurn: boolean; // Solo se puede adjuntar una energía por turno
  retreatedThisTurn: boolean; // Solo se puede retirar una vez por turno
  playerCanTakePrize: boolean; // El jugador puede tomar un premio (después de noquear)
  opponentCanTakePrize: boolean; // El oponente puede tomar un premio
  playerNeedsToPromote: boolean; // El jugador necesita elegir un Pokémon de la banca para promover
  opponentNeedsToPromote: boolean; // El oponente necesita elegir un Pokémon de la banca para promover
  activeModifiers: GameModifier[]; // Modificadores activos (PlusPower, Defender, etc.)
  gameResult: GameResult; // Resultado del juego (victoria, derrota o null si aún no termina)
  events: GameEvent[]; // Registro de eventos del juego
  /** ForceSwitch (Lure, Whirlwind): player needs to pick an opponent bench Pokemon to bring forward */
  pendingForceSwitch?: boolean;
  /** SelfSwitch (Teleport): player needs to pick own bench Pokemon to switch with */
  pendingSelfSwitch?: boolean;
  /** Track which Pokemon have used their "once per turn" powers this turn (by Pokemon ID) */
  usedPowersThisTurn?: string[];
  /** DeckSearch: player needs to search deck for Basic Pokemon matching filter */
  pendingDeckSearch?: {
    filter: {
      /** Exact name matches (e.g., ["Bellsprout"] or ["Nidoran♂", "Nidoran♀"]) */
      names?: string[];
      /** Pokemon type filter (e.g., "fighting" for Marowak) */
      type?: EnergyType;
      /** Always enforce Basic-only selection */
      basicOnly: true;
    };
  };
  /** BenchDamage: player needs to select bench Pokemon to receive damage */
  pendingBenchDamageSelection?: {
    /** Amount of damage to deal to each selected Pokemon */
    damageAmount: number;
    /** Which side's bench to target */
    targetSide: "player" | "opponent";
    /** Maximum number of bench Pokemon to select */
    maxTargets: number;
    /** Minimum number of bench Pokemon to select (default 1) */
    minTargets?: number;
    /** Optional: only show Pokemon matching defender type (for Chain Lightning) */
    matchDefenderType?: boolean;
    /** Optional: defender types for filtering (Chain Lightning) */
    defenderTypes?: EnergyType[];
  };
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Crea un nuevo evento de juego
 */
export function createGameEvent(
  message: string,
  type: GameEvent["type"] = "info"
): GameEvent {
  return {
    id: `event-${Date.now()}-${Math.random()}`,
    timestamp: Date.now(),
    message,
    type,
  };
}

/**
 * Busca una carta en el Base Set por nombre
 */
export function findCardByName(name: string): Card | undefined {
  return baseSetCards.find((card) => card.name === name);
}

/**
 * Mezcla un array usando el algoritmo Fisher-Yates
 */
export function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Resultado de robar una carta
 */
type DrawCardResult = {
  success: boolean;
  newDeck: GameCard[];
  newHand: GameCard[];
  drawnCard: GameCard | null;
  deckOut: boolean;
};

/**
 * Roba una carta del mazo y la agrega a la mano
 * @returns Resultado con el nuevo estado del mazo y mano, o deckOut si no hay cartas
 */
export function drawCard(deck: GameCard[], hand: GameCard[]): DrawCardResult {
  if (deck.length === 0) {
    return {
      success: false,
      newDeck: deck,
      newHand: hand,
      drawnCard: null,
      deckOut: true,
    };
  }

  const drawnCard = deck[0];
  const newDeck = deck.slice(1);
  // Las cartas nuevas se agregan al inicio de la mano (lado izquierdo)
  const newHand = [drawnCard, ...hand];

  return {
    success: true,
    newDeck,
    newHand,
    drawnCard,
    deckOut: false,
  };
}

// ============================================================================
// STATUS CONDITIONS
// ============================================================================

export function hasStatusCondition(
  pokemon: PokemonInPlay,
  status: StatusCondition
): boolean {
  return pokemon.statusConditions?.includes(status) ?? false;
}

/**
 * Exclusive status conditions: Asleep, Confused, Paralyzed replace each other.
 * Poisoned is independent and can coexist with any of them.
 */
const EXCLUSIVE_STATUS_CONDITIONS: StatusCondition[] = [
  StatusCondition.Asleep,
  StatusCondition.Confused,
  StatusCondition.Paralyzed,
];

export function applyStatusCondition(
  pokemon: PokemonInPlay,
  status: StatusCondition,
  turnNumber?: number
): PokemonInPlay {
  const currentStatuses = pokemon.statusConditions ?? [];

  if (currentStatuses.includes(status)) {
    return pokemon;
  }

  // Exclusive conditions: Asleep/Confused/Paralyzed replace each other
  let newStatuses: StatusCondition[];
  if (EXCLUSIVE_STATUS_CONDITIONS.includes(status)) {
    newStatuses = [
      ...currentStatuses.filter(s => !EXCLUSIVE_STATUS_CONDITIONS.includes(s)),
      status,
    ];
  } else {
    newStatuses = [...currentStatuses, status];
  }

  const updated: PokemonInPlay = {
    ...pokemon,
    statusConditions: newStatuses,
  };

  if (status === StatusCondition.Paralyzed && turnNumber !== undefined) {
    updated.paralyzedOnTurn = turnNumber;
  }

  // Clear paralyzedOnTurn if we're replacing paralysis with another exclusive condition
  if (status !== StatusCondition.Paralyzed && currentStatuses.includes(StatusCondition.Paralyzed)) {
    updated.paralyzedOnTurn = undefined;
  }

  return updated;
}

export function removeStatusCondition(
  pokemon: PokemonInPlay,
  status: StatusCondition
): PokemonInPlay {
  if (!pokemon.statusConditions?.includes(status)) {
    return pokemon;
  }

  const updated: PokemonInPlay = {
    ...pokemon,
    statusConditions: pokemon.statusConditions.filter((s) => s !== status),
  };

  if (status === StatusCondition.Paralyzed) {
    updated.paralyzedOnTurn = undefined;
  }

  return updated;
}

export function clearAllStatusConditions(pokemon: PokemonInPlay): PokemonInPlay {
  return {
    ...pokemon,
    statusConditions: [],
    paralyzedOnTurn: undefined,
  };
}

/**
 * Apply CannotAttack status (from attacks like Rhyhorn's Leer)
 * This prevents the Pokemon from attacking during its next turn
 */
export function applyCannotAttack(
  pokemon: PokemonInPlay,
  currentTurnNumber: number
): PokemonInPlay {
  return applyStatusCondition(pokemon, StatusCondition.CannotAttack, currentTurnNumber);
}

export function canPokemonAttack(pokemon: PokemonInPlay): boolean {
  if (hasStatusCondition(pokemon, StatusCondition.Asleep)) return false;
  if (hasStatusCondition(pokemon, StatusCondition.Paralyzed)) return false;
  if (hasStatusCondition(pokemon, StatusCondition.CannotAttack)) return false;
  return true;
}

export function canPokemonRetreat(pokemon: PokemonInPlay): boolean {
  if (hasStatusCondition(pokemon, StatusCondition.Asleep)) return false;
  if (hasStatusCondition(pokemon, StatusCondition.Paralyzed)) return false;
  return true;
}

// ============================================================================
// PROTECCIÓN (prevención de daño)
// ============================================================================

export function applyProtection(
  pokemon: PokemonInPlay,
  protectionType: ProtectionType,
  currentTurnNumber: number,
  threshold?: number
): PokemonInPlay {
  return {
    ...pokemon,
    protection: {
      type: protectionType,
      expiresAfterTurn: currentTurnNumber + 1,
      ...(threshold !== undefined && { threshold }),
    },
  };
}

export function isProtected(pokemon: PokemonInPlay): boolean {
  return !!pokemon.protection;
}

export function protectionBlocksDamage(pokemon: PokemonInPlay, damage?: number): boolean {
  if (!pokemon.protection) return false;
  // Threshold-based protection (e.g., Onix Harden): only blocks damage <= threshold
  if (pokemon.protection.threshold !== undefined && damage !== undefined) {
    return damage <= pokemon.protection.threshold;
  }
  // Full protection (no threshold): blocks all damage
  return true;
}

export function clearProtection(pokemon: PokemonInPlay): PokemonInPlay {
  if (!pokemon.protection) return pokemon;
  return {
    ...pokemon,
    protection: undefined,
  };
}

/**
 * Limpia estados al retirarse (todos excepto veneno) y protección
 */
export function clearStatusConditionsOnRetreat(pokemon: PokemonInPlay): PokemonInPlay {
  const keepPoisoned = hasStatusCondition(pokemon, StatusCondition.Poisoned);
  return {
    ...pokemon,
    statusConditions: keepPoisoned ? [StatusCondition.Poisoned] : [],
    paralyzedOnTurn: undefined,
    protection: undefined,
    // Clear all "next turn" attack effects when going to bench (per TCG rules)
    nextTurnBonusDamage: undefined,
    nextTurnDamageReduction: undefined,
    nextTurnEffectAppliedOnTurn: undefined,
    // Clear retreat prevention when going to bench
    retreatPrevented: undefined,
    retreatPreventedOnTurn: undefined,
  };
}

// ============================================================================
// RETREAT (RETIRADA)
// ============================================================================

/**
 * Verifica si un Pokémon puede retirarse
 * @param pokemon - El Pokémon activo que quiere retirarse
 * @param benchLength - Cantidad de Pokémon en la banca
 * @param retreatedThisTurn - Si ya se retiró este turno
 * @returns true si puede retirarse
 */
export function canRetreat(
  pokemon: PokemonInPlay,
  benchLength: number,
  retreatedThisTurn: boolean
): boolean {
  // No puede retirarse si ya lo hizo este turno
  if (retreatedThisTurn) return false;

  // No puede retirarse si no hay Pokémon en la banca
  if (benchLength === 0) return false;

  // No puede retirarse si está dormido o paralizado
  if (hasStatusCondition(pokemon, StatusCondition.Asleep)) return false;
  if (hasStatusCondition(pokemon, StatusCondition.Paralyzed)) return false;

  // No puede retirarse si la retirada fue bloqueada (Acid)
  if (pokemon.retreatPrevented) return false;

  return true;
}

/**
 * Returns how many energy units a single energy card provides.
 * Double Colorless Energy provides 2 colorless energy; all others provide 1.
 */
export function getEnergyValue(card: GameCard): number {
  // Buzzap energy provides 2 units of the chosen type
  if (card.buzzapSourceId) {
    return 2;
  }
  // Double Colorless Energy provides 2 colorless
  // Check by name first (most reliable)
  if (card.name === "Double Colorless Energy") {
    return 2;
  }
  // Fallback: any non-basic colorless energy provides 2
  if (isEnergyCard(card) && card.energyType === EnergyTypeEnum.Colorless && !card.isBasic) {
    return 2;
  }
  return 1;
}

/**
 * Returns the total energy units provided by an array of energy cards,
 * accounting for Double Colorless Energy.
 */
export function getTotalEnergyValue(cards: GameCard[]): number {
  return cards.reduce((sum, card) => sum + getEnergyValue(card), 0);
}

/**
 * Verifica si el Pokémon tiene suficiente energía para pagar el coste de retirada
 * @param pokemon - El Pokémon activo
 * @returns true si tiene suficiente energía
 */
export function hasEnoughEnergyToRetreat(pokemon: PokemonInPlay, bench?: PokemonInPlay[]): boolean {
  if (pokemon.pokemon.kind !== CardKind.Pokemon) return false;

  let retreatCost = pokemon.pokemon.retreatCost;
  if (bench) {
    retreatCost = Math.max(0, retreatCost - getRetreatCostReduction(bench));
  }

  // Si el coste es 0, siempre puede retirarse
  if (retreatCost === 0) return true;

  // Verificar que tiene suficientes energías adjuntas (DCE cuenta como 2)
  return getTotalEnergyValue(pokemon.attachedEnergy) >= retreatCost;
}

/**
 * Obtiene el coste de retirada de un Pokémon
 * @param pokemon - El Pokémon
 * @returns El coste de retirada (0-5)
 */
export function getRetreatCost(pokemon: PokemonInPlay, bench?: PokemonInPlay[]): number {
  if (pokemon.pokemon.kind !== CardKind.Pokemon) return 0;
  let cost = pokemon.pokemon.retreatCost;
  if (bench) {
    cost = Math.max(0, cost - getRetreatCostReduction(bench));
  }
  return cost;
}

/**
 * Ejecuta la retirada de un Pokémon
 * @param gameState - Estado actual del juego
 * @param energyIdsToDiscard - IDs de las energías a descartar para pagar el coste
 * @param benchIndex - Índice del Pokémon de la banca que será el nuevo activo
 * @returns Nuevo estado del juego
 */
export function executeRetreat(
  gameState: GameState,
  energyIdsToDiscard: string[],
  benchIndex: number
): GameState {
  const activePokemon = gameState.playerActivePokemon;
  const benchPokemon = gameState.playerBench[benchIndex];

  // Validaciones
  if (!activePokemon) {
    return {
      ...gameState,
      events: [...gameState.events, createGameEvent("No hay Pokémon activo", "info")],
    };
  }

  if (!benchPokemon) {
    return {
      ...gameState,
      events: [...gameState.events, createGameEvent("No hay Pokémon en esa posición de la banca", "info")],
    };
  }

  if (!canRetreat(activePokemon, gameState.playerBench.length, gameState.retreatedThisTurn)) {
    return {
      ...gameState,
      events: [...gameState.events, createGameEvent("No puedes retirarte ahora", "info")],
    };
  }

  const retreatCost = getRetreatCost(activePokemon, gameState.playerBench);

  // Verificar que se están descartando la cantidad correcta de energías (DCE cuenta como 2)
  const discardCards = activePokemon.attachedEnergy.filter(e => energyIdsToDiscard.includes(e.id));
  const discardValue = getTotalEnergyValue(discardCards);
  if (discardValue < retreatCost) {
    return {
      ...gameState,
      events: [...gameState.events, createGameEvent(`Debes descartar energía equivalente a ${retreatCost}`, "info")],
    };
  }

  // Verificar que todas las energías a descartar existen en el Pokémon
  const energyIds = activePokemon.attachedEnergy.map(e => e.id);
  for (const id of energyIdsToDiscard) {
    if (!energyIds.includes(id)) {
      return {
        ...gameState,
        events: [...gameState.events, createGameEvent("Energía inválida seleccionada", "info")],
      };
    }
  }

  // Separar las energías: las que se descartan y las que se quedan
  const energiesToDiscard = activePokemon.attachedEnergy.filter(e => energyIdsToDiscard.includes(e.id));
  const remainingEnergy = activePokemon.attachedEnergy.filter(e => !energyIdsToDiscard.includes(e.id));

  // Limpiar estados especiales del Pokémon que se retira (excepto veneno)
  const retreatingPokemon = clearStatusConditionsOnRetreat(activePokemon);

  // Crear el nuevo Pokémon en banca (el que estaba activo)
  // Clear Conversion effects (modifiedWeakness/modifiedResistance) when leaving active
  const pokemonGoingToBench: PokemonInPlay = {
    ...retreatingPokemon,
    attachedEnergy: remainingEnergy,
    modifiedWeakness: undefined,
    modifiedResistance: undefined,
  };

  // Crear nueva banca: remover el que pasa a activo y agregar el que se retira
  const newBench = [...gameState.playerBench];
  newBench.splice(benchIndex, 1); // Remover el que pasa a activo
  newBench.push(pokemonGoingToBench); // Agregar el que se retira al final

  // Crear eventos
  const events = [
    ...gameState.events,
    createGameEvent(
      `${activePokemon.pokemon.name} se retiró${retreatCost > 0 ? ` (descartó ${retreatCost} energía${retreatCost > 1 ? "s" : ""})` : ""}`,
      "action"
    ),
    createGameEvent(
      `${benchPokemon.pokemon.name} es ahora tu Pokémon activo`,
      "info"
    ),
  ];

  return {
    ...gameState,
    playerActivePokemon: benchPokemon,
    playerBench: newBench,
    playerDiscard: [...gameState.playerDiscard, ...energiesToDiscard],
    retreatedThisTurn: true,
    events,
  };
}

/**
 * Applies a ForceSwitch: opponent's active goes to bench, selected bench Pokemon becomes active.
 * Called after executeAttack when pendingForceSwitch is true.
 * Similar to Gust of Wind but triggered by an attack effect.
 */
export function applyForceSwitch(gameState: GameState, benchIndex: number): GameState {
  const opponentActive = gameState.opponentActivePokemon;
  const targetBench = gameState.opponentBench[benchIndex];

  if (!opponentActive || !targetBench) {
    return {
      ...gameState,
      pendingForceSwitch: undefined,
      events: [...gameState.events, createGameEvent("No se pudo realizar el cambio forzado", "info")],
    };
  }

  // Clear status/effects from the Pokemon going to bench
  const goingToBench: PokemonInPlay = {
    ...clearStatusConditionsOnRetreat(opponentActive),
    modifiedWeakness: undefined,
    modifiedResistance: undefined,
  };

  const newBench = [...gameState.opponentBench];
  newBench.splice(benchIndex, 1);
  newBench.push(goingToBench);

  const events = [
    ...gameState.events,
    createGameEvent(`${opponentActive.pokemon.name} fue enviado a la banca del rival`, "action"),
    createGameEvent(`${targetBench.pokemon.name} es ahora el Pokémon activo del rival`, "info"),
  ];

  const newState: GameState = {
    ...gameState,
    opponentActivePokemon: targetBench,
    opponentBench: newBench,
    pendingForceSwitch: undefined,
    events,
  };

  // Now end the turn (attack is complete)
  return endTurn(newState);
}

/**
 * Applies a SelfSwitch: attacker switches with own bench Pokemon.
 * Called after executeAttack when pendingSelfSwitch is true.
 * Used by Exeggutor's Teleport.
 */
export function applySelfSwitch(gameState: GameState, benchIndex: number): GameState {
  const playerActive = gameState.playerActivePokemon;
  const targetBench = gameState.playerBench[benchIndex];

  if (!playerActive || !targetBench) {
    return {
      ...gameState,
      pendingSelfSwitch: undefined,
      events: [...gameState.events, createGameEvent("No se pudo realizar el cambio", "info")],
    };
  }

  // Clear effects when going to bench (like retreat)
  const goingToBench: PokemonInPlay = {
    ...clearStatusConditionsOnRetreat(playerActive),
    modifiedWeakness: undefined,
    modifiedResistance: undefined,
  };

  const newBench = [...gameState.playerBench];
  newBench.splice(benchIndex, 1);
  newBench.push(goingToBench);

  const events = [
    ...gameState.events,
    createGameEvent(`${playerActive.pokemon.name} se cambió con ${targetBench.pokemon.name}`, "action"),
  ];

  const newState: GameState = {
    ...gameState,
    playerActivePokemon: targetBench,
    playerBench: newBench,
    pendingSelfSwitch: undefined,
    events,
  };

  // Now end the turn (attack is complete)
  return endTurn(newState);
}

/**
 * Skips a pending ForceSwitch or SelfSwitch (when there are no valid targets)
 * and ends the turn normally.
 */
export function skipPendingSwitch(gameState: GameState): GameState {
  return endTurn({
    ...gameState,
    pendingForceSwitch: undefined,
    pendingSelfSwitch: undefined,
  });
}

/**
 * Executes a DeckSearch: player searches deck for a Basic Pokemon matching the filter.
 * Called after executeAttack when pendingDeckSearch is set.
 * Used by "Call for Family" attacks (Bellsprout, Oddish, Nidorina, Marowak).
 *
 * @param gameState - Current game state
 * @param selectedCardId - ID of the selected Pokemon card (null to skip selection)
 * @returns New game state with Pokemon added to bench and deck shuffled
 */
export function executeDeckSearch(
  gameState: GameState,
  selectedCardId: string | null
): GameState {
  const filter = gameState.pendingDeckSearch?.filter;

  if (!filter) {
    return {
      ...gameState,
      pendingDeckSearch: undefined,
      events: [...gameState.events, createGameEvent("No hay búsqueda pendiente", "info")],
    };
  }

  // If no card selected, just shuffle and end turn
  if (!selectedCardId) {
    const shuffledDeck = shuffle([...gameState.playerDeck]);
    const events = [
      ...gameState.events,
      createGameEvent("No seleccionaste ningún Pokémon. Se mezcló el mazo", "info"),
    ];

    const newState: GameState = {
      ...gameState,
      playerDeck: shuffledDeck,
      pendingDeckSearch: undefined,
      events,
    };

    return endTurn(newState);
  }

  // Find the selected card in deck
  const selectedCard = gameState.playerDeck.find(c => c.id === selectedCardId);

  if (!selectedCard) {
    return {
      ...gameState,
      pendingDeckSearch: undefined,
      events: [...gameState.events, createGameEvent("Carta no encontrada en el mazo", "info")],
    };
  }

  // Validate card matches filter
  if (selectedCard.kind !== CardKind.Pokemon) {
    return {
      ...gameState,
      pendingDeckSearch: undefined,
      events: [...gameState.events, createGameEvent("La carta seleccionada no es un Pokémon", "info")],
    };
  }

  if (selectedCard.stage !== PokemonStage.Basic) {
    return {
      ...gameState,
      pendingDeckSearch: undefined,
      events: [...gameState.events, createGameEvent("Solo puedes seleccionar Pokémon Básicos", "info")],
    };
  }

  // Check name filter
  if (filter.names && filter.names.length > 0) {
    if (!filter.names.includes(selectedCard.name)) {
      return {
        ...gameState,
        pendingDeckSearch: undefined,
        events: [...gameState.events, createGameEvent(`Solo puedes seleccionar: ${filter.names.join(" o ")}`, "info")],
      };
    }
  }

  // Check type filter
  if (filter.type) {
    if (!selectedCard.types.includes(filter.type)) {
      return {
        ...gameState,
        pendingDeckSearch: undefined,
        events: [...gameState.events, createGameEvent(`Solo puedes seleccionar Pokémon de tipo ${filter.type}`, "info")],
      };
    }
  }

  // Check if bench is full
  const benchCount = gameState.playerBench.filter(p => p !== null).length;
  if (benchCount >= 5) {
    return {
      ...gameState,
      pendingDeckSearch: undefined,
      events: [...gameState.events, createGameEvent("Tu banca está llena", "info")],
    };
  }

  // Remove card from deck
  const newDeck = gameState.playerDeck.filter(c => c.id !== selectedCardId);

  // Shuffle deck
  const shuffledDeck = shuffle(newDeck);

  // Create PokemonInPlay
  const newPokemonInPlay: PokemonInPlay = {
    pokemon: selectedCard,
    attachedEnergy: [],
    attachedTrainers: [],
    previousEvolutions: [],
    statusConditions: [],
    currentDamage: 0,
    playedOnTurn: gameState.turnNumber,
  };

  // Add to bench
  const newBench = [...gameState.playerBench, newPokemonInPlay];

  const events = [
    ...gameState.events,
    createGameEvent(`Encontraste ${selectedCard.name} y lo colocaste en tu banca`, "action"),
    createGameEvent("Se mezcló el mazo", "info"),
  ];

  const newState: GameState = {
    ...gameState,
    playerDeck: shuffledDeck,
    playerBench: newBench,
    pendingDeckSearch: undefined,
    events,
  };

  // End turn after deck search completes
  return endTurn(newState);
}

/**
 * Execute bench damage on selected Pokemon
 * @param gameState Current game state with pendingBenchDamageSelection
 * @param selectedPokemonIds Array of Pokemon IDs to receive damage (empty array = skip/cancel)
 * @returns New game state with damage applied and pending cleared
 */
export function executeBenchDamage(
  gameState: GameState,
  selectedPokemonIds: string[]
): GameState {
  const pending = gameState.pendingBenchDamageSelection;

  if (!pending) {
    return {
      ...gameState,
      events: [...gameState.events, createGameEvent("No hay daño de banca pendiente", "info")],
    };
  }

  const { damageAmount, targetSide, maxTargets, minTargets = 1 } = pending;

  // If no selection (cancel), just clear pending and end turn
  if (selectedPokemonIds.length === 0) {
    const events = [
      ...gameState.events,
      createGameEvent("No seleccionaste ningún Pokémon", "info"),
    ];

    const newState: GameState = {
      ...gameState,
      pendingBenchDamageSelection: undefined,
      events,
    };

    return endTurn(newState);
  }

  // Validate selection count
  if (selectedPokemonIds.length < minTargets) {
    return {
      ...gameState,
      events: [...gameState.events, createGameEvent(`Debes seleccionar al menos ${minTargets} Pokémon`, "info")],
    };
  }

  if (selectedPokemonIds.length > maxTargets) {
    return {
      ...gameState,
      events: [...gameState.events, createGameEvent(`No puedes seleccionar más de ${maxTargets} Pokémon`, "info")],
    };
  }

  // Apply damage to selected Pokemon
  const events = [...gameState.events];
  let newPlayerBench = [...gameState.playerBench];
  let newOpponentBench = [...gameState.opponentBench];

  if (targetSide === "opponent") {
    newOpponentBench = newOpponentBench.map((p) => {
      if (!p || !selectedPokemonIds.includes(p.pokemon.id)) return p;

      const newDamage = (p.currentDamage || 0) + damageAmount;
      events.push(
        createGameEvent(
          `${p.pokemon.name} del rival recibió ${damageAmount} de daño`,
          "action"
        )
      );

      return {
        ...p,
        currentDamage: newDamage,
      };
    });
  } else {
    newPlayerBench = newPlayerBench.map((p) => {
      if (!p || !selectedPokemonIds.includes(p.pokemon.id)) return p;

      const newDamage = (p.currentDamage || 0) + damageAmount;
      events.push(
        createGameEvent(
          `Tu ${p.pokemon.name} recibió ${damageAmount} de daño`,
          "action"
        )
      );

      return {
        ...p,
        currentDamage: newDamage,
      };
    });
  }

  const newState: GameState = {
    ...gameState,
    playerBench: newPlayerBench,
    opponentBench: newOpponentBench,
    pendingBenchDamageSelection: undefined,
    events,
  };

  // End turn after damage is applied
  return endTurn(newState);
}

/**
 * Construye un mazo completo desde un DeckEntry[]
 */
export function buildDeckFromEntries(entries: DeckEntry[]): GameCard[] {
  const deck: GameCard[] = [];

  for (const entry of entries) {
    const card = baseSetCards.find((c) => c.number === entry.cardNumber);
    if (!card) {
      console.warn(`Carta #${entry.cardNumber} no encontrada en el catálogo`);
      continue;
    }

    // Crear múltiples copias de la carta
    for (let i = 0; i < entry.quantity; i++) {
      deck.push({
        ...card,
        id: `${card.name}-${i}-${Date.now()}-${Math.random()}`,
      });
    }
  }

  return deck;
}

/**
 * Inicializa el estado del juego desde un Deck seleccionado (sin preparar)
 */
export function initializeGame(deck: Deck): GameState {
  // Construir y mezclar el mazo del jugador
  const fullDeck = buildDeckFromEntries(deck.cards);
  const shuffledDeck = shuffle(fullDeck);

  // Seleccionar un mazo diferente para el rival
  const availableDecks = decks.filter(d => d.id !== deck.id && d.id !== "test");
  const opponentDeck = availableDecks.length > 0
    ? availableDecks[Math.floor(Math.random() * availableDecks.length)]
    : deck; // Fallback al mismo deck si no hay otros disponibles
  const opponentFullDeck = buildDeckFromEntries(opponentDeck.cards);
  const opponentShuffledDeck = shuffle(opponentFullDeck);

  return {
    playerDeck: shuffledDeck,
    playerHand: [],
    playerPrizes: [],
    playerDiscard: [],
    playerActivePokemon: null,
    playerBench: [],
    opponentDeck: opponentShuffledDeck,
    opponentHand: [],
    opponentPrizes: [],
    opponentDiscard: [],
    opponentActivePokemon: null,
    opponentBench: [],
    selectedDeckId: deck.id,
    turnNumber: 0,
    startingPlayer: null,
    isPlayerTurn: false,
    gameStarted: false,
    gamePhase: GamePhase.Mulligan,
    playerReady: false,
    opponentReady: false,
    energyAttachedThisTurn: false,
    retreatedThisTurn: false,
    playerCanTakePrize: false,
    opponentCanTakePrize: false,
    playerNeedsToPromote: false,
    opponentNeedsToPromote: false,
    activeModifiers: [],
    gameResult: null,
    events: [createGameEvent("Partida inicializada", "system")],
  };
}

/**
 * Inicializa el estado del juego para multijugador con ambos mazos especificados
 */
export function initializeMultiplayerGame(player1Deck: Deck, player2Deck: Deck): GameState {
  // Construir y mezclar el mazo del jugador 1
  const player1FullDeck = buildDeckFromEntries(player1Deck.cards);
  const player1ShuffledDeck = shuffle(player1FullDeck);

  // Construir y mezclar el mazo del jugador 2 (será el "opponent" desde la perspectiva del estado)
  const player2FullDeck = buildDeckFromEntries(player2Deck.cards);
  const player2ShuffledDeck = shuffle(player2FullDeck);

  return {
    playerDeck: player1ShuffledDeck,
    playerHand: [],
    playerPrizes: [],
    playerDiscard: [],
    playerActivePokemon: null,
    playerBench: [],
    opponentDeck: player2ShuffledDeck,
    opponentHand: [],
    opponentPrizes: [],
    opponentDiscard: [],
    opponentActivePokemon: null,
    opponentBench: [],
    selectedDeckId: player1Deck.id,
    turnNumber: 0,
    startingPlayer: null,
    isPlayerTurn: false,
    gameStarted: false,
    gamePhase: GamePhase.Mulligan,
    playerReady: false,
    opponentReady: false,
    energyAttachedThisTurn: false,
    retreatedThisTurn: false,
    playerCanTakePrize: false,
    opponentCanTakePrize: false,
    playerNeedsToPromote: false,
    opponentNeedsToPromote: false,
    activeModifiers: [],
    gameResult: null,
    events: [createGameEvent("Partida multijugador inicializada", "system")],
  };
}

/**
 * Prepara el juego: reparte cartas y premios (sin coinflip, eso ocurre después del setup)
 */
export function startGame(gameState: GameState): GameState {
  // Crear copias de los mazos para no mutar los originales
  const playerDeckCopy = [...gameState.playerDeck];
  const opponentDeckCopy = [...gameState.opponentDeck];

  // Mezclar nuevamente antes de repartir
  const shuffledPlayerDeck = shuffle(playerDeckCopy);
  const shuffledOpponentDeck = shuffle(opponentDeckCopy);

  // Repartir: 7 cartas a la mano, 6 a premios, el resto queda en el mazo
  const playerHand = shuffledPlayerDeck.slice(0, 7);
  const playerPrizes = shuffledPlayerDeck.slice(7, 13);
  const playerDeck = shuffledPlayerDeck.slice(13);

  const opponentHand = shuffledOpponentDeck.slice(0, 7);
  const opponentPrizes = shuffledOpponentDeck.slice(7, 13);
  const opponentDeck = shuffledOpponentDeck.slice(13);

  // Crear eventos
  const newEvents = [
    ...gameState.events,
    createGameEvent("Tú robas 7 cartas y colocas 6 premios", "action"),
    createGameEvent("Rival roba 7 cartas y coloca 6 premios", "action"),
  ];

  return {
    ...gameState,
    playerDeck,
    playerHand,
    playerPrizes,
    playerActivePokemon: null,
    playerBench: [],
    opponentDeck,
    opponentHand,
    opponentPrizes,
    opponentActivePokemon: null,
    opponentBench: [],
    turnNumber: 0,
    startingPlayer: null,
    isPlayerTurn: false,
    gameStarted: true,
    gamePhase: GamePhase.Mulligan, // Inicia en mulligan para verificar pokémon básicos
    playerReady: false,
    opponentReady: false,
    energyAttachedThisTurn: false,
    retreatedThisTurn: false,
    playerCanTakePrize: false,
    opponentCanTakePrize: false,
    playerNeedsToPromote: false,
    opponentNeedsToPromote: false,
    activeModifiers: [],
    gameResult: null,
    events: newEvents,
  };
}

/**
 * Verifica si hay al menos un Pokémon básico en la mano
 */
export function hasBasicPokemon(hand: GameCard[]): boolean {
  return hand.some((card) => {
    if (card.kind !== CardKind.Pokemon) return false;
    return card.stage === PokemonStage.Basic;
  });
}

/**
 * Realiza un mulligan: devuelve la mano al mazo, mezcla y roba 7 nuevas cartas
 */
export function doMulligan(gameState: GameState, isPlayer: boolean): GameState {
  const hand = isPlayer ? gameState.playerHand : gameState.opponentHand;
  const deck = isPlayer ? gameState.playerDeck : gameState.opponentDeck;

  // Combinar mano con mazo
  const combined = [...hand, ...deck];

  // Mezclar
  const shuffled = shuffle(combined);

  // Robar 7 nuevas cartas
  const newHand = shuffled.slice(0, 7);
  const newDeck = shuffled.slice(7);

  const playerName = isPlayer ? "Tú" : "Rival";
  const newEvent = createGameEvent(`${playerName} ${isPlayer ? "hiciste" : "hizo"} mulligan`, "action");

  if (isPlayer) {
    return {
      ...gameState,
      playerHand: newHand,
      playerDeck: newDeck,
      events: [...gameState.events, newEvent],
    };
  } else {
    return {
      ...gameState,
      opponentHand: newHand,
      opponentDeck: newDeck,
      events: [...gameState.events, newEvent],
    };
  }
}

/**
 * Avanza a la fase de SETUP cuando el jugador tiene pokémon básicos
 */
export function advanceToSetup(gameState: GameState): GameState {
  return {
    ...gameState,
    gamePhase: GamePhase.Setup,
    events: [
      ...gameState.events,
      createGameEvent("Fase de preparación: coloca tus Pokémon básicos", "system"),
    ],
  };
}

/**
 * Marca un jugador como listo.
 * Cuando ambos están listos, NO avanza automáticamente a PLAYING.
 * El caller debe lanzar la moneda primero y luego llamar a startPlayingPhase().
 */
export function setPlayerReady(gameState: GameState, isPlayer: boolean): GameState {
  const playerName = isPlayer ? "Tú" : "Rival";
  const newEvent = createGameEvent(`${playerName} ${isPlayer ? "estás" : "está"} listo`, "info");

  return {
    ...gameState,
    playerReady: isPlayer ? true : gameState.playerReady,
    opponentReady: !isPlayer ? true : gameState.opponentReady,
    events: [...gameState.events, newEvent],
  };
}

/**
 * Inicia la fase de juego después del coin flip.
 * @param coinFlipResult - Resultado de la moneda para determinar quién comienza
 */
export function startPlayingPhase(gameState: GameState, coinFlipResult: "heads" | "tails"): GameState {
  const startingPlayer = coinFlipResult === "heads" ? "player" : "opponent";

  return {
    ...gameState,
    gamePhase: GamePhase.Playing,
    startingPlayer,
    isPlayerTurn: startingPlayer === "player",
    turnNumber: 1,
    energyAttachedThisTurn: false,
    events: [
      ...gameState.events,
      createGameEvent("¡Comienza la partida!", "system"),
      createGameEvent(
        `Moneda lanzada: ${coinFlipResult === "heads" ? "[coin:heads]" : "[coin:tails]"}`,
        "info"
      ),
      createGameEvent(
        `${startingPlayer === "player" ? "Tú empiezas" : "Rival empieza"} el juego`,
        "info"
      ),
      createGameEvent("¡Comienza el turno 1!", "system"),
      createGameEvent(
        `Turno de ${startingPlayer === "player" ? "Jugador" : "Rival"}`,
        "info"
      ),
    ],
  };
}

function processStatusEffectsForPokemon(
  pokemon: PokemonInPlay,
  currentTurn: number
): { pokemon: PokemonInPlay; events: GameEvent[]; isKnockedOut: boolean } {
  let updated = { ...pokemon };
  const events: GameEvent[] = [];
  let isKnockedOut = false;

  // Veneno: 10 de daño (o 20 si es Tóxico)
  if (hasStatusCondition(updated, StatusCondition.Poisoned)) {
    const poisonDmg = updated.poisonDamage ?? 10;
    const newDamage = (updated.currentDamage ?? 0) + poisonDmg;
    updated.currentDamage = newDamage;
    events.push(createGameEvent(`${updated.pokemon.name} recibe ${poisonDmg} de daño por veneno`, "action"));

    if (updated.pokemon.kind === CardKind.Pokemon && newDamage >= updated.pokemon.hp) {
      isKnockedOut = true;
      events.push(createGameEvent(`¡${updated.pokemon.name} fue noqueado por veneno!`, "action"));
    }
  }

  // Dormido: tirar moneda, cara = despertar
  if (hasStatusCondition(updated, StatusCondition.Asleep)) {
    const coinFlip = Math.random() < 0.5 ? "heads" : "tails";
    if (coinFlip === "heads") {
      updated = removeStatusCondition(updated, StatusCondition.Asleep);
      events.push(createGameEvent(`${updated.pokemon.name} despertó (moneda: [coin:heads])`, "info"));
    } else {
      events.push(createGameEvent(`${updated.pokemon.name} sigue dormido (moneda: [coin:tails])`, "info"));
    }
  }

  // Parálisis: se cura al final del siguiente turno del dueño
  if (hasStatusCondition(updated, StatusCondition.Paralyzed) && updated.paralyzedOnTurn !== undefined) {
    // Si fue paralizado en un turno anterior (no este), se cura
    if (updated.paralyzedOnTurn < currentTurn) {
      updated = removeStatusCondition(updated, StatusCondition.Paralyzed);
      events.push(createGameEvent(`${updated.pokemon.name} ya no está paralizado`, "info"));
    }
  }

  // CannotAttack: se limpia automáticamente al final del turno del defensor
  // (después de aplicar el ataque que lo causó, el efecto dura un turno del oponente)
  if (hasStatusCondition(updated, StatusCondition.CannotAttack)) {
    updated = removeStatusCondition(updated, StatusCondition.CannotAttack);
    events.push(createGameEvent(`${updated.pokemon.name} ya puede atacar`, "info"));
  }

  return { pokemon: updated, events, isKnockedOut };
}

export function endTurn(gameState: GameState, skipOpponentPromotion: boolean = false): GameState {
  // Block turn end if there's a pending switch, deck search, or bench damage selection
  if (gameState.pendingForceSwitch || gameState.pendingSelfSwitch || gameState.pendingDeckSearch || gameState.pendingBenchDamageSelection) {
    return gameState;
  }

  const currentTurn = gameState.turnNumber;
  const isPlayerEndingTurn = gameState.isPlayerTurn;
  const newIsPlayerTurn = !isPlayerEndingTurn;
  const newTurnNumber = currentTurn + 1;
  const events: GameEvent[] = [...gameState.events];

  let updatedState = { ...gameState };

  // Variables para trackear KO y premios
  let gameResult: GameResult = null;
  let gamePhase: GamePhase = gameState.gamePhase;
  let playerCanTakePrize = gameState.playerCanTakePrize;
  let opponentCanTakePrize = gameState.opponentCanTakePrize;

  // =====================================================================
  // FASE "ENTRE TURNOS": Procesar efectos de estado para AMBOS Pokémon
  // En Pokemon TCG, el veneno se aplica "entre turnos" a TODOS los Pokemon envenenados
  // =====================================================================

  // Función helper para manejar KO
  const handleKnockout = (
    knockedOut: PokemonInPlay,
    isPlayerPokemon: boolean
  ) => {
    // Mover al descarte
    if (isPlayerPokemon) {
      updatedState.playerDiscard = [
        ...updatedState.playerDiscard,
        knockedOut.pokemon,
        ...knockedOut.attachedEnergy,
        ...(knockedOut.attachedTrainers || []),
        ...(knockedOut.previousEvolutions || []),
      ];

      // El oponente puede tomar premio
      if (updatedState.opponentPrizes.length > 0) {
        opponentCanTakePrize = true;
        events.push(createGameEvent("El rival puede tomar un premio", "action"));
      }

      // Promover de banca — el jugador debe elegir
      const hasPlayerBench = updatedState.playerBench.some(p => p != null);
      if (hasPlayerBench) {
        updatedState.playerActivePokemon = null;
        updatedState.playerNeedsToPromote = true;
        events.push(
          createGameEvent("Debes elegir un Pokémon de tu banca para continuar", "info")
        );
      } else {
        updatedState.playerActivePokemon = null;
        gameResult = "defeat";
        gamePhase = GamePhase.GameOver;
        events.push(createGameEvent("¡Derrota! No tienes más Pokémon", "system"));
        events.push(createGameEvent("Ya puedes salir de la mesa", "info"));
      }
    } else {
      updatedState.opponentDiscard = [
        ...updatedState.opponentDiscard,
        knockedOut.pokemon,
        ...knockedOut.attachedEnergy,
        ...(knockedOut.attachedTrainers || []),
        ...(knockedOut.previousEvolutions || []),
      ];

      // El jugador puede tomar premio
      if (updatedState.playerPrizes.length > 0) {
        playerCanTakePrize = true;
        events.push(createGameEvent("¡Puedes tomar un premio!", "action"));
      }

      // Promover de banca
      const opponentPromoteIndex = updatedState.opponentBench.findIndex(p => p != null);
      if (opponentPromoteIndex !== -1) {
        if (skipOpponentPromotion) {
          updatedState.opponentActivePokemon = null;
          updatedState.opponentNeedsToPromote = true;
          events.push(
            createGameEvent("Debes elegir un Pokémon de tu banca para continuar", "info")
          );
        } else {
          const promoted = updatedState.opponentBench[opponentPromoteIndex]!;
          updatedState.opponentBench.splice(opponentPromoteIndex, 1);
          updatedState.opponentActivePokemon = promoted;
          events.push(
            createGameEvent(`${promoted.pokemon.name} pasa a ser el Pokémon activo del rival`, "info")
          );
        }
      } else {
        updatedState.opponentActivePokemon = null;
        gameResult = "victory";
        gamePhase = GamePhase.GameOver;
        events.push(createGameEvent("¡Victoria! El rival no tiene más Pokémon", "system"));
        events.push(createGameEvent("Ya puedes salir de la mesa", "info"));
      }
    }
  };

  // =====================================================================
  // POKEMON CHECKUP — entre turnos, aplica a AMBOS Pokémon activos
  // Reglas TCG: veneno, sueño y parálisis se chequean para ambos jugadores
  // =====================================================================

  // 1) Pokémon del jugador que TERMINA su turno
  const ownPokemon = isPlayerEndingTurn
    ? updatedState.playerActivePokemon
    : updatedState.opponentActivePokemon;

  if (ownPokemon && gameResult === null) {
    const result = processStatusEffectsForPokemon(ownPokemon, currentTurn);
    events.push(...result.events);

    if (result.isKnockedOut) {
      handleKnockout(result.pokemon, isPlayerEndingTurn);
    } else {
      if (isPlayerEndingTurn) {
        updatedState.playerActivePokemon = result.pokemon;
      } else {
        updatedState.opponentActivePokemon = result.pokemon;
      }
    }
  }

  // 2) Pokémon del OPONENTE (el que no termina su turno)
  const otherPokemon = isPlayerEndingTurn
    ? updatedState.opponentActivePokemon
    : updatedState.playerActivePokemon;

  if (otherPokemon && gameResult === null) {
    const result = processStatusEffectsForPokemon(otherPokemon, currentTurn);
    events.push(...result.events);

    if (result.isKnockedOut) {
      handleKnockout(result.pokemon, !isPlayerEndingTurn);
    } else {
      if (isPlayerEndingTurn) {
        updatedState.opponentActivePokemon = result.pokemon;
      } else {
        updatedState.playerActivePokemon = result.pokemon;
      }
    }
  }

  // Si el juego terminó, no continuar con el siguiente turno
  if (gameResult !== null) {
    return {
      ...updatedState,
      gamePhase,
      gameResult,
      playerCanTakePrize,
      opponentCanTakePrize,
      events,
    };
  }

  // Si alguien puede tomar premio o promover, no avanzar el turno aún
  if (playerCanTakePrize || opponentCanTakePrize || updatedState.playerNeedsToPromote) {
    return {
      ...updatedState,
      playerCanTakePrize,
      opponentCanTakePrize,
      events,
    };
  }

  // =====================================================================
  // EXPIRAR PROTECCIÓN
  // =====================================================================
  const expireProtection = (pokemon: PokemonInPlay | null): PokemonInPlay | null => {
    if (!pokemon?.protection) return pokemon;
    if (newTurnNumber > pokemon.protection.expiresAfterTurn) {
      events.push(
        createGameEvent(
          `La protección de ${pokemon.pokemon.name} expiró`,
          "info"
        )
      );
      return clearProtection(pokemon);
    }
    return pokemon;
  };

  updatedState.playerActivePokemon = expireProtection(updatedState.playerActivePokemon);
  updatedState.opponentActivePokemon = expireProtection(updatedState.opponentActivePokemon);

  // =====================================================================
  // EXPIRAR RETREAT PREVENTION (Acid)
  // Retreat prevention applied on turn T expires when the affected Pokemon's
  // next turn ends (i.e., when newTurnNumber > T + 1)
  // =====================================================================
  const expireRetreatPrevention = (pokemon: PokemonInPlay | null): PokemonInPlay | null => {
    if (!pokemon?.retreatPrevented || pokemon.retreatPreventedOnTurn == null) return pokemon;
    if (newTurnNumber > pokemon.retreatPreventedOnTurn + 1) {
      events.push(
        createGameEvent(
          `${pokemon.pokemon.name} ya puede retirarse`,
          "info"
        )
      );
      return { ...pokemon, retreatPrevented: undefined, retreatPreventedOnTurn: undefined };
    }
    return pokemon;
  };

  updatedState.playerActivePokemon = expireRetreatPrevention(updatedState.playerActivePokemon);
  updatedState.opponentActivePokemon = expireRetreatPrevention(updatedState.opponentActivePokemon);

  // =====================================================================
  // EXPIRAR MODIFIERS (PlusPower, Defender, etc.)
  // =====================================================================
  const expiredModifiers = updatedState.activeModifiers.filter(
    (m) => m.expiresAfterTurn <= currentTurn
  );
  const remainingModifiers = updatedState.activeModifiers.filter(
    (m) => m.expiresAfterTurn > currentTurn
  );

  // Move expired modifier cards to the appropriate discard pile
  for (const mod of expiredModifiers) {
    if (mod.playerId === "player") {
      updatedState.playerDiscard = [...updatedState.playerDiscard, mod.card];
    } else {
      updatedState.opponentDiscard = [...updatedState.opponentDiscard, mod.card];
    }
    events.push(
      createGameEvent(
        `El efecto de ${mod.card.name} expiró`,
        "info"
      )
    );
  }
  updatedState.activeModifiers = remainingModifiers;

  // =====================================================================
  // EXPIRE NEXT-TURN ATTACK EFFECTS (Swords Dance, Minimize, etc.)
  // Effects applied on turn T expire when turnNumber reaches T+2
  // =====================================================================
  const clearExpiredNextTurnEffects = (pokemon: PokemonInPlay | null): PokemonInPlay | null => {
    if (!pokemon) return pokemon;
    if (pokemon.nextTurnEffectAppliedOnTurn == null) return pokemon;
    // Effect was applied on turn T. It should be available during turn T+1 (opponent's turn).
    // If we reach T+2 without it being consumed, it expires.
    if (newTurnNumber > pokemon.nextTurnEffectAppliedOnTurn + 1) {
      const hadBonus = pokemon.nextTurnBonusDamage;
      const hadReduction = pokemon.nextTurnDamageReduction;
      if (hadBonus || hadReduction) {
        events.push(
          createGameEvent(
            `El efecto temporal de ${pokemon.pokemon.name} expiró`,
            "info"
          )
        );
      }
      return {
        ...pokemon,
        nextTurnBonusDamage: undefined,
        nextTurnDamageReduction: undefined,
        nextTurnEffectAppliedOnTurn: undefined,
      };
    }
    return pokemon;
  };

  updatedState.playerActivePokemon = clearExpiredNextTurnEffects(updatedState.playerActivePokemon);
  updatedState.opponentActivePokemon = clearExpiredNextTurnEffects(updatedState.opponentActivePokemon);

  // =====================================================================
  // CLEAR ENERGY BURN (energyConversionType resets at end of turn)
  // CLEAR SHIFT (shiftedType resets at end of turn)
  // =====================================================================
  if (updatedState.playerActivePokemon?.shiftedType) {
    events.push(createGameEvent(`Efecto de Shift terminado — ${updatedState.playerActivePokemon.pokemon.name} vuelve a su tipo original`, "info"));
  }
  if (updatedState.opponentActivePokemon?.shiftedType) {
    events.push(createGameEvent(`Efecto de Shift terminado — ${updatedState.opponentActivePokemon.pokemon.name} vuelve a su tipo original`, "info"));
  }
  if (updatedState.playerActivePokemon?.energyConversionType || updatedState.playerActivePokemon?.shiftedType) {
    updatedState.playerActivePokemon = {
      ...updatedState.playerActivePokemon,
      energyConversionType: undefined,
      shiftedType: undefined,
    };
  }
  if (updatedState.opponentActivePokemon?.energyConversionType || updatedState.opponentActivePokemon?.shiftedType) {
    updatedState.opponentActivePokemon = {
      ...updatedState.opponentActivePokemon,
      energyConversionType: undefined,
      shiftedType: undefined,
    };
  }
  // Clear shiftedType from bench Pokemon as well
  updatedState.playerBench = updatedState.playerBench.map(p =>
    p && p.shiftedType ? { ...p, shiftedType: undefined } : p
  );
  updatedState.opponentBench = updatedState.opponentBench.map(p =>
    p && p.shiftedType ? { ...p, shiftedType: undefined } : p
  );

  // =====================================================================
  // CLEAR lastDamageReceived (Mirror Move) for the player ending their turn
  // Lifecycle: A attacks B (set on B) -> B's turn (B can use Mirror Move) -> B ends turn (clear on B)
  // =====================================================================
  if (isPlayerEndingTurn) {
    if (updatedState.playerActivePokemon?.lastDamageReceived != null) {
      updatedState.playerActivePokemon = {
        ...updatedState.playerActivePokemon,
        lastDamageReceived: undefined,
      };
    }
    updatedState.playerBench = updatedState.playerBench.map(p =>
      p && p.lastDamageReceived != null ? { ...p, lastDamageReceived: undefined } : p
    );
  } else {
    if (updatedState.opponentActivePokemon?.lastDamageReceived != null) {
      updatedState.opponentActivePokemon = {
        ...updatedState.opponentActivePokemon,
        lastDamageReceived: undefined,
      };
    }
    updatedState.opponentBench = updatedState.opponentBench.map(p =>
      p && p.lastDamageReceived != null ? { ...p, lastDamageReceived: undefined } : p
    );
  }

  // Mensaje de fin de turno (después de procesar todos los efectos de fin de turno)
  events.push(
    createGameEvent(
      isPlayerEndingTurn ? "Fin de tu turno" : "Fin del turno del rival",
      "system"
    )
  );

  // =====================================================================
  // INICIO DEL NUEVO TURNO: Robar una carta
  // =====================================================================
  const incomingPlayerDeck = newIsPlayerTurn ? updatedState.playerDeck : updatedState.opponentDeck;
  const incomingPlayerHand = newIsPlayerTurn ? updatedState.playerHand : updatedState.opponentHand;

  const drawResult = drawCard(incomingPlayerDeck, incomingPlayerHand);

  // Si no puede robar (deck vacío), pierde el juego
  if (drawResult.deckOut) {
    if (newIsPlayerTurn) {
      events.push(createGameEvent("¡No puedes robar! Tu mazo está vacío", "system"));
      events.push(createGameEvent("¡Derrota! No tienes cartas para robar", "system"));
      return {
        ...updatedState,
        gamePhase: GamePhase.GameOver,
        gameResult: "defeat",
        events,
      };
    } else {
      events.push(createGameEvent("¡El rival no puede robar! Su mazo está vacío", "system"));
      events.push(createGameEvent("¡Victoria! El rival no tiene cartas para robar", "system"));
      return {
        ...updatedState,
        gamePhase: GamePhase.GameOver,
        gameResult: "victory",
        events,
      };
    }
  }

  // Anunciar el nuevo turno PRIMERO
  events.push(
    createGameEvent(
      `Turno ${newTurnNumber} - ${newIsPlayerTurn ? "Tu turno" : "Turno del rival"}`,
      "system"
    )
  );

  // Actualizar mazo y mano del jugador que roba
  if (newIsPlayerTurn) {
    updatedState.playerDeck = drawResult.newDeck;
    updatedState.playerHand = drawResult.newHand;
    events.push(createGameEvent("Robaste una carta", "action"));
  } else {
    updatedState.opponentDeck = drawResult.newDeck;
    updatedState.opponentHand = drawResult.newHand;
    events.push(createGameEvent("El rival robó una carta", "info"));
  }

  return {
    ...updatedState,
    isPlayerTurn: newIsPlayerTurn,
    turnNumber: newTurnNumber,
    energyAttachedThisTurn: false,
    retreatedThisTurn: false,
    playerCanTakePrize,
    opponentCanTakePrize,
    usedPowersThisTurn: [], // Clear used powers for new turn
    events,
  };
}

/**
 * Obtiene la URL de la imagen de una carta
 */
export function getCardImageUrl(card: GameCard): string {
  return getCatalogImageUrl(card);
}

/**
 * Traduce el tipo de energía al español
 */
export function getEnergyTypeInSpanish(energyType: string): string {
  const translations: Record<string, string> = {
    grass: "planta",
    fire: "fuego",
    water: "agua",
    lightning: "eléctrica",
    psychic: "psíquica",
    fighting: "lucha",
    darkness: "oscuridad",
    metal: "metal",
    fairy: "hada",
    dragon: "dragón",
    colorless: "incolora"
  };

  return translations[energyType.toLowerCase()] || energyType;
}

/**
 * Verifica si un Pokémon puede evolucionar en otro
 * @param evolution - El Pokémon al que quiere evolucionar (debe ser stage-1 o stage-2)
 * @param base - El Pokémon base que está en juego
 * @returns true si la evolución es válida
 */
export function canEvolveInto(evolution: Card, base: Card): boolean {
  // Verificar que ambos parámetros existan
  if (!evolution || !base) {
    return false;
  }

  // Ambas deben ser cartas de Pokémon
  if (evolution.kind !== CardKind.Pokemon || base.kind !== CardKind.Pokemon) {
    return false;
  }

  // La evolución debe tener evolvesFrom definido
  if (!evolution.evolvesFrom) {
    return false;
  }

  // El Pokémon base debe coincidir con el evolvesFrom de la evolución
  return evolution.evolvesFrom === base.name;
}

/**
 * Encuentra todos los Pokémon en juego que pueden ser evolucionados por una carta específica
 * @param evolutionCard - La carta de evolución (stage-1 o stage-2)
 * @param activePokemon - Pokémon activo del jugador
 * @param bench - Banca del jugador
 * @param turnNumber - Turno actual (para bloquear evolución el mismo turno que fue jugado/evolucionado)
 * @returns Array de índices donde se puede colocar la evolución (-1 = activo, 0-4 = banca)
 */
export function findValidEvolutionTargets(
  evolutionCard: GameCard,
  activePokemon: PokemonInPlay | null,
  bench: PokemonInPlay[],
  turnNumber?: number,
  startingPlayer?: "player" | "opponent" | null,
  isPlayerTurn?: boolean
): number[] {
  const validTargets: number[] = [];

  // Global restriction: Cannot evolve on turn 1 of the game
  if (turnNumber !== undefined && turnNumber <= 1) {
    return validTargets;
  }

  // First turn restriction: Cannot evolve on YOUR first turn
  // If player goes second, their first turn is turn 2
  // If opponent goes second, their first turn is turn 2
  if (turnNumber !== undefined && startingPlayer && isPlayerTurn !== undefined) {
    const isPlayersFirstTurn = isPlayerTurn && (
      (startingPlayer === "player" && turnNumber === 1) ||
      (startingPlayer === "opponent" && turnNumber === 2)
    );
    const isOpponentsFirstTurn = !isPlayerTurn && (
      (startingPlayer === "opponent" && turnNumber === 1) ||
      (startingPlayer === "player" && turnNumber === 2)
    );
    if (isPlayersFirstTurn || isOpponentsFirstTurn) {
      return validTargets;
    }
  }

  // Verificar Pokémon activo
  if (activePokemon && canEvolveInto(evolutionCard, activePokemon.pokemon)) {
    // No puede evolucionar si fue jugado o evolucionado este mismo turno
    const canEvolveThisTurn = turnNumber === undefined || activePokemon.playedOnTurn !== turnNumber;
    if (canEvolveThisTurn) {
      validTargets.push(-1); // -1 indica el Pokémon activo
    }
  }

  // Verificar cada Pokémon en la banca
  bench.forEach((pokemonInPlay, index) => {
    if (canEvolveInto(evolutionCard, pokemonInPlay?.pokemon)) {
      const canEvolveThisTurn = turnNumber === undefined || pokemonInPlay.playedOnTurn !== turnNumber;
      if (canEvolveThisTurn) {
        validTargets.push(index);
      }
    }
  });

  return validTargets;
}

/**
 * Verifica si un Pokémon puede usar un ataque específico
 * @param pokemonInPlay - El Pokémon en juego con sus energías adjuntas
 * @param attackIndex - Índice del ataque a verificar
 * @returns true si tiene las energías necesarias
 */
export function canUseAttack(pokemonInPlay: PokemonInPlay, attackIndex: number): boolean {
  const pokemon = pokemonInPlay.pokemon;
  if (pokemon.kind !== CardKind.Pokemon) return false;

  const attack = pokemon.attacks[attackIndex];
  if (!attack) return false;

  // Verificar si es un ataque de uso único ya utilizado
  const hasUseOnce = attack.effects?.some((e) => e.type === AttackEffectType.UseOnce);
  if (hasUseOnce && pokemonInPlay.usedOnceAttacks?.includes(attack.name)) {
    return false;
  }

  const attachedEnergy = pokemonInPlay.attachedEnergy;

  // Check for Energy Burn conversion (all energy treated as one type)
  // Auto-detect from power if not explicitly set (continuous power)
  let energyConversionType = pokemonInPlay.energyConversionType;
  if (!energyConversionType && isPokemonCard(pokemonInPlay.pokemon)) {
    const power = pokemonInPlay.pokemon.power;
    if (power?.type === PokemonPowerType.EnergyConversion && power.energyType) {
      // Check no blocking status
      const statuses = pokemonInPlay.statusConditions ?? [];
      if (statuses.length === 0) {
        energyConversionType = power.energyType;
      }
    }
  }

  // Contar energías por tipo (Double Colorless cuenta como 2 para costos de ataque)
  const energyValueCount: Record<string, number> = {};
  // Contar cartas de energía por tipo (para requisitos de descarte, cada carta = 1)
  const energyCardCount: Record<string, number> = {};
  for (const energy of attachedEnergy) {
    if (energy.kind === CardKind.Energy) {
      // Determine effective energy type:
      // 1. Energy Burn: all energy counts as the conversion type
      // 2. Buzzap energy: use the chosen buzzap type
      // 3. Normal energy: use the card's energy type
      let effectiveType = energy.energyType;
      if (energyConversionType) {
        effectiveType = energyConversionType;
      } else if (energy.buzzapEnergyType) {
        effectiveType = energy.buzzapEnergyType;
      }

      const value = getEnergyValue(energy); // DCE provee 2 energías colorless
      energyValueCount[effectiveType] = (energyValueCount[effectiveType] || 0) + value;
      // For discard requirements: Energy Burn converts the type entirely for all purposes
      // Buzzap energy uses its chosen type, normal energy uses card type
      energyCardCount[effectiveType] = (energyCardCount[effectiveType] || 0) + 1;
    }
  }

  // Contar requerimientos por tipo
  const costCount: Record<string, number> = {};
  for (const type of attack.cost) {
    costCount[type] = (costCount[type] || 0) + 1;
  }

  // Primero verificar energías específicas (no colorless) usando valores de energía
  let usedEnergy: Record<string, number> = {};
  for (const [type, required] of Object.entries(costCount)) {
    if (type === EnergyTypeEnum.Colorless) continue;

    const available = energyValueCount[type] || 0;
    if (available < required) {
      return false;
    }
    usedEnergy[type] = required;
  }

  // Luego verificar colorless (puede ser cualquier tipo) usando valores de energía
  const colorlessRequired = costCount[EnergyTypeEnum.Colorless] || 0;
  if (colorlessRequired > 0) {
    // Calcular total de energías restantes después de pagar costos específicos
    let remainingEnergy = 0;
    for (const [type, count] of Object.entries(energyValueCount)) {
      const used = usedEnergy[type] || 0;
      remainingEnergy += count - used;
    }

    if (remainingEnergy < colorlessRequired) {
      return false;
    }
  }

  // Verificar discardCostRequirement de los efectos del ataque (cuenta cartas, no valores)
  if (attack.effects) {
    for (const effect of attack.effects) {
      if (effect.discardCostRequirement && effect.discardCostRequirement.length > 0) {
        const discardCount: Record<string, number> = {};
        for (const type of effect.discardCostRequirement) {
          discardCount[type] = (discardCount[type] || 0) + 1;
        }

        for (const [type, required] of Object.entries(discardCount)) {
          const available = energyCardCount[type] || 0;
          if (available < required) {
            return false;
          }
        }
      }
    }
  }

  return true;
}

/**
 * Get the discard requirement for an attack (if any)
 * Returns the energy types that must be discarded, or null if no discard needed
 */
export function getAttackDiscardRequirement(pokemonInPlay: PokemonInPlay, attackIndex: number): EnergyType[] | null {
  const pokemon = pokemonInPlay.pokemon;
  if (pokemon.kind !== CardKind.Pokemon) return null;

  const attack = pokemon.attacks[attackIndex];
  if (!attack || !attack.effects) return null;

  for (const effect of attack.effects) {
    if (effect.discardCostRequirement && effect.discardCostRequirement.length > 0) {
      return effect.discardCostRequirement;
    }
  }

  return null;
}

/**
 * Ejecuta un ataque del Pokémon activo del jugador contra el Pokémon activo del oponente
 * @param gameState - Estado actual del juego
 * @param attackIndex - Índice del ataque a usar
 * @param skipEndTurn - Si es true, no termina el turno automáticamente (usado para ataques con coin flip)
 * @param skipDefenderPromotion - Si es true, no promueve al defensor después de un KO
 * @param selectedEnergyIds - IDs de las energías seleccionadas para descartar (si el ataque lo requiere)
 * @returns Nuevo estado del juego con el daño aplicado
 */
export function executeAttack(
  gameState: GameState,
  attackIndex: number,
  skipEndTurn: boolean = false,
  skipDefenderPromotion: boolean = false,
  selectedEnergyIds?: string[]
): GameState {
  const attacker = gameState.playerActivePokemon;
  const defender = gameState.opponentActivePokemon;

  if (!attacker || !defender) {
    return {
      ...gameState,
      events: [
        ...gameState.events,
        createGameEvent("No hay Pokémon para atacar", "info"),
      ],
    };
  }

  if (attacker.pokemon.kind !== CardKind.Pokemon || defender.pokemon.kind !== CardKind.Pokemon) {
    return gameState;
  }

  const attack = attacker.pokemon.attacks[attackIndex];
  if (!attack) return gameState;

  // Calcular daño base (puede ser número o string como "10x", "20+", "30-")
  let baseDamage = 0;
  let damageMultiplierDescription = "";

  if (typeof attack.damage === "number") {
    baseDamage = attack.damage;
  } else if (typeof attack.damage === "string") {
    // Extraer el número base del string (ej: "10x" -> 10, "20+" -> 20)
    const numMatch = attack.damage.match(/(\d+)/);
    const baseValue = numMatch ? parseInt(numMatch[1], 10) : 0;

    if (attack.damage.endsWith("x")) {
      // "10x" = daño multiplicado por contadores de daño propios (ej: Azote/Flail)
      // Cada contador de daño = 10 puntos de daño
      const damageCounters = Math.floor((attacker.currentDamage || 0) / 10);
      baseDamage = baseValue * damageCounters;
      damageMultiplierDescription = ` (${baseValue} × ${damageCounters} contadores)`;
    } else if (attack.damage.endsWith("+")) {
      // "20+" = daño base + posible bonus (implementar según el efecto)
      baseDamage = baseValue;
    } else if (attack.damage.endsWith("-")) {
      // "30-" = daño base - posible reducción (implementar según el efecto)
      baseDamage = baseValue;
    } else {
      baseDamage = baseValue;
    }
  }
  // Apply non-coinflip BonusDamage, DamagePerCounter, and ExtraEnergy to base damage
  if (attack.effects) {
    for (const effect of attack.effects) {
      if (effect.coinFlip) continue;

      // BonusDamage: add damage based on source (bench count, named pokemon, etc.)
      // Skip Self-targeting BonusDamage without a bonusDamageSource — those are "next turn" buffs (e.g., Swords Dance)
      if (effect.type === AttackEffectType.BonusDamage && effect.amount && !effect.coinFlip
          && !(effect.target === AttackTarget.Self && !effect.bonusDamageSource)) {
        let multiplier = 1;
        if (effect.bonusDamageSource === "benchCount") {
          multiplier = gameState.playerBench.filter(p => p != null).length;
        } else if (effect.bonusDamageSource === "namedPokemon" && effect.bonusDamageNameMatch) {
          const name = effect.bonusDamageNameMatch;
          // Count in active + bench
          let count = 0;
          if (attacker.pokemon.name === name) count++;
          for (const bp of gameState.playerBench) {
            if (bp && bp.pokemon.name === name) count++;
          }
          multiplier = count;
        }
        baseDamage += effect.amount * multiplier;
      }

      // DamagePerCounter: bonus damage per damage counter on self or defender
      if (effect.type === AttackEffectType.DamagePerCounter && effect.amount) {
        if (effect.target === AttackTarget.Self) {
          // Damage counters on attacker (e.g., Rage, Rampage)
          const counters = Math.floor((attacker.currentDamage || 0) / 10);
          baseDamage += effect.amount * counters;
        } else if (effect.target === AttackTarget.Defender) {
          // Damage counters on defender (e.g., Meditate)
          const counters = Math.floor((defender.currentDamage || 0) / 10);
          baseDamage += effect.amount * counters;
        }
      }

      // ExtraEnergy: bonus damage per extra energy of a type beyond attack cost
      if (effect.type === AttackEffectType.ExtraEnergy && effect.extraDamagePerEnergy) {
        const energyType = effect.extraEnergyType;
        const maxExtra = effect.maxExtraEnergy ?? Infinity;
        if (energyType) {
          // Count total energy of this type attached
          const totalOfType = attacker.attachedEnergy.filter(
            e => e.kind === CardKind.Energy && "energyType" in e && e.energyType === energyType
          ).length;
          // Count how many are required by the attack cost
          const requiredOfType = attack.cost.filter(c => c === energyType).length;
          const extraCount = Math.min(Math.max(0, totalOfType - requiredOfType), maxExtra);
          baseDamage += effect.extraDamagePerEnergy * extraCount;
        }
      }
    }
  }

  // Apply stored nextTurnBonusDamage from a previous turn (e.g., Swords Dance +30)
  // The bonus is consumed and cleared later when assembling the final state
  let consumedBonusDamage = false;
  let bonusDamageMessage = "";
  if (attacker.nextTurnBonusDamage && attacker.nextTurnBonusDamage > 0) {
    baseDamage += attacker.nextTurnBonusDamage;
    consumedBonusDamage = true;
    bonusDamageMessage = `¡Efecto de turno anterior! +${attacker.nextTurnBonusDamage} de daño extra`;
  }

  // Check for MirrorMove effect: replaces all damage with lastDamageReceived
  // Mirror Move copies the FINAL damage dealt to this Pokemon last turn (already includes weakness/resistance)
  let isMirrorMove = false;
  const mirrorMoveEffect = attack.effects?.find(e => e.type === AttackEffectType.MirrorMove);
  if (mirrorMoveEffect) {
    isMirrorMove = true;
    const lastDamage = attacker.lastDamageReceived;
    if (lastDamage && lastDamage > 0) {
      baseDamage = lastDamage;
    } else {
      baseDamage = 0;
    }
  }

  let damage = baseDamage;

  // Verificar debilidad y resistencia (using modifiedWeakness/modifiedResistance from Porygon's Conversion)
  // Skip for MirrorMove — the copied damage already had weakness/resistance applied
  const defenderWeaknesses = defender.modifiedWeakness
    ? [defender.modifiedWeakness]
    : (defender.pokemon.weaknesses ?? []);
  const defenderResistances = defender.modifiedResistance
    ? [defender.modifiedResistance]
    : (defender.pokemon.resistances ?? []);

  // Use shiftedType (Venomoth Shift) if available, otherwise use original type
  const attackerType = attacker.shiftedType || attacker.pokemon.types[0];
  const hasWeakness = !isMirrorMove && defenderWeaknesses.includes(attackerType);
  const hasResistance = !isMirrorMove && defenderResistances.includes(attackerType);

  // Aplicar debilidad (x2)
  if (hasWeakness) {
    damage *= 2;
  }

  // Aplicar resistencia (-30)
  if (hasResistance) {
    damage = Math.max(0, damage - 30);
  }

  // Aplicar bonus de PlusPower (después de debilidad/resistencia, según reglas TCG)
  const plusPowerModifiers = gameState.activeModifiers.filter(
    (m) => m.source === "plusPower" && m.playerId === "player"
  );
  const plusPowerBonus = plusPowerModifiers.reduce((sum, m) => sum + m.amount, 0);
  if (plusPowerBonus > 0) {
    damage += plusPowerBonus;
  }

  // Aplicar reducción de Defender (después de debilidad/resistencia)
  const defenderModifiers = gameState.activeModifiers.filter(
    (m) => m.source === "defender" && m.targetPokemonId === defender.pokemon.id
  );
  const defenderReduction = defenderModifiers.reduce((sum, m) => sum + Math.abs(m.amount), 0);
  if (defenderReduction > 0) {
    damage = Math.max(0, damage - defenderReduction);
  }

  // Apply stored nextTurnDamageReduction from defender (e.g., Minimize -20, Screech -10)
  // The reduction is consumed and cleared later when assembling the final state
  let consumedDamageReduction = false;
  let damageReductionMessage = "";
  if (defender.nextTurnDamageReduction && defender.nextTurnDamageReduction > 0 && damage > 0) {
    const reduction = defender.nextTurnDamageReduction;
    damage = Math.max(0, damage - reduction);
    consumedDamageReduction = true;
    damageReductionMessage = `${defender.pokemon.name} redujo el daño en ${reduction} (efecto de turno anterior)`;
  }

  // Verificar si el defensor está protegido o tiene barrera de daño
  const defenderIsProtected = protectionBlocksDamage(defender, damage);
  let effectiveDamage = damage;
  let damageBarrierBlocked = false;
  if (defenderIsProtected && damage > 0) {
    effectiveDamage = 0;
  } else if (isDamageBlocked(defender, damage)) {
    effectiveDamage = 0;
    damageBarrierBlocked = true;
  }

  // Aplicar daño al defensor
  const newDamage = (defender.currentDamage || 0) + effectiveDamage;
  const defenderHP = defender.pokemon.hp;

  // Crear eventos
  const events: GameEvent[] = [...gameState.events];

  // Add deferred messages for next-turn effects (computed before events array was created)
  if (bonusDamageMessage) {
    events.push(createGameEvent(bonusDamageMessage, "action"));
  }
  if (damageReductionMessage) {
    events.push(createGameEvent(damageReductionMessage, "action"));
  }

  // Mirror Move result message
  if (isMirrorMove) {
    if (attacker.lastDamageReceived && attacker.lastDamageReceived > 0) {
      events.push(createGameEvent(
        `¡Movimiento Espejo! ${attacker.pokemon.name} devuelve ${attacker.lastDamageReceived} de daño`,
        "action"
      ));
    } else {
      events.push(createGameEvent(
        `Movimiento Espejo falló: ${attacker.pokemon.name} no fue atacado el turno anterior`,
        "info"
      ));
    }
  }

  // Mensaje del ataque con detalles de debilidad/resistencia y protección
  let damageMessage = "";
  if (defenderIsProtected && damage > 0) {
    if (defender.protection?.threshold !== undefined) {
      damageMessage = ` pero Endurecimiento previno ${damage} de daño (${damage} ≤ ${defender.protection.threshold})`;
    } else {
      damageMessage = ` pero ${defender.pokemon.name} está protegido. ¡El daño fue prevenido!`;
    }
  } else if (damageBarrierBlocked) {
    const barrierPowerName = isPokemonCard(defender.pokemon) ? defender.pokemon.power?.name || "Muro Invisible" : "Muro Invisible";
    damageMessage = ` pero ${defender.pokemon.name} bloqueó el daño con ${barrierPowerName}`;
  } else if (effectiveDamage > 0) {
    if (hasWeakness) {
      damageMessage = ` e hizo ${effectiveDamage} de daño${damageMultiplierDescription} (x2 debilidad)`;
    } else if (hasResistance) {
      damageMessage = ` e hizo ${effectiveDamage} de daño${damageMultiplierDescription} (-30 resistencia)`;
    } else {
      damageMessage = ` e hizo ${effectiveDamage} de daño${damageMultiplierDescription}`;
    }
  } else if (typeof attack.damage === "string" && attack.damage.endsWith("x")) {
    // Si es un ataque de daño variable y no hizo daño, indicarlo
    damageMessage = " pero no hizo daño (0 contadores)";
  } else if (hasResistance && baseDamage > 0) {
    // El ataque tenía daño pero fue reducido a 0 por resistencia
    damageMessage = ` e hizo 0 de daño (-30 resistencia)`;
  } else if (defenderReduction > 0 && baseDamage > 0) {
    // El ataque fue reducido a 0 por Defender
    damageMessage = ` e hizo 0 de daño (bloqueado por Defender)`;
  }

  events.push(
    createGameEvent(
      `${attacker.pokemon.name} usó ${attack.name}${damageMessage}`,
      "action"
    )
  );

  // Verificar si el defensor fue noqueado
  const isKnockedOut = newDamage >= defenderHP;
  if (isKnockedOut) {
    events.push(
      createGameEvent(`¡${defender.pokemon.name} fue noqueado!`, "action")
    );
  }

  // Actualizar estado del oponente
  let newOpponentActive: PokemonInPlay | null = defender;
  let newOpponentDiscard = [...gameState.opponentDiscard];
  let newOpponentBench = [...gameState.opponentBench];
  let newPlayerPrizes = [...gameState.playerPrizes];
  let newPlayerHand = [...gameState.playerHand];

  // Variable para trackear si el jugador puede tomar premio
  let playerCanTakePrize = false;
  // Variable para trackear si el oponente necesita promover (cuando skipDefenderPromotion es true)
  let opponentNeedsToPromote = false;

  if (isKnockedOut) {
    // Mover Pokémon noqueado y sus cartas al descarte
    newOpponentDiscard.push(defender.pokemon);
    newOpponentDiscard.push(...defender.attachedEnergy);
    if (defender.attachedTrainers) {
      newOpponentDiscard.push(...defender.attachedTrainers);
    }
    if (defender.previousEvolutions) {
      newOpponentDiscard.push(...defender.previousEvolutions);
    }

    // Marcar que el jugador puede tomar un premio (si hay)
    if (newPlayerPrizes.length > 0) {
      playerCanTakePrize = true;
      events.push(createGameEvent("¡Puedes tomar un premio!", "action"));
    }

    // Promover primer Pokémon de la banca (si hay)
    const opponentBenchPokemonIndex = newOpponentBench.findIndex(p => p != null);
    if (opponentBenchPokemonIndex !== -1) {
      if (skipDefenderPromotion) {
        // No auto-promover, dejar que el jugador elija
        newOpponentActive = null;
        opponentNeedsToPromote = true;
        events.push(
          createGameEvent("Debes elegir un Pokémon de tu banca para continuar", "info")
        );
      } else {
        newOpponentActive = newOpponentBench[opponentBenchPokemonIndex]!;
        newOpponentBench.splice(opponentBenchPokemonIndex, 1);
        events.push(
          createGameEvent(
            `${newOpponentActive.pokemon.name} pasa a ser el Pokémon activo del rival`,
            "info"
          )
        );
      }
    } else {
      newOpponentActive = null;
      events.push(createGameEvent("¡Victoria! El rival no tiene más Pokémon", "system"));
      events.push(createGameEvent("Ya puedes salir de la mesa", "info"));
    }
  } else {
    // Solo actualizar daño + store lastDamageReceived for Mirror Move
    newOpponentActive = {
      ...defender,
      currentDamage: newDamage,
      lastDamageReceived: effectiveDamage > 0 ? effectiveDamage : undefined,
    };
  }

  // Procesar efectos del ataque que no requieren coin flip
  let newPlayerActive: PokemonInPlay | null = attacker;
  let newPlayerBench = [...gameState.playerBench];
  let newPlayerDiscard = [...gameState.playerDiscard];
  let newPlayerDeck = [...gameState.playerDeck];
  let newOpponentPrizes = [...gameState.opponentPrizes];
  let newOpponentHand = [...gameState.opponentHand];
  let newOpponentDeck = [...gameState.opponentDeck];
  let attackerKnockedOut = false;
  let attackerNeedsToPromote = false;
  let pendingBenchDamageSelection: GameState["pendingBenchDamageSelection"] = undefined;

  if (attack.effects) {
    for (const effect of attack.effects) {
      // Ignorar efectos con coinFlip (se procesan en handleCoinFlipComplete)
      if (effect.coinFlip) continue;

      // Draw: robar cartas del mazo (ej: Kangaskhan's Fetch)
      if (effect.type === AttackEffectType.Draw && effect.amount) {
        const isPlayer = effect.target === AttackTarget.Self;
        for (let i = 0; i < effect.amount; i++) {
          const deck = isPlayer ? newPlayerDeck : newOpponentDeck;
          const hand = isPlayer ? newPlayerHand : newOpponentHand;
          const result = drawCard(deck, hand);
          if (result.success) {
            if (isPlayer) {
              newPlayerDeck = result.newDeck;
              newPlayerHand = result.newHand;
            } else {
              newOpponentDeck = result.newDeck;
              newOpponentHand = result.newHand;
            }
          }
        }
        const who = isPlayer ? "Robaste" : "El rival robó";
        events.push(createGameEvent(`${who} ${effect.amount} carta${effect.amount > 1 ? "s" : ""} por ${attack.name}`, "action"));
      }

      // Daño a sí mismo (selfDamage)
      if (effect.type === AttackEffectType.SelfDamage && effect.amount && newPlayerActive) {
        const selfDamage: number = effect.amount;
        const newSelfDamage: number = (newPlayerActive.currentDamage || 0) + selfDamage;

        events.push(
          createGameEvent(
            `${newPlayerActive.pokemon.name} se hizo ${selfDamage} de daño a sí mismo`,
            "action"
          )
        );

        // Verificar si el atacante se noqueó
        if (newPlayerActive.pokemon.kind === CardKind.Pokemon && newSelfDamage >= newPlayerActive.pokemon.hp) {
          attackerKnockedOut = true;
          events.push(
            createGameEvent(`¡${newPlayerActive.pokemon.name} se noqueó a sí mismo!`, "action")
          );

          // Mover al descarte
          newPlayerDiscard.push(newPlayerActive.pokemon);
          newPlayerDiscard.push(...newPlayerActive.attachedEnergy);
          if (newPlayerActive.attachedTrainers) {
            newPlayerDiscard.push(...newPlayerActive.attachedTrainers);
          }
          if (newPlayerActive.previousEvolutions) {
            newPlayerDiscard.push(...newPlayerActive.previousEvolutions);
          }

          // Oponente toma un premio (si hay)
          if (newOpponentPrizes.length > 0) {
            const prize = newOpponentPrizes.pop()!;
            newOpponentHand.push(prize);
            events.push(createGameEvent("El rival tomó un premio", "action"));
          }

          // Promover Pokémon de la banca del jugador (si hay)
          const benchPokemonCount = newPlayerBench.filter(p => p != null).length;
          if (benchPokemonCount >= 1) {
            // El jugador debe elegir qué Pokémon promover
            newPlayerActive = null;
            attackerNeedsToPromote = true;
            events.push(
              createGameEvent("Debes elegir un Pokémon de tu banca para continuar", "info")
            );
          } else {
            // No hay Pokémon en la banca: derrota
            newPlayerActive = null;
            events.push(createGameEvent("¡Derrota! No tienes más Pokémon", "system"));
            events.push(createGameEvent("Ya puedes salir de la mesa", "info"));
          }
        } else {
          newPlayerActive = {
            ...newPlayerActive,
            currentDamage: newSelfDamage,
          };
        }
      }

      // Daño a la banca (benchDamage)
      if (effect.type === AttackEffectType.BenchDamage && effect.amount && effect.benchTarget) {
        const benchDamageAmount = effect.amount;
        const target = effect.benchTarget;

        // Chain Lightning: use original defender types (not newOpponentActive which may be promoted replacement)
        const defenderTypes = isPokemonCard(defender.pokemon)
          ? defender.pokemon.types
          : [];
        if (effect.skipIfColorless && defenderTypes.includes(EnergyTypeEnum.Colorless)) {
          // Effect does nothing against Colorless defenders
        } else {
          // Determine if we need manual selection
          const maxTargets = effect.maxBenchTargets ?? Infinity;
          const needsManualSelection = maxTargets < Infinity;

          // Count available targets
          const getAvailableTargets = (bench: PokemonInPlay[]): PokemonInPlay[] => {
            return bench.filter((p) => {
              if (!p) return false;
              if (effect.matchDefenderType && isPokemonCard(p.pokemon)) {
                return p.pokemon.types.some((t) => defenderTypes.includes(t));
              }
              return true;
            });
          };

          // Check if we need manual selection (when maxTargets < available targets)
          if (target === BenchDamageTarget.Opponent || target === BenchDamageTarget.Both) {
            const availableOpponentTargets = getAvailableTargets(newOpponentBench);

            if (needsManualSelection && availableOpponentTargets.length > 0) {
              // Set pending state - frontend will show selection modal
              pendingBenchDamageSelection = {
                damageAmount: benchDamageAmount,
                targetSide: "opponent",
                maxTargets: maxTargets,
                minTargets: Math.min(1, availableOpponentTargets.length),
                matchDefenderType: effect.matchDefenderType,
                defenderTypes: effect.matchDefenderType ? defenderTypes : undefined,
              };
              // Do NOT apply damage automatically - wait for player selection
              // Do NOT call endTurn() - the pending flag will block it
              events.push(
                createGameEvent(
                  `Elige hasta ${maxTargets} Pokémon de la banca del rival para hacer ${benchDamageAmount} de daño`,
                  "action"
                )
              );
            } else {
              // Automatic damage (maxTargets >= available targets OR no targets available)
              let opponentHitsRemaining = maxTargets;
              newOpponentBench = newOpponentBench.map((benchPokemon) => {
                if (!benchPokemon || opponentHitsRemaining <= 0) return benchPokemon;

                // Filter by defender type if matchDefenderType is set
                if (effect.matchDefenderType && isPokemonCard(benchPokemon.pokemon)) {
                  const sharesType = benchPokemon.pokemon.types.some((t) => defenderTypes.includes(t));
                  if (!sharesType) return benchPokemon;
                }

                opponentHitsRemaining--;
                const newBenchDamage = (benchPokemon.currentDamage || 0) + benchDamageAmount;
                events.push(
                  createGameEvent(
                    `${benchPokemon.pokemon.name} del rival recibió ${benchDamageAmount} de daño`,
                    "action"
                  )
                );

                return {
                  ...benchPokemon,
                  currentDamage: newBenchDamage,
                };
              });
            }
          }

          // Apply to own bench (typically for attacks like Selfdestruct)
          if (target === BenchDamageTarget.Own || target === BenchDamageTarget.Both) {
            const availableOwnTargets = getAvailableTargets(newPlayerBench);

            // Own bench damage usually doesn't need selection (hits all), but support it anyway
            if (needsManualSelection && availableOwnTargets.length > maxTargets && !pendingBenchDamageSelection) {
              pendingBenchDamageSelection = {
                damageAmount: benchDamageAmount,
                targetSide: "player",
                maxTargets: maxTargets,
                minTargets: Math.min(1, availableOwnTargets.length),
                matchDefenderType: effect.matchDefenderType,
                defenderTypes: effect.matchDefenderType ? defenderTypes : undefined,
              };
              events.push(
                createGameEvent(
                  `Elige hasta ${maxTargets} de tus Pokémon de la banca para recibir ${benchDamageAmount} de daño`,
                  "action"
                )
              );
            } else {
              // Automatic damage
              let ownHitsRemaining = maxTargets;
              newPlayerBench = newPlayerBench.map((benchPokemon) => {
                if (!benchPokemon || ownHitsRemaining <= 0) return benchPokemon;

                // Filter by defender type if matchDefenderType is set
                if (effect.matchDefenderType && isPokemonCard(benchPokemon.pokemon)) {
                  const sharesType = benchPokemon.pokemon.types.some((t) => defenderTypes.includes(t));
                  if (!sharesType) return benchPokemon;
                }

                ownHitsRemaining--;
                const newBenchDamage = (benchPokemon.currentDamage || 0) + benchDamageAmount;
                events.push(
                  createGameEvent(
                    `Tu ${benchPokemon.pokemon.name} recibió ${benchDamageAmount} de daño`,
                    "action"
                  )
                );

                return {
                  ...benchPokemon,
                  currentDamage: newBenchDamage,
                };
              });
            }
          }
        }

        // TODO: Verificar y procesar KOs en la banca
      }

      // Heal: cure damage from self (e.g., Butterfree Mega Drain, Exeggcute Leech Seed, Venonat Leech Life)
      if (effect.type === AttackEffectType.Heal && effect.target === AttackTarget.Self && newPlayerActive) {
        let healAmount = effect.amount || 0;
        if (effect.healFromDamageDealt) {
          // Heal = half the actual damage dealt to the defender
          healAmount = Math.floor(effectiveDamage / 2);
          // Round down to nearest 10 (damage counters are multiples of 10)
          healAmount = Math.floor(healAmount / 10) * 10;
        }
        const attackerDamage: number = newPlayerActive.currentDamage || 0;
        const actualHeal = Math.min(healAmount, attackerDamage);
        if (actualHeal > 0) {
          newPlayerActive = {
            ...newPlayerActive,
            currentDamage: attackerDamage - actualHeal,
          };
          events.push(
            createGameEvent(
              `${newPlayerActive.pokemon.name} se curó ${actualHeal} de daño`,
              "action"
            )
          );
        }
      }

      // Recuperación: curar todo el daño descartando energía (ej: Starmie's Recuperación)
      if (effect.type === AttackEffectType.Recover && effect.target === "self" && newPlayerActive) {
        const discardReq = effect.discardCostRequirement;

        if (discardReq && discardReq.length > 0) {
          // Buscar y descartar las energías requeridas
          const remainingEnergy: GameCard[] = [...newPlayerActive.attachedEnergy];
          const discardedEnergy: GameCard[] = [];
          let canPay = true;

          for (const reqType of discardReq) {
            const idx = remainingEnergy.findIndex(
              (e) => e.kind === CardKind.Energy && "energyType" in e && e.energyType === reqType
            );
            if (idx !== -1) {
              discardedEnergy.push(...remainingEnergy.splice(idx, 1));
            } else {
              canPay = false;
              break;
            }
          }

          if (canPay) {
            const healedAmount = newPlayerActive.currentDamage || 0;
            newPlayerDiscard.push(...discardedEnergy);

            newPlayerActive = {
              ...newPlayerActive,
              attachedEnergy: remainingEnergy,
              currentDamage: 0,
            };

            if (healedAmount > 0) {
              events.push(
                createGameEvent(
                  `${newPlayerActive.pokemon.name} se recuperó y curó ${healedAmount} de daño`,
                  "action"
                )
              );
            } else {
              events.push(
                createGameEvent(
                  `${newPlayerActive.pokemon.name} usó Recuperación (sin daño que curar)`,
                  "info"
                )
              );
            }
          } else {
            events.push(
              createGameEvent(
                `${newPlayerActive.pokemon.name} no tiene la energía necesaria para Recuperación`,
                "info"
              )
            );
          }
        } else {
          // Sin costo de descarte, curar directamente
          const healedAmount = newPlayerActive.currentDamage || 0;
          newPlayerActive = {
            ...newPlayerActive,
            currentDamage: 0,
          };
          if (healedAmount > 0) {
            events.push(
              createGameEvent(
                `${newPlayerActive.pokemon.name} se recuperó y curó ${healedAmount} de daño`,
                "action"
              )
            );
          }
        }
      }

      // Descarte de energía como costo del ataque
      if (effect.type === AttackEffectType.Discard && newPlayerActive) {
        if (effect.discardAll) {
          // Descartar TODAS las energías (ej: Zapdos' Rayo)
          const allEnergy = [...newPlayerActive.attachedEnergy];
          if (allEnergy.length > 0) {
            newPlayerDiscard.push(...allEnergy);
            newPlayerActive = {
              ...newPlayerActive,
              attachedEnergy: [],
            };
            events.push(
              createGameEvent(
                `${newPlayerActive.pokemon.name} descartó todas sus energías (${allEnergy.length})`,
                "action"
              )
            );
          }
        } else if (effect.discardCostRequirement) {
          // Descartar energías específicas (ej: Charizard' Giro Fuego, Ninetales' Lanzallamas)
          const remainingEnergy: GameCard[] = [...newPlayerActive.attachedEnergy];
          const discardedEnergy: GameCard[] = [];

          if (selectedEnergyIds && selectedEnergyIds.length > 0) {
            // User selected specific energies to discard
            for (const energyId of selectedEnergyIds) {
              const idx = remainingEnergy.findIndex((e) => e.id === energyId);
              if (idx !== -1) {
                discardedEnergy.push(...remainingEnergy.splice(idx, 1));
              }
            }
          } else {
            // Auto-select energies (fallback for AI or legacy code)
            const discardReq = effect.discardCostRequirement;
            let energyConversionType = newPlayerActive.energyConversionType;
            if (!energyConversionType && isPokemonCard(newPlayerActive.pokemon)) {
              const power = newPlayerActive.pokemon.power;
              if (power?.type === PokemonPowerType.EnergyConversion && power.energyType) {
                const statuses = newPlayerActive.statusConditions ?? [];
                if (statuses.length === 0) energyConversionType = power.energyType;
              }
            }

            for (const reqType of discardReq) {
              const idx = remainingEnergy.findIndex((e) => {
                if (e.kind !== CardKind.Energy && !e.buzzapEnergyType) return false;
                // With Energy Burn, all energy counts as the converted type
                if (energyConversionType) return true;
                // Buzzap energy uses its chosen type
                if (e.buzzapEnergyType) return e.buzzapEnergyType === reqType;
                // Normal energy
                return "energyType" in e && e.energyType === reqType;
              });
              if (idx !== -1) {
                discardedEnergy.push(...remainingEnergy.splice(idx, 1));
              }
            }
          }

          if (discardedEnergy.length > 0) {
            newPlayerDiscard.push(...discardedEnergy);
            newPlayerActive = {
              ...newPlayerActive,
              attachedEnergy: remainingEnergy,
            };

            const energyNames = discardedEnergy
              .map((e) => "energyType" in e ? getEnergyTypeInSpanish(e.energyType) : "")
              .join(", ");
            events.push(
              createGameEvent(
                `${newPlayerActive.pokemon.name} descartó ${discardedEnergy.length} energía${discardedEnergy.length > 1 ? "s" : ""} (${energyNames})`,
                "action"
              )
            );
          }
        }
      }

      // BonusDamage (Self): store bonus for NEXT attack (e.g., Scyther's Swords Dance +30)
      if (effect.type === AttackEffectType.BonusDamage && effect.target === AttackTarget.Self && effect.amount && newPlayerActive && !attackerKnockedOut) {
        // Only store if it has no bonusDamageSource (those are immediate, like Nidoqueen's namedPokemon)
        if (!effect.bonusDamageSource) {
          newPlayerActive = {
            ...newPlayerActive,
            nextTurnBonusDamage: (newPlayerActive.nextTurnBonusDamage || 0) + effect.amount,
            nextTurnEffectAppliedOnTurn: gameState.turnNumber,
          };
          events.push(
            createGameEvent(
              `${newPlayerActive.pokemon.name} se preparó para hacer +${effect.amount} de daño en su próximo ataque`,
              "action"
            )
          );
        }
      }

      // ReduceDamage (Self): store damage reduction for next opponent's attack (e.g., Clefable's Minimize -20)
      if (effect.type === AttackEffectType.ReduceDamage && effect.target === AttackTarget.Self && effect.amount && newPlayerActive && !attackerKnockedOut) {
        newPlayerActive = {
          ...newPlayerActive,
          nextTurnDamageReduction: (newPlayerActive.nextTurnDamageReduction || 0) + effect.amount,
          nextTurnEffectAppliedOnTurn: gameState.turnNumber,
        };
        events.push(
          createGameEvent(
            `${newPlayerActive.pokemon.name} reducirá el daño recibido en ${effect.amount} durante el próximo turno`,
            "action"
          )
        );
      }

      // Protection (non-coin-flip): apply protection to self (e.g., Onix's Harden)
      // Coin-flip protection (Kakuna, Metapod) is handled in frontend useCoinFlipHandler and AI executor
      if (effect.type === AttackEffectType.Protection && !effect.coinFlip && effect.target === AttackTarget.Self && newPlayerActive && !attackerKnockedOut) {
        const protType = effect.protectionType || ("damageOnly" as ProtectionType);
        const threshold = effect.amount; // undefined for full protection, number for threshold (e.g., 30 for Onix)
        newPlayerActive = applyProtection(newPlayerActive, protType, gameState.turnNumber, threshold);
        if (threshold !== undefined) {
          events.push(
            createGameEvent(
              `${newPlayerActive.pokemon.name} se endureció — prevendrá daño de ${threshold} o menos durante el próximo turno del rival`,
              "action"
            )
          );
        } else {
          events.push(
            createGameEvent(
              `¡${newPlayerActive.pokemon.name} se protegió! El daño será prevenido durante el próximo turno del rival`,
              "action"
            )
          );
        }
      }

      // Aplicar estado sin coinFlip (ej: Ivysaur's Polvo Veneno, Nidoking's Tóxico, Gloom's Foul Odor)
      if (effect.type === AttackEffectType.ApplyStatus && effect.status) {
        const status = effect.status;
        const statusMessages: Record<string, string> = {
          paralyzed: "paralizado",
          asleep: "dormido",
          confused: "confundido",
          poisoned: "envenenado",
        };

        // Collect all statuses to apply (primary + additionalStatuses)
        const allStatuses = [status, ...(effect.additionalStatuses || [])];

        if (effect.target === AttackTarget.Self) {
          // Apply status to the ATTACKER (e.g., Vileplume Petal Dance → confused, Gloom Foul Odor → confused)
          if (newPlayerActive && !attackerKnockedOut) {
            for (const s of allStatuses) {
              const before: PokemonInPlay = newPlayerActive;
              newPlayerActive = applyStatusCondition(newPlayerActive, s, gameState.turnNumber);
              if (newPlayerActive !== before) {
                // Si es veneno con daño personalizado (Tóxico = 20), guardarlo
                if (s === StatusCondition.Poisoned && effect.poisonDamage) {
                  newPlayerActive = { ...newPlayerActive, poisonDamage: effect.poisonDamage };
                }
                events.push(
                  createGameEvent(
                    `¡${newPlayerActive.pokemon.name} está ${statusMessages[s] || s}!`,
                    "action"
                  )
                );
              }
            }
          }
        } else {
          // Apply status to the DEFENDER — only if not KO'd (don't transfer to promoted Pokemon)
          if (newOpponentActive && !isKnockedOut) {
            // Check StatusImmunity (Snorlax's Thick Skinned)
            if (hasStatusImmunity(newOpponentActive)) {
              const immunityPowerName = isPokemonCard(newOpponentActive.pokemon) ? newOpponentActive.pokemon.power?.name || "Piel Gruesa" : "Piel Gruesa";
              events.push(
                createGameEvent(
                  `¡${newOpponentActive.pokemon.name} es inmune a estados alterados gracias a ${immunityPowerName}!`,
                  "action"
                )
              );
            } else {
              for (const s of allStatuses) {
                const before: PokemonInPlay = newOpponentActive;
                newOpponentActive = applyStatusCondition(newOpponentActive, s, gameState.turnNumber);
                if (newOpponentActive !== before) {
                  // Si es veneno con daño personalizado (Tóxico = 20), guardarlo
                  if (s === StatusCondition.Poisoned && effect.poisonDamage) {
                    newOpponentActive = { ...newOpponentActive, poisonDamage: effect.poisonDamage };
                  }
                  events.push(
                    createGameEvent(
                      `¡${newOpponentActive.pokemon.name} está ${statusMessages[s] || s}!`,
                      "action"
                    )
                  );
                }
              }
            }
          }
        }
      }
    }
  }

  // =====================================================================
  // FORCE SWITCH / SELF SWITCH / PREVENT RETREAT / DECK SEARCH — post-effects processing
  // =====================================================================
  let pendingForceSwitch = false;
  let pendingSelfSwitch = false;
  let pendingDeckSearch: GameState["pendingDeckSearch"] = undefined;

  if (attack.effects) {
    for (const effect of attack.effects) {
      // ForceSwitch: opponent must switch active with a bench Pokemon (Lure, Whirlwind, Ram)
      if (effect.type === AttackEffectType.ForceSwitch && effect.target === AttackTarget.Defender) {
        // Only if opponent has bench Pokemon and wasn't KO'd
        if (newOpponentActive && !isKnockedOut) {
          const opponentBench = [...newOpponentBench];
          const hasBench = opponentBench.some(p => p != null);
          if (hasBench) {
            pendingForceSwitch = true;
            events.push(
              createGameEvent(
                `¡${newPlayerActive?.pokemon.name || attacker.pokemon.name} fuerza al rival a cambiar su Pokémon activo!`,
                "action"
              )
            );
          }
        }
      }

      // SelfSwitch: attacker switches with own bench Pokemon (Teleport)
      if (effect.type === AttackEffectType.SelfSwitch && effect.target === AttackTarget.Self) {
        if (newPlayerActive && !attackerKnockedOut) {
          const hasBench = newPlayerBench.some(p => p != null);
          if (hasBench) {
            pendingSelfSwitch = true;
            events.push(
              createGameEvent(
                `${newPlayerActive.pokemon.name} puede cambiarse con un Pokémon de la banca`,
                "action"
              )
            );
          }
        }
      }

      // PreventRetreat: defender can't retreat next turn (Acid)
      if (effect.type === AttackEffectType.PreventRetreat && newOpponentActive && !isKnockedOut) {
        // No coinFlip here — the coin flip is on the effect itself, handled in coin flip handler
        if (!effect.coinFlip) {
          newOpponentActive = {
            ...newOpponentActive,
            retreatPrevented: true,
            retreatPreventedOnTurn: gameState.turnNumber,
          };
          events.push(
            createGameEvent(
              `¡${newOpponentActive.pokemon.name} no puede retirarse durante el próximo turno!`,
              "action"
            )
          );
        }
      }

      // ReturnToHand: return defender to opponent's hand (Pidgeot's Hurricane)
      // Only if defender was NOT knocked out
      if (effect.type === AttackEffectType.ReturnToHand && effect.target === AttackTarget.Defender) {
        if (newOpponentActive && !isKnockedOut) {
          // Return the defender and all attached cards to opponent's hand
          const cardsToReturn: GameCard[] = [
            newOpponentActive.pokemon,
            ...newOpponentActive.attachedEnergy,
          ];
          if (newOpponentActive.attachedTrainers) {
            cardsToReturn.push(...newOpponentActive.attachedTrainers);
          }
          // Include previous evolutions if any
          if (newOpponentActive.previousEvolutions) {
            cardsToReturn.push(...newOpponentActive.previousEvolutions);
          }

          // Add all cards to opponent's hand
          newOpponentHand = [...newOpponentHand, ...cardsToReturn];

          // Clear the defender
          newOpponentActive = null;

          events.push(
            createGameEvent(
              `¡${defender.pokemon.name} y todas sus cartas adjuntas volvieron a la mano!`,
              "action"
            )
          );

          // Opponent will need to promote from bench
          if (newOpponentBench.some(p => p !== null)) {
            // There are Pokemon on bench to promote
            opponentNeedsToPromote = true;
          } else {
            // No bench Pokemon - the game will end (handled by gameResult logic later)
            // The gameResult check at line 2774 will detect this: newOpponentActive === null && newOpponentBench.length === 0
            events.push(
              createGameEvent(
                "¡El rival no tiene Pokémon en la banca!",
                "action"
              )
            );
          }
        }
      }

      // SearchDeck: Buscar Pokemon en el deck y ponerlo en la banca (Call for Family, Sprout)
      if (effect.type === AttackEffectType.SearchDeck && effect.searchPokemonNames && effect.searchPokemonNames.length > 0) {
        const benchCount = newPlayerBench.filter(p => p !== null).length;
        if (benchCount >= 5) {
          events.push(createGameEvent("Tu banca está llena, no puedes buscar Pokémon", "info"));
        } else {
          // Search deck for any matching Pokemon
          const matchingCards = newPlayerDeck.filter(card =>
            card.kind === CardKind.Pokemon &&
            card.stage === PokemonStage.Basic &&
            effect.searchPokemonNames!.includes(card.name)
          );

          if (matchingCards.length > 0) {
            // Take the first matching card
            const foundCard = matchingCards[0];
            // Remove from deck
            newPlayerDeck = newPlayerDeck.filter(c => c.id !== foundCard.id);
            // Shuffle deck
            newPlayerDeck = shuffle(newPlayerDeck);
            // Add to bench
            const newPokemonInPlay: PokemonInPlay = {
              pokemon: foundCard,
              attachedEnergy: [],
              attachedTrainers: [],
              previousEvolutions: [],
              statusConditions: [],
              currentDamage: 0,
              playedOnTurn: gameState.turnNumber,
            };
            newPlayerBench.push(newPokemonInPlay);
            events.push(createGameEvent(`Encontraste ${foundCard.name} y lo pusiste en tu banca`, "action"));
          } else {
            // Shuffle deck even if not found
            newPlayerDeck = shuffle(newPlayerDeck);
            events.push(createGameEvent("No se encontró ningún Pokémon con ese nombre en tu mazo", "info"));
          }
        }
      }

      // DeckSearch: Open modal to search deck for Basic Pokemon (Call for Family)
      // Player can browse entire deck and select one valid Basic Pokemon
      if (effect.type === AttackEffectType.DeckSearch && effect.deckSearchFilter) {
        // Use original gameState bench count, not newPlayerBench which may have been modified by promotion
        const benchCount = gameState.playerBench.filter(p => p !== null).length;
        if (benchCount >= 5) {
          events.push(createGameEvent("Tu banca está llena, no puedes buscar Pokémon", "info"));
        } else {
          // Set pending deck search with filter criteria
          pendingDeckSearch = {
            filter: effect.deckSearchFilter,
          };
          events.push(
            createGameEvent(
              `Busca en tu mazo un Pokémon Básico para colocar en tu banca`,
              "action"
            )
          );
        }
      }
    }
  }

  // STRIKES BACK: Aplicar contraataque si el defensor tiene damageReaction
  // Se aplica incluso si el defensor fue noqueado (usa defender, no newOpponentActive)
  if (effectiveDamage > 0 && newPlayerActive && !attackerKnockedOut) {
    const reaction = getDamageReaction(defender, true); // true = defender was active
    if (reaction) {
      const counterDamage = reaction.reactionDamage;
      const newAttackerDamage = (newPlayerActive.currentDamage || 0) + counterDamage;

      events.push(
        createGameEvent(
          `¡${reaction.powerName}! ${defender.pokemon.name} contraataca con ${counterDamage} de daño`,
          "action"
        )
      );

      // Verificar si el atacante es noqueado por el contraataque
      if (newPlayerActive.pokemon.kind === CardKind.Pokemon && newAttackerDamage >= newPlayerActive.pokemon.hp) {
        attackerKnockedOut = true;
        events.push(
          createGameEvent(`¡${newPlayerActive.pokemon.name} fue noqueado por el contraataque!`, "action")
        );

        // Mover al descarte
        newPlayerDiscard.push(newPlayerActive.pokemon);
        newPlayerDiscard.push(...newPlayerActive.attachedEnergy);
        if (newPlayerActive.attachedTrainers) {
          newPlayerDiscard.push(...newPlayerActive.attachedTrainers);
        }
        if (newPlayerActive.previousEvolutions) {
          newPlayerDiscard.push(...newPlayerActive.previousEvolutions);
        }

        // Oponente toma un premio (si hay y no había tomado por el KO del defensor)
        if (newOpponentPrizes.length > 0 && !isKnockedOut) {
          const prize = newOpponentPrizes.pop()!;
          newOpponentHand.push(prize);
          events.push(createGameEvent("El rival tomó un premio por el contraataque", "action"));
        }

        // Promover Pokémon de la banca del jugador
        const benchPokemonCount = newPlayerBench.filter(p => p != null).length;
        if (benchPokemonCount >= 1) {
          newPlayerActive = null;
          attackerNeedsToPromote = true;
          events.push(
            createGameEvent("Debes elegir un Pokémon de tu banca para continuar", "info")
          );
        } else {
          newPlayerActive = null;
          events.push(createGameEvent("¡Derrota! No tienes más Pokémon", "system"));
          events.push(createGameEvent("Ya puedes salir de la mesa", "info"));
        }
      } else {
        // Solo actualizar daño del atacante
        newPlayerActive = {
          ...newPlayerActive,
          currentDamage: newAttackerDamage,
        };
      }
    }
  }

  // Determinar resultado del juego
  let gameResult: GameResult = null;
  let gamePhase: GamePhase = gameState.gamePhase;

  // Victoria: el rival no tiene más Pokémon
  if (newOpponentActive === null && newOpponentBench.length === 0) {
    gameResult = "victory";
    gamePhase = GamePhase.GameOver;
  }
  // Derrota: el jugador no tiene más Pokémon
  if (newPlayerActive === null && newPlayerBench.length === 0) {
    gameResult = "defeat";
    gamePhase = GamePhase.GameOver;
  }

  // Marcar ataques de uso único como utilizados
  const hasUseOnceEffect = attack.effects?.some((e) => e.type === AttackEffectType.UseOnce);
  if (hasUseOnceEffect && newPlayerActive && !attackerKnockedOut) {
    const usedOnce = newPlayerActive.usedOnceAttacks ?? [];
    if (!usedOnce.includes(attack.name)) {
      newPlayerActive = {
        ...newPlayerActive,
        usedOnceAttacks: [...usedOnce, attack.name],
      };
    }
  }

  // Clear consumed next-turn effects
  if (consumedBonusDamage && newPlayerActive && !attackerKnockedOut) {
    const stillHasReduction = newPlayerActive.nextTurnDamageReduction;
    newPlayerActive = {
      ...newPlayerActive,
      nextTurnBonusDamage: undefined,
      // Only clear the turn tracker if no other effect remains
      nextTurnEffectAppliedOnTurn: stillHasReduction ? newPlayerActive.nextTurnEffectAppliedOnTurn : undefined,
    };
  }
  if (consumedDamageReduction && newOpponentActive) {
    const stillHasBonus = newOpponentActive.nextTurnBonusDamage;
    newOpponentActive = {
      ...newOpponentActive,
      nextTurnDamageReduction: undefined,
      nextTurnEffectAppliedOnTurn: stillHasBonus ? newOpponentActive.nextTurnEffectAppliedOnTurn : undefined,
    };
  }

  // Construir el estado después del ataque
  const stateAfterAttack: GameState = {
    ...gameState,
    gamePhase,
    gameResult,
    playerActivePokemon: attackerKnockedOut ? newPlayerActive : (newPlayerActive ?? attacker),
    playerBench: newPlayerBench,
    playerDiscard: newPlayerDiscard,
    playerDeck: newPlayerDeck,
    opponentActivePokemon: newOpponentActive,
    opponentBench: newOpponentBench,
    opponentDiscard: newOpponentDiscard,
    opponentDeck: newOpponentDeck,
    playerPrizes: newPlayerPrizes,
    playerHand: newPlayerHand,
    opponentPrizes: newOpponentPrizes,
    opponentHand: newOpponentHand,
    playerCanTakePrize: playerCanTakePrize,
    opponentCanTakePrize: attackerKnockedOut && newOpponentPrizes.length > 0,
    playerNeedsToPromote: attackerNeedsToPromote || gameState.playerNeedsToPromote,
    opponentNeedsToPromote: opponentNeedsToPromote,
    pendingForceSwitch: pendingForceSwitch || undefined,
    pendingSelfSwitch: pendingSelfSwitch || undefined,
    pendingDeckSearch: pendingDeckSearch,
    pendingBenchDamageSelection: pendingBenchDamageSelection,
    events,
  };

  // No terminar el turno si el juego terminó o si el jugador puede tomar premio
  if (gameResult !== null) {
    return stateAfterAttack;
  }

  // Si skipEndTurn es true, no terminar el turno (el caller lo hará después de aplicar efectos)
  if (skipEndTurn) {
    return stateAfterAttack;
  }

  // Don't end turn if there's a pending force/self switch, deck search, or bench damage selection — player needs to choose first
  if (pendingForceSwitch || pendingSelfSwitch || pendingDeckSearch || pendingBenchDamageSelection) {
    return stateAfterAttack;
  }

  // Terminar el turno después de atacar (a menos que el jugador pueda tomar premio)
  if (newOpponentActive !== null && newPlayerActive !== null && !playerCanTakePrize) {
    return endTurn(stateAfterAttack);
  }

  return stateAfterAttack;
}

/**
 * Ejecuta Metronomo (Clefairy/Clefable) - copia un ataque del oponente y lo ejecuta
 * con todos sus efectos, ignorando costos de energía y descarte.
 * @param gameState - Estado actual del juego
 * @param copiedAttack - El ataque copiado del Pokémon rival
 * @returns Nuevo estado del juego después de ejecutar el ataque copiado
 */
export function executeMetronome(
  gameState: GameState,
  copiedAttack: Attack,
  skipEndTurn: boolean = false,
  skipDefenderPromotion: boolean = false
): GameState {
  const attacker = gameState.playerActivePokemon;
  const defender = gameState.opponentActivePokemon;

  if (!attacker || !defender) {
    return {
      ...gameState,
      events: [
        ...gameState.events,
        createGameEvent("No hay Pokémon para atacar", "info"),
      ],
    };
  }

  if (attacker.pokemon.kind !== CardKind.Pokemon || defender.pokemon.kind !== CardKind.Pokemon) {
    return gameState;
  }

  // Log del uso de Metronomo
  const events = [
    ...gameState.events,
    createGameEvent(`${attacker.pokemon.name} uso Metronomo y copio ${copiedAttack.name}!`, "action"),
  ];

  // Crear un ataque temporal que use el daño y efectos del ataque copiado
  // pero sin requisitos de energía o descarte (Metronomo ignora esos requisitos)
  const metronomeAttack: Attack = {
    ...copiedAttack,
    cost: [], // Metronomo no requiere energía específica (ya fue pagada con el costo de Metronomo)
    effects: copiedAttack.effects?.map(effect => {
      // Ignorar efectos de descarte de energía (Metronomo no descarta)
      if (effect.type === AttackEffectType.Discard) {
        return { ...effect, type: AttackEffectType.Discard, discardAll: false, discardCostRequirement: [] };
      }
      return effect;
    }),
  };

  // Crear un estado temporal con un Pokémon que tenga el ataque de Metronomo
  const tempAttacker: PokemonInPlay = {
    ...attacker,
    pokemon: {
      ...attacker.pokemon,
      attacks: [metronomeAttack], // Reemplazar ataques con el ataque copiado
    } as PokemonCard,
  };

  const tempState: GameState = {
    ...gameState,
    playerActivePokemon: tempAttacker,
    events,
  };

  // Ejecutar el ataque copiado usando executeAttack
  const resultState = executeAttack(tempState, 0, skipEndTurn, skipDefenderPromotion, undefined);

  // Restaurar el Pokémon original (con sus ataques reales) después de ejecutar
  return {
    ...resultState,
    playerActivePokemon: resultState.playerActivePokemon
      ? { ...resultState.playerActivePokemon, pokemon: attacker.pokemon }
      : null,
  };
}

/**
 * Permite al jugador tomar un premio después de noquear un Pokémon rival
 * @param gameState - Estado actual del juego
 * @param prizeIndex - Índice del premio a tomar (0-5)
 * @param isPlayer - Si es el jugador o el oponente quien toma el premio
 * @returns Nuevo estado del juego con el premio tomado
 */
export function takePrize(gameState: GameState, prizeIndex: number, isPlayer: boolean = true, shouldEndTurn: boolean = true): GameState {
  // Bloquear si el juego ya terminó
  if (gameState.gamePhase === GamePhase.GameOver) {
    return gameState;
  }

  const prizes = isPlayer ? gameState.playerPrizes : gameState.opponentPrizes;
  const canTake = isPlayer ? gameState.playerCanTakePrize : gameState.opponentCanTakePrize;

  // Verificar que puede tomar un premio
  if (!canTake) {
    return {
      ...gameState,
      events: [
        ...gameState.events,
        createGameEvent("No puedes tomar un premio ahora", "info"),
      ],
    };
  }

  // Verificar que el índice es válido
  if (prizeIndex < 0 || prizeIndex >= prizes.length) {
    return {
      ...gameState,
      events: [
        ...gameState.events,
        createGameEvent("Premio inválido", "info"),
      ],
    };
  }

  // Tomar el premio - las cartas nuevas van a la izquierda de la mano
  const prize = prizes[prizeIndex];
  const newPrizes = prizes.filter((_, i) => i !== prizeIndex);
  const newHand = isPlayer
    ? [prize, ...gameState.playerHand]
    : [prize, ...gameState.opponentHand];

  const events = [
    ...gameState.events,
    createGameEvent(
      isPlayer ? "Tomaste un premio" : "El rival tomó un premio",
      "action"
    ),
  ];

  // Verificar victoria por premios
  let gameResult: GameResult = null;
  let gamePhase: GamePhase = gameState.gamePhase;

  if (newPrizes.length === 0) {
    events.push(
      createGameEvent(
        isPlayer ? "¡Victoria! Has tomado todos tus premios" : "¡Derrota! El rival tomó todos sus premios",
        "system"
      )
    );
    events.push(createGameEvent("Ya puedes salir de la mesa", "info"));
    gameResult = isPlayer ? "victory" : "defeat";
    gamePhase = GamePhase.GameOver;
  }

  const updatedState: GameState = {
    ...gameState,
    gamePhase,
    gameResult,
    playerPrizes: isPlayer ? newPrizes : gameState.playerPrizes,
    playerHand: isPlayer ? newHand : gameState.playerHand,
    playerCanTakePrize: isPlayer ? false : gameState.playerCanTakePrize,
    opponentPrizes: !isPlayer ? newPrizes : gameState.opponentPrizes,
    opponentHand: !isPlayer ? newHand : gameState.opponentHand,
    opponentCanTakePrize: !isPlayer ? false : gameState.opponentCanTakePrize,
    events,
  };

  // No terminar turno si el juego terminó o si se indica que no debe terminar
  if (gameResult !== null || !shouldEndTurn) {
    return updatedState;
  }

  // Terminar el turno después de tomar el premio (solo si shouldEndTurn = true)
  if (gameState.opponentActivePokemon !== null && gameState.playerActivePokemon !== null) {
    return endTurn(updatedState);
  }

  return updatedState;
}

/**
 * Promueve un Pokémon de la banca a la posición activa
 * Se usa cuando el jugador necesita elegir manualmente qué Pokémon promover después de un KO
 * @param gameState - Estado actual del juego
 * @param benchIndex - Índice del Pokémon en la banca a promover (0-4)
 * @param isPlayer - Si es el jugador o el oponente quien promueve
 * @returns Nuevo estado del juego con el Pokémon promovido
 */
export function promoteActivePokemon(
  gameState: GameState,
  benchIndex: number,
  isPlayer: boolean = true
): GameState {
  const bench = isPlayer ? gameState.playerBench : gameState.opponentBench;
  const pokemonToPromote = bench[benchIndex];

  if (!pokemonToPromote) {
    return {
      ...gameState,
      events: [
        ...gameState.events,
        createGameEvent("No hay Pokémon en esa posición de la banca", "info"),
      ],
    };
  }

  // Remover de la banca
  const newBench = bench.filter((_, i) => i !== benchIndex);

  const events = [
    ...gameState.events,
    createGameEvent(
      `${pokemonToPromote.pokemon.name} pasa a ser ${isPlayer ? "tu" : "el"} Pokémon activo`,
      "action"
    ),
  ];

  if (isPlayer) {
    return {
      ...gameState,
      playerActivePokemon: pokemonToPromote,
      playerBench: newBench,
      playerNeedsToPromote: false,
      events,
    };
  } else {
    return {
      ...gameState,
      opponentActivePokemon: pokemonToPromote,
      opponentBench: newBench,
      opponentNeedsToPromote: false,
      events,
    };
  }
}
