/**
 * Match domain types - Game state and related entities.
 *
 * The engine's own definitions live in lib/gameState.ts; this module re-exports them so
 * both import paths see the same types (they used to be a drifting copy).
 */

import type { GameCard } from "@/lib/gameState";
import type { StatusCondition, GamePhase } from "@/domain/constants";

// Re-export for convenience
export type { StatusCondition, GamePhase };

export type {
  GameCard,
  PokemonInPlay,
  GameEvent,
  GameModifier,
  GameResult,
  PowerSuppression,
  StadiumInPlay,
  BenchTrim,
  GameState,
} from "@/lib/gameState";

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
