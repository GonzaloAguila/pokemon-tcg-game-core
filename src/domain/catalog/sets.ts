/**
 * Set registry — the single list of card sets the engine knows about.
 *
 * Every catalog lookup (by id, by set + number, by name, image URL) goes through here,
 * so adding a set means: write its catalog file, add one entry to CARD_SETS (and its
 * value to the CardSet enum). Consumers should iterate CARD_SETS / ALL_CARDS instead of
 * hard-coding `[...baseSetCards, ...jungleCards]`.
 */

import type { Card } from "@/domain/cards";
import { CardSet } from "@/domain/constants";
import { baseSetCards } from "./base-set";
import { jungleCards } from "./jungle";
import { fossilCards } from "./fossil";
import { getBaseSetImageUrl, getJungleImageUrl, getFossilImageUrl, type CardImageInput } from "./image-urls";

/** Stable slug of a set (also the prefix of its card ids). */
export type CardSetId = "base-set" | "jungle" | "fossil";

export type CardSetInfo = {
  id: CardSetId;
  /** Value of `card.set` for the set's cards */
  name: CardSet;
  /** Short printed code ("BS", "JU", "FO", "TR") */
  code: string;
  /** ISO date (YYYY-MM-DD) of the original English release */
  releaseDate: string;
  /** Number of cards printed in the set (the catalog may hold fewer: non-holo duplicates are excluded) */
  totalCards: number;
  /** Catalog cards of the set, in card-number order */
  cards: Card[];
  /** Image URL (pkmncards.com) for a card of this set */
  imageUrl(card: CardImageInput): string;
};

export const CARD_SETS: readonly CardSetInfo[] = [
  {
    id: "base-set",
    name: CardSet.BaseSet,
    code: "BS",
    releaseDate: "1999-01-09",
    totalCards: 102,
    cards: baseSetCards,
    imageUrl: getBaseSetImageUrl,
  },
  {
    id: "jungle",
    name: CardSet.Jungle,
    code: "JU",
    releaseDate: "1999-06-16",
    totalCards: 64,
    cards: jungleCards,
    imageUrl: getJungleImageUrl,
  },
  {
    id: "fossil",
    name: CardSet.Fossil,
    code: "FO",
    releaseDate: "1999-10-10",
    totalCards: 62,
    cards: fossilCards,
    imageUrl: getFossilImageUrl,
  },
];

/** Every catalog card of every set, in registry order (Base Set first). */
export const ALL_CARDS: readonly Card[] = CARD_SETS.flatMap((set) => set.cards);

const CARDS_BY_ID = new Map<string, Card>(ALL_CARDS.map((card) => [card.id, card]));

/** Set by its id slug ("base-set", "jungle"). */
export function getSetById(id: string): CardSetInfo | undefined {
  return CARD_SETS.find((set) => set.id === id);
}

/** Set by its `CardSet` name ("Base Set", "Jungle") or id slug. */
export function getSet(setNameOrId: CardSet | CardSetId | string): CardSetInfo | undefined {
  return CARD_SETS.find((set) => set.name === setNameOrId || set.id === setNameOrId);
}

/** The set a card belongs to (by `card.set`; Base Set when missing, like DeckEntry). */
export function getSetForCard(card: Pick<Card, "set">): CardSetInfo | undefined {
  return card.set ? getSet(card.set) : CARD_SETS[0];
}

/**
 * Catalog card by its catalog id (`base-set-004-charizard`). In-game instances have their
 * own ids; use their `set` + `number` (findCardDefinition) to get back to the catalog card.
 */
export function findCardById(id: string): Card | undefined {
  return CARDS_BY_ID.get(id);
}

/**
 * Catalog card by set and printed number. `set` is a `CardSet` name or a set id; card
 * numbers repeat across sets so it is required (undefined = Base Set, for DeckEntry
 * backward compatibility).
 */
export function findCardDefinition(set: CardSet | CardSetId | string | undefined, cardNumber: number): Card | undefined {
  const info = set === undefined ? CARD_SETS[0] : getSet(set);
  return info?.cards.find((card) => card.number === cardNumber);
}

/**
 * First catalog card with this name across all sets (registry order). Names are not unique
 * across sets (Pikachu is in Base Set and Jungle): use findCardDefinition when the set matters.
 */
export function findCardByName(name: string): Card | undefined {
  return ALL_CARDS.find((card) => card.name === name);
}

/** Image URL of any card, dispatched by its set. */
export function getCardImageUrl(card: Card & { id?: string }): string {
  return (getSetForCard(card) ?? CARD_SETS[0]).imageUrl(card);
}
