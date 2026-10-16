import { getCardImageUrl as getCatalogImageUrl } from "@/domain/catalog";
import type { Card, ProtectionType, EnergyType, Attack, PokemonCard, AttackEffect } from "@/domain/cards";
import {
  isEnergyCard,
  isPokemonCard,
  isPlayableAsBasic,
  isTrainerInPlay,
  cardsLeavingPlay,
  cardOutOfPlay,
  givesPrizeWhenKnockedOut,
} from "@/domain/cards";
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
  type CoinFlipResult,
} from "@/domain/constants";
import { decks, findCardBySetAndNumber, type Deck, type DeckEntry } from "@/domain/decks";
import {
  applyDamageHalving,
  getConfusedDamageBonus,
  getKnockOutRetaliation,
  getRetreatCostIncrease,
  getRetreatDamageSources,
  getDamageReaction,
  getEffectiveHp,
  getEffectivePokemonCard,
  getRetreatCostReduction,
  hasBlockingStatus,
  hasStatusImmunity,
  isAwaitingTransformTarget,
  isDamageBlocked,
  isPowerActive,
} from "@/domain/powers";
import { getTurnActionBlocker, isBenchFull, maxBenchSize } from "@/domain/board";
import { stadiumIgnoresResistance, stadiumOffersAttackCoin, stadiumRetreatModifier, VERMILION_COIN_DAMAGE } from "@/domain/stadiums/rules";
import type { SelectionStep } from "@/domain/effects/types";
import { isAttackChoiceEffect, matchesDeckCardFilter, startAttackChoices, type AttackChoiceContext } from "./attackChoices";
export { resolveAttackChoice, isAttackChoiceEffect, matchesDeckCardFilter } from "./attackChoices";
export type { AttackChoiceContext } from "./attackChoices";
import type { PendingPowerChoice } from "./powerChoices";
import { defenderReduction as attachedDefenderReduction, modifierAppliesTo, releaseOrphanModifiers } from "./modifiers";
export { resolvePowerChoice, triggerOnPlayPower, ON_PLAY_POWERS } from "./powerChoices";
export type { PendingPowerChoice, OnPlayPowerDef } from "./powerChoices";
import { assertLegal, IllegalActionError } from "@/shared/errors";
import { chooseAutoPromotion } from "@/domain/ai/choices";

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
  /** Destiny Bond: if this Pokemon is KO'd by an attack, the attacker is also KO'd. Clears at end of owner's next turn. */
  destinyBondActive?: boolean;
  /** Turn number when Destiny Bond was activated (for expiration) */
  destinyBondTurn?: number;
  /**
   * Mirror Shell (Dark Wartortle): turn number when it was used. During the next turn (the
   * opponent's), attack damage done to it is done back to the attacker. Cleared on bench/evolve.
   */
  mirrorShellOnTurn?: number;
  /**
   * Crosscounter / Fire Wall (CounterAttack): during the turn after `onTurn` (the opponent's),
   * attack damage done to it is answered with damage to the attacker: `amount`, or the damage
   * done × `damageMultiplier`; `retaliationCoin` = only on heads (the attack's defender coin);
   * `applyWeaknessResistance` with its type. Cleared on bench/evolve.
   */
  counterAttack?: {
    onTurn: number;
    attackName: string;
    amount?: number;
    damageMultiplier?: number;
    retaliationCoin?: boolean;
    applyWeaknessResistance?: boolean;
  };
  /**
   * Shadow Images (EvadeOnFlip): whenever an attack that can damage it is used against it, the
   * attacking player flips (the attack's defender coin); tails = no damage to it. Lasts until it
   * takes damage from an attack; cleared on bench/evolve.
   */
  evadeOnFlip?: { attackName: string };
  /**
   * Tunneling / Screaming Headbutt (CantAttackNextTurn): during turn `onTurn` (its owner's next
   * turn) it can't attack, or can't use `attackName` only. Cleared on bench/evolve.
   */
  attackLock?: { onTurn: number; attackName?: string };
  /** Sand-Attack / SmokeScreen: opponent must flip coin to attack. Clears on bench/evolve. */
  mustFlipToAttack?: boolean;
  /** Turn number when mustFlipToAttack was set (for expiration) */
  mustFlipToAttackTurn?: number;
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

/** A pending attack choice (see GameState.pendingAttackChoice and lib/attackChoices.ts). */
export type PendingAttackChoice = {
  /** The attack effect waiting for the answer (its type says what the answer does) */
  effect: AttackEffect;
  /** The question; `chooser` = "self" (the attacker) or "opponent" (the defending side) */
  step: SelectionStep;
  /** What the attack left behind (attacker / defender ids, Knock Out, prevention...) */
  context: AttackChoiceContext;
  /** Prophecy: the deck chosen in its first step */
  deck?: "player" | "opponent";
  /** Multi-step choices (Magnetic Lines, Third Eye, Flame Pillar): the answer to the first step */
  picked?: string[];
  /** Choice effects of the same attack still to ask, in order */
  queue: AttackEffect[];
};

/**
 * The Stadium card in play (Gym Heroes): shared by both players; `playedBy` is relative like
 * every side of the state (swapSides flips it) and says whose discard pile it goes to when
 * another Stadium replaces it. Plain data (serialized by the API).
 */
export type StadiumInPlay = { card: GameCard; playedBy: "player" | "opponent" };

/**
 * One player who must return Benched Pokémon to the hand until `keep` are left (a Stadium
 * lowered the Bench limit below its size). See GameState.pendingBenchTrim.
 */
export type BenchTrim = { side: "player" | "opponent"; keep: number };

/** A timed "Pokémon Powers stop working" effect (see GameState.powersSuppressed). */
export type PowerSuppression = {
  /** Card or attack that caused it, for log messages ("Goop Gas Attack") */
  source: string;
  /** Only this Pokémon's power (undefined = every Pokémon in play, both sides) */
  pokemonId?: string;
  /** Last turn number during which it applies */
  expiresAfterTurn: number;
};

export type GameState = {
  playerDeck: GameCard[];
  playerHand: GameCard[];
  playerPrizes: GameCard[];
  playerDiscard: GameCard[];
  playerActivePokemon: PokemonInPlay | null;
  playerBench: PokemonInPlay[]; // Máximo maxBenchSize (5) Pokémon en la banca
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
  /**
   * The acting side already attacked this turn (set by executeAttack/executeMetronome and a
   * failed confused attack; cleared when the turn passes). Blocks a second attack and any
   * other action while the turn waits for prizes/promotions. Kept in sync with match/types.ts.
   */
  attackedThisTurn?: boolean;
  /**
   * endTurn already ran the between-turns Pokémon Checkup for this turn number but stopped
   * before passing the turn (a prize to take or a Pokémon to promote). The next endTurn call
   * skips the checkup, so poison/sleep never apply twice. Cleared when the turn passes.
   * While set, the turn is over: no normal actions (getTurnActionBlocker).
   */
  checkupDoneOnTurn?: number;
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
  /**
   * TypeShift (Venomoth Shift power): the player is choosing a type. Optional power UI:
   * it does NOT block endTurn (ending the turn cancels it). Kept in sync with domain/match/types.ts.
   */
  pendingTypeShift?: {
    /** Pokemon ID that will receive the type change */
    pokemonId: string;
    /** Available types to choose from (types of all Pokemon in play, excluding colorless) */
    availableTypes: EnergyType[];
  };
  /**
   * Peek (Mankey power): result being shown to the player. Informational only:
   * it does NOT block endTurn (ending the turn clears it).
   */
  pendingPeek?: {
    /** What was peeked at */
    peekType: "playerDeck" | "opponentDeck" | "opponentHand" | "playerPrize" | "opponentPrize";
    /** The card(s) that were peeked */
    revealedCards: GameCard[];
  };
  /**
   * Pokémon Powers stopped by a timed effect (Goop Gas Attack: every power; Dark Arbok's
   * Stare: one Pokémon). Read through isPowerActive / isPowerSuppressed. Muk's Toxic Gas is
   * derived from the board, not stored here. Entries are dropped by endTurn once
   * `expiresAfterTurn` has passed. Kept in sync with domain/match/types.ts.
   */
  powersSuppressed?: PowerSuppression[];
  /**
   * A choice an attack left to a player (Hyper Beam's Energy, Terror Strike's switch, Prophecy,
   * Wildfire, Energy Conversion, Scavenge...): see lib/attackChoices.ts. Answer with
   * resolveAttackChoice on the attacking side's view; `step.chooser` says who picks. Blocks
   * endTurn and every other action. Kept in sync with domain/match/types.ts (re-export).
   */
  pendingAttackChoice?: PendingAttackChoice;
  /**
   * A choice left by a Pokémon Power played from the hand (Summon Minions, Sneak Attack,
   * Reel In): see lib/powerChoices.ts. Belongs to the side whose turn it is; answer with
   * resolvePowerChoice on that side's view. Blocks endTurn and every other action.
   */
  pendingPowerChoice?: PendingPowerChoice;
  /**
   * Here Comes Team Rocket!: both players play with their Prize cards face up for the rest of
   * the game (read it with arePrizesRevealed; consumers must not hide the Prizes then).
   */
  prizesFaceUp?: boolean;
  /**
   * The Stadium in play (null / absent = none). Read it with getStadium / stadiumNamed; played
   * with playTrainerCard (playStadium). Kept in sync with domain/match/types.ts (re-export).
   */
  stadium?: StadiumInPlay | null;
  /**
   * A Stadium lowered the Bench limit below a Bench's size: each listed player, in order (the opponent of
   * whoever played it first), returns Benched Pokémon with all their cards to the hand until
   * `keep` are left. Answer the first entry with resolveBenchTrim (any view; normally that
   * player's own, where its side is "player"). Swapped by swapSides. Blocks endTurn and every
   * other action. Kept in sync with domain/match/types.ts (re-export).
   */
  pendingBenchTrim?: BenchTrim[];
  /** Prize cards each player set aside at the start (startGame's prizeCount; 6 when absent). */
  prizeCount?: number;
  /**
   * Headache (Psyduck): no Trainer cards can be played during this turn number (the opponent's
   * next turn). Dropped by endTurn once that turn is over.
   */
  noTrainersOnTurn?: number;
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

/** Catalog card by name across all sets (see the set registry). */
export { findCardByName } from "@/domain/catalog";

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
 * Confusion (Base Set rule): if the attack coin flip is tails, the attack does nothing
 * and the confused Pokémon does 20 damage to itself (no weakness/resistance).
 * Shared by the AI executor and the consumers' coin-flip handlers.
 */
export const CONFUSION_SELF_DAMAGE = 20;

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

  // Mysterious Fossil / Clefairy Doll can't be affected by Special Conditions
  if (isTrainerInPlay(pokemon.pokemon) && status !== StatusCondition.CannotAttack) {
    return pokemon;
  }

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
    // Toxic's 20-damage poison ends with the condition (a later Poison does 10)
    poisonDamage: undefined,
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
 * Resets everything that ends when a Pokémon moves to the bench (retreat, Switch,
 * Whirlwind/Lure, Teleport...). Classic rule: moving to the bench removes ALL
 * special conditions, including Poison. Also clears protection and "next turn" effects.
 */
export function clearStatusConditionsOnRetreat(pokemon: PokemonInPlay): PokemonInPlay {
  return {
    ...pokemon,
    statusConditions: [],
    poisonDamage: undefined,
    paralyzedOnTurn: undefined,
    protection: undefined,
    // Clear all "next turn" attack effects when going to bench (per TCG rules)
    nextTurnBonusDamage: undefined,
    nextTurnDamageReduction: undefined,
    nextTurnEffectAppliedOnTurn: undefined,
    // Clear retreat prevention when going to bench
    retreatPrevented: undefined,
    retreatPreventedOnTurn: undefined,
    // Clear Destiny Bond when going to bench
    destinyBondActive: undefined,
    destinyBondTurn: undefined,
    // Clear Sand-Attack/SmokeScreen when going to bench
    mustFlipToAttack: undefined,
    mustFlipToAttackTurn: undefined,
    mirrorShellOnTurn: undefined,
    counterAttack: undefined,
    evadeOnFlip: undefined,
    attackLock: undefined,
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

  // Mysterious Fossil / Clefairy Doll: "can't retreat"
  if (isTrainerInPlay(pokemon.pokemon)) return false;

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
  // Explicit amount on the card data (Rainbow / Full Heal / Potion Energy: 1)
  if (isEnergyCard(card) && card.provides !== undefined) {
    return card.provides;
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
 * Does this attached Energy card provide Energy of `type` (while in play)? Buzzap Energy
 * provides its chosen type; Rainbow Energy (`providesAllTypes`) every basic type; any other
 * Energy card its printed type. Use it for every "<type> Energy card attached" check (costs,
 * discard costs, Water Gun-style bonuses, Continuous Fireball, Energy Trans, Gather Fire...).
 * In the hand or the discard pile a Rainbow Energy is not a basic Energy card (isBasicEnergy).
 */
export function energyProvidesType(card: GameCard, type: EnergyType): boolean {
  if (card.buzzapEnergyType) return card.buzzapEnergyType === type;
  if (!isEnergyCard(card)) return false;
  if (card.providesAllTypes) return type !== EnergyTypeEnum.Colorless;
  return card.energyType === type;
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
export function hasEnoughEnergyToRetreat(pokemon: PokemonInPlay, bench?: PokemonInPlay[], state?: GameState): boolean {
  if (pokemon.pokemon.kind !== CardKind.Pokemon) return false;
  const retreatCost = getRetreatCost(pokemon, bench, state);

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
export function getRetreatCost(pokemon: PokemonInPlay, bench?: PokemonInPlay[], state?: GameState): number {
  if (pokemon.pokemon.kind !== CardKind.Pokemon) return 0;
  // A transformed Ditto has the copied card's Retreat Cost
  let cost = (state ? getEffectivePokemonCard(state, pokemon)?.retreatCost : undefined) ?? pokemon.pokemon.retreatCost;
  if (bench) {
    cost = Math.max(0, cost - getRetreatCostReduction(bench, state));
  }
  // Sticky Goo (Dark Muk as the opposing Active): Retreat Aid first, then the extra cost
  cost += getRetreatCostIncrease(state, pokemon);
  // The Stadium in play (stadiums/rules.ts)
  return state ? Math.max(0, cost + stadiumRetreatModifier(state, pokemon)) : cost;
}

/**
 * Ejecuta la retirada de un Pokémon
 * @param gameState - Estado actual del juego
 * @param energyIdsToDiscard - IDs de las energías a descartar para pagar el coste
 * @param benchIndex - Índice del Pokémon de la banca que será el nuevo activo
 * @returns Nuevo estado del juego
 */
/**
 * Coins the side whose turn it is ("player") flips when its Active retreats: one per working
 * Sinkhole (Dark Dugtrio) of the opponent, in the opponent's Active-then-Bench order. Pass them
 * to executeRetreat as `coinResults` (the server flips them in multiplayer).
 */
export function getRetreatCoinFlips(state: GameState): number {
  return getRetreatDamageSources(state, "player").length;
}

/** Options of executeRetreat. */
export type RetreatOptions = {
  /**
   * Sinkhole coins (getRetreatCoinFlips, in order): tails = that Sinkhole does its damage to the
   * Pokémon that retreated. Omitted: the engine flips them itself (Math.random). A list of the
   * wrong length throws (a caller bug).
   */
  coinResults?: CoinFlipResult[];
};

export function executeRetreat(
  gameState: GameState,
  energyIdsToDiscard: string[],
  benchIndex: number,
  options: RetreatOptions = {}
): GameState {
  const activePokemon = gameState.playerActivePokemon;
  const benchPokemon = gameState.playerBench[benchIndex];

  // Validaciones
  // A normal action of the turn: not after attacking, not while a prize / promotion / pending effect waits
  const turnBlocker = getTurnActionBlocker(gameState);
  if (turnBlocker) {
    return {
      ...gameState,
      events: [...gameState.events, createGameEvent(turnBlocker, "info")],
    };
  }

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

  const retreatCost = getRetreatCost(activePokemon, gameState.playerBench, gameState);

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

  // Limpiar todos los estados especiales del Pokémon que se retira (incluido veneno)
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

  // Sinkhole (Dark Dugtrio): the retreating player flips once per working Sinkhole of the opponent
  const sinkholes = getRetreatDamageSources(gameState, "player");
  if (options.coinResults && options.coinResults.length !== sinkholes.length) {
    throw new Error(`executeRetreat: needs ${sinkholes.length} coin result(s) (getRetreatCoinFlips), got ${options.coinResults.length}`);
  }
  let retreated = pokemonGoingToBench;
  sinkholes.forEach((source, i) => {
    const coin: CoinFlipResult = options.coinResults?.[i] ?? (Math.random() < 0.5 ? "heads" : "tails");
    const power = isPokemonCard(source.pokemon) ? source.pokemon.power : undefined;
    const powerName = power?.name ?? "Socavón";
    events.push(createGameEvent(`${powerName} de ${source.pokemon.name} - Moneda: [coin:${coin}]`, "info"));
    if (coin === "tails") {
      const amount = power?.amount ?? 20;
      retreated = { ...retreated, currentDamage: (retreated.currentDamage ?? 0) + amount };
      events.push(createGameEvent(`${powerName}: ${retreated.pokemon.name} recibió ${amount} de daño`, "action"));
    }
  });
  const finalBench = sinkholes.length > 0 ? newBench.map((p) => (p === pokemonGoingToBench ? retreated : p)) : newBench;

  // The new Active may change what a transformed Ditto copies (Knock Out if its new HP is too low);
  // Sinkhole can Knock Out the Pokémon that retreated (a Benched Pokémon now)
  return checkKnockouts({
    ...gameState,
    playerActivePokemon: benchPokemon,
    playerBench: finalBench,
    playerDiscard: [...gameState.playerDiscard, ...energiesToDiscard],
    retreatedThisTurn: true,
    events,
  });
}

/** Options of the resolvers of an attack's pending choice (switch, deck search, bench damage...). */
export type PendingResolutionOptions = {
  /** Don't call endTurn once resolved (callers that swap perspective end the turn themselves). */
  skipEndTurn?: boolean;
};

/** The attack is complete once its pending choice is resolved: end the turn unless told not to. */
function finishPendingStep(state: GameState, options: PendingResolutionOptions): GameState {
  return options.skipEndTurn ? state : endTurn(state);
}

/**
 * Applies a ForceSwitch: opponent's active goes to bench, selected bench Pokemon becomes active.
 * Called after executeAttack when pendingForceSwitch is true.
 * Similar to Gust of Wind but triggered by an attack effect.
 */
export function applyForceSwitch(gameState: GameState, benchIndex: number, options: PendingResolutionOptions = {}): GameState {
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
  return finishPendingStep(newState, options);
}

/**
 * Applies a SelfSwitch: attacker switches with own bench Pokemon.
 * Called after executeAttack when pendingSelfSwitch is true.
 * Used by Exeggutor's Teleport.
 */
export function applySelfSwitch(gameState: GameState, benchIndex: number, options: PendingResolutionOptions = {}): GameState {
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
  return finishPendingStep(newState, options);
}

/**
 * Skips a pending ForceSwitch or SelfSwitch (when there are no valid targets)
 * and ends the turn normally.
 */
export function skipPendingSwitch(gameState: GameState, options: PendingResolutionOptions = {}): GameState {
  return finishPendingStep({
    ...gameState,
    pendingForceSwitch: undefined,
    pendingSelfSwitch: undefined,
  }, options);
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
  selectedCardId: string | null,
  options: PendingResolutionOptions = {}
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

    return finishPendingStep(newState, options);
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
  if (benchCount >= maxBenchSize(gameState, "player")) {
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
  return finishPendingStep(newState, options);
}

/**
 * Execute bench damage on selected Pokemon
 * @param gameState Current game state with pendingBenchDamageSelection
 * @param selectedPokemonIds Array of Pokemon IDs to receive damage (empty array = skip/cancel)
 * @returns New game state with damage applied and pending cleared
 */
export function executeBenchDamage(
  gameState: GameState,
  selectedPokemonIds: string[],
  options: PendingResolutionOptions = {}
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

    return finishPendingStep(newState, options);
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
  // Strikes Back (Machamp) of a chosen Benched Pokémon: damage to the attacker (no W/R)
  let strikesBack = 0;

  if (targetSide === "opponent") {
    newOpponentBench = newOpponentBench.map((p) => {
      if (!p || !selectedPokemonIds.includes(p.pokemon.id)) return p;

      const dealt = applyDamageHalving(p, Math.max(0, damageAmount - attachedDefenderReduction(gameState, p)), gameState);
      const newDamage = (p.currentDamage || 0) + dealt;
      events.push(
        createGameEvent(
          `${p.pokemon.name} del rival recibió ${dealt} de daño`,
          "action"
        )
      );
      const reaction = dealt > 0 && gameState.playerActivePokemon ? getDamageReaction(p, false, gameState) : null;
      if (reaction) {
        strikesBack += reaction.reactionDamage;
        events.push(createGameEvent(`¡${reaction.powerName}! ${p.pokemon.name} contraataca con ${reaction.reactionDamage} de daño desde la banca`, "action"));
      }

      return {
        ...p,
        currentDamage: newDamage,
      };
    });
  } else {
    newPlayerBench = newPlayerBench.map((p) => {
      if (!p || !selectedPokemonIds.includes(p.pokemon.id)) return p;

      const dealt = applyDamageHalving(p, Math.max(0, damageAmount - attachedDefenderReduction(gameState, p)), gameState);
      const newDamage = (p.currentDamage || 0) + dealt;
      events.push(
        createGameEvent(
          `Tu ${p.pokemon.name} recibió ${dealt} de daño`,
          "action"
        )
      );

      return {
        ...p,
        currentDamage: newDamage,
      };
    });
  }

  // The attack may already have knocked out an Active: a bench KO can leave a side with
  // no Pokémon at all (Spark KOs the Active, then the last benched Pokémon). Strikes Back can
  // Knock Out the attacker (checkKnockouts: bench KOs first, then the Actives)
  const attacker = gameState.playerActivePokemon;
  const newState = endGameIfNoPokemonLeft(checkKnockouts({
    ...gameState,
    playerActivePokemon: attacker && strikesBack > 0 ? { ...attacker, currentDamage: (attacker.currentDamage || 0) + strikesBack } : attacker,
    playerBench: newPlayerBench,
    opponentBench: newOpponentBench,
    pendingBenchDamageSelection: undefined,
    events,
  }));

  // The last prize may have been taken by a bench KO
  if (newState.gameResult !== null) {
    return newState;
  }

  // End turn after damage is applied
  return finishPendingStep(newState, options);
}

/**
 * The acting side's ("player") active Pokémon is knocked out during its own turn
 * (self damage, Strikes Back, Destiny Bond, confusion). Shared by executeAttack and
 * resolveConfusionFlip. Pure: returns new piles, never mutates the inputs.
 * - The Pokémon and all attached energy/trainers/lower stages go to its discard pile.
 * - The opponent automatically takes exactly one prize (no manual pick is flagged).
 * - `needsToPromote` when something is left on the bench; otherwise a defeat event is
 *   logged. `prizedOut` when that prize was the opponent's last one. The caller sets
 *   gameResult/gamePhase.
 */
function knockOutActingActive(
  knockedOut: PokemonInPlay,
  piles: { bench: PokemonInPlay[]; discard: GameCard[]; opponentPrizes: GameCard[]; opponentHand: GameCard[] },
  prizeMessage: string
): {
  discard: GameCard[];
  opponentPrizes: GameCard[];
  opponentHand: GameCard[];
  needsToPromote: boolean;
  prizedOut: boolean;
  events: GameEvent[];
} {
  const events: GameEvent[] = [];
  const discard = [...piles.discard, ...cardsLeavingPlay(knockedOut)];

  let opponentPrizes = piles.opponentPrizes;
  let opponentHand = piles.opponentHand;
  let prizedOut = false;
  // A Knocked Out Mysterious Fossil / Clefairy Doll doesn't count: no Prize
  if (opponentPrizes.length > 0 && givesPrizeWhenKnockedOut(knockedOut)) {
    const prize = opponentPrizes[opponentPrizes.length - 1];
    opponentPrizes = opponentPrizes.slice(0, -1);
    opponentHand = [...opponentHand, prize];
    events.push(createGameEvent(prizeMessage, "action"));
    prizedOut = opponentPrizes.length === 0;
  }

  const needsToPromote = piles.bench.some((p) => p != null);
  if (prizedOut) {
    events.push(createGameEvent("¡Se tomó el último premio! Fin de la partida", "system"));
    events.push(createGameEvent("Ya puedes salir de la mesa", "info"));
  } else if (needsToPromote) {
    events.push(createGameEvent("Debes elegir un Pokémon de tu banca para continuar", "info"));
  } else {
    events.push(createGameEvent("¡Derrota! No tienes más Pokémon", "system"));
    events.push(createGameEvent("Ya puedes salir de la mesa", "info"));
  }

  return { discard, opponentPrizes, opponentHand, needsToPromote: needsToPromote && !prizedOut, prizedOut, events };
}

/**
 * Knock out the acting side's ("player") Active Pokémon outside an attack (a Trainer or a
 * Power left it with damage >= HP, e.g. Devolution Spray). Same flow as an attacker self-KO:
 * discard it with everything attached, the opponent automatically takes one prize, then the
 * player must promote (or loses when the bench is empty / that was the last prize).
 */
export function knockOutPlayerActive(state: GameState, prizeMessage: string = "El rival tomó un premio"): GameState {
  const active = state.playerActivePokemon;
  if (!active) return state;
  const ko = knockOutActingActive(
    active,
    { bench: state.playerBench, discard: state.playerDiscard, opponentPrizes: state.opponentPrizes, opponentHand: state.opponentHand },
    prizeMessage
  );
  const defeated = ko.prizedOut || !ko.needsToPromote;
  return {
    ...state,
    playerActivePokemon: null,
    playerDiscard: ko.discard,
    opponentPrizes: ko.opponentPrizes,
    opponentHand: ko.opponentHand,
    playerNeedsToPromote: ko.needsToPromote,
    ...(defeated && { gameResult: "defeat" as const, gamePhase: GamePhase.GameOver }),
    events: [...state.events, createGameEvent(`¡${active.pokemon.name} fue noqueado!`, "action"), ...ko.events],
  };
}

/**
 * Knock out the opponent's Active Pokémon outside an attack (Gengar's Curse moved a damage
 * counter onto it...). Its cards go to the opponent's discard pile, the player automatically
 * takes one Prize (none for a Mysterious Fossil / Clefairy Doll), then the opponent must
 * promote a benched Pokémon (`opponentNeedsToPromote`; the player's turn goes on afterwards)
 * or loses when nothing is left. Taking the last Prize wins.
 */
export function knockOutOpponentActive(state: GameState): GameState {
  const active = state.opponentActivePokemon;
  if (!active) return state;
  const events: GameEvent[] = [...state.events, createGameEvent(`¡${active.pokemon.name} fue noqueado!`, "action")];
  let playerPrizes = state.playerPrizes;
  let playerHand = state.playerHand;
  let tookPrize = false;
  if (playerPrizes.length > 0 && givesPrizeWhenKnockedOut(active)) {
    playerHand = [playerPrizes[0], ...playerHand];
    playerPrizes = playerPrizes.slice(1);
    tookPrize = true;
    events.push(createGameEvent(`Se toma 1 premio por noquear a ${active.pokemon.name}`, "action"));
  }
  const next: GameState = {
    ...state,
    opponentActivePokemon: null,
    opponentDiscard: [...state.opponentDiscard, ...cardsLeavingPlay(active)],
    playerPrizes,
    playerHand,
    opponentNeedsToPromote: state.opponentBench.length > 0,
    events,
  };
  if (tookPrize && playerPrizes.length === 0) {
    return {
      ...next,
      gameResult: "victory",
      gamePhase: GamePhase.GameOver,
      opponentNeedsToPromote: false,
      events: [
        ...events,
        createGameEvent("¡Se tomó el último premio! Fin de la partida", "system"),
        createGameEvent("Ya puedes salir de la mesa", "info"),
      ],
    };
  }
  if (next.opponentNeedsToPromote) {
    return { ...next, events: [...events, createGameEvent(`El dueño de ${active.pokemon.name} debe elegir un nuevo Pokémon activo`, "info")] };
  }
  return endGameIfNoPokemonLeft(next);
}

/**
 * Knock Outs after an effect that is not an attack moved or placed damage counters (Gengar's
 * Curse...): both benches (processBenchKnockouts, Prizes taken automatically), then the
 * opponent's and the player's Active Pokémon (knockOutOpponentActive / knockOutPlayerActive),
 * then the "no Pokémon left" check. Pure: returns the same object when nothing happened.
 */
export function checkKnockouts(state: GameState): GameState {
  let next = processBenchKnockouts(state);
  // Actives use their current HP (a transformed Ditto's copy changes with the other Active)
  const isOut = (p: PokemonInPlay | null): boolean =>
    !!p && p.pokemon.kind === CardKind.Pokemon && (p.currentDamage ?? 0) >= getEffectiveHp(next, p) &&
    !isAwaitingTransformTarget(next, p);
  if (next.gameResult === null && isOut(next.opponentActivePokemon)) next = knockOutOpponentActive(next);
  if (next.gameResult === null && isOut(next.playerActivePokemon)) next = knockOutPlayerActive(next);
  // Defender / PlusPower of a Pokémon that left play go to the discard pile with it
  return releaseOrphanModifiers(next === state ? state : endGameIfNoPokemonLeft(next));
}

/**
 * A side with no Active and an empty bench loses (checked after damage that can remove the
 * last Pokémon outside the normal attack flow). Promotion flags of a side with nothing left
 * on the bench are cleared. The "player" side is checked second, like executeAttack.
 */
export function endGameIfNoPokemonLeft(state: GameState): GameState {
  if (state.gameResult !== null) return state;
  const opponentOut = !state.opponentActivePokemon && state.opponentBench.length === 0;
  const playerOut = !state.playerActivePokemon && state.playerBench.length === 0;
  const cleaned: GameState = {
    ...state,
    playerNeedsToPromote: state.playerNeedsToPromote && state.playerBench.length > 0,
    opponentNeedsToPromote: state.opponentNeedsToPromote && state.opponentBench.length > 0,
  };
  if (!opponentOut && !playerOut) return cleaned;
  const result: GameResult = playerOut ? "defeat" : "victory";
  return {
    ...cleaned,
    gameResult: result,
    gamePhase: GamePhase.GameOver,
    playerCanTakePrize: false,
    opponentCanTakePrize: false,
    events: [
      ...state.events,
      createGameEvent(result === "victory" ? "¡Victoria! El rival no tiene más Pokémon" : "¡Derrota! No tienes más Pokémon", "system"),
      createGameEvent("Ya puedes salir de la mesa", "info"),
    ],
  };
}

/**
 * KO sweep for BOTH benches (classic rule: knockouts are checked after every
 * damage source, including bench damage and self-damage attacks).
 *
 * Every benched Pokémon whose damage is >= its HP is Knocked Out: it goes to its
 * owner's discard pile together with its attached energy, trainers and lower
 * evolution stages, and the OTHER side takes one prize per knocked-out Pokémon.
 * Bench-KO prizes are taken automatically from the top of the prize pile (the
 * active-KO manual prize pick, `playerCanTakePrize`, is left untouched).
 * If a side takes its last prize the game ends (`gameResult` is set from the
 * `player` perspective). Simultaneous prize-outs (sudden death) are not modeled:
 * the `player` side is checked first.
 *
 * Active Pokémon are NOT handled here: their KO flow includes the promotion step.
 * Pure: returns the same object when nothing is knocked out.
 */
export function processBenchKnockouts(state: GameState): GameState {
  const isKnockedOut = (p: PokemonInPlay | null | undefined): p is PokemonInPlay =>
    !!p && p.pokemon.kind === CardKind.Pokemon && (p.currentDamage ?? 0) >= p.pokemon.hp;

  const playerKOs = state.playerBench.filter(isKnockedOut);
  const opponentKOs = state.opponentBench.filter(isKnockedOut);
  if (playerKOs.length === 0 && opponentKOs.length === 0) {
    return state;
  }

  const events = [...state.events];
  const cardsOf = (p: PokemonInPlay): GameCard[] => cardsLeavingPlay(p);

  // Takes one prize per KO for the given side (not for a Mysterious Fossil / Clefairy Doll)
  const takePrizes = (prizes: GameCard[], hand: GameCard[], allKnockedOut: PokemonInPlay[]) => {
    const knockedOut = allKnockedOut.filter(givesPrizeWhenKnockedOut);
    const taken = prizes.slice(0, knockedOut.length);
    for (const ko of knockedOut.slice(0, taken.length)) {
      events.push(createGameEvent(`Se toma 1 premio por noquear a ${ko.pokemon.name}`, "action"));
    }
    return { prizes: prizes.slice(taken.length), hand: [...taken, ...hand], took: taken.length > 0 };
  };

  for (const ko of [...opponentKOs, ...playerKOs]) {
    events.push(createGameEvent(`¡${ko.pokemon.name} fue noqueado en la banca!`, "action"));
  }

  // Opponent's benched Pokémon knocked out -> player takes prizes, and vice versa
  const player = takePrizes(state.playerPrizes, state.playerHand, opponentKOs);
  const opponent = takePrizes(state.opponentPrizes, state.opponentHand, playerKOs);

  let gameResult = state.gameResult;
  let gamePhase = state.gamePhase;
  if (gameResult === null) {
    if (player.took && player.prizes.length === 0) {
      gameResult = "victory";
    } else if (opponent.took && opponent.prizes.length === 0) {
      gameResult = "defeat";
    }
    if (gameResult !== null) {
      gamePhase = GamePhase.GameOver;
      events.push(createGameEvent("¡Se tomó el último premio! Fin de la partida", "system"));
      events.push(createGameEvent("Ya puedes salir de la mesa", "info"));
    }
  }

  const gameOver = gameResult !== null && state.gameResult === null;

  return {
    ...state,
    playerBench: state.playerBench.filter((p) => !playerKOs.includes(p)),
    opponentBench: state.opponentBench.filter((p) => !opponentKOs.includes(p)),
    playerDiscard: [...state.playerDiscard, ...playerKOs.flatMap(cardsOf)],
    opponentDiscard: [...state.opponentDiscard, ...opponentKOs.flatMap(cardsOf)],
    playerPrizes: player.prizes,
    playerHand: player.hand,
    opponentPrizes: opponent.prizes,
    opponentHand: opponent.hand,
    gameResult,
    gamePhase,
    ...(gameOver && { playerCanTakePrize: false, opponentCanTakePrize: false }),
    events,
  };
}

/**
 * Construye un mazo completo desde un DeckEntry[]
 * Cards are resolved by (entry.set, entry.cardNumber); no set = Base Set.
 */
export function buildDeckFromEntries(entries: DeckEntry[]): GameCard[] {
  const deck: GameCard[] = [];

  for (const entry of entries) {
    const card = findCardBySetAndNumber(entry.set, entry.cardNumber);
    if (!card) {
      console.warn(`Carta #${entry.cardNumber} (${entry.set ?? "Base Set"}) no encontrada en el catálogo`);
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

/** Prize cards in a standard game. */
export const DEFAULT_PRIZE_COUNT = 6;

export type StartGameOptions = {
  /**
   * Prize cards per player (1-6, default 6): shorter games vs the AI. The game is won as
   * always, by taking the last one.
   */
  prizeCount?: number;
};

/**
 * Prepara el juego: reparte cartas y premios (sin coinflip, eso ocurre después del setup)
 */
export function startGame(gameState: GameState, options: StartGameOptions = {}): GameState {
  const prizeCount = Math.min(DEFAULT_PRIZE_COUNT, Math.max(1, Math.floor(options.prizeCount ?? DEFAULT_PRIZE_COUNT)));

  // Crear copias de los mazos para no mutar los originales
  const playerDeckCopy = [...gameState.playerDeck];
  const opponentDeckCopy = [...gameState.opponentDeck];

  // Mezclar nuevamente antes de repartir
  const shuffledPlayerDeck = shuffle(playerDeckCopy);
  const shuffledOpponentDeck = shuffle(opponentDeckCopy);

  // Repartir: 7 cartas a la mano, los premios, el resto queda en el mazo
  const prizesEnd = 7 + prizeCount;
  const playerHand = shuffledPlayerDeck.slice(0, 7);
  const playerPrizes = shuffledPlayerDeck.slice(7, prizesEnd);
  const playerDeck = shuffledPlayerDeck.slice(prizesEnd);

  const opponentHand = shuffledOpponentDeck.slice(0, 7);
  const opponentPrizes = shuffledOpponentDeck.slice(7, prizesEnd);
  const opponentDeck = shuffledOpponentDeck.slice(prizesEnd);
  const prizesText = `${prizeCount} ${prizeCount === 1 ? "premio" : "premios"}`;

  // Crear eventos
  const newEvents = [
    ...gameState.events,
    createGameEvent(`Tú robas 7 cartas y colocas ${prizesText}`, "action"),
    createGameEvent(`Rival roba 7 cartas y coloca ${prizesText}`, "action"),
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
    prizeCount,
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
  return hand.some(isPlayableAsBasic);
}

/**
 * Why that side (`isPlayer`: the "player" side, else the "opponent" side) can't mulligan
 * now, or null. Only before the game starts (MULLIGAN/SETUP), with no Pokémon in play and
 * no Basic Pokémon (or card played as a Basic) in the hand.
 */
export function canMulligan(gameState: GameState, isPlayer: boolean): string | null {
  if (gameState.gamePhase !== GamePhase.Mulligan && gameState.gamePhase !== GamePhase.Setup) {
    return "Solo puedes hacer mulligan antes de empezar la partida";
  }
  const active = isPlayer ? gameState.playerActivePokemon : gameState.opponentActivePokemon;
  const bench = isPlayer ? gameState.playerBench : gameState.opponentBench;
  if (active || bench.length > 0) return "Ya tienes Pokémon en juego: no puedes hacer mulligan";
  const hand = isPlayer ? gameState.playerHand : gameState.opponentHand;
  if (hasBasicPokemon(hand)) return "Tienes Pokémon básicos en la mano: no puedes hacer mulligan";
  return null;
}

/**
 * Realiza un mulligan: devuelve la mano al mazo, mezcla y roba 7 nuevas cartas.
 * Throws IllegalActionError when `canMulligan` gives a reason.
 */
export function doMulligan(gameState: GameState, isPlayer: boolean): GameState {
  assertLegal(canMulligan(gameState, isPlayer));
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

  // Classic rule: every turn starts with a draw, the starting player's first turn included
  // (endTurn draws for every later turn). The decks are never empty here (60 - 7 - 6).
  const draw = startingPlayer === "player"
    ? drawCard(gameState.playerDeck, gameState.playerHand)
    : drawCard(gameState.opponentDeck, gameState.opponentHand);

  return {
    ...gameState,
    ...(startingPlayer === "player"
      ? { playerDeck: draw.newDeck, playerHand: draw.newHand }
      : { opponentDeck: draw.newDeck, opponentHand: draw.newHand }),
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
      ...(draw.success ? [createGameEvent(startingPlayer === "player" ? "Robaste una carta" : "El rival robó una carta", "info")] : []),
    ],
  };
}

/**
 * Between-turns checkup for one active Pokémon.
 * @param isOwnersTurnEnding - true when this Pokémon's owner is the player ending the turn.
 *   Effects that last "during your opponent's next turn" (Leer / CannotAttack) wear off
 *   only at the end of the affected Pokémon's own turn.
 */
function processStatusEffectsForPokemon(
  pokemon: PokemonInPlay,
  currentTurn: number,
  isOwnersTurnEnding: boolean,
  hp: number
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

    if (updated.pokemon.kind === CardKind.Pokemon && newDamage >= hp) {
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

  // CannotAttack (Leer): applied during the opponent's turn, it must last through the
  // affected Pokémon's next turn, so it is only cleared when its OWNER ends a turn.
  if (isOwnersTurnEnding && hasStatusCondition(updated, StatusCondition.CannotAttack)) {
    updated = removeStatusCondition(updated, StatusCondition.CannotAttack);
    events.push(createGameEvent(`${updated.pokemon.name} ya puede atacar`, "info"));
  }

  return { pokemon: updated, events, isKnockedOut };
}

export function endTurn(gameState: GameState, skipOpponentPromotion: boolean = false): GameState {
  // Block turn end while an ATTACK is still resolving (switch, deck search, bench damage selection).
  // pendingTypeShift / pendingPeek are optional Pokémon Power prompts opened during the turn:
  // they never block (blocking would deadlock a closed modal or a client that never sends
  // clearPeek) and are discarded below so they can't leak into the next turn.
  if (
    gameState.pendingForceSwitch || gameState.pendingSelfSwitch || gameState.pendingDeckSearch ||
    gameState.pendingBenchDamageSelection || gameState.pendingAttackChoice || gameState.pendingPowerChoice ||
    gameState.pendingBenchTrim
  ) {
    return gameState;
  }

  // State-based Knock Outs first (a transformed Ditto whose copy no longer fits its damage)
  gameState = checkKnockouts(gameState);
  if (gameState.gameResult !== null) return gameState;

  const currentTurn = gameState.turnNumber;
  const isPlayerEndingTurn = gameState.isPlayerTurn;
  const newIsPlayerTurn = !isPlayerEndingTurn;
  const newTurnNumber = currentTurn + 1;
  const events: GameEvent[] = [...gameState.events];

  let updatedState: GameState = { ...gameState, pendingTypeShift: undefined, pendingPeek: undefined };

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
      updatedState.playerDiscard = [...updatedState.playerDiscard, ...cardsLeavingPlay(knockedOut)];

      // El oponente puede tomar premio
      if (updatedState.opponentPrizes.length > 0 && givesPrizeWhenKnockedOut(knockedOut)) {
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
      updatedState.opponentDiscard = [...updatedState.opponentDiscard, ...cardsLeavingPlay(knockedOut)];

      // El jugador puede tomar premio
      if (updatedState.playerPrizes.length > 0 && givesPrizeWhenKnockedOut(knockedOut)) {
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
          // Copy instead of splice: updatedState is a shallow copy, the array is the caller's
          updatedState.opponentBench = updatedState.opponentBench.filter((_, i) => i !== opponentPromoteIndex);
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

  // The checkup runs once per turn change, even if endTurn is called again after a pause
  const checkupAlreadyDone = gameState.checkupDoneOnTurn === currentTurn;

  // 1) Pokémon del jugador que TERMINA su turno
  const ownPokemon = isPlayerEndingTurn
    ? updatedState.playerActivePokemon
    : updatedState.opponentActivePokemon;

  if (ownPokemon && gameResult === null && !checkupAlreadyDone) {
    const result = processStatusEffectsForPokemon(ownPokemon, currentTurn, true, getEffectiveHp(gameState, ownPokemon));
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

  if (otherPokemon && gameResult === null && !checkupAlreadyDone) {
    const result = processStatusEffectsForPokemon(otherPokemon, currentTurn, false, getEffectiveHp(gameState, otherPokemon));
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

  // =====================================================================
  // EXPIRE POWER SUPPRESSION (Goop Gas Attack, Stare) — before the state-based Knock Outs:
  // a Ditto whose Transform works again may now be Knocked Out by its copy's HP
  // =====================================================================
  if (updatedState.powersSuppressed?.length) {
    const stillActive = updatedState.powersSuppressed.filter((s) => s.expiresAfterTurn >= newTurnNumber);
    if (stillActive.length !== updatedState.powersSuppressed.length) {
      events.push(createGameEvent("Los Poderes Pokémon vuelven a funcionar", "info"));
    }
    updatedState.powersSuppressed = stillActive.length > 0 ? stillActive : undefined;
  }

  // State-based Knock Outs after the checkup: an auto-promoted Pokémon changed what a transformed
  // Ditto copies (it can't wait for the next turn: the turn change must leave nothing pending)
  const swept = checkKnockouts({ ...updatedState, playerCanTakePrize, opponentCanTakePrize, events: [...events] });
  if (swept.gameResult !== null) return swept;
  if (swept.events.length !== events.length) {
    updatedState = { ...swept };
    events.splice(0, events.length, ...swept.events);
  }

  // Si alguien puede tomar premio o promover, no avanzar el turno aún (either side may still
  // need a new Active: an attack that Knocked Out the Defending Pokémon with skipDefenderPromotion)
  if (playerCanTakePrize || opponentCanTakePrize || updatedState.playerNeedsToPromote || updatedState.opponentNeedsToPromote) {
    return {
      ...updatedState,
      playerCanTakePrize,
      opponentCanTakePrize,
      checkupDoneOnTurn: currentTurn,
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
  // EXPIRAR DESTINY BOND
  // Destiny Bond set on turn T expires at end of opponent's next turn (T + 1)
  // =====================================================================
  const expireDestinyBond = (pokemon: PokemonInPlay | null): PokemonInPlay | null => {
    if (!pokemon?.destinyBondActive || pokemon.destinyBondTurn == null) return pokemon;
    if (newTurnNumber > pokemon.destinyBondTurn + 1) {
      events.push(
        createGameEvent(
          `El efecto de Unión de Destino de ${pokemon.pokemon.name} expiró`,
          "info"
        )
      );
      return { ...pokemon, destinyBondActive: undefined, destinyBondTurn: undefined };
    }
    return pokemon;
  };

  updatedState.playerActivePokemon = expireDestinyBond(updatedState.playerActivePokemon);
  updatedState.opponentActivePokemon = expireDestinyBond(updatedState.opponentActivePokemon);

  // =====================================================================
  // EXPIRAR SAND-ATTACK / SMOKESCREEN (mustFlipToAttack)
  // Set on turn T, expires at end of affected Pokemon's next turn (T + 1)
  // Also clears when going to bench or evolving (handled separately)
  // =====================================================================
  const expireMustFlipToAttack = (pokemon: PokemonInPlay | null): PokemonInPlay | null => {
    if (!pokemon?.mustFlipToAttack || pokemon.mustFlipToAttackTurn == null) return pokemon;
    if (newTurnNumber > pokemon.mustFlipToAttackTurn + 1) {
      events.push(
        createGameEvent(
          `${pokemon.pokemon.name} ya puede atacar normalmente`,
          "info"
        )
      );
      return { ...pokemon, mustFlipToAttack: undefined, mustFlipToAttackTurn: undefined };
    }
    return pokemon;
  };

  updatedState.playerActivePokemon = expireMustFlipToAttack(updatedState.playerActivePokemon);
  updatedState.opponentActivePokemon = expireMustFlipToAttack(updatedState.opponentActivePokemon);

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

  // Headache: the blocked turn is over once the turn after it starts
  if (updatedState.noTrainersOnTurn !== undefined && updatedState.noTrainersOnTurn < newTurnNumber) {
    updatedState.noTrainersOnTurn = undefined;
  }


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
    // Swords Dance's bonus is for the attacker's OWN next turn (T+2): only the reduction ends here
    if (pokemon.nextTurnBonusDamage && newTurnNumber === pokemon.nextTurnEffectAppliedOnTurn + 2) {
      return pokemon.nextTurnDamageReduction ? { ...pokemon, nextTurnDamageReduction: undefined } : pokemon;
    }
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
  // Clear shiftedType and Energy Burn from bench Pokemon as well (both work from the Bench,
  // and a Charizard may have been benched after using Energy Burn)
  updatedState.playerBench = updatedState.playerBench.map(p =>
    p && (p.shiftedType || p.energyConversionType) ? { ...p, shiftedType: undefined, energyConversionType: undefined } : p
  );
  updatedState.opponentBench = updatedState.opponentBench.map(p =>
    p && (p.shiftedType || p.energyConversionType) ? { ...p, shiftedType: undefined, energyConversionType: undefined } : p
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
    attackedThisTurn: undefined,
    checkupDoneOnTurn: undefined,
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
    grass: "Planta",
    fire: "Fuego",
    water: "Agua",
    lightning: "Eléctrica",
    psychic: "Psíquica",
    fighting: "Lucha",
    darkness: "Oscuridad",
    metal: "Metal",
    fairy: "Hada",
    dragon: "Dragón",
    colorless: "Incolora"
  };

  return translations[energyType.toLowerCase()] || energyType;
}

/**
 * Display label of an Energy card: "Energía Fuego" for a basic Energy, the card's name for a
 * special Energy ("Rainbow Energy", "Double Colorless Energy"), the name for anything else.
 */
export function energyCardLabel(card: GameCard): string {
  if (card.buzzapEnergyType) return `Energía ${getEnergyTypeInSpanish(card.buzzapEnergyType)} (${card.name})`;
  if (!isEnergyCard(card)) return card.name;
  return card.isBasic ? `Energía ${getEnergyTypeInSpanish(card.energyType)}` : card.name;
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
 * Attack requirements on the Defending Pokémon (RequireStatus, e.g. Haunter's Dream Eater:
 * "You can't use this attack unless the Defending Pokémon is Asleep").
 * @returns true when every requirement is met (or the attack has none)
 */
export function meetsAttackRequirements(
  attack: Attack,
  defender: PokemonInPlay | null | undefined,
  attacker?: PokemonInPlay | null,
  defenderBench?: PokemonInPlay[],
  attackerBench?: PokemonInPlay[]
): boolean {
  return getAttackRequirementFailure(attack, defender, attacker, defenderBench, attackerBench) === null;
}

/**
 * Why an attack's own requirement isn't met (Spanish reason), or null. Requirements on the
 * attacker are only checked when it is given, the opponent's Bench only when `defenderBench`
 * is given (Fling, Drag Off, Fascinate: "can't be used if your opponent has no Benched Pokémon"),
 * the attacker's Bench only when `attackerBench` is given (Alert).
 */
export function getAttackRequirementFailure(
  attack: Attack,
  defender: PokemonInPlay | null | undefined,
  attacker?: PokemonInPlay | null,
  defenderBench?: PokemonInPlay[],
  attackerBench?: PokemonInPlay[]
): string | null {
  for (const effect of attack.effects ?? []) {
    if (effect.type === AttackEffectType.RequireStatus && effect.requiredStatus) {
      if (effect.target === AttackTarget.Defender && (!defender || !hasStatusCondition(defender, effect.requiredStatus))) {
        return `No puedes usar ${attack.name}: el Pokémon defensor no cumple el requisito del ataque`;
      }
    }
    // Spacing Out: "can't be used if Slowpoke has no damage counters on it" (checked when the attacker is known)
    if (effect.type === AttackEffectType.RequireDamageCounters && attacker && (attacker.currentDamage ?? 0) <= 0) {
      return `No puedes usar ${attack.name}: ${attacker.pokemon.name} no tiene contadores de daño`;
    }
    // Fireball / Playing with Fire: an Energy card of that type attached (Rainbow Energy counts)
    if (effect.type === AttackEffectType.RequireAttachedEnergy && effect.energyType && attacker &&
        !attacker.attachedEnergy.some((e) => energyProvidesType(e, effect.energyType!))) {
      return `No puedes usar ${attack.name}: ${attacker.pokemon.name} no tiene Energía ${getEnergyTypeInSpanish(effect.energyType)} unida`;
    }
    if (effect.type === AttackEffectType.RequireOpponentBench && defenderBench && defenderBench.length === 0) {
      return `No puedes usar ${attack.name}: tu rival no tiene Pokémon en la Banca`;
    }
    if (effect.type === AttackEffectType.RequireOwnBench && attackerBench && attackerBench.length === 0) {
      return `No puedes usar ${attack.name}: no tienes Pokémon en la Banca`;
    }
  }
  return null;
}

/** The Bench of the side `pokemon` is the Active of (for requirements on the defender's Bench). */
function benchOfActive(state: GameState, pokemon: PokemonInPlay | null | undefined): PokemonInPlay[] | undefined {
  if (!pokemon) return undefined;
  if (state.opponentActivePokemon?.pokemon.id === pokemon.pokemon.id) return state.opponentBench;
  if (state.playerActivePokemon?.pokemon.id === pokemon.pokemon.id) return state.playerBench;
  return undefined;
}

/**
 * Verifica si un Pokémon puede usar un ataque específico
 * @param pokemonInPlay - El Pokémon en juego con sus energías adjuntas
 * @param attackIndex - Índice del ataque a verificar
 * @param defender - Pokémon defensor. When given, requirements on the defender are checked
 *   too (Dream Eater needs it Asleep). Omit it to check only energy / once-per-play rules.
 * @returns true si tiene las energías necesarias (y se cumplen los requisitos)
 */
export function canUseAttack(
  pokemonInPlay: PokemonInPlay,
  attackIndex: number,
  defender?: PokemonInPlay | null,
  state?: GameState
): boolean {
  // With the state, a transformed Ditto uses the copied card's attacks and Energy of any type
  const pokemon = (state ? getEffectivePokemonCard(state, pokemonInPlay) : undefined) ?? pokemonInPlay.pokemon;
  if (pokemon.kind !== CardKind.Pokemon) return false;

  const attack = pokemon.attacks[attackIndex];
  if (!attack) return false;

  if (defender !== undefined && !meetsAttackRequirements(attack, defender, pokemonInPlay, state ? benchOfActive(state, defender) : undefined, state ? benchOfActive(state, pokemonInPlay) : undefined)) {
    return false;
  }

  // Verificar si es un ataque de uso único ya utilizado
  const hasUseOnce = attack.effects?.some((e) => e.type === AttackEffectType.UseOnce);
  if (hasUseOnce && pokemonInPlay.usedOnceAttacks?.includes(attack.name)) {
    return false;
  }

  const attachedEnergy = pokemonInPlay.attachedEnergy;

  // Transform (Ditto): any Energy attached counts as Energy of any type
  if (pokemon.transformedFrom) {
    const total = getTotalEnergyValue(attachedEnergy);
    const cards = attachedEnergy.filter((e) => e.kind === CardKind.Energy || e.buzzapEnergyType).length;
    const discardNeeded = Math.max(0, ...(attack.effects ?? []).map((e) => e.discardCostRequirement?.length ?? 0));
    return total >= attack.cost.length && cards >= discardNeeded;
  }

  // Check for Energy Burn conversion (all energy treated as one type)
  // Auto-detect from power if not explicitly set (continuous power)
  let energyConversionType = pokemonInPlay.energyConversionType;
  if (!energyConversionType && isPokemonCard(pokemonInPlay.pokemon)) {
    const power = pokemonInPlay.pokemon.power;
    if (power?.type === PokemonPowerType.EnergyConversion && power.energyType) {
      // Only Asleep/Confused/Paralyzed stop the power (Poison does not); with the state, Toxic Gas too
      if (state ? isPowerActive(state, pokemonInPlay) : !hasBlockingStatus(pokemonInPlay)) {
        energyConversionType = power.energyType;
      }
    }
  }

  // Contar energías por tipo (Double Colorless cuenta como 2 para costos de ataque)
  const energyValueCount: Record<string, number> = {};
  // Contar cartas de energía por tipo (para requisitos de descarte, cada carta = 1)
  const energyCardCount: Record<string, number> = {};
  // Rainbow Energy: counts as any basic type (one type at a time), assigned below where needed
  let wildValue = 0;
  let wildCards = 0;
  for (const energy of attachedEnergy) {
    if (energy.kind === CardKind.Energy && !energyConversionType && !energy.buzzapEnergyType && energy.providesAllTypes) {
      wildValue += getEnergyValue(energy);
      wildCards += 1;
      continue;
    }
    // A Buzzap Electrode is a Pokémon card attached as Energy (kind stays "pokemon")
    if (energy.kind === CardKind.Energy || energy.buzzapEnergyType) {
      // Determine effective energy type:
      // 1. Energy Burn: all energy counts as the conversion type
      // 2. Buzzap energy: use the chosen buzzap type
      // 3. Normal energy: use the card's energy type
      let effectiveType = isEnergyCard(energy) ? energy.energyType : energy.buzzapEnergyType!;
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
  // (lo que falte de un tipo lo puede pagar Rainbow Energy)
  let usedEnergy: Record<string, number> = {};
  let wildLeft = wildValue;
  for (const [type, required] of Object.entries(costCount)) {
    if (type === EnergyTypeEnum.Colorless) continue;

    const available = energyValueCount[type] || 0;
    if (available < required) {
      const missing = required - available;
      if (wildLeft < missing) return false;
      wildLeft -= missing;
      usedEnergy[type] = available;
      continue;
    }
    usedEnergy[type] = required;
  }

  // Luego verificar colorless (puede ser cualquier tipo) usando valores de energía
  const colorlessRequired = costCount[EnergyTypeEnum.Colorless] || 0;
  if (colorlessRequired > 0) {
    // Calcular total de energías restantes después de pagar costos específicos
    let remainingEnergy = wildLeft;
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

        let wildCardsLeft = wildCards;
        for (const [type, required] of Object.entries(discardCount)) {
          const available = energyCardCount[type] || 0;
          if (available < required) {
            const missing = required - available;
            if (wildCardsLeft < missing) return false;
            wildCardsLeft -= missing;
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
 * Base damage of an attack, before weakness/resistance, PlusPower, Defender and
 * protection, and before next-turn bonuses or Mirror Move (executeAttack adds those).
 *
 * - Numeric damage is the printed value.
 * - "Nx" damage starts at 0: the multiplier is always described by an effect —
 *   `DamagePerCounter` (Self) for Flail ("10 × each damage counter on Magikarp"),
 *   or a coin flip (`CoinFlipDamage`: Bonemerang, Double Kick, Fury Swipes) that
 *   executeAttack resolves when the caller passes `coinResults`.
 * - Effects that still carry `coinFlip` are ignored here; a `CoinFlipDamage` without
 *   `coinFlip` (already resolved, see resolveCoinFlipEffects) adds its amount.
 * - "N+" / "N-" start at N and are adjusted by the non-coin-flip effects below.
 *
 * @param attackerBench - bench of the attacking side (BonusDamage "benchCount"/"namedPokemon")
 */
export function calculateBaseDamage(
  attacker: PokemonInPlay,
  defender: PokemonInPlay,
  attack: Attack,
  attackerBench: PokemonInPlay[],
  defenderBench: PokemonInPlay[] = []
): { damage: number; description: string } {
  let baseDamage = 0;
  let description = "";

  if (typeof attack.damage === "number") {
    baseDamage = attack.damage;
  } else if (typeof attack.damage === "string") {
    const numMatch = attack.damage.match(/(\d+)/);
    const baseValue = numMatch ? parseInt(numMatch[1], 10) : 0;
    // "Nx": the multiplier comes from an effect (see above), never from the string itself
    baseDamage = attack.damage.endsWith("x") ? 0 : baseValue;
  }

  const ownCounters = Math.floor((attacker.currentDamage || 0) / 10);

  for (const effect of attack.effects ?? []) {
    if (effect.coinFlip) continue;

    // BonusDamage: add damage based on source (bench count, named pokemon, etc.)
    // Skip Self-targeting BonusDamage without a bonusDamageSource — those are "next turn" buffs (e.g., Swords Dance)
    if (effect.type === AttackEffectType.BonusDamage && effect.amount
        && !(effect.target === AttackTarget.Self && !effect.bonusDamageSource)) {
      let multiplier = 1;
      if (effect.bonusDamageSource === "benchCount") {
        multiplier = attackerBench.filter(p => p != null).length;
      } else if (effect.bonusDamageSource === "namedPokemon" && effect.bonusDamageNameMatch) {
        const name = effect.bonusDamageNameMatch;
        // Count in active + bench
        let count = 0;
        if (attacker.pokemon.name === name) count++;
        for (const bp of attackerBench) {
          if (bp && bp.pokemon.name === name) count++;
        }
        multiplier = count;
      } else if (effect.bonusDamageSource === "namedOnBench" && effect.names) {
        // Magnetism: each named Pokémon on your Bench
        multiplier = attackerBench.filter((p) => p && effect.names!.includes(p.pokemon.name)).length;
      } else if (effect.bonusDamageSource === "namedInPlay" && effect.names) {
        // Mass Explosion: each named Pokémon in play, both sides (Actives included)
        multiplier = [attacker, defender, ...attackerBench, ...defenderBench].filter((p) => p && effect.names!.includes(p.pokemon.name)).length;
      }
      baseDamage += effect.amount * multiplier;
    }

    // DamagePerCounter: damage per damage counter on self (Rage, Rampage, Flail) or defender (Meditate)
    if (effect.type === AttackEffectType.DamagePerCounter && effect.amount) {
      if (effect.target === AttackTarget.Self) {
        baseDamage += effect.amount * ownCounters;
        if (typeof attack.damage === "string" && attack.damage.endsWith("x")) {
          description = ` (${effect.amount} × ${ownCounters} contadores)`;
        }
      } else if (effect.target === AttackTarget.Defender) {
        const counters = Math.floor((defender.currentDamage || 0) / 10);
        baseDamage += effect.amount * counters;
      }
    }

    // SelfDamageReduction (Karate Chop): "N minus 10 for each damage counter on this Pokémon"
    if (effect.type === AttackEffectType.SelfDamageReduction && effect.amount) {
      baseDamage -= effect.amount * ownCounters;
    }

    // HalfHPDamage (Super Fang): damage = half of defender's remaining HP, rounded up to nearest 10
    if (effect.type === AttackEffectType.HalfHPDamage && effect.target === AttackTarget.Defender
        && isPokemonCard(defender.pokemon)) {
      const remainingHP = defender.pokemon.hp - (defender.currentDamage || 0);
      const halfHP = Math.ceil(remainingHP / 2);
      baseDamage = Math.ceil(halfHP / 10) * 10;
    }

    // CoinFlipDamage already resolved by resolveCoinFlipEffects (no `coinFlip` left):
    // the amount is the total coin damage (amount × matching coins)
    if (effect.type === AttackEffectType.CoinFlipDamage && effect.amount) {
      baseDamage += effect.amount;
    }

    // ExtraEnergy: bonus damage per extra energy of a type beyond attack cost
    if (effect.type === AttackEffectType.ExtraEnergy && effect.extraDamagePerEnergy) {
      const energyType = effect.extraEnergyType;
      const maxExtra = effect.maxExtraEnergy ?? Infinity;
      if (energyType) {
        // Count total energy of this type attached (a transformed Ditto's Energy is any type)
        const anyType = isPokemonCard(attacker.pokemon) && !!attacker.pokemon.transformedFrom;
        const totalOfType = attacker.attachedEnergy.filter(
          e => e.kind === CardKind.Energy && (anyType || energyProvidesType(e, energyType))
        ).length;
        // Count how many are required by the attack cost: its symbols of that type, plus the
        // Colorless part that the other Energy can't pay (Poliwrath W W W for W W C: no extra)
        const otherValue = getTotalEnergyValue(attacker.attachedEnergy.filter(
          e => e.kind === CardKind.Energy && !(anyType || energyProvidesType(e, energyType))
        ));
        const colorlessCost = attack.cost.filter(c => c === EnergyTypeEnum.Colorless).length;
        const requiredOfType = attack.cost.filter(c => c === energyType).length + Math.max(0, colorlessCost - otherValue);
        const extraCount = Math.min(Math.max(0, totalOfType - requiredOfType), maxExtra);
        baseDamage += effect.extraDamagePerEnergy * extraCount;
      }
    }
  }

  return { damage: Math.max(0, baseDamage), description };
}

// ============================================================================
// COIN-FLIP ATTACK EFFECTS
// ============================================================================

/** Options for executeAttack / executeMetronome (object form). */
export type ExecuteAttackOptions = {
  /** Don't call endTurn after the attack (the caller will). */
  skipEndTurn?: boolean;
  /** After a KO, let the defending side choose its new active instead of auto-promoting. */
  skipDefenderPromotion?: boolean;
  /** Energy cards chosen to pay a discard cost (Fire Spin...). */
  selectedEnergyIds?: string[];
  /**
   * Conversion 1 / Conversion 2 (Porygon): the type chosen by the attacker. When given, the
   * engine sets the Defending Pokémon's Weakness (if it has one) / the attacker's Resistance
   * (never Colorless). Omitted: unchanged (the consumer applies it, as before).
   */
  chosenType?: EnergyType;
  /**
   * The attacker's coin flips, flipped by the caller (UI or server), in order.
   * Must have exactly `getAttackCoinFlipCount(state, attackIndex)` entries — omit it
   * (or pass []) for attacks without coins. The engine resolves every coin effect.
   */
  coinResults?: CoinFlipResult[];
  /**
   * Vermilion City Gym: the attacker (a Pokémon with Lt. Surge in its name) chose to flip the
   * Stadium's coin (`canUseVermilionCoin`); its coin is in `coinResults` as
   * `getAttackCoinPlan(state, i, { vermilionCoin: true })` lays it out. Refused
   * (IllegalActionError) when the Stadium doesn't offer it.
   */
  vermilionCoin?: boolean;
};

/** Options of getAttackCoinPlan / getAttackCoinFlipCount: the attacker's optional coins. */
export type AttackCoinOptions = Pick<ExecuteAttackOptions, "vermilionCoin">;

/** Coins needed by an attack used by `attacker` (shared by all its coin effects). */
export function coinFlipCountFor(attacker: PokemonInPlay, attack: Attack, state?: GameState): number | "untilTails" {
  let count = 0;
  for (const effect of attack.effects ?? []) {
    if (!effect.coinFlip) continue;
    // Stone Barrage: flip until tails
    if (effect.coinFlip.untilTails) return "untilTails";
    // Big Eggsplosion: one coin per Energy attached (Double Colorless provides 2)
    // Thunderstorm: one coin per opponent's Benched Pokémon
    // Continuous Fireball: one coin per Energy card providing that type (Rainbow Energy counts)
    const n = effect.coinCountFromEnergyType
      ? attacker.attachedEnergy.filter((e) => energyProvidesType(e, effect.coinCountFromEnergyType!)).length
      : effect.coinCountFromEnergy
      ? getTotalEnergyValue(attacker.attachedEnergy)
      : effect.coinCountSource === "opponentBench"
        ? (state?.opponentBench.length ?? 0)
        : effect.coinFlip.count;
    count = Math.max(count, n);
  }
  return count;
}

/**
 * The coins of one attack, in the order they go in `coinResults`:
 *
 * 1. `smokescreen` (0 or 1): the attacker is under Sand-attack / Smokescreen. FIRST coin; tails =
 *    the attack does nothing (no other coin matters).
 * 2. `attack`: the attack's own coins (all its coin effects share them): a fixed number, or
 *    `"untilTails"` (Stone Barrage): a run of heads ending with the first tails (at least 1 coin).
 * 3. `stadium` (absent/0 or 1): the Stadium's coin the attacker opted into (Vermilion City Gym,
 *    `{ vermilionCoin: true }`): heads = 10 more damage to the Defending Pokémon if the attack
 *    damaged it (after Weakness and Resistance), tails = 10 damage to the attacker.
 * 4. `defender` (0 or 1): Haunter's Transparency on the Defending Pokémon, LAST coin (flipped
 *    for the defending player; heads = everything the attack does to Haunter is prevented). Only
 *    counted when the attack can do something to the Defending Pokémon (damage or an effect on
 *    it); it is ignored when the attack ended up doing nothing to it. The same slot is Dark
 *    Gyarados' Final Beam and Rocket's Hitmonchan's Crosscounter (heads = double the damage
 *    back), both only when the attack can damage it.
 *
 * In multiplayer the server flips all of them. Use flipAttackCoins to build the list.
 */
export type AttackCoinPlan = {
  smokescreen: number;
  attack: number | "untilTails";
  /** The attacker's optional Stadium coin (Vermilion City Gym); absent = 0 */
  stadium?: number;
  defender: number;
  /**
   * Who flips the attack's own coins: present ("opponent") only when the defending player flips
   * them (Knock Down, Bench Manipulation: "your opponent flips"). Same position in coinResults.
   */
  attackFlipper?: "opponent";
  /**
   * Who flips the defender coin: present ("attacker") only when the attacking player flips it
   * (Rocket's Scyther's Shadow Images: "your opponent flips"); otherwise the defending player.
   */
  defenderFlipper?: "attacker";
};

/** Effect types that do something to the Defending Pokémon (Transparency flips for them). */
const DEFENDER_EFFECT_TYPES: ReadonlySet<string> = new Set([
  AttackEffectType.ApplyStatus,
  AttackEffectType.ForceSwitch,
  AttackEffectType.PreventRetreat,
  AttackEffectType.SandAttack,
  AttackEffectType.ReturnToHand,
  AttackEffectType.Discard,
  AttackEffectType.ChangeWeakness,
  AttackEffectType.ChooseTargetDamage,
  AttackEffectType.ShuffleDefenderIntoDeck,
  AttackEffectType.MoveDefenderEnergyToBench,
  AttackEffectType.DamageCountersOnDamaged,
]);

/** Can the attack do anything to the Defending Pokémon (damage, or an effect on it)? */
function attackCanAffectDefender(attack: Attack): boolean {
  if (typeof attack.damage === "string" ? attack.damage.length > 0 : (attack.damage ?? 0) > 0) return true;
  return (attack.effects ?? []).some(
    (e) =>
      e.target === AttackTarget.Defender &&
      (DEFENDER_EFFECT_TYPES.has(e.type) ||
        e.type === AttackEffectType.CoinFlipDamage ||
        e.type === AttackEffectType.MirrorMove ||
        e.type === AttackEffectType.HalfHPDamage ||
        e.type === AttackEffectType.DamagePerCounter)
  );
}

/** Haunter's Transparency on this Defending Pokémon (a working PreventAttackOnFlip power). */
function defenderFlipsToPrevent(state: GameState, defender: PokemonInPlay | null): boolean {
  if (!defender || !isPokemonCard(defender.pokemon)) return false;
  const power = defender.pokemon.power;
  return power?.type === PokemonPowerType.PreventAttackOnFlip && isPowerActive(state, defender);
}

/** Can the attack do damage to the Defending Pokémon (Final Beam only matters then)? */
function attackCanDamageDefender(attack: Attack): boolean {
  if (typeof attack.damage === "string" ? attack.damage.length > 0 : (attack.damage ?? 0) > 0) return true;
  return (attack.effects ?? []).some(
    (e) =>
      e.type === AttackEffectType.CoinFlipDamage ||
      e.type === AttackEffectType.ChooseTargetDamage ||
      e.type === AttackEffectType.MirrorMove ||
      e.type === AttackEffectType.HalfHPDamage ||
      e.type === AttackEffectType.DamagePerCounter
  );
}

/**
 * Final Beam (Dark Gyarados) damage to the attacker that Knocked it Out: `amount` per Water
 * Energy card attached to it (Rainbow Energy counts), as damage of its type with the attacker's
 * Weakness and Resistance applied. The coin is the attack's defender coin (getAttackCoinPlan).
 */
export function knockOutRetaliationDamage(
  state: GameState,
  knockedOut: PokemonInPlay,
  attacker: PokemonInPlay
): number {
  const power = getKnockOutRetaliation(state, knockedOut);
  const knockedOutCard = getEffectivePokemonCard(state, knockedOut);
  const attackerCard = getEffectivePokemonCard(state, attacker);
  if (!power || !knockedOutCard || !attackerCard) return 0;
  const waterCards = knockedOut.attachedEnergy.filter((e) => energyProvidesType(e, EnergyTypeEnum.Water)).length;
  let damage = (power.amount ?? 20) * waterCards;
  const type = knockedOut.shiftedType ?? knockedOutCard.types[0];
  const weaknesses = attacker.modifiedWeakness ? [attacker.modifiedWeakness] : attackerCard.weaknesses ?? [];
  const resistances = attacker.modifiedResistance ? [attacker.modifiedResistance] : attackerCard.resistances ?? [];
  if (damage > 0 && type && weaknesses.includes(type)) damage *= 2;
  if (damage > 0 && type && resistances.includes(type)) damage = Math.max(0, damage - 30);
  return damage;
}

/** Crosscounter / Fire Wall used by `pokemon` on the previous turn (working now), or undefined. */
export function activeCounterAttack(state: GameState, pokemon: PokemonInPlay | null | undefined): PokemonInPlay["counterAttack"] {
  const counter = pokemon?.counterAttack;
  return counter && counter.onTurn === state.turnNumber - 1 ? counter : undefined;
}

/**
 * Damage the Pokémon `damaged` (with a working CounterAttack) does back to `attacker` after the
 * attack did `damageDone` to it: `amount` or `damageDone` × `damageMultiplier`, 0 without heads on
 * its coin (`retaliationCoin`), Weakness / Resistance of the attacker for its type if
 * `applyWeaknessResistance`.
 */
export function counterAttackDamage(
  state: GameState,
  damaged: PokemonInPlay,
  damageDone: number,
  attacker: PokemonInPlay,
  coin?: CoinFlipResult
): number {
  const counter = activeCounterAttack(state, damaged);
  if (!counter || damageDone <= 0) return 0;
  if (counter.retaliationCoin && coin !== "heads") return 0;
  let damage = counter.amount ?? damageDone * (counter.damageMultiplier ?? 1);
  if (counter.applyWeaknessResistance) {
    const damagedCard = getEffectivePokemonCard(state, damaged);
    const attackerCard = getEffectivePokemonCard(state, attacker);
    const type = damaged.shiftedType ?? damagedCard?.types[0];
    const weaknesses = attacker.modifiedWeakness ? [attacker.modifiedWeakness] : attackerCard?.weaknesses ?? [];
    const resistances = attacker.modifiedResistance ? [attacker.modifiedResistance] : attackerCard?.resistances ?? [];
    if (type && weaknesses.includes(type)) damage *= 2;
    if (type && resistances.includes(type)) damage = Math.max(0, damage - 30);
  }
  return damage;
}

/**
 * What the attack's defender coin (one at most) is for, or null when there is none:
 * Transparency (whenever the attack can affect the Defending Pokémon), then Final Beam, Shadow
 * Images (flipped by the attacker) and Crosscounter (whenever the attack can damage it).
 */
function defenderCoinKind(
  state: GameState,
  defender: PokemonInPlay | null,
  attack: Attack
): "transparency" | "finalBeam" | "evade" | "counterAttack" | null {
  if (!defender) return null;
  if (defenderFlipsToPrevent(state, defender) && attackCanAffectDefender(attack)) return "transparency";
  if (!attackCanDamageDefender(attack)) return null;
  if (getKnockOutRetaliation(state, defender)) return "finalBeam";
  if (defender.evadeOnFlip) return "evade";
  if (activeCounterAttack(state, defender)?.retaliationCoin) return "counterAttack";
  return null;
}

/**
 * Coin plan of an attack used now by the side whose turn it is ("player"): see AttackCoinPlan.
 * @param attack - index of the Active Pokémon's attack (a transformed Ditto's copied attacks),
 *   or an Attack object (the attack copied by Metronome).
 */
export function getAttackCoinPlan(state: GameState, attack: number | Attack, options: AttackCoinOptions = {}): AttackCoinPlan {
  const none: AttackCoinPlan = { smokescreen: 0, attack: 0, defender: 0 };
  const attacker = state.playerActivePokemon;
  const card = attacker ? getEffectivePokemonCard(state, attacker) : undefined;
  if (!attacker || !card) return none;
  const resolved = typeof attack === "number" ? card.attacks[attack] : attack;
  if (!resolved) return none;
  const defenderCoin = defenderCoinKind(state, state.opponentActivePokemon, resolved);
  const opponentFlips = (resolved.effects ?? []).some((e) => e.coinFlip && e.coinFlippedBy === "opponent");
  // Vermilion City Gym, only when the attacker opted in and the Stadium offers it
  const stadiumCoin = options.vermilionCoin && stadiumOffersAttackCoin(state, attacker);
  return {
    smokescreen: smokescreenCoins(attacker),
    attack: coinFlipCountFor(attacker, resolved, state),
    ...(stadiumCoin && { stadium: 1 }),
    defender: defenderCoin ? 1 : 0,
    ...(defenderCoin === "evade" && { defenderFlipper: "attacker" as const }),
    ...(opponentFlips && { attackFlipper: "opponent" as const }),
  };
}

/** Flip the coins of a plan in order (smokescreen, the attack's own — until tails if so —, stadium, defender). */
export function flipAttackCoins(plan: AttackCoinPlan, flip: () => CoinFlipResult): CoinFlipResult[] {
  const coins: CoinFlipResult[] = [];
  for (let i = 0; i < plan.smokescreen; i++) coins.push(flip());
  if (plan.attack === "untilTails") {
    for (let guard = 0; guard < 1000; guard++) {
      const coin = flip();
      coins.push(coin);
      if (coin === "tails") break;
    }
  } else {
    for (let i = 0; i < plan.attack; i++) coins.push(flip());
  }
  for (let i = 0; i < (plan.stadium ?? 0); i++) coins.push(flip());
  for (let i = 0; i < plan.defender; i++) coins.push(flip());
  return coins;
}

/** Split `coinResults` along the plan; throws when they don't fit it (a caller bug). */
function splitAttackCoins(
  plan: AttackCoinPlan,
  coins: CoinFlipResult[],
  attackName: string
): { smokescreen: CoinFlipResult[]; attack: CoinFlipResult[]; stadium: CoinFlipResult[]; defender: CoinFlipResult[] } {
  const fail = (expected: string): never => {
    throw new Error(`executeAttack: "${attackName}" needs ${expected} coin result(s) (getAttackCoinPlan), got ${coins.length}`);
  };
  const stadiumCount = plan.stadium ?? 0;
  const after = stadiumCount + plan.defender;
  const smokescreen = coins.slice(0, plan.smokescreen);
  const rest = coins.slice(plan.smokescreen);
  let attackCount: number;
  if (plan.attack === "untilTails") {
    const tailsAt = rest.indexOf("tails");
    if (tailsAt === -1) fail(`${plan.smokescreen} + a run ending in tails + ${after}`);
    attackCount = tailsAt + 1;
    if (rest.length !== attackCount + after) fail(`${plan.smokescreen} + ${attackCount} (until tails) + ${after}`);
  } else {
    attackCount = plan.attack;
    if (coins.length !== plan.smokescreen + attackCount + after) fail(String(plan.smokescreen + attackCount + after));
  }
  return {
    smokescreen,
    attack: rest.slice(0, attackCount),
    stadium: rest.slice(attackCount, attackCount + stadiumCount),
    defender: rest.slice(attackCount + stadiumCount),
  };
}

/**
 * How many coins the side whose turn it is ("player") must flip before using an attack:
 * pass the result to executeAttack / executeMetronome as `coinResults`.
 *
 * @param attack - index of the active Pokémon's attack, or an Attack object for an attack
 *   used through Metronome (the copied attack; Energy-based counts use the Metronome user).
 * @returns 0 when the attack has no coin effects (or there is no active Pokémon/attack).
 */
export function getAttackCoinFlipCount(state: GameState, attack: number | Attack, options: AttackCoinOptions = {}): number {
  const plan = getAttackCoinPlan(state, attack, options);
  // "untilTails" (Stone Barrage) has no fixed count: the minimum (tails at once) is returned;
  // callers must use getAttackCoinPlan + flipAttackCoins for those
  return plan.smokescreen + (plan.attack === "untilTails" ? 1 : plan.attack) + (plan.stadium ?? 0) + plan.defender;
}

/**
 * Sand-attack / Smokescreen: a Pokémon with `mustFlipToAttack` flips one extra coin when it
 * attacks; it is the FIRST of `coinResults` (tails: the attack does nothing).
 */
function smokescreenCoins(attacker: PokemonInPlay): number {
  return attacker.mustFlipToAttack ? 1 : 0;
}

/**
 * Energy Bomb / Electric Current (MoveAllEnergyToBench): the attached Energy cards still to move,
 * in order — every card, or with `energyType` those providing it (printed type first, Rainbow
 * Energy last) — at most `amount` minus the `moved` ones.
 */
export function energyToMove(attacker: PokemonInPlay, effect: AttackEffect, moved = 0): GameCard[] {
  const type = effect.energyType;
  const cards = type
    ? [
        ...attacker.attachedEnergy.filter((e) => energyProvidesType(e, type) && !(isEnergyCard(e) && e.providesAllTypes)),
        ...attacker.attachedEnergy.filter((e) => energyProvidesType(e, type) && isEnergyCard(e) && e.providesAllTypes),
      ]
    : attacker.attachedEnergy;
  return cards.slice(0, Math.max(0, (effect.amount ?? Infinity) - moved));
}

/** An attached card as it is once it leaves play (a Mysterious Fossil can't be attached, but be safe). */
function cardOutOfPlayEnergy(card: GameCard): GameCard {
  return cardOutOfPlay(card);
}

/**
 * Mass Explosion's second part (DamageNamedInPlay) as the effects the pipeline already knows:
 * self damage when the attacker is named, and bench damage to the named Benched Pokémon of
 * both sides (the Defending Pokémon's share is added in executeAttack).
 */
function expandNamedDamage(attack: Attack, attackerName: string): Attack {
  if (!attack.effects?.some((e) => e.type === AttackEffectType.DamageNamedInPlay)) return attack;
  return {
    ...attack,
    effects: attack.effects.flatMap((e): AttackEffect[] => {
      if (e.type !== AttackEffectType.DamageNamedInPlay || e.coinFlip) return [e];
      const names = e.names ?? [];
      return [
        e,
        ...(names.includes(attackerName) ? [{ type: AttackEffectType.SelfDamage, target: AttackTarget.Self, amount: e.amount } as AttackEffect] : []),
        { type: AttackEffectType.BenchDamage, target: AttackTarget.Defender, amount: e.amount, benchTarget: BenchDamageTarget.Both, benchNameFilter: names },
      ];
    }),
  };
}

// ============================================================================
// ATTACK LEGALITY
// ============================================================================

/**
 * Why the side whose turn it is ("player") can't use its Active Pokémon's attack
 * `attackIndex` right now, or null. executeAttack enforces it (throws IllegalActionError).
 *
 * Checks: normal-action blocker (PLAYING phase, your turn, nothing pending, not already
 * attacked this turn), both Active Pokémon present, Asleep / Paralyzed / Leer's "can't
 * attack", attack requirements on the Defending Pokémon (Dream Eater), "once while in play"
 * attacks, Energy cost (Double Colorless = 2, Energy Burn, Buzzap) and discard costs, and
 * Call for Family with a full bench.
 *
 * Classic (1999) rule: the starting player MAY attack on its first turn, so there is no
 * first-turn check. Confusion is not a reason (it is resolved by resolveConfusionFlip first).
 */
export function canExecuteAttack(state: GameState, attackIndex: number): string | null {
  const blocker = getTurnActionBlocker(state);
  if (blocker) return blocker;
  const attacker = state.playerActivePokemon;
  const defender = state.opponentActivePokemon;
  if (!attacker || !defender) return "No hay Pokémon para atacar";
  // A transformed Ditto uses the Defending Pokémon's attacks
  const attackerCard = getEffectivePokemonCard(state, attacker);
  if (!attackerCard) return "Tu Pokémon activo no puede atacar";
  const attack = attackerCard.attacks[attackIndex];
  if (!attack) return "Ese ataque no existe";
  const name = attacker.pokemon.name;
  if (hasStatusCondition(attacker, StatusCondition.Asleep)) return `${name} está dormido y no puede atacar`;
  if (hasStatusCondition(attacker, StatusCondition.Paralyzed)) return `${name} está paralizado y no puede atacar`;
  if (hasStatusCondition(attacker, StatusCondition.CannotAttack)) return `${name} no puede atacar este turno`;
  // Tunneling / Screaming Headbutt used on its previous turn
  if (attacker.attackLock?.onTurn === state.turnNumber && !attacker.attackLock.attackName) return `${name} no puede atacar este turno`;
  if (attacker.attackLock?.onTurn === state.turnNumber && attacker.attackLock.attackName === attack.name) {
    return `${name} no puede usar ${attack.name} este turno`;
  }
  const requirement = getAttackRequirementFailure(attack, defender, attacker, state.opponentBench, state.playerBench);
  if (requirement) return requirement;
  const isUseOnce = attack.effects?.some((e) => e.type === AttackEffectType.UseOnce);
  if (isUseOnce && attacker.usedOnceAttacks?.includes(attack.name)) return `${attack.name} ya fue usado`;
  if (!canUseAttack(attacker, attackIndex, undefined, state)) return `${name} no tiene la energía necesaria para ${attack.name}`;
  const searchesDeck = attack.effects?.some(
    (e) => e.type === AttackEffectType.DeckSearch || (e.type === AttackEffectType.SearchDeckChoice && e.destination === "bench")
  );
  if (searchesDeck && isBenchFull(state, "player")) {
    return "Tu banca está llena, no puedes usar este ataque";
  }
  return null;
}

/** Index of the Metronome-style (CopyAttack) attack of the player's Active Pokémon, or -1. */
function copyAttackIndex(state: GameState): number {
  const attacker = state.playerActivePokemon;
  const card = attacker ? getEffectivePokemonCard(state, attacker) : undefined;
  if (!card) return -1;
  return card.attacks.findIndex((a) => a.effects?.some((e) => e.type === AttackEffectType.CopyAttack));
}

/**
 * Why Metronome (Clefairy / Clefable) can't copy `copiedAttack` now, or null: Metronome
 * itself must be usable (its own cost, statuses, turn...) and `copiedAttack` must be one of
 * the Defending Pokémon's attacks whose requirements are met.
 */
export function canExecuteMetronome(state: GameState, copiedAttack: Attack): string | null {
  const index = copyAttackIndex(state);
  if (index === -1) return "Tu Pokémon activo no tiene Metrónomo";
  const reason = canExecuteAttack(state, index);
  if (reason) return reason;
  const defender = state.opponentActivePokemon!;
  const defenderCard = getEffectivePokemonCard(state, defender);
  const copyable = !!defenderCard && defenderCard.attacks.some((a) => a.name === copiedAttack.name);
  if (!copyable) return "Metrónomo solo puede copiar un ataque del Pokémon Defensor";
  const requirement = getAttackRequirementFailure(copiedAttack, defender, undefined, state.opponentBench, state.playerBench);
  if (requirement) return requirement;
  return null;
}

const NON_STATUS_COIN_OUTCOMES = ["damage", "protection", "preventRetreat"];

export type CoinResolution = {
  /** The attack's effects with every coin effect turned into a plain effect (or dropped). */
  effects: AttackEffect[];
  /** Coin effects that did not happen (tails on Scrunch...), for log messages. */
  missed: AttackEffect[];
  /** The attack has coin damage (CoinFlipDamage / coin BonusDamage). */
  hasCoinDamage: boolean;
};

/**
 * Turn coin effects into the equivalent non-coin effects for these flips, so the regular
 * effects pipeline in executeAttack applies them (one damage value before weakness and
 * resistance, KO checks, protection, immunity...). All coin effects of an attack share the
 * same coins (Thrash: one coin decides +10 or 10 to itself).
 *
 * - An effect "happens" once per matching coin: heads if `onHeads` is set, tails if
 *   `onTails` is set (the value only matters for ApplyStatus, where it is the status).
 * - CoinFlipDamage / coin BonusDamage → CoinFlipDamage with amount × matching coins
 *   (calculateBaseDamage adds it to the base damage).
 * - SelfDamage / Heal → amount × matching coins. ApplyStatus → the status for the coin side.
 * - Protection, PreventRetreat, Draw (Pay Day) and anything else → kept once if any coin matches.
 */
export function resolveCoinFlipEffects(effects: AttackEffect[], coins: CoinFlipResult[]): CoinResolution {
  // (Thunderstorm) perCoinBenchTarget: coin i decides the i-th Benched Pokémon of the target side
  const heads = coins.filter((c) => c === "heads").length;
  const tails = coins.length - heads;
  const resolved: AttackEffect[] = [];
  const missed: AttackEffect[] = [];
  let hasCoinDamage = false;

  for (const effect of effects) {
    if (!effect.coinFlip) {
      resolved.push(effect);
      continue;
    }
    const { coinFlip, coinCountFromEnergy: _fromEnergy, ...plain } = effect;
    const hits = (coinFlip.onHeads ? heads : 0) + (coinFlip.onTails ? tails : 0);

    // Surprise Thunder: the first coin must be heads; the second one picks the amount
    if (effect.secondCoinAmounts) {
      if (coins[0] !== "heads") missed.push(effect);
      else resolved.push({ ...plain, amount: coins[1] === "heads" ? effect.secondCoinAmounts.heads : effect.secondCoinAmounts.tails });
      continue;
    }
    // Petal Whirlwind: the effect needs at least `minHits` matching coins
    if (coinFlip.minHits !== undefined && hits < coinFlip.minHits) {
      missed.push(effect);
      continue;
    }

    if (effect.type === AttackEffectType.CoinFlipDamage || effect.type === AttackEffectType.BonusDamage) {
      hasCoinDamage = true;
      resolved.push({ ...plain, type: AttackEffectType.CoinFlipDamage, target: AttackTarget.Defender, amount: (effect.amount ?? 0) * hits });
      continue;
    }

    if (effect.type === AttackEffectType.ApplyStatus) {
      const isStatus = (v: string | undefined): v is StatusCondition => !!v && !NON_STATUS_COIN_OUTCOMES.includes(v);
      const status =
        heads > 0 && isStatus(coinFlip.onHeads) ? coinFlip.onHeads
        : tails > 0 && isStatus(coinFlip.onTails) ? coinFlip.onTails
        : undefined;
      if (status) resolved.push({ ...plain, status });
      else missed.push(effect);
      continue;
    }

    if (effect.type === AttackEffectType.BenchDamage && effect.perCoinBenchTarget) {
      const wanted = coinFlip.onHeads ? "heads" : "tails";
      const indexes = coins.map((c, i) => (c === wanted ? i : -1)).filter((i) => i !== -1);
      if (indexes.length === 0) missed.push(effect);
      else resolved.push({ ...plain, benchTargetIndexes: indexes });
      continue;
    }
    if (hits === 0) {
      missed.push(effect);
      continue;
    }
    if (effect.type === AttackEffectType.SelfDamage || effect.type === AttackEffectType.Heal) {
      // Healing Pollen: "for each heads, remove 1 damage counter"
      resolved.push({ ...plain, amount: (effect.amount ?? 0) * hits });
    } else if (effect.type === AttackEffectType.Discard && effect.energyType) {
      // Continuous Fireball: one Fire Energy card per heads
      resolved.push({ ...plain, amount: (effect.amount ?? 1) * hits });
    } else {
      resolved.push(plain);
    }
  }

  return { effects: resolved, missed, hasCoinDamage };
}


/**
 * Uses an attack of the active Pokémon of the side whose turn it is ("player") against the
 * opponent's active Pokémon, resolving damage, effects, knockouts and (by default) endTurn.
 *
 * Two call forms:
 *
 * - **Options object (engine-owned coins)**: `executeAttack(state, i, { coinResults, ... })`.
 *   The caller flips `getAttackCoinFlipCount(state, i)` coins and passes them; the engine
 *   resolves every coin effect (coin damage before weakness/resistance, statuses, self
 *   damage, protection, prevent retreat, Pay Day...). Throws if the number of coins doesn't
 *   match (a caller bug: it would otherwise silently change the outcome).
 * - **Legacy positional booleans** `(state, i, skipEndTurn?, skipDefenderPromotion?, selectedEnergyIds?)`:
 *   unchanged behaviour — effects with `coinFlip` are SKIPPED and the caller applies them.
 *   Deprecated; kept so consumers can migrate one at a time.
 *
 * @example
 * const coins = Array.from({ length: getAttackCoinFlipCount(state, 1) }, flipCoin);
 * const next = executeAttack(state, 1, { coinResults: coins });
 */
export function executeAttack(gameState: GameState, attackIndex: number, options?: ExecuteAttackOptions): GameState;
/** @deprecated Coin effects are skipped in this form; pass `{ coinResults }` instead. */
export function executeAttack(
  gameState: GameState,
  attackIndex: number,
  skipEndTurn?: boolean,
  skipDefenderPromotion?: boolean,
  selectedEnergyIds?: string[]
): GameState;
export function executeAttack(
  gameState: GameState,
  attackIndex: number,
  skipEndTurnOrOptions: boolean | ExecuteAttackOptions = false,
  skipDefenderPromotionArg: boolean = false,
  selectedEnergyIdsArg?: string[]
): GameState {
  assertLegal(canExecuteAttack(gameState, attackIndex));
  return executeAttackUnchecked(gameState, attackIndex, skipEndTurnOrOptions, skipDefenderPromotionArg, selectedEnergyIdsArg);
}

/** executeAttack without the legality guard (executeMetronome checks Metronome itself). */
function executeAttackUnchecked(
  gameState: GameState,
  attackIndex: number,
  skipEndTurnOrOptions: boolean | ExecuteAttackOptions,
  skipDefenderPromotionArg: boolean,
  selectedEnergyIdsArg?: string[]
): GameState {
  const options = typeof skipEndTurnOrOptions === "object" && skipEndTurnOrOptions !== null
    ? skipEndTurnOrOptions
    : undefined;
  const skipEndTurn = options ? !!options.skipEndTurn : !!skipEndTurnOrOptions;
  const skipDefenderPromotion = options ? !!options.skipDefenderPromotion : skipDefenderPromotionArg;
  const selectedEnergyIds = options ? options.selectedEnergyIds : selectedEnergyIdsArg;

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

  // The cards the rules see: a transformed Ditto is a copy of the other Active (Transform)
  const attackerCard = getEffectivePokemonCard(gameState, attacker);
  const defenderCard = getEffectivePokemonCard(gameState, defender);
  if (!attackerCard || !defenderCard) {
    return gameState;
  }
  const attackerView: PokemonInPlay = { ...attacker, pokemon: attackerCard };
  const defenderView: PokemonInPlay = { ...defender, pokemon: defenderCard };

  const printedAttack = attackerCard.attacks[attackIndex];
  if (!printedAttack) return gameState;

  // Coin flips: in the options form the engine resolves coin effects from the caller's coins,
  // laid out as getAttackCoinPlan says (Sand-attack/Smokescreen first, Transparency last).
  // Vermilion City Gym's optional coin: only when the Stadium offers it to this attacker
  if (options?.vermilionCoin && !stadiumOffersAttackCoin(gameState, attacker)) {
    throw new IllegalActionError("El Estadio en juego no ofrece una moneda a este Pokémon");
  }
  const coinPlan = getAttackCoinPlan(gameState, printedAttack, { vermilionCoin: options?.vermilionCoin });
  const allCoins = options ? (options.coinResults ?? []) : undefined;
  const splitCoins = allCoins ? splitAttackCoins(coinPlan, allCoins, printedAttack.name) : undefined;
  if (splitCoins && splitCoins.smokescreen.length > 0) {
    const coin = splitCoins.smokescreen[0];
    const events = [
      ...gameState.events,
      createGameEvent(`${attacker.pokemon.name} debe lanzar una moneda para atacar - Moneda: [coin:${coin}]`, "info"),
    ];
    if (coin === "tails") {
      // The attack is used but does nothing; the turn ends like after any attack
      const failed: GameState = {
        ...gameState,
        attackedThisTurn: true,
        events: [...events, createGameEvent(`${attacker.pokemon.name} usó ${printedAttack.name} pero el ataque no hizo nada`, "action")],
      };
      return skipEndTurn ? failed : endTurn(failed);
    }
    gameState = { ...gameState, events: [...events, createGameEvent("[coin:heads] El ataque procede normalmente", "info")] };
  }
  const coinResults = splitCoins?.attack;
  const coinResolution = coinResults && coinResults.length > 0
    ? resolveCoinFlipEffects(printedAttack.effects ?? [], coinResults)
    : null;
  const expandedAttack: Attack = expandNamedDamage(
    coinResolution ? { ...printedAttack, effects: coinResolution.effects } : printedAttack,
    attacker.pokemon.name
  );
  // The Stadium's coin the attacker opted into (Vermilion City Gym): heads adds damage below,
  // tails = damage to the attacker besides whatever the attack does (the self-damage effect)
  const stadiumCoin = splitCoins?.stadium[0];
  const attack: Attack = stadiumCoin === "tails"
    ? {
        ...expandedAttack,
        effects: [
          ...(expandedAttack.effects ?? []),
          { type: AttackEffectType.SelfDamage, target: AttackTarget.Self, amount: VERMILION_COIN_DAMAGE } as AttackEffect,
        ],
      }
    : expandedAttack;
  // The defending side's coin, last in the list: Transparency (Haunter) or Final Beam (Dark Gyarados)
  const defenderCoin = splitCoins?.defender[0];
  const defenderPowerType = isPokemonCard(defender.pokemon) ? defender.pokemon.power?.type : undefined;
  const transparencyCoin = defenderPowerType === PokemonPowerType.PreventAttackOnFlip ? defenderCoin : undefined;
  const finalBeamCoin = defenderPowerType === PokemonPowerType.KnockOutRetaliation ? defenderCoin : undefined;
  const defenderCoinFor = defenderCoinKind(gameState, defender, printedAttack);
  const counterAttackCoin = defenderCoinFor === "counterAttack" ? defenderCoin : undefined;
  // Shadow Images: tails = this attack does no damage to the Defending Pokémon
  const evadeCoin = defenderCoinFor === "evade" ? defenderCoin : undefined;

  // Dive Bomb / Clamp tails: "this attack does nothing (not even damage)"
  if (attack.effects?.some((e) => e.type === AttackEffectType.AttackFails && !e.coinFlip)) {
    const tokens = (coinResults ?? []).map((r) => `[coin:${r}]`).join(" ");
    const failed: GameState = {
      ...gameState,
      attackedThisTurn: true,
      events: [
        ...gameState.events,
        ...(tokens ? [createGameEvent(`Moneda: ${tokens}`, "info")] : []),
        createGameEvent(`${attacker.pokemon.name} usó ${attack.name} pero el ataque no hizo nada`, "action"),
      ],
    };
    return skipEndTurn ? failed : endTurn(failed);
  }

  // RequireStatus (Dream Eater): the attack can't be used unless the defender has the status
  if (!meetsAttackRequirements(attack, defender, attacker, gameState.opponentBench, gameState.playerBench)) {
    return {
      ...gameState,
      events: [
        ...gameState.events,
        createGameEvent(`No puedes usar ${attack.name}: el Pokémon defensor no cumple el requisito del ataque`, "info"),
      ],
    };
  }

  // Block DeckSearch attacks when bench is full (TCG rule: "No puedes usar este ataque si tu Banca está llena.")
  const hasDeckSearchEffect = attack.effects?.some(e => e.type === AttackEffectType.DeckSearch);
  if (hasDeckSearchEffect) {
    const benchCount = gameState.playerBench.filter(p => p !== null).length;
    if (benchCount >= maxBenchSize(gameState, "player")) {
      return {
        ...gameState,
        events: [
          ...gameState.events,
          createGameEvent("Tu banca está llena, no puedes usar este ataque", "info"),
        ],
      };
    }
  }

  // Daño base: printed damage + non-coin-flip damage effects (see calculateBaseDamage)
  const base = calculateBaseDamage(attackerView, defenderView, attack, gameState.playerBench, gameState.opponentBench);
  let baseDamage = base.damage;
  // Drag Off: its damage goes to the Benched Pokémon switched in by its choice (attackChoices)
  if (attack.effects?.some((e) => e.type === AttackEffectType.ChooseTargetDamage && e.switchWithDefender)) baseDamage = 0;
  const damageMultiplierDescription = base.description;

  // Frenzy (Dark Primeape): it does 30 more damage while Confused
  const frenzyBonus = baseDamage > 0 ? getConfusedDamageBonus(gameState, attacker) : 0;
  if (frenzyBonus > 0) baseDamage += frenzyBonus;

  // Apply stored nextTurnBonusDamage from a previous turn (e.g., Swords Dance +30)
  // The bonus is consumed and cleared later when assembling the final state
  let consumedBonusDamage = false;
  let bonusDamageMessage = "";
  // Only an attack that does damage gets it ("Slash's base damage is 60"; not Swords Dance again)
  if (attacker.nextTurnBonusDamage && attacker.nextTurnBonusDamage > 0 && baseDamage > 0) {
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
    : (defenderCard.weaknesses ?? []);
  const defenderResistances = defender.modifiedResistance
    ? [defender.modifiedResistance]
    : (defenderCard.resistances ?? []);

  // Use shiftedType (Venomoth Shift) if available, otherwise use original type
  const attackerType = attacker.shiftedType || attackerCard.types[0];
  // Sonicboom: "Don't apply Weakness and Resistance for this attack"
  const ignoresWeaknessResistance = attack.effects?.some((e) => e.type === AttackEffectType.IgnoreWeaknessResistance) ?? false;
  const hasWeakness = !isMirrorMove && !ignoresWeaknessResistance && defenderWeaknesses.includes(attackerType);
  // The Stadium in play may cancel Resistance for this attacker (stadiums/rules.ts)
  const hasResistance = !isMirrorMove && !ignoresWeaknessResistance && !stadiumIgnoresResistance(gameState, attacker) &&
    defenderResistances.includes(attackerType);

  // Aplicar debilidad (x2)
  if (hasWeakness) {
    damage *= 2;
  }

  // Aplicar resistencia (-30)
  if (hasResistance) {
    damage = Math.max(0, damage - 30);
  }

  // Vermilion City Gym heads: 10 more if the attack does damage to the Defending Pokémon
  // after Weakness and Resistance (like PlusPower)
  if (stadiumCoin === "heads" && damage > 0) {
    damage += VERMILION_COIN_DAMAGE;
  }

  // Aplicar bonus de PlusPower (después de debilidad/resistencia, según reglas TCG)
  // PlusPower only adds damage if the attack does damage to the defending Pokemon after
  // Weakness and Resistance (10 vs Resistance = 0: no PlusPower)
  const plusPowerModifiers = gameState.activeModifiers.filter(
    (m) => m.source === "plusPower" && m.playerId === "player" && modifierAppliesTo(m, attacker)
  );
  const plusPowerBonus = plusPowerModifiers.reduce((sum, m) => sum + m.amount, 0);
  if (plusPowerBonus > 0 && damage > 0) {
    damage += plusPowerBonus;
  }

  // Aplicar reducción de Defender (después de debilidad/resistencia)
  const defenderModifiers = gameState.activeModifiers.filter(
    (m) => m.source === "defender" && modifierAppliesTo(m, defender)
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

  // Kabuto Armor: half the damage (after Weakness/Resistance and the modifiers above), rounded down
  const damageBeforeArmor = damage;
  damage = applyDamageHalving(defender, damage, gameState);
  const halvedByArmor = damage < damageBeforeArmor;

  // Verificar si el defensor está protegido o tiene barrera de daño
  const defenderIsProtected = protectionBlocksDamage(defender, damage);
  // Transparency (Haunter) heads: every effect of this attack done to it, damage included, is prevented
  const transparencyPrevents = transparencyCoin === "heads";
  // DamageAndEffects protection (Agility, Barrier, Tail Wag) also blocks status, ForceSwitch, PreventRetreat
  const defenderBlocksEffects = (defender.protection?.type === "damageAndEffects" && defenderIsProtected) || transparencyPrevents;
  let effectiveDamage = damage;
  let damageBarrierBlocked = false;
  if (transparencyPrevents) {
    effectiveDamage = 0;
  } else if (defenderIsProtected && damage > 0) {
    effectiveDamage = 0;
  } else if (evadeCoin === "tails") {
    effectiveDamage = 0;
  } else if (isDamageBlocked(defender, damage, gameState)) {
    effectiveDamage = 0;
    damageBarrierBlocked = true;
  }
  const evaded = evadeCoin === "tails" && !transparencyPrevents && !(defenderIsProtected && damage > 0);

  // Mass Explosion: its second part also hits the Defending Pokémon when it is named (no W/R),
  // unless everything was prevented
  const namedDamage = attack.effects?.find((e) => e.type === AttackEffectType.DamageNamedInPlay && !e.coinFlip);
  const namedDefenderDamage =
    namedDamage?.names?.includes(defender.pokemon.name) && !transparencyPrevents && !(defenderIsProtected && damage > 0)
      ? applyDamageHalving(defender, namedDamage.amount ?? 0, gameState)
      : 0;

  // Pain Amplifier: a damage counter on the Defending Pokémon if it already had any (not damage:
  // only what prevents every effect of the attack stops it)
  const countersOnDamaged = attack.effects?.find((e) => e.type === AttackEffectType.DamageCountersOnDamaged && !e.coinFlip);
  const defenderCounters =
    countersOnDamaged && (defender.currentDamage || 0) > 0 && !defenderBlocksEffects ? countersOnDamaged.amount ?? 10 : 0;

  // Aplicar daño al defensor
  const newDamage = (defender.currentDamage || 0) + effectiveDamage + namedDefenderDamage + defenderCounters;
  const defenderHP = defenderCard.hp;

  // Crear eventos
  const events: GameEvent[] = [...gameState.events];

  // Coin results first, so the log reads: coins → attack → effects
  if (coinResolution && coinResults) {
    const tokens = coinResults.map((r) => `[coin:${r}]`).join(" ");
    events.push(createGameEvent(coinResults.length === 1 ? `Moneda: ${tokens}` : `Monedas: ${tokens}`, "info"));
  }

  // The Stadium's coin (Vermilion City Gym), after the attack's own coins
  if (stadiumCoin) {
    events.push(createGameEvent(`${gameState.stadium?.card.name ?? "Estadio"} - Moneda: [coin:${stadiumCoin}]`, "info"));
  }

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

  // Transparency's coin, flipped for the Defending Pokémon
  if (transparencyCoin) {
    const powerName = isPokemonCard(defender.pokemon) ? defender.pokemon.power?.name ?? "Transparencia" : "Transparencia";
    events.push(createGameEvent(`${powerName} de ${defender.pokemon.name} - Moneda: [coin:${transparencyCoin}]`, "info"));
  }
  // Shadow Images' coin, flipped by the attacker
  if (evadeCoin && defender.evadeOnFlip) {
    events.push(createGameEvent(`${defender.evadeOnFlip.attackName} de ${defender.pokemon.name} - Moneda: [coin:${evadeCoin}]`, "info"));
  }

  // Mensaje del ataque con detalles de debilidad/resistencia y protección
  let damageMessage = "";
  if (transparencyPrevents) {
    damageMessage = ` pero ${defender.pokemon.name} evitó todos sus efectos (Transparencia)`;
  } else if (defenderIsProtected && damage > 0) {
    if (defender.protection?.threshold !== undefined) {
      damageMessage = ` pero Endurecimiento previno ${damage} de daño (${damage} ≤ ${defender.protection.threshold})`;
    } else {
      damageMessage = ` pero ${defender.pokemon.name} está protegido. ¡El daño fue prevenido!`;
    }
  } else if (evaded) {
    damageMessage = ` pero ${defender.pokemon.name} no recibió daño (${defender.evadeOnFlip?.attackName ?? "Imágenes Sombra"})`;
  } else if (damageBarrierBlocked) {
    const barrierPowerName = isPokemonCard(defender.pokemon) ? defender.pokemon.power?.name || "Muro Invisible" : "Muro Invisible";
    damageMessage = ` pero ${defender.pokemon.name} bloqueó el daño con ${barrierPowerName}`;
  } else if (effectiveDamage > 0) {
    const armorNote = halvedByArmor ? " (la mitad por Armadura Kabuto)" : "";
    if (halvedByArmor) {
      damageMessage = ` e hizo ${effectiveDamage} de daño${damageMultiplierDescription}${armorNote}`;
    } else if (hasWeakness) {
      damageMessage = ` e hizo ${effectiveDamage} de daño${damageMultiplierDescription} (x2 debilidad)`;
    } else if (hasResistance) {
      damageMessage = ` e hizo ${effectiveDamage} de daño${damageMultiplierDescription} (-30 resistencia)`;
    } else {
      damageMessage = ` e hizo ${effectiveDamage} de daño${damageMultiplierDescription}`;
    }
  } else if (coinResolution?.hasCoinDamage && baseDamage === 0) {
    // Coin damage attack with no matching coins (Twineedle tails/tails, Leek Slap tails)
    damageMessage = " pero no hizo daño";
  } else if (damageMultiplierDescription && baseDamage === 0) {
    // Ataque por contadores propios (Azote/Flail) sin contadores: indicarlo.
    damageMessage = " pero no hizo daño (0 contadores)";
  } else if (hasResistance && baseDamage > 0) {
    // El ataque tenía daño pero fue reducido a 0 por resistencia
    damageMessage = ` e hizo 0 de daño (-30 resistencia)`;
  } else if (defenderReduction > 0 && baseDamage > 0) {
    // El ataque fue reducido a 0 por Defender
    damageMessage = ` e hizo 0 de daño (bloqueado por Defender)`;
  } else if (halvedByArmor) {
    damageMessage = ` e hizo 0 de daño (la mitad por Armadura Kabuto)`;
  }

  events.push(
    createGameEvent(
      `${attacker.pokemon.name} usó ${attack.name}${damageMessage}`,
      "action"
    )
  );

  // Coin protection that didn't happen (Scrunch, Stiffen, Withdraw, Agility on tails)
  if (coinResolution?.missed.some((e) => e.type === AttackEffectType.Protection)) {
    events.push(createGameEvent(`${attacker.pokemon.name} no logró protegerse`, "info"));
  }

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
    newOpponentDiscard.push(...cardsLeavingPlay(defender));

    // Marcar que el jugador puede tomar un premio (si hay; un Fósil Misterioso no da premio)
    if (newPlayerPrizes.length > 0 && givesPrizeWhenKnockedOut(defender)) {
      playerCanTakePrize = true;
      events.push(createGameEvent("¡Puedes tomar un premio!", "action"));
    }

    // The replacement is chosen AFTER all attack effects and the bench KO sweep
    // (see "DEFENDER REPLACEMENT" below), so a benched Pokémon knocked out by this
    // same attack is never promoted and the replacement doesn't dodge bench damage.
    newOpponentActive = null;
  } else {
    // Solo actualizar daño + store lastDamageReceived for Mirror Move
    newOpponentActive = {
      ...defender,
      currentDamage: newDamage,
      lastDamageReceived: effectiveDamage > 0 ? effectiveDamage : undefined,
      // Shadow Images lasts until it takes damage
      ...(newDamage > (defender.currentDamage || 0) && { evadeOnFlip: undefined }),
    };
  }

  // Destiny Bond: if the defender was KO'd and had Destiny Bond active, KO the attacker too
  let destinyBondTriggered = false;
  if (isKnockedOut && defender.destinyBondActive && effectiveDamage > 0) {
    destinyBondTriggered = true;
    events.push(
      createGameEvent(
        `¡Unión de Destino! ¡${defender.pokemon.name} se lleva a ${attacker.pokemon.name} consigo!`,
        "action"
      )
    );
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
  // Vanish: the attacker left play without a Knock Out
  let attackerLeftPlay = false;
  let attackerNeedsToPromote = false;
  let pendingBenchDamageSelection: GameState["pendingBenchDamageSelection"] = undefined;

  // Shared attacker-KO step (self damage, Strikes Back, Destiny Bond): see knockOutActingActive
  const applyAttackerKnockout = (knockedOut: PokemonInPlay, prizeMessage: string) => {
    const ko = knockOutActingActive(
      knockedOut,
      { bench: newPlayerBench, discard: newPlayerDiscard, opponentPrizes: newOpponentPrizes, opponentHand: newOpponentHand },
      prizeMessage
    );
    events.push(...ko.events);
    return {
      newPlayerDiscard: ko.discard,
      newOpponentPrizes: ko.opponentPrizes,
      newOpponentHand: ko.opponentHand,
      attackerNeedsToPromote: ko.needsToPromote,
    };
  };

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
        let selfDamage: number = effect.amount;

        // Apply Defender reduction to self-damage
        const selfDefenderMods = gameState.activeModifiers.filter(
          (m) => m.source === "defender" && modifierAppliesTo(m, newPlayerActive)
        );
        const selfDefenderReduction = selfDefenderMods.reduce((sum, m) => sum + Math.abs(m.amount), 0);
        if (selfDefenderReduction > 0) {
          selfDamage = Math.max(0, selfDamage - selfDefenderReduction);
          events.push(
            createGameEvent(
              `Defender redujo el auto-daño en ${selfDefenderReduction}`,
              "info"
            )
          );
        }

        // Kabuto Armor also halves damage an attack does to its own user ("even your own")
        selfDamage = applyDamageHalving(newPlayerActive, selfDamage, gameState);
        const newSelfDamage: number = (newPlayerActive.currentDamage || 0) + selfDamage;

        if (selfDamage > 0) {
          events.push(
            createGameEvent(
              `${newPlayerActive.pokemon.name} se hizo ${selfDamage} de daño a sí mismo`,
              "action"
            )
          );
        }

        // Verificar si el atacante se noqueó
        if (newSelfDamage >= attackerCard.hp) {
          attackerKnockedOut = true;
          events.push(
            createGameEvent(`¡${newPlayerActive.pokemon.name} se noqueó a sí mismo!`, "action")
          );

          ({ newPlayerDiscard, newOpponentPrizes, newOpponentHand, attackerNeedsToPromote } =
            applyAttackerKnockout(newPlayerActive, "El rival tomó un premio"));
          newPlayerActive = null;
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
        // Opponent's Benched Pokémon this effect damaged now (Strikes Back reacts only for them;
        // chosen targets react in executeBenchDamage)
        const damagedOpponentBenchIds = new Set<string>();

        // Chain Lightning: use original defender types (not newOpponentActive which may be promoted replacement)
        const defenderTypes = defenderCard.types;
        if (effect.skipIfColorless && defenderTypes.includes(EnergyTypeEnum.Colorless)) {
          // Effect does nothing against Colorless defenders
        } else {
          // Determine if we need manual selection
          const maxTargets = effect.maxBenchTargets ?? Infinity;
          const needsManualSelection = maxTargets < Infinity;
          // Thunderstorm: only the Benched Pokémon whose coin was heads (by bench position)
          const coinIndexes = effect.benchTargetIndexes;

          // Mass Explosion: only the named Benched Pokémon; Blaze / Water Ring: only (or not) these types
          const nameFilter = effect.benchNameFilter;
          const typesOf = (p: PokemonInPlay): EnergyType[] => (p.shiftedType ? [p.shiftedType] : isPokemonCard(p.pokemon) ? p.pokemon.types : []);
          const named = (p: PokemonInPlay) =>
            (!nameFilter || nameFilter.includes(p.pokemon.name)) &&
            (!effect.benchTypes || typesOf(p).some((t) => effect.benchTypes!.includes(t))) &&
            (!effect.benchExcludeTypes || !typesOf(p).some((t) => effect.benchExcludeTypes!.includes(t)));
          // Count available targets
          const getAvailableTargets = (bench: PokemonInPlay[]): PokemonInPlay[] => {
            return bench.filter((p) => {
              if (!p) return false;
              if (!named(p)) return false;
              if (effect.matchDefenderType && isPokemonCard(p.pokemon)) {
                return p.pokemon.types.some((t) => defenderTypes.includes(t));
              }
              return true;
            });
          };

          // Check if we need manual selection (when maxTargets < available targets)
          if (target === BenchDamageTarget.Opponent || target === BenchDamageTarget.Both) {
            const availableOpponentTargets = getAvailableTargets(newOpponentBench);

            // Gigashock: "choose 3 ... if fewer than 3, do the damage to each of them" — no choice then
            const exactAndAll = effect.exactBenchTargets && availableOpponentTargets.length <= maxTargets;
            if (needsManualSelection && availableOpponentTargets.length > 0 && !exactAndAll) {
              // Set pending state - frontend will show selection modal
              pendingBenchDamageSelection = {
                damageAmount: benchDamageAmount,
                targetSide: "opponent",
                maxTargets: maxTargets,
                minTargets: effect.exactBenchTargets
                  ? Math.min(maxTargets, availableOpponentTargets.length)
                  : Math.min(1, availableOpponentTargets.length),
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
              newOpponentBench = newOpponentBench.map((benchPokemon, benchIndex) => {
                if (!benchPokemon || opponentHitsRemaining <= 0) return benchPokemon;
                if (coinIndexes && !coinIndexes.includes(benchIndex)) return benchPokemon;
                if (!named(benchPokemon)) return benchPokemon;

                // Filter by defender type if matchDefenderType is set
                if (effect.matchDefenderType && isPokemonCard(benchPokemon.pokemon)) {
                  const sharesType = benchPokemon.pokemon.types.some((t) => defenderTypes.includes(t));
                  if (!sharesType) return benchPokemon;
                }

                opponentHitsRemaining--;
                const dealt = applyDamageHalving(benchPokemon, Math.max(0, benchDamageAmount - attachedDefenderReduction(gameState, benchPokemon)), gameState);
                if (dealt > 0) damagedOpponentBenchIds.add(benchPokemon.pokemon.id);
                const newBenchDamage = (benchPokemon.currentDamage || 0) + dealt;
                events.push(
                  createGameEvent(
                    `${benchPokemon.pokemon.name} del rival recibió ${dealt} de daño`,
                    "action"
                  )
                );

                return {
                  ...benchPokemon,
                  currentDamage: newBenchDamage,
                  // Mirror Move: track bench damage so it can be copied when promoted
                  lastDamageReceived: dealt > 0 ? dealt : undefined,
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
                if (!named(benchPokemon)) return benchPokemon;

                // Filter by defender type if matchDefenderType is set
                if (effect.matchDefenderType && isPokemonCard(benchPokemon.pokemon)) {
                  const sharesType = benchPokemon.pokemon.types.some((t) => defenderTypes.includes(t));
                  if (!sharesType) return benchPokemon;
                }

                ownHitsRemaining--;
                const dealt = applyDamageHalving(benchPokemon, Math.max(0, benchDamageAmount - attachedDefenderReduction(gameState, benchPokemon)), gameState);
                const newBenchDamage = (benchPokemon.currentDamage || 0) + dealt;
                events.push(
                  createGameEvent(
                    `Tu ${benchPokemon.pokemon.name} recibió ${dealt} de daño`,
                    "action"
                  )
                );

                return {
                  ...benchPokemon,
                  currentDamage: newBenchDamage,
                  // Mirror Move: track bench damage for potential use when promoted
                  lastDamageReceived: dealt > 0 ? dealt : undefined,
                };
              });
            }
          }
        }

        // Strikes Back: check bench Pokemon with DamageReaction powers (e.g., Machamp)
        // Only opponent bench can trigger Strikes Back against the attacker
        if (target === BenchDamageTarget.Opponent || target === BenchDamageTarget.Both) {
          if (newPlayerActive && !attackerKnockedOut) {
            for (const benchPokemon of newOpponentBench) {
              if (!benchPokemon) continue;
              // Not damaged by this bench damage (Mass Explosion's names, Chain Lightning's type,
              // Thunderstorm's tails, a target still to be chosen)
              if (!damagedOpponentBenchIds.has(benchPokemon.pokemon.id)) continue;
              const reaction = getDamageReaction(benchPokemon, false, gameState); // false = from bench
              if (reaction) {
                const counterDamage = reaction.reactionDamage;
                const currentAttackerDamage: number = newPlayerActive.currentDamage || 0;
                const newAttackerDamage: number = currentAttackerDamage + counterDamage;
                events.push(
                  createGameEvent(
                    `¡${reaction.powerName}! ${benchPokemon.pokemon.name} contraataca con ${counterDamage} de daño desde la banca`,
                    "action"
                  )
                );

                if (newAttackerDamage >= attackerCard.hp) {
                  attackerKnockedOut = true;
                  events.push(
                    createGameEvent(`¡${newPlayerActive.pokemon.name} fue noqueado por el contraataque de ${benchPokemon.pokemon.name}!`, "action")
                  );
                  ({ newPlayerDiscard, newOpponentPrizes, newOpponentHand, attackerNeedsToPromote } =
                    applyAttackerKnockout(newPlayerActive, "El rival tomó un premio por el contraataque"));
                  newPlayerActive = null;
                  break; // Attacker KO'd, stop checking further reactions
                } else {
                  newPlayerActive = { ...newPlayerActive, currentDamage: newAttackerDamage };
                }
              }
            }
          }
        }

        // Bench KOs are resolved by processBenchKnockouts() once all effects are applied
      }

      // Pain Amplifier on the opponent's Benched Pokémon that already have damage counters (KOs: processBenchKnockouts)
      if (effect.type === AttackEffectType.DamageCountersOnDamaged) {
        const amount = effect.amount ?? 10;
        const hit = [
          ...(defenderCounters > 0 ? [defender.pokemon.name] : []),
          ...newOpponentBench.filter((p) => (p.currentDamage ?? 0) > 0).map((p) => p.pokemon.name),
        ];
        newOpponentBench = newOpponentBench.map((p) => ((p.currentDamage ?? 0) > 0 ? { ...p, currentDamage: (p.currentDamage ?? 0) + amount } : p));
        if (hit.length > 0) events.push(createGameEvent(`${attack.name}: ${amount / 10} contador${amount > 10 ? "es" : ""} de daño en ${hit.join(", ")}`, "action"));
      }

      // Healing Pollen: `amount` from each of your Pokémon (all of their counters if fewer)
      if (effect.type === AttackEffectType.Heal && effect.healAllOwn) {
        const amount = effect.amount ?? 0;
        const healed: string[] = [];
        const heal = (p: PokemonInPlay): PokemonInPlay => {
          const removed = Math.min(amount, p.currentDamage ?? 0);
          if (removed <= 0) return p;
          healed.push(`${p.pokemon.name} (${removed})`);
          return { ...p, currentDamage: (p.currentDamage ?? 0) - removed };
        };
        if (newPlayerActive) newPlayerActive = heal(newPlayerActive);
        newPlayerBench = newPlayerBench.map(heal);
        if (healed.length > 0) events.push(createGameEvent(`${attack.name}: se curó el daño de ${healed.join(", ")}`, "action"));
      }

      // Heal: cure damage from self (e.g., Butterfree Mega Drain, Exeggcute Leech Seed, Venonat Leech Life)
      if (effect.type === AttackEffectType.Heal && !effect.healAllOwn && effect.target === AttackTarget.Self && newPlayerActive) {
        // Leech Seed: "unless all damage from this attack is prevented" (protection, Invisible Wall,
        // Transparency); an attack without damage (Spacing Out) heals anyway
        const damagePrevented = transparencyPrevents || (defenderIsProtected && damage > 0) || damageBarrierBlocked;
        let healAmount = damagePrevented ? 0 : effect.amount || 0;
        if (effect.healFromDamage === "all") {
          // Leech Life: as many counters as the damage done (after W/R)
          healAmount = effectiveDamage;
        } else if (effect.healFromDamage === "halfRoundedUp") {
          // Absorb: half the damage done, rounded up to the nearest 10
          healAmount = Math.ceil(effectiveDamage / 2 / 10) * 10;
        } else if (effect.healFromDamageDealt) {
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
              (e) => e.kind === CardKind.Energy && energyProvidesType(e, reqType)
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

      // Energy Bomb / Electric Current with no Benched Pokémon: the Energy cards to move are discarded
      if (effect.type === AttackEffectType.MoveAllEnergyToBench && newPlayerActive && !attackerKnockedOut && newPlayerBench.length === 0) {
        const discarded = energyToMove(newPlayerActive, effect);
        if (discarded.length > 0) {
          newPlayerDiscard.push(...discarded.map(cardOutOfPlayEnergy));
          newPlayerActive = { ...newPlayerActive, attachedEnergy: newPlayerActive.attachedEnergy.filter((e) => !discarded.includes(e)) };
          events.push(createGameEvent(
            effect.energyType
              ? `${newPlayerActive.pokemon.name} descartó ${discarded.map(energyCardLabel).join(", ")} (no hay Pokémon en la Banca)`
              : `${newPlayerActive.pokemon.name} descartó todas sus energías (no hay Pokémon en la Banca)`,
            "action"
          ));
        }
      }

      // Mirror Shell: remember the turn (checked during the opponent's next attack)
      if (effect.type === AttackEffectType.MirrorShell && newPlayerActive && !attackerKnockedOut) {
        newPlayerActive = { ...newPlayerActive, mirrorShellOnTurn: gameState.turnNumber };
        events.push(createGameEvent(`${newPlayerActive.pokemon.name} devolverá el daño que reciba durante el siguiente turno`, "action"));
      }

      // Tunneling / Screaming Headbutt: locked during its owner's next turn
      if (effect.type === AttackEffectType.CantAttackNextTurn && newPlayerActive && !attackerKnockedOut) {
        newPlayerActive = {
          ...newPlayerActive,
          attackLock: { onTurn: gameState.turnNumber + 2, ...(effect.thisAttackOnly && { attackName: attack.name }) },
        };
        events.push(createGameEvent(
          effect.thisAttackOnly
            ? `${newPlayerActive.pokemon.name} no podrá usar ${attack.name} durante el próximo turno de su dueño`
            : `${newPlayerActive.pokemon.name} no podrá atacar durante el próximo turno de su dueño`,
          "action"
        ));
      }

      // Shadow Images: until it takes damage
      if (effect.type === AttackEffectType.EvadeOnFlip && newPlayerActive && !attackerKnockedOut) {
        newPlayerActive = { ...newPlayerActive, evadeOnFlip: { attackName: attack.name } };
        events.push(createGameEvent(`Quien ataque a ${newPlayerActive.pokemon.name} deberá lanzar una moneda: si sale cruz, el ataque no le hace daño`, "action"));
      }

      // Crosscounter / Fire Wall: remembered for the opponent's next turn
      if (effect.type === AttackEffectType.CounterAttack && newPlayerActive && !attackerKnockedOut) {
        newPlayerActive = {
          ...newPlayerActive,
          counterAttack: {
            onTurn: gameState.turnNumber,
            attackName: attack.name,
            ...(effect.amount !== undefined && { amount: effect.amount }),
            ...(effect.damageMultiplier !== undefined && { damageMultiplier: effect.damageMultiplier }),
            ...(effect.retaliationCoin && { retaliationCoin: true }),
            ...(effect.applyWeaknessResistance && { applyWeaknessResistance: true }),
          },
        };
        events.push(createGameEvent(`${newPlayerActive.pokemon.name} contraatacará si recibe daño de un ataque durante el siguiente turno`, "action"));
      }

      // Conversion 1 / 2 (Porygon), when the caller passed the chosen type
      if (options?.chosenType && options.chosenType !== EnergyTypeEnum.Colorless) {
        if (effect.type === AttackEffectType.ChangeWeakness && newOpponentActive && !isKnockedOut && !defenderBlocksEffects) {
          const hasWeakness = !!newOpponentActive.modifiedWeakness || (defenderCard.weaknesses ?? []).length > 0;
          if (hasWeakness) {
            newOpponentActive = { ...newOpponentActive, modifiedWeakness: options.chosenType };
            events.push(createGameEvent(`La Debilidad de ${newOpponentActive.pokemon.name} pasa a ser ${getEnergyTypeInSpanish(options.chosenType)}`, "action"));
          }
        }
        if (effect.type === AttackEffectType.ChangeResistance && newPlayerActive && !attackerKnockedOut) {
          newPlayerActive = { ...newPlayerActive, modifiedResistance: options.chosenType };
          events.push(createGameEvent(`La Resistencia de ${newPlayerActive.pokemon.name} pasa a ser ${getEnergyTypeInSpanish(options.chosenType)}`, "action"));
        }
      }

      // Descarte de energía como costo del ataque
      if (effect.type === AttackEffectType.Discard && newPlayerActive) {
        if (effect.target === AttackTarget.Self && effect.energyType && effect.amount && !effect.discardCostRequirement) {
          // Continuous Fireball / Fireball / Playing with Fire: N Energy cards of that type
          // (cards printed with the type first, Rainbow Energy last)
          const type = effect.energyType;
          const candidates = [
            ...newPlayerActive.attachedEnergy.filter((e) => energyProvidesType(e, type) && !(isEnergyCard(e) && e.providesAllTypes)),
            ...newPlayerActive.attachedEnergy.filter((e) => isEnergyCard(e) && e.providesAllTypes),
          ].slice(0, effect.amount);
          if (candidates.length > 0) {
            const ids = candidates.map((e) => e.id);
            newPlayerDiscard.push(...candidates);
            newPlayerActive = { ...newPlayerActive, attachedEnergy: newPlayerActive.attachedEnergy.filter((e) => !ids.includes(e.id)) };
            events.push(createGameEvent(`${newPlayerActive.pokemon.name} descartó ${candidates.map(energyCardLabel).join(", ")}`, "action"));
          }
        } else if (effect.discardAll && effect.energyType) {
          // Discharge: every Energy card of that type (Rainbow Energy included)
          const type = effect.energyType;
          const discarded: GameCard[] = newPlayerActive.attachedEnergy.filter((e) => energyProvidesType(e, type));
          if (discarded.length > 0) {
            newPlayerDiscard.push(...discarded);
            newPlayerActive = { ...newPlayerActive, attachedEnergy: newPlayerActive.attachedEnergy.filter((e: GameCard) => !discarded.includes(e)) };
            events.push(createGameEvent(`${newPlayerActive.pokemon.name} descartó ${discarded.map(energyCardLabel).join(", ")}`, "action"));
          }
        } else if (effect.discardAll) {
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
                if (!hasBlockingStatus(newPlayerActive)) energyConversionType = power.energyType;
              }
            }

            for (const reqType of discardReq) {
              const matches = (e: GameCard): boolean => {
                if (e.kind !== CardKind.Energy && !e.buzzapEnergyType) return false;
                // With Energy Burn, all energy counts as the converted type
                if (energyConversionType) return true;
                // Buzzap energy uses its chosen type; Rainbow Energy any basic type
                return energyProvidesType(e, reqType);
              };
              // A card printed with that type first, Rainbow Energy last
              const exact = remainingEnergy.findIndex((e) => matches(e) && !(isEnergyCard(e) && e.providesAllTypes));
              const idx = exact !== -1 ? exact : remainingEnergy.findIndex(matches);
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

            const energyNames = discardedEnergy.map(energyCardLabel).join(", ");
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
            // "base damage is 60 instead of 30": a second Swords Dance doesn't stack
            nextTurnBonusDamage: effect.amount,
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

      // DestinyBond: set flag on attacker (Gastly) — if KO'd by opponent's attack, attacker is also KO'd
      if (effect.type === AttackEffectType.DestinyBond && effect.target === AttackTarget.Self && newPlayerActive && !attackerKnockedOut) {
        newPlayerActive = {
          ...newPlayerActive,
          destinyBondActive: true,
          destinyBondTurn: gameState.turnNumber,
        };
        events.push(
          createGameEvent(
            `¡${newPlayerActive.pokemon.name} activó Unión de Destino! Si es noqueado por un ataque, el atacante también será noqueado`,
            "action"
          )
        );
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
        const statusMessage = (name: string, s: StatusCondition) =>
          s === StatusCondition.CannotAttack
            ? `¡${name} no podrá atacar durante el próximo turno!`
            : `¡${name} está ${statusMessages[s] || s}!`;

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
                events.push(createGameEvent(statusMessage(newPlayerActive.pokemon.name, s), "action"));
              }
            }
          }
        } else {
          // Apply status to the DEFENDER — only if not KO'd (don't transfer to promoted Pokemon)
          if (newOpponentActive && !isKnockedOut) {
            // DamageAndEffects protection (Agility/Barrier) blocks status effects
            if (defenderBlocksEffects) {
              events.push(
                createGameEvent(
                  `¡${newOpponentActive.pokemon.name} está protegido y no recibe efectos de estado!`,
                  "action"
                )
              );
            } else {
              // StatusImmunity (Snorlax's Thick Skinned) stops special conditions only;
              // Leer's "can't attack" is not a special condition
              let statusesToApply = allStatuses;
              if (hasStatusImmunity(newOpponentActive, gameState)) {
                statusesToApply = allStatuses.filter((s) => s === StatusCondition.CannotAttack);
                const immunityPowerName = isPokemonCard(newOpponentActive.pokemon) ? newOpponentActive.pokemon.power?.name || "Piel Gruesa" : "Piel Gruesa";
                if (statusesToApply.length < allStatuses.length) {
                  events.push(
                    createGameEvent(
                      isTrainerInPlay(newOpponentActive.pokemon)
                        ? `¡${newOpponentActive.pokemon.name} no puede verse afectado por estados especiales!`
                        : `¡${newOpponentActive.pokemon.name} es inmune a estados alterados gracias a ${immunityPowerName}!`,
                      "action"
                    )
                  );
                }
              }
              for (const s of statusesToApply) {
                const before: PokemonInPlay = newOpponentActive;
                newOpponentActive = applyStatusCondition(newOpponentActive, s, gameState.turnNumber);
                if (newOpponentActive !== before) {
                  // Si es veneno con daño personalizado (Tóxico = 20), guardarlo
                  if (s === StatusCondition.Poisoned && effect.poisonDamage) {
                    newOpponentActive = { ...newOpponentActive, poisonDamage: effect.poisonDamage };
                  }
                  events.push(createGameEvent(statusMessage(newOpponentActive.pokemon.name, s), "action"));
                } else if (s === StatusCondition.Poisoned && effect.poisonDamage && hasStatusCondition(newOpponentActive, s) && newOpponentActive.poisonDamage !== effect.poisonDamage) {
                  // Toxic: "20 Poison damage instead of 10 ... (even if it was already Poisoned)"
                  newOpponentActive = { ...newOpponentActive, poisonDamage: effect.poisonDamage };
                  events.push(createGameEvent(`¡${newOpponentActive.pokemon.name} ahora recibe ${effect.poisonDamage} de daño por veneno!`, "action"));
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
  let noTrainersOnTurn = gameState.noTrainersOnTurn;

  if (attack.effects) {
    for (const effect of attack.effects) {
      // Headache: the opponent can't play Trainer cards during their next turn (not an effect on
      // the Defending Pokémon: protection doesn't stop it)
      if (effect.type === AttackEffectType.BlockTrainers && !effect.coinFlip) {
        noTrainersOnTurn = gameState.turnNumber + 1;
        events.push(createGameEvent("¡El defensor no podrá jugar cartas de Entrenador durante su próximo turno!", "action"));
      }

      // ForceSwitch: opponent must switch active with a bench Pokemon (Lure, Whirlwind, Ram).
      // Terror Strike (the opponent chooses) is a pending attack choice instead.
      if (effect.type === AttackEffectType.ForceSwitch && effect.target === AttackTarget.Defender && effect.switchChosenBy !== "opponent" && !effect.coinFlip) {
        // DamageAndEffects protection blocks ForceSwitch
        if (defenderBlocksEffects) {
          events.push(
            createGameEvent(
              `¡${newOpponentActive?.pokemon.name || defender.pokemon.name} está protegido y no puede ser forzado a cambiar!`,
              "action"
            )
          );
        // Only if opponent has bench Pokemon and wasn't KO'd
        } else if (newOpponentActive && !isKnockedOut) {
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

      // Fling: the Defending Pokémon and everything attached go into its owner's deck
      if (effect.type === AttackEffectType.ShuffleDefenderIntoDeck && newOpponentActive && !isKnockedOut) {
        if (defenderBlocksEffects) {
          events.push(createGameEvent(`¡${newOpponentActive.pokemon.name} está protegido y no es afectado por ${attack.name}!`, "action"));
        } else {
          newOpponentDeck = shuffle([...newOpponentDeck, ...cardsLeavingPlay(newOpponentActive)]);
          events.push(createGameEvent(`¡${newOpponentActive.pokemon.name} y todas sus cartas se barajaron en el mazo de su dueño!`, "action"));
          newOpponentActive = null;
          opponentNeedsToPromote = newOpponentBench.length > 0;
        }
      }

      // Vanish: the attacker goes into its owner's deck, the cards attached to the discard pile
      // (Phoenix Flame / Take Away: the cards attached go into the deck too)
      if (effect.type === AttackEffectType.ShuffleSelfIntoDeck && newPlayerActive && !attackerKnockedOut) {
        const leaving = newPlayerActive;
        if (effect.withAttachedCards) {
          newPlayerDeck = shuffle([...newPlayerDeck, ...cardsLeavingPlay(leaving)]);
          events.push(createGameEvent(`¡${leaving.pokemon.name} y todas sus cartas se barajaron en el mazo de su dueño!`, "action"));
        } else {
          newPlayerDeck = shuffle([...newPlayerDeck, ...[leaving.pokemon, ...(leaving.previousEvolutions ?? [])].map(cardOutOfPlay)]);
          newPlayerDiscard.push(...[...leaving.attachedEnergy, ...(leaving.attachedTrainers ?? [])].map(cardOutOfPlay));
          events.push(createGameEvent(`¡${leaving.pokemon.name} se barajó en el mazo de su dueño!`, "action"));
        }
        newPlayerActive = null;
        attackerLeftPlay = true;
        attackerNeedsToPromote = newPlayerBench.length > 0;
        if (attackerNeedsToPromote) events.push(createGameEvent("Debes elegir un Pokémon de tu banca para continuar", "info"));
      }

      // Mischief: shuffle the opponent's deck
      if (effect.type === AttackEffectType.ShuffleOpponentDeck) {
        newOpponentDeck = shuffle(newOpponentDeck);
        events.push(createGameEvent("Se mezcló el mazo del defensor", "action"));
      }

      // A deck search with nothing to find (or Sleight of Hand with an empty hand): only the shuffle
      if (effect.type === AttackEffectType.SearchDeckChoice) {
        const nothing = effect.putBackFromHand
          ? newPlayerHand.length === 0
          : !newPlayerDeck.some((c) => matchesDeckCardFilter(c, effect.deckFilter));
        if (nothing) {
          newPlayerDeck = shuffle(newPlayerDeck);
          events.push(createGameEvent(`${attack.name}: no se encontró nada en el mazo. Se mezcló el mazo`, "info"));
        }
      }

      // Rapid Evolution / Afternoon Nap with nothing to find: the deck is searched and shuffled
      if (effect.type === AttackEffectType.EvolveFromDeck || effect.type === AttackEffectType.AttachEnergyFromDeck) {
        const finds = effect.type === AttackEffectType.EvolveFromDeck
          ? newPlayerDeck.some((c) => isPokemonCard(c) && effect.searchPokemonNames?.includes(c.name))
          : newPlayerDeck.some((c) => isEnergyCard(c) && c.isBasic && c.energyType === effect.energyType);
        if (!finds) {
          newPlayerDeck = shuffle(newPlayerDeck);
          events.push(createGameEvent(`${attack.name}: no se encontró nada en el mazo. Se mezcló el mazo`, "info"));
        }
      }

      // SelfSwitch: attacker switches with own bench Pokemon (Teleport). Teleport Blast ("you may") is a pending attack choice.
      if (effect.type === AttackEffectType.SelfSwitch && effect.target === AttackTarget.Self && !effect.optional) {
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
        // DamageAndEffects protection blocks PreventRetreat
        if (defenderBlocksEffects) {
          events.push(
            createGameEvent(
              `¡${newOpponentActive.pokemon.name} está protegido y no se le puede impedir retirarse!`,
              "action"
            )
          );
        // No coinFlip here — the coin flip is on the effect itself, handled in coin flip handler
        } else if (!effect.coinFlip) {
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
        if (newOpponentActive && !isKnockedOut && defenderBlocksEffects) {
          events.push(createGameEvent(`¡${newOpponentActive.pokemon.name} está protegido y no vuelve a la mano!`, "action"));
        } else if (newOpponentActive && !isKnockedOut) {
          // Return the defender and all attached cards to opponent's hand
          const cardsToReturn: GameCard[] = cardsLeavingPlay(newOpponentActive);

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
        if (benchCount >= maxBenchSize(gameState, "player")) {
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

      // SandAttack: defender must flip coin to attack next turn (Sandshrew's Sand-Attack)
      if (effect.type === AttackEffectType.SandAttack && effect.target === AttackTarget.Defender) {
        if (newOpponentActive && !isKnockedOut) {
          if (defenderBlocksEffects) {
            events.push(
              createGameEvent(
                `¡${newOpponentActive.pokemon.name} está protegido y no es afectado por ${attack.name}!`,
                "action"
              )
            );
          } else {
            newOpponentActive = {
              ...newOpponentActive,
              mustFlipToAttack: true,
              mustFlipToAttackTurn: gameState.turnNumber,
            };
            events.push(
              createGameEvent(
                `¡${newOpponentActive.pokemon.name} deberá lanzar una moneda para atacar en su próximo turno!`,
                "action"
              )
            );
          }
        }
      }

      // DeckSearch: Open modal to search deck for Basic Pokemon (Call for Family)
      // Player can browse entire deck and select one valid Basic Pokemon
      if (effect.type === AttackEffectType.DeckSearch && effect.deckSearchFilter) {
        // Use original gameState bench count, not newPlayerBench which may have been modified by promotion
        const benchCount = gameState.playerBench.filter(p => p !== null).length;
        if (benchCount >= maxBenchSize(gameState, "player")) {
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

  // DESTINY BOND: KO the attacker if Destiny Bond was triggered
  if (destinyBondTriggered && newPlayerActive && !attackerKnockedOut) {
    attackerKnockedOut = true;
    events.push(
      createGameEvent(`¡${newPlayerActive.pokemon.name} fue noqueado por Unión de Destino!`, "action")
    );

    ({ newPlayerDiscard, newOpponentPrizes, newOpponentHand, attackerNeedsToPromote } =
      applyAttackerKnockout(newPlayerActive, "El rival tomó un premio por Unión de Destino"));
    newPlayerActive = null;
  }

  // STRIKES BACK: Aplicar contraataque si el defensor tiene damageReaction
  // Se aplica incluso si el defensor fue noqueado (usa defender, no newOpponentActive)
  if (effectiveDamage > 0 && newPlayerActive && !attackerKnockedOut) {
    const reaction = getDamageReaction(defender, true, gameState); // true = defender was active
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
      if (newAttackerDamage >= attackerCard.hp) {
        attackerKnockedOut = true;
        events.push(
          createGameEvent(`¡${newPlayerActive.pokemon.name} fue noqueado por el contraataque!`, "action")
        );

        // El KO del defensor da premio al jugador; el del atacante, al rival (siempre)
        ({ newPlayerDiscard, newOpponentPrizes, newOpponentHand, attackerNeedsToPromote } =
          applyAttackerKnockout(newPlayerActive, "El rival tomó un premio por el contraataque"));
        newPlayerActive = null;
      } else {
        // Solo actualizar daño del atacante
        newPlayerActive = {
          ...newPlayerActive,
          currentDamage: newAttackerDamage,
        };
      }
    }
  }

  // FINAL BEAM (Dark Gyarados): Knocked Out by this attack → its owner flips (the attack's defender
  // coin); heads = 20 × Water Energy attached to it, to the attacker, with Weakness/Resistance
  if (isKnockedOut && finalBeamCoin && effectiveDamage > 0 && newPlayerActive && !attackerKnockedOut && getKnockOutRetaliation(gameState, defender)) {
    const powerName = isPokemonCard(defender.pokemon) ? defender.pokemon.power?.name ?? "Rayo Final" : "Rayo Final";
    events.push(createGameEvent(`${powerName} de ${defender.pokemon.name} - Moneda: [coin:${finalBeamCoin}]`, "info"));
    const retaliation = finalBeamCoin === "heads" ? knockOutRetaliationDamage(gameState, defender, attacker) : 0;
    if (retaliation > 0) {
      const newAttackerDamage = (newPlayerActive.currentDamage || 0) + retaliation;
      events.push(createGameEvent(`¡${powerName}! ${defender.pokemon.name} le hizo ${retaliation} de daño a ${newPlayerActive.pokemon.name}`, "action"));
      if (newAttackerDamage >= attackerCard.hp) {
        attackerKnockedOut = true;
        events.push(createGameEvent(`¡${newPlayerActive.pokemon.name} fue noqueado por ${powerName}!`, "action"));
        ({ newPlayerDiscard, newOpponentPrizes, newOpponentHand, attackerNeedsToPromote } =
          applyAttackerKnockout(newPlayerActive, `El rival tomó un premio por ${powerName}`));
        newPlayerActive = null;
      } else {
        newPlayerActive = { ...newPlayerActive, currentDamage: newAttackerDamage };
      }
    }
  }

  // MIRROR SHELL (Dark Wartortle): attack damage done to it during this turn is done back to the
  // attacker, even if Dark Wartortle was Knocked Out (no Weakness/Resistance)
  if (effectiveDamage > 0 && defender.mirrorShellOnTurn === gameState.turnNumber - 1 && newPlayerActive && !attackerKnockedOut) {
    const newAttackerDamage = (newPlayerActive.currentDamage || 0) + effectiveDamage;
    events.push(createGameEvent(`¡Caparazón Espejo! ${defender.pokemon.name} le devuelve ${effectiveDamage} de daño a ${newPlayerActive.pokemon.name}`, "action"));
    if (newAttackerDamage >= attackerCard.hp) {
      attackerKnockedOut = true;
      events.push(createGameEvent(`¡${newPlayerActive.pokemon.name} fue noqueado por Caparazón Espejo!`, "action"));
      ({ newPlayerDiscard, newOpponentPrizes, newOpponentHand, attackerNeedsToPromote } =
        applyAttackerKnockout(newPlayerActive, "El rival tomó un premio por Caparazón Espejo"));
      newPlayerActive = null;
    } else {
      newPlayerActive = { ...newPlayerActive, currentDamage: newAttackerDamage };
    }
  }

  // CROSSCOUNTER / FIRE WALL: attack damage done to it this turn is answered, even after a Knock Out
  const counter = activeCounterAttack(gameState, defender);
  if (counter && effectiveDamage > 0 && newPlayerActive && !attackerKnockedOut) {
    if (counter.retaliationCoin && counterAttackCoin) {
      events.push(createGameEvent(`${counter.attackName} de ${defender.pokemon.name} - Moneda: [coin:${counterAttackCoin}]`, "info"));
    }
    const retaliation = counterAttackDamage(gameState, defender, effectiveDamage, attacker, counterAttackCoin);
    if (retaliation > 0) {
      const newAttackerDamage = (newPlayerActive.currentDamage || 0) + retaliation;
      events.push(createGameEvent(`¡${counter.attackName}! ${defender.pokemon.name} le hizo ${retaliation} de daño a ${newPlayerActive.pokemon.name}`, "action"));
      if (newAttackerDamage >= attackerCard.hp) {
        attackerKnockedOut = true;
        events.push(createGameEvent(`¡${newPlayerActive.pokemon.name} fue noqueado por ${counter.attackName}!`, "action"));
        ({ newPlayerDiscard, newOpponentPrizes, newOpponentHand, attackerNeedsToPromote } =
          applyAttackerKnockout(newPlayerActive, `El rival tomó un premio por ${counter.attackName}`));
        newPlayerActive = null;
      } else {
        newPlayerActive = { ...newPlayerActive, currentDamage: newAttackerDamage };
      }
    }
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
  let stateAfterAttack: GameState = {
    ...gameState,
    playerActivePokemon: attackerKnockedOut || attackerLeftPlay ? newPlayerActive : (newPlayerActive ?? attacker),
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
    // Every attacker-KO path above already moved the opponent's prize to their hand;
    // flagging a manual pick too gave the opponent a second prize.
    opponentCanTakePrize: false,
    pendingForceSwitch: pendingForceSwitch || undefined,
    pendingSelfSwitch: pendingSelfSwitch || undefined,
    pendingDeckSearch: pendingDeckSearch,
    pendingBenchDamageSelection: pendingBenchDamageSelection,
    noTrainersOnTurn,
    attackedThisTurn: true,
    events,
  };

  // =====================================================================
  // KO SWEEP: benched Pokémon on BOTH sides (bench damage, self-damage attacks)
  // =====================================================================
  stateAfterAttack = processBenchKnockouts(stateAfterAttack);

  // =====================================================================
  // DEFENDER REPLACEMENT (after the sweep)
  // =====================================================================
  if (isKnockedOut && stateAfterAttack.gameResult === null) {
    const remainingBench = stateAfterAttack.opponentBench;
    if (remainingBench.length > 0) {
      if (skipDefenderPromotion) {
        // No auto-promover, dejar que el jugador elija
        opponentNeedsToPromote = true;
        stateAfterAttack = {
          ...stateAfterAttack,
          events: [
            ...stateAfterAttack.events,
            createGameEvent("Debes elegir un Pokémon de tu banca para continuar", "info"),
          ],
        };
      } else {
        // Auto-promotion (single-player: the defender is the AI): the AI's promotion choice
        const index = chooseAutoPromotion(stateAfterAttack);
        const promoted = remainingBench[index];
        stateAfterAttack = {
          ...stateAfterAttack,
          opponentActivePokemon: promoted,
          opponentBench: remainingBench.filter((_, i) => i !== index),
          events: [
            ...stateAfterAttack.events,
            createGameEvent(`${promoted.pokemon.name} pasa a ser el Pokémon activo del rival`, "info"),
          ],
        };
      }
    } else {
      stateAfterAttack = {
        ...stateAfterAttack,
        events: [
          ...stateAfterAttack.events,
          createGameEvent("¡Victoria! El rival no tiene más Pokémon", "system"),
          createGameEvent("Ya puedes salir de la mesa", "info"),
        ],
      };
    }
  }

  // A promotion is only possible if something is left on the bench after the sweep
  if (stateAfterAttack.opponentBench.length === 0) opponentNeedsToPromote = false;
  if (stateAfterAttack.playerBench.length === 0) attackerNeedsToPromote = false;

  // Determinar resultado del juego (a prize-out from the sweep already set it)
  let gameResult: GameResult = stateAfterAttack.gameResult;
  let gamePhase: GamePhase = stateAfterAttack.gamePhase;
  if (gameResult === null) {
    // Victoria: el rival no tiene más Pokémon
    if (stateAfterAttack.opponentActivePokemon === null && stateAfterAttack.opponentBench.length === 0) {
      gameResult = "victory";
      gamePhase = GamePhase.GameOver;
    }
    // Derrota: el jugador no tiene más Pokémon
    if (stateAfterAttack.playerActivePokemon === null && stateAfterAttack.playerBench.length === 0) {
      gameResult = "defeat";
      gamePhase = GamePhase.GameOver;
    }
    // Derrota: el KO del atacante le dio al rival su último premio
    if (gameResult === null && gameState.opponentPrizes.length > 0 && stateAfterAttack.opponentPrizes.length === 0) {
      gameResult = "defeat";
      gamePhase = GamePhase.GameOver;
      attackerNeedsToPromote = false;
    }
  }

  stateAfterAttack = {
    ...stateAfterAttack,
    gamePhase,
    gameResult,
    playerNeedsToPromote: attackerNeedsToPromote || gameState.playerNeedsToPromote,
    opponentNeedsToPromote: opponentNeedsToPromote,
  };

  // Knock Outs the attack caused indirectly: a transformed Ditto whose copy changed (new
  // Defending Pokémon) or that stopped being a copy (Asleep...) with damage >= its new HP
  stateAfterAttack = checkKnockouts(stateAfterAttack);

  // No terminar el turno si el juego terminó o si el jugador puede tomar premio
  if (stateAfterAttack.gameResult !== null) {
    return stateAfterAttack;
  }

  // Choices left to a player (Hyper Beam, Terror Strike, Prophecy, Wildfire, Energy Conversion,
  // Scavenge): a pending attack choice blocks the end of the turn until it is answered
  const choiceEffects = (attack.effects ?? []).filter((e) => !e.coinFlip && isAttackChoiceEffect(e));
  if (choiceEffects.length > 0) {
    stateAfterAttack = startAttackChoices(stateAfterAttack, choiceEffects, {
      attackName: attack.name,
      attackerId: attacker.pokemon.id,
      defenderId: defender.pokemon.id,
      defenderKnockedOut: isKnockedOut,
      defenderBlocksEffects,
      discardIdsBefore: gameState.playerDiscard.map((c) => c.id),
      finalBeamCoin,
      counterAttackCoin,
      evadeCoin,
    });
  }

  // Si skipEndTurn es true, no terminar el turno (el caller lo hará después de aplicar efectos)
  if (skipEndTurn) {
    return stateAfterAttack;
  }

  // Don't end turn if there's a pending force/self switch, deck search, bench damage selection or attack choice — a player needs to choose first
  if (pendingForceSwitch || pendingSelfSwitch || pendingDeckSearch || pendingBenchDamageSelection || stateAfterAttack.pendingAttackChoice) {
    return stateAfterAttack;
  }

  // Terminar el turno después de atacar (a menos que el jugador pueda tomar premio)
  if (
    stateAfterAttack.opponentActivePokemon !== null &&
    stateAfterAttack.playerActivePokemon !== null &&
    !attackerKnockedOut &&
    !playerCanTakePrize
  ) {
    return endTurn(stateAfterAttack);
  }

  return stateAfterAttack;
}

/**
 * Confusion check before an attack (Base Set rule), for the side whose turn it is ("player").
 * The caller flips the coin (so the server can be authoritative) and passes the result.
 *
 * - Active not Confused → `{ state (same object), canAttack: true }`.
 * - Heads → `canAttack: true`; only a coin event is added. The caller then runs the attack.
 * - Tails → `canAttack: false`; the attack is used but fails: the active takes
 *   CONFUSION_SELF_DAMAGE (20, no weakness/resistance). If that knocks it out it is handled
 *   like an attacker self-KO in executeAttack (discard, opponent auto-takes one prize,
 *   promotion or defeat, game over on the last prize). Then the turn ends like a resolved
 *   attack: endTurn is called internally unless `skipEndTurn`, the game is over, or the
 *   active was knocked out (the turn then waits for the promotion, exactly as after an
 *   executeAttack self-KO: promote, then call endTurn).
 *
 * @param skipEndTurn - like executeAttack: return before endTurn (e.g. callers that swap
 *   perspective and want to call endTurn themselves)
 */
export function resolveConfusionFlip(
  state: GameState,
  heads: boolean,
  skipEndTurn: boolean = false
): { state: GameState; canAttack: boolean } {
  const active = state.playerActivePokemon;
  if (!active || !hasStatusCondition(active, StatusCondition.Confused)) {
    return { state, canAttack: true };
  }

  const name = active.pokemon.name;
  const coin = heads ? "[coin:heads]" : "[coin:tails]";
  const events: GameEvent[] = [
    ...state.events,
    createGameEvent(`${name} está confundido - Moneda: ${coin}`, "info"),
  ];

  if (heads) {
    events.push(createGameEvent("[coin:heads] El ataque procede normalmente", "info"));
    return { state: { ...state, events }, canAttack: true };
  }

  events.push(createGameEvent(`[coin:tails] ${name} se lastima a sí mismo`, "info"));
  // Frenzy (Dark Primeape): 30 more, even to itself
  const selfDamage = CONFUSION_SELF_DAMAGE + getConfusedDamageBonus(state, active);
  events.push(createGameEvent(`${name} se hizo ${selfDamage} de daño a sí mismo`, "action"));

  const newDamage = (active.currentDamage ?? 0) + selfDamage;
  // A confused Ditto isn't a copy: its own HP
  const knockedOut = active.pokemon.kind === CardKind.Pokemon && newDamage >= getEffectiveHp(state, active);

  if (!knockedOut) {
    const damaged: GameState = {
      ...state,
      playerActivePokemon: { ...active, currentDamage: newDamage },
      attackedThisTurn: true,
      events,
    };
    const endsTurn = !skipEndTurn && state.opponentActivePokemon !== null &&
      !damaged.pendingForceSwitch && !damaged.pendingSelfSwitch &&
      !damaged.pendingDeckSearch && !damaged.pendingBenchDamageSelection;
    return { state: endsTurn ? endTurn(damaged) : damaged, canAttack: false };
  }

  events.push(createGameEvent(`¡${name} se noqueó a sí mismo!`, "action"));
  const ko = knockOutActingActive(
    active,
    {
      bench: state.playerBench,
      discard: state.playerDiscard,
      opponentPrizes: state.opponentPrizes,
      opponentHand: state.opponentHand,
    },
    "El rival tomó un premio"
  );
  events.push(...ko.events);

  const defeated = ko.prizedOut || !ko.needsToPromote;
  return {
    state: {
      ...state,
      playerActivePokemon: null,
      playerDiscard: ko.discard,
      opponentPrizes: ko.opponentPrizes,
      opponentHand: ko.opponentHand,
      opponentCanTakePrize: false,
      playerNeedsToPromote: ko.needsToPromote,
      attackedThisTurn: true,
      ...(defeated && { gameResult: "defeat" as const, gamePhase: GamePhase.GameOver }),
      events,
    },
    canAttack: false,
  };
}

/**
 * Ejecuta Metronomo (Clefairy/Clefable) - copia un ataque del oponente y lo ejecuta
 * con todos sus efectos, ignorando costos de energía y descarte.
 * @param gameState - Estado actual del juego
 * @param copiedAttack - El ataque copiado del Pokémon rival
 * @returns Nuevo estado del juego después de ejecutar el ataque copiado
 *
 * Same two call forms as executeAttack: `{ coinResults, skipEndTurn, skipDefenderPromotion }`
 * (coins counted with `getAttackCoinFlipCount(state, copiedAttack)`, resolved by the engine)
 * or the deprecated positional booleans (coin effects skipped).
 */
export function executeMetronome(gameState: GameState, copiedAttack: Attack, options?: ExecuteAttackOptions): GameState;
/** @deprecated Coin effects are skipped in this form; pass `{ coinResults }` instead. */
export function executeMetronome(
  gameState: GameState,
  copiedAttack: Attack,
  skipEndTurn?: boolean,
  skipDefenderPromotion?: boolean
): GameState;
export function executeMetronome(
  gameState: GameState,
  copiedAttack: Attack,
  skipEndTurnOrOptions: boolean | ExecuteAttackOptions = false,
  skipDefenderPromotion: boolean = false
): GameState {
  assertLegal(canExecuteMetronome(gameState, copiedAttack));
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
    createGameEvent(`¡${attacker.pokemon.name} usó Metrónomo y copió ${copiedAttack.name}!`, "action"),
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
  // A transformed Ditto uses Metronome as the copied card (its type, HP...); the temporary card
  // drops Transform so the copy isn't recomputed from the attack below
  const attackerCard = getEffectivePokemonCard(gameState, attacker) ?? (attacker.pokemon as PokemonCard);
  const tempAttacker: PokemonInPlay = {
    ...attacker,
    pokemon: {
      ...attackerCard,
      ...(attackerCard.transformedFrom && { power: undefined }),
      attacks: [metronomeAttack], // Reemplazar ataques con el ataque copiado
    } as PokemonCard,
  };

  const tempState: GameState = {
    ...gameState,
    playerActivePokemon: tempAttacker,
    events,
  };

  // Ejecutar el ataque copiado usando executeAttack
  // Metronome never discards Energy, so selectedEnergyIds is dropped
  const resultState = typeof skipEndTurnOrOptions === "object" && skipEndTurnOrOptions !== null
    ? executeAttackUnchecked(tempState, 0, { ...skipEndTurnOrOptions, selectedEnergyIds: undefined }, false)
    : executeAttackUnchecked(tempState, 0, !!skipEndTurnOrOptions, skipDefenderPromotion, undefined);

  // Restaurar el Pokémon original (con sus ataques reales) después de ejecutar; also the card
  // itself when the copied attack moved it out of play (Selfdestruct, Strikes Back, Vanish...)
  const realCard = (c: GameCard): GameCard => (c.id === attacker.pokemon.id ? attacker.pokemon : c);
  return {
    ...resultState,
    playerActivePokemon: resultState.playerActivePokemon
      ? { ...resultState.playerActivePokemon, pokemon: attacker.pokemon }
      : null,
    playerDiscard: resultState.playerDiscard.map(realCard),
    playerDeck: resultState.playerDeck.map(realCard),
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

  // The new Active may change what a transformed Ditto copies (Knock Out if its new HP is too low)
  if (isPlayer) {
    return checkKnockouts({
      ...gameState,
      playerActivePokemon: pokemonToPromote,
      playerBench: newBench,
      playerNeedsToPromote: false,
      events,
    });
  } else {
    return checkKnockouts({
      ...gameState,
      opponentActivePokemon: pokemonToPromote,
      opponentBench: newBench,
      opponentNeedsToPromote: false,
      events,
    });
  }
}
