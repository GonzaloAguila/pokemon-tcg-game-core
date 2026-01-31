/**
 * Deck resolution utilities
 * Resolves DeckEntry[] to full Card objects grouped by kind
 */

import type { Card } from "@/domain/cards";
import { baseSetCards } from "@/domain/catalog";
import type { Deck, DeckEntry } from "./types";

export type ResolvedDeckEntry = {
  card: Card;
  quantity: number;
};

export type GroupedDeck = {
  energy: ResolvedDeckEntry[];
  pokemon: ResolvedDeckEntry[];
  trainer: ResolvedDeckEntry[];
};

/**
 * Resolves a single DeckEntry to its Card from the catalog
 */
function resolveEntry(entry: DeckEntry): ResolvedDeckEntry | null {
  const card = baseSetCards.find((c) => c.number === entry.cardNumber);
  if (!card) {
    console.warn(`Card #${entry.cardNumber} not found in catalog`);
    return null;
  }
  return { card, quantity: entry.quantity };
}

/**
 * Resolves all entries in a deck to full Card objects
 */
export function resolveDeck(deck: Deck): ResolvedDeckEntry[] {
  return deck.cards
    .map(resolveEntry)
    .filter((entry): entry is ResolvedDeckEntry => entry !== null);
}

/**
 * Groups resolved deck entries by card kind (energy, pokemon, trainer)
 */
export function groupDeckByKind(entries: ResolvedDeckEntry[]): GroupedDeck {
  const energy: ResolvedDeckEntry[] = [];
  const pokemon: ResolvedDeckEntry[] = [];
  const trainer: ResolvedDeckEntry[] = [];

  for (const entry of entries) {
    switch (entry.card.kind) {
      case "energy":
        energy.push(entry);
        break;
      case "pokemon":
        pokemon.push(entry);
        break;
      case "trainer":
        trainer.push(entry);
        break;
    }
  }

  return { energy, pokemon, trainer };
}

/**
 * Finds a card in the catalog by its set number
 */
export function findCardByNumber(cardNumber: number): Card | undefined {
  return baseSetCards.find((c) => c.number === cardNumber);
}
