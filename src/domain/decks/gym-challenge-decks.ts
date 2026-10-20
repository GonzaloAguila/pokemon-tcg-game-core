/**
 * Gym Challenge Gym Leader decks: Giovanni and Koga (their Pokémon are all in Gym Challenge), built
 * like the Gym Heroes ones (gym-heroes-decks.ts): legal 60-card decks of the leader's Pokémon, the
 * Trainers the AI plays in single-player (no Chaos Gym, Lt. Surge's Secret Plan, Misty's Wish,
 * Blaine's Quiz #2 / #3, Warp Point: see ai/cardEffects.ts) and Base Set basic Energy.
 * Blaine's and Sabrina's Gym Heroes decks take their Gym Challenge evolutions (gym-heroes-decks.ts).
 */

import { CardSet } from "@/domain/constants";
import type { Deck, DeckEntry } from "./types";

const gc = (cardNumber: number, quantity: number): DeckEntry => ({ cardNumber, quantity, set: CardSet.GymChallenge });
const gh = (cardNumber: number, quantity: number): DeckEntry => ({ cardNumber, quantity, set: CardSet.GymHeroes });
/** Base Set basic Energy: 97 Fighting, 98 Fire, 99 Grass, 100 Lightning, 101 Psychic, 102 Water */
const energy = (cardNumber: number, quantity: number): DeckEntry => ({ cardNumber, quantity });

export const gymChallengeLeaderDecks: Deck[] = [
  {
    id: "gym-challenge-giovanni",
    name: "Mazo de Giovanni",
    image: "",
    featuredPokemon: [
      { cardNumber: 6, set: CardSet.GymChallenge }, // Giovanni's Machamp
      { cardNumber: 7, set: CardSet.GymChallenge }, // Giovanni's Nidoking
      { cardNumber: 8, set: CardSet.GymChallenge }, // Giovanni's Persian
    ],
    cards: [
      // Pokémon (23)
      gc(72, 3), // Giovanni's Machop
      gc(42, 2), // Giovanni's Machoke
      gc(6, 1), // Giovanni's Machamp
      gc(76, 3), // Giovanni's Nidoran ♂
      gc(45, 2), // Giovanni's Nidorino
      gc(7, 1), // Giovanni's Nidoking
      gc(75, 2), // Giovanni's Nidoran ♀
      gc(44, 2), // Giovanni's Nidorina
      gc(23, 1), // Giovanni's Nidoqueen
      gc(24, 2), // Giovanni's Pinsir
      gc(74, 2), // Giovanni's Meowth
      gc(43, 1), // Giovanni's Meowth
      gc(8, 1), // Giovanni's Persian
      // Trainers (11)
      gc(18, 2), // Giovanni
      gc(123, 2), // Viridian City Gym
      gc(105, 1), // Giovanni's Last Resort
      gc(116, 1), // Master Ball
      gc(117, 1), // Max Revive
      gc(120, 1), // Rocket's Secret Experiment
      gh(111, 2), // Good Manners
      gh(118, 1), // Secret Mission
      // Energy (26)
      energy(97, 13), // Fighting Energy
      energy(99, 13), // Grass Energy
    ],
  },
  {
    id: "gym-challenge-koga",
    name: "Mazo de Koga",
    image: "",
    featuredPokemon: [
      { cardNumber: 9, set: CardSet.GymChallenge }, // Koga's Beedrill
      { cardNumber: 26, set: CardSet.GymChallenge }, // Koga's Muk
      { cardNumber: 25, set: CardSet.GymChallenge }, // Koga's Arbok
    ],
    cards: [
      // Pokémon (23)
      gc(82, 3), // Koga's Weedle
      gc(47, 2), // Koga's Kakuna
      gc(9, 2), // Koga's Beedrill
      gc(78, 3), // Koga's Grimer
      gc(26, 2), // Koga's Muk
      gc(77, 2), // Koga's Ekans
      gc(25, 1), // Koga's Arbok
      gc(79, 2), // Koga's Koffing
      gc(50, 1), // Koga's Weezing
      gc(83, 2), // Koga's Zubat
      gc(46, 1), // Koga's Golbat
      gc(81, 1), // Koga's Tangela
      gc(10, 1), // Koga's Ditto
      // Trainers (11)
      gc(19, 2), // Koga
      gc(115, 2), // Koga's Ninja Trick
      gc(114, 2), // Fuchsia City Gym
      gc(116, 1), // Master Ball
      gc(117, 1), // Max Revive
      gh(111, 2), // Good Manners
      gh(118, 1), // Secret Mission
      // Energy (26)
      energy(99, 26), // Grass Energy
    ],
  },
];
