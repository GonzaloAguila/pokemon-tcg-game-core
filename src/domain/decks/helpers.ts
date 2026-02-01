/**
 * Deck utility functions
 */

import type { EnergyType, PokemonCard } from "@/domain/cards";
import { isPokemonCard, isEnergyCard } from "@/domain/cards";
import { EnergyType as EnergyTypeEnum, CardRarity, PokemonStage } from "@/domain/constants";
import type { Deck } from "./types";
import { resolveDeck } from "./resolve";
import { decks } from "./theme-decks";

/** Rarity ordering for sorting (higher = more featured) */
const RARITY_ORDER: Record<string, number> = {
  [CardRarity.RareHolo]: 5,
  [CardRarity.Rare]: 4,
  [CardRarity.Uncommon]: 2,
  [CardRarity.Common]: 1,
};

/** Stage ordering for sorting (higher = more evolved) */
const STAGE_ORDER: Record<string, number> = {
  [PokemonStage.Stage2]: 3,
  [PokemonStage.Stage1]: 2,
  [PokemonStage.Basic]: 1,
};

/**
 * Returns the unique energy types used by a deck (from pokemon types and energy cards)
 */
export function getDeckEnergyTypes(deck: Deck): EnergyType[] {
  const resolved = resolveDeck(deck);
  const types = new Set<EnergyType>();

  for (const entry of resolved) {
    if (isPokemonCard(entry.card)) {
      for (const t of entry.card.types) {
        if (t !== EnergyTypeEnum.Colorless) types.add(t);
      }
    } else if (isEnergyCard(entry.card)) {
      if (entry.card.energyType !== EnergyTypeEnum.Colorless) {
        types.add(entry.card.energyType);
      }
    }
  }

  return Array.from(types);
}

/**
 * Returns total card count in a deck
 */
export function getDeckCardCount(deck: Deck): number {
  return deck.cards.reduce((sum, entry) => sum + entry.quantity, 0);
}

/**
 * Returns the featured Pokemon for deck display [left, center, right]
 * Uses deck.featuredPokemon if specified, otherwise falls back to rarity sorting
 */
export function getDeckFeaturedPokemon(deck: Deck, count: number = 3): PokemonCard[] {
  const resolved = resolveDeck(deck);

  // If deck has explicit featured Pokemon, use them in order
  if (deck.featuredPokemon) {
    const featured: PokemonCard[] = [];
    for (const cardNumber of deck.featuredPokemon) {
      const entry = resolved.find(e => e.card.number === cardNumber);
      if (entry && isPokemonCard(entry.card)) {
        featured.push(entry.card);
      }
    }
    if (featured.length === count) {
      return featured;
    }
  }

  // Fallback: sort by rarity then evolution stage
  const pokemon = resolved
    .filter((entry) => isPokemonCard(entry.card))
    .map((entry) => entry.card as PokemonCard);

  pokemon.sort((a, b) => {
    const rarityDiff = (RARITY_ORDER[b.rarity] || 0) - (RARITY_ORDER[a.rarity] || 0);
    if (rarityDiff !== 0) return rarityDiff;

    const stageDiff = (STAGE_ORDER[b.stage] || 0) - (STAGE_ORDER[a.stage] || 0);
    if (stageDiff !== 0) return stageDiff;

    return b.hp - a.hp;
  });

  return pokemon.slice(0, count);
}

/**
 * Returns a deck by its ID
 */
export function getDeckById(deckId: string): Deck | undefined {
  return decks.find((d) => d.id === deckId);
}
