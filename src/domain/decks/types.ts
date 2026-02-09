/**
 * Deck domain types
 */

import type { CardSet } from "@/domain/constants";

export type DeckEntry = {
  cardNumber: number;
  quantity: number;
  set?: CardSet; // undefined = Base Set (backward compatible)
};

export type FeaturedPokemonRef = {
  cardNumber: number;
  set?: CardSet; // undefined = Base Set
};

export type Deck = {
  id: string;
  name: string;
  image: string;
  cards: DeckEntry[];
  /** Featured Pokemon for display [left, center, right] */
  featuredPokemon?: [FeaturedPokemonRef, FeaturedPokemonRef, FeaturedPokemonRef];
};
