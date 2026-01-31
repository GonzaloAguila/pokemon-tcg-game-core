/**
 * Match helper functions
 */

import { baseSetCards } from "@/domain/catalog";
import { shuffle as shuffleArray } from "../../shared/utils";
import type { Card } from "@/domain/cards";
import type { GameCard, GameEvent } from "./types";

/**
 * Re-export shuffle from shared utils
 */
export const shuffle = shuffleArray;

/**
 * Creates a new game event
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
 * Finds a card in the Base Set by name
 */
export function findCardByName(name: string): Card | undefined {
  return baseSetCards.find((card) => card.name === name);
}

/**
 * Creates a GameCard instance with unique ID
 */
export function createGameCard(card: Card, index: number = 0): GameCard {
  return {
    ...card,
    id: `${card.name}-${index}-${Date.now()}-${Math.random()}`,
  };
}
