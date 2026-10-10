/**
 * Deck resolution utilities
 * Resolves DeckEntry[] to full Card objects grouped by kind
 */

import type { Card } from "@/domain/cards";
import { ALL_CARDS, findCardDefinition } from "@/domain/catalog";
import type { CardSet } from "@/domain/constants";
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
 * Finds a card by (set, number). Card numbers repeat across sets, so the set is
 * required to disambiguate; `undefined` means Base Set (DeckEntry backward compatibility).
 */
export function findCardBySetAndNumber(set: CardSet | undefined, cardNumber: number): Card | undefined {
  return findCardDefinition(set, cardNumber);
}

/**
 * Resolves a single DeckEntry to its Card from the catalog
 */
function resolveEntry(entry: DeckEntry): ResolvedDeckEntry | null {
  const card = findCardBySetAndNumber(entry.set, entry.cardNumber);
  if (!card) {
    console.warn(`Card #${entry.cardNumber} not found in ${entry.set ?? "Base Set"}`);
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
 * Finds a card in the catalog by its number, first match across all sets (registry order).
 * Ambiguous across sets: prefer findCardBySetAndNumber.
 */
export function findCardByNumber(cardNumber: number): Card | undefined {
  return ALL_CARDS.find((c) => c.number === cardNumber);
}
