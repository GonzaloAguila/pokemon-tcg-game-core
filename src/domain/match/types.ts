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
  };
  /** Energy Burn: treat all attached energy as this type until end of turn */
  energyConversionType?: EnergyType;
  /** Conversion 1 (Porygon): overrides the opponent's weakness type. Clears when leaving active. */
  modifiedWeakness?: EnergyType;
  /** Conversion 2 (Porygon): overrides this Pokemon's resistance type. Clears when leaving active. */
  modifiedResistance?: EnergyType;
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
