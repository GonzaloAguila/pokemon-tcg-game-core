/**
 * Card image URL helpers (pkmncards.com). `getCardImageUrl` (any set) lives in sets.ts.
 */

/** What an image URL needs from a card */
export type CardImageInput = {
  name: string;
  number: number;
  imageSetVersion?: "bs" | "b2";
};

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
export const getBaseSetImageUrl = (card: CardImageInput): string => {
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
export const getJungleImageUrl = (card: CardImageInput): string => {
  let slug = toSlug(card.name);

  // Special cases for slug mismatches
  if (card.name === "Nidoran♀") {
    slug = "nidoran-female";
  }
  if (card.name === "Mr. Mime") {
    slug = "mr.-mime";
  }

  return `https://pkmncards.com/wp-content/uploads/${slug}-jungle-ju-${card.number}.jpg`;
};

/**
 * Generates the image URL for a Fossil card
 */
export const getFossilImageUrl = (card: CardImageInput): string => {
  let slug = toSlug(card.name);

  // Special cases for slug mismatches (pkmncards keeps the dot, like Jungle's Mr. Mime)
  if (card.name === "Mr. Fuji") {
    slug = "mr.-fuji";
  }

  return `https://pkmncards.com/wp-content/uploads/${slug}-fossil-fo-${card.number}.jpg`;
};

/**
 * Generates the image URL for a Team Rocket card ("Rocket's Sneak Attack" → rockets-sneak-attack)
 */
export const getTeamRocketImageUrl = (card: CardImageInput): string =>
  `https://pkmncards.com/wp-content/uploads/${toSlug(card.name)}-team-rocket-tr-${card.number}.jpg`;

/**
 * Generates the image URL for a Gym Heroes card ("Lt. Surge's Treaty" → lt.-surges-treaty).
 * pkmncards' Gym Heroes files keep the dot (like Jungle's Mr. Mime) and have no set code
 * (lt.-surges-fearow-gym-heroes-7.jpg), unlike its card pages (/card/lt-surges-fearow-gym-heroes-g1-7/).
 * Checked against pkmncards' set page for all 132 printed cards.
 */
export const getGymHeroesImageUrl = (card: CardImageInput): string => {
  const slug = card.name
    .toLowerCase()
    .replace(/é/g, "e")
    .replace(/'/g, "")
    .replace(/[^a-z0-9.\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `https://pkmncards.com/wp-content/uploads/${slug}-gym-heroes-${card.number}.jpg`;
};
