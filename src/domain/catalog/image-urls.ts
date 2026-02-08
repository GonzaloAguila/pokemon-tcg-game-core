/**
 * Card image URL helpers
 */

import type { Card } from "@/domain/cards";
import { CardSet } from "@/domain/constants";

/** Shared slug generation for card names */
const toSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/é/g, "e")
    .replace(/♀/g, "f")
    .replace(/♂/g, "male")
    .replace(/'/g, "")
    .replace(/\./g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

/**
 * Generates the image URL for a Base Set card
 */
export const getBaseSetImageUrl = (card: {
  name: string;
  number: number;
  imageSetVersion?: "bs" | "b2";
}): string => {
  let slug = toSlug(card.name);

  // Special cases for slug mismatches
  if (card.name === "Nidoran") {
    slug = "nidoran-male";
  }
  if (card.name === "Imposter Professor Oak") {
    slug = "impostor-professor-oak"; // URL uses "impostor" spelling
  }

  const setVersion = card.imageSetVersion || "bs";
  const setSlug = setVersion === "b2" ? "base-set-2-b2" : "base-set-bs";

  return `https://pkmncards.com/wp-content/uploads/${slug}-${setSlug}-${card.number}.jpg`;
};

/**
 * Generates the image URL for a Jungle card
 */
export const getJungleImageUrl = (card: {
  name: string;
  number: number;
}): string => {
  let slug = toSlug(card.name);

  // Special cases for slug mismatches
  if (card.name === "Nidoran♀") {
    slug = "nidoran-female";
  }

  return `https://pkmncards.com/wp-content/uploads/${slug}-jungle-ju-${card.number}.jpg`;
};

/**
 * Gets the image URL for any card (dispatches by set)
 */
export function getCardImageUrl(card: Card & { id?: string }): string {
  if (card.set === CardSet.Jungle) return getJungleImageUrl(card);
  return getBaseSetImageUrl(card);
}
