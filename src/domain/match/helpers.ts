/**
 * Match helper functions
 */

import { shuffle as shuffleArray } from "../../shared/utils";
import type { Card } from "@/domain/cards";
import type { GameCard } from "./types";

/**
 * Re-export shuffle from shared utils
 */
export const shuffle = shuffleArray;

/** Creates a new game event (single definition: the engine's) */
export { createGameEvent, toLogCards } from "@/lib/gameState";

/** Catalog card by name across all sets (see the set registry). */
export { findCardByName } from "@/domain/catalog";

/**
 * Creates a GameCard instance with unique ID
 */
export function createGameCard(card: Card, index: number = 0): GameCard {
  return {
    ...card,
    id: `${card.name}-${index}-${Date.now()}-${Math.random()}`,
  };
}
