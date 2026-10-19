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
import { teamRocketCards } from "./team-rocket";
import { gymHeroesCards } from "./gym-heroes";
import { gymChallengeCards } from "./gym-challenge";
import {
  getBaseSetImageUrl,
  getJungleImageUrl,
  getFossilImageUrl,
  getTeamRocketImageUrl,
  getGymHeroesImageUrl,
  getGymChallengeImageUrl,
  type CardImageInput,
} from "./image-urls";

/** Stable slug of a set (also the prefix of its card ids). */
export type CardSetId = "base-set" | "jungle" | "fossil" | "team-rocket" | "gym-heroes" | "gym-challenge";

export type CardSetInfo = {
  id: CardSetId;
  /** Value of `card.set` for the set's cards */
  name: CardSet;
  /** Short printed code ("BS", "JU", "FO", "TR", "G1", "G2") */
  code: string;
  /** ISO date (YYYY-MM-DD) of the original English release */
  releaseDate: string;
  /** Number of cards printed in the set (the catalog may hold fewer: non-holo duplicates are excluded) */
  totalCards: number;
  /** Catalog cards of the set, in card-number order */
  cards: Card[];
  /** Image URL (pkmncards.com) for a card of this set */
  imageUrl(card: CardImageInput): string;
  /**
   * The set's cards are cataloged but their effects aren't implemented yet: kept out of the
   * engine's random pools (simulator default sets, Lucky Duel). Consumers must hide it too
   * (boosters, collection, deck builder, catalog pages) while it is set. Use `isSetInDevelopment`.
   */
  inDevelopment?: boolean;
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
  {
    id: "team-rocket",
    name: CardSet.TeamRocket,
    code: "TR",
    releaseDate: "2000-04-24",
    // 82 + the secret Dark Raichu (#83)
    totalCards: 83,
    cards: teamRocketCards,
    imageUrl: getTeamRocketImageUrl,
  },
  {
    id: "gym-heroes",
    name: CardSet.GymHeroes,
    code: "G1",
    releaseDate: "2000-08-14",
    totalCards: 132,
    cards: gymHeroesCards,
    imageUrl: getGymHeroesImageUrl,
  },
  {
    id: "gym-challenge",
    name: CardSet.GymChallenge,
    code: "G2",
    releaseDate: "2000-10-16",
    totalCards: 132,
    cards: gymChallengeCards,
    imageUrl: getGymChallengeImageUrl,
    // Catalog only (2026-10-19): effects come with docs/superpowers/plans/2026-10-19-gym-challenge.md
    inDevelopment: true,
  },
];

/** Whether a card's set is still in development (see CardSetInfo.inDevelopment). */
export function isSetInDevelopment(card: Pick<Card, "set">): boolean {
  return !!getSetForCard(card)?.inDevelopment;
}

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
