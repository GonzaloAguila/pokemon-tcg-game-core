/**
 * Card catalog - Card data, set registry and image helpers
 */

export { baseSetCards } from "./base-set";
export { jungleCards } from "./jungle";
export { fossilCards } from "./fossil";
export { teamRocketCards } from "./team-rocket";
export { gymHeroesCards } from "./gym-heroes";
export { gymChallengeCards } from "./gym-challenge";
export {
  getBaseSetImageUrl,
  getJungleImageUrl,
  getFossilImageUrl,
  getTeamRocketImageUrl,
  getGymHeroesImageUrl,
  getGymChallengeImageUrl,
} from "./image-urls";
export type { CardImageInput } from "./image-urls";
export {
  CARD_SETS,
  ALL_CARDS,
  getSetById,
  getSet,
  getSetForCard,
  findCardById,
  findCardDefinition,
  findCardByName,
  getCardImageUrl,
  isSetInDevelopment,
} from "./sets";
export type { CardSetId, CardSetInfo } from "./sets";
export { POKEDEX_HEIGHTS, pokedexSpecies, pokedexHeight, heightInInches, quizLengthOptions } from "./pokedex-heights";
