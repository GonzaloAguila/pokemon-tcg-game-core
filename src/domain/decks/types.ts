/**
 * Deck domain types
 */

export type DeckEntry = {
  cardNumber: number; // Card number within the set (e.g. 1-102 for Base Set)
  quantity: number;
};

export type Deck = {
  id: string;
  name: string;
  image: string;
  cards: DeckEntry[];
  /** Card numbers for featured Pokemon display [left, center, right] */
  featuredPokemon?: [number, number, number];
};
