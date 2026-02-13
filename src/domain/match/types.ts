/**
 * Match domain types - Game state and related entities
 */

import type { Card, ProtectionType, EnergyType } from "@/domain/cards";
import type { StatusCondition, GamePhase } from "@/domain/constants";

// Re-export for convenience
export type { StatusCondition, GamePhase };

export type GameCard = Card & {
  id: string; // Unique ID for each card instance
  /** For Buzzap energy: ID of the original Electrode Pokemon */
  buzzapSourceId?: string;
  /** For Buzzap energy: the energy type chosen by the player */
  buzzapEnergyType?: EnergyType;
};

export type PokemonInPlay = {
  pokemon: GameCard;
  attachedEnergy: GameCard[];
  attachedTrainers?: GameCard[];
  previousEvolutions?: GameCard[];
  currentDamage?: number;
  statusConditions?: StatusCondition[];
  paralyzedOnTurn?: number; // Turn when paralyzed (cures at end of owner's next turn)
  playedOnTurn?: number; // Turn when played or evolved (cannot evolve same turn)
  usedOnceAttacks?: string[]; // Attack names that have been used (for "useOnce" attacks like Farfetch'd Leek Slap)
  poisonDamage?: number; // Custom poison damage (default 10, Toxic uses 20)
  protection?: {
    type: ProtectionType;       // "damageOnly" or "damageAndEffects"
    expiresAfterTurn: number;   // Turn number after which protection expires
    threshold?: number;         // If set, only blocks damage <= this amount (e.g., Onix Harden blocks <=30)
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

export type GameModifier = {
  id: string;
  source: "plusPower" | "defender";
  card: GameCard;
  targetPokemonId?: string; // For Defender: which pokemon is protected
  amount: number; // +10 for PlusPower, -20 for Defender
  expiresAfterTurn: number; // Turn number when this modifier expires
  playerId: "player" | "opponent"; // Who played this modifier
};

export type GameResult = "victory" | "defeat" | null;

export type GameState = {
  playerDeck: GameCard[];
  playerHand: GameCard[];
  playerPrizes: GameCard[];
  playerDiscard: GameCard[];
  playerActivePokemon: PokemonInPlay | null;
  playerBench: PokemonInPlay[]; // Max 5 Pokemon on bench
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
  energyAttachedThisTurn: boolean; // Only one energy attachment per turn
  retreatedThisTurn: boolean; // Only one retreat per turn
  playerCanTakePrize: boolean; // Player can take a prize (after KO)
  opponentCanTakePrize: boolean; // Opponent can take a prize
  playerNeedsToPromote: boolean; // Player needs to select a Pokemon from bench to promote
  opponentNeedsToPromote: boolean; // Opponent needs to select a Pokemon from bench to promote
  gameResult: GameResult; // Game result (victory, defeat or null if not finished)
  activeModifiers: GameModifier[]; // Active modifiers (PlusPower, Defender, etc.)
  events: GameEvent[]; // Game event log
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
  /** TypeShift (Venomoth): player needs to pick a type from Pokemon in play */
  pendingTypeShift?: {
    /** Pokemon ID that will receive the type change */
    pokemonId: string;
    /** Available types to choose from (types of all Pokemon in play, excluding colorless) */
    availableTypes: EnergyType[];
  };
  /** Peek (Mankey): player chose to peek at something, show the result */
  pendingPeek?: {
    /** What was peeked at */
    peekType: "playerDeck" | "opponentDeck" | "opponentHand" | "playerPrize" | "opponentPrize";
    /** The card(s) that were peeked */
    revealedCards: GameCard[];
  };
  /** BenchDamage selection: player needs to pick which bench Pokemon receive damage */
  pendingBenchDamageSelection?: {
    damageAmount: number;
    targetSide: "player" | "opponent";
    maxTargets: number;
    minTargets?: number;
    matchDefenderType?: boolean;
    defenderTypes?: EnergyType[];
  };
};

/**
 * Result of drawing a card
 */
export type DrawCardResult = {
  success: boolean;
  newDeck: GameCard[];
  newHand: GameCard[];
  drawnCard: GameCard | null;
  deckOut: boolean;
};
