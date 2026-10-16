/**
 * Gym Heroes theme decks: one per Gym Leader of the set (Brock, Misty, Erika, Lt. Surge, Sabrina,
 * Blaine), built from the Gym Heroes catalog plus Base Set basic Energy (the expansions have no
 * Energy cards). Legal 60-card decks (at most 4 copies by name, basic Energy excepted); they back
 * the "Gym Leader" vs-AI mode, so their Trainers are ones the AI plays in single-player (no Erika,
 * Lt. Surge's Treaty, Blaine's Quiz #1, Misty's Duel or Charity: see ai/cardEffects.ts).
 * Kept apart from the classic theme decks (`decks`); `getDeckById` finds both.
 */

import { CardSet } from "@/domain/constants";
import type { Deck, DeckEntry } from "./types";

const gh = (cardNumber: number, quantity: number): DeckEntry => ({ cardNumber, quantity, set: CardSet.GymHeroes });
/** Base Set basic Energy: 97 Fighting, 98 Fire, 99 Grass, 100 Lightning, 101 Psychic, 102 Water */
const energy = (cardNumber: number, quantity: number): DeckEntry => ({ cardNumber, quantity });

export const gymLeaderDecks: Deck[] = [
  {
    id: "gym-heroes-brock",
    name: "Mazo de Brock",
    image: "",
    featuredPokemon: [
      { cardNumber: 69, set: CardSet.GymHeroes }, // Brock's Onix
      { cardNumber: 20, set: CardSet.GymHeroes }, // Brock's Golem
      { cardNumber: 2, set: CardSet.GymHeroes }, // Brock's Rhydon
    ],
    cards: [
      // Pokémon (22)
      gh(70, 2), // Brock's Rhyhorn
      gh(22, 1), // Brock's Rhyhorn
      gh(2, 2), // Brock's Rhydon
      gh(38, 2), // Brock's Geodude
      gh(66, 2), // Brock's Geodude
      gh(40, 3), // Brock's Graveler
      gh(20, 2), // Brock's Golem
      gh(69, 2), // Brock's Onix
      gh(72, 2), // Brock's Sandshrew
      gh(71, 1), // Brock's Sandshrew
      gh(23, 2), // Brock's Sandslash
      gh(41, 1), // Brock's Lickitung
      // Trainers (12)
      gh(15, 2), // Brock
      gh(115, 2), // Pewter City Gym
      gh(106, 3), // Brock's Training Method
      gh(111, 2), // Good Manners
      gh(118, 1), // Secret Mission
      gh(116, 1), // Recall
      gh(19, 1), // The Rocket's Trap
      // Energy (26)
      energy(97, 26), // Fighting Energy
    ],
  },
  {
    id: "gym-heroes-misty",
    name: "Mazo de Misty",
    image: "",
    featuredPokemon: [
      { cardNumber: 10, set: CardSet.GymHeroes }, // Misty's Tentacruel
      { cardNumber: 31, set: CardSet.GymHeroes }, // Misty's Poliwrath
      { cardNumber: 9, set: CardSet.GymHeroes }, // Misty's Seadra
    ],
    cards: [
      // Pokémon (23)
      gh(86, 3), // Misty's Horsea
      gh(9, 2), // Misty's Seadra
      gh(32, 2), // Misty's Tentacool
      gh(57, 2), // Misty's Tentacool
      gh(10, 2), // Misty's Tentacruel
      gh(87, 3), // Misty's Poliwag
      gh(53, 2), // Misty's Poliwhirl
      gh(31, 1), // Misty's Poliwrath
      gh(90, 3), // Misty's Staryu
      gh(56, 2), // Misty's Starmie
      gh(54, 1), // Misty's Psyduck
      // Trainers (11)
      gh(18, 2), // Misty
      gh(108, 2), // Cerulean City Gym
      gh(114, 2), // Misty's Wrath
      gh(111, 2), // Good Manners
      gh(118, 1), // Secret Mission
      gh(122, 1), // Energy Flow
      gh(19, 1), // The Rocket's Trap
      // Energy (26)
      energy(102, 26), // Water Energy
    ],
  },
  {
    id: "gym-heroes-erika",
    name: "Mazo de Erika",
    image: "",
    featuredPokemon: [
      { cardNumber: 5, set: CardSet.GymHeroes }, // Erika's Vileplume
      { cardNumber: 3, set: CardSet.GymHeroes }, // Erika's Clefable
      { cardNumber: 26, set: CardSet.GymHeroes }, // Erika's Victreebel
    ],
    cards: [
      // Pokémon (22)
      gh(47, 2), // Erika's Oddish
      gh(78, 2), // Erika's Oddish
      gh(45, 2), // Erika's Gloom
      gh(46, 1), // Erika's Gloom
      gh(5, 2), // Erika's Vileplume
      gh(75, 2), // Erika's Bellsprout
      gh(76, 1), // Erika's Bellsprout
      gh(48, 1), // Erika's Weepinbell
      gh(49, 1), // Erika's Weepinbell
      gh(26, 1), // Erika's Victreebel
      gh(43, 2), // Erika's Exeggcute
      gh(44, 1), // Erika's Exeggutor
      gh(79, 1), // Erika's Tangela
      gh(25, 2), // Erika's Clefairy
      gh(3, 1), // Erika's Clefable
      // Trainers (12)
      gh(109, 2), // Erika's Maids
      gh(110, 2), // Erika's Perfume
      gh(107, 2), // Celadon City Gym
      gh(111, 2), // Good Manners
      gh(118, 1), // Secret Mission
      gh(116, 1), // Recall
      gh(126, 1), // Trash Exchange
      gh(122, 1), // Energy Flow
      // Energy (26)
      energy(99, 26), // Grass Energy
    ],
  },
  {
    id: "gym-heroes-lt-surge",
    name: "Mazo de Lt. Surge",
    image: "",
    featuredPokemon: [
      { cardNumber: 28, set: CardSet.GymHeroes }, // Lt. Surge's Raichu
      { cardNumber: 8, set: CardSet.GymHeroes }, // Lt. Surge's Magneton
      { cardNumber: 6, set: CardSet.GymHeroes }, // Lt. Surge's Electabuzz
    ],
    cards: [
      // Pokémon (24)
      gh(6, 1), // Lt. Surge's Electabuzz
      gh(27, 2), // Lt. Surge's Electabuzz
      gh(50, 2), // Lt. Surge's Magnemite
      gh(80, 2), // Lt. Surge's Magnemite
      gh(8, 2), // Lt. Surge's Magneton
      gh(81, 3), // Lt. Surge's Pikachu
      gh(28, 2), // Lt. Surge's Raichu
      gh(84, 2), // Lt. Surge's Voltorb
      gh(52, 1), // Lt. Surge's Spearow
      gh(83, 2), // Lt. Surge's Spearow
      gh(7, 2), // Lt. Surge's Fearow
      gh(82, 2), // Lt. Surge's Rattata
      gh(51, 1), // Lt. Surge's Raticate
      // Trainers (10)
      gh(17, 2), // Lt. Surge
      gh(120, 2), // Vermilion City Gym
      gh(111, 2), // Good Manners
      gh(118, 1), // Secret Mission
      gh(113, 1), // Minion of Team Rocket
      gh(119, 1), // Tickling Machine
      gh(116, 1), // Recall
      // Energy (26)
      energy(100, 26), // Lightning Energy
    ],
  },
  {
    id: "gym-heroes-sabrina",
    name: "Mazo de Sabrina",
    image: "",
    featuredPokemon: [
      { cardNumber: 14, set: CardSet.GymHeroes }, // Sabrina's Gengar
      { cardNumber: 59, set: CardSet.GymHeroes }, // Sabrina's Jynx
      { cardNumber: 60, set: CardSet.GymHeroes }, // Sabrina's Slowbro
    ],
    cards: [
      // Pokémon (22)
      gh(93, 4), // Sabrina's Gastly
      gh(58, 3), // Sabrina's Haunter
      gh(14, 2), // Sabrina's Gengar
      gh(91, 2), // Sabrina's Abra
      gh(92, 2), // Sabrina's Drowzee
      gh(59, 2), // Sabrina's Jynx
      gh(94, 2), // Sabrina's Mr. Mime
      gh(95, 3), // Sabrina's Slowpoke
      gh(60, 2), // Sabrina's Slowbro
      // Trainers (12)
      gh(117, 2), // Sabrina's ESP
      gh(125, 2), // Sabrina's Gaze
      gh(111, 2), // Good Manners
      gh(118, 2), // Secret Mission
      gh(116, 1), // Recall
      gh(19, 1), // The Rocket's Trap
      gh(126, 1), // Trash Exchange
      gh(119, 1), // Tickling Machine
      // Energy (26)
      energy(101, 26), // Psychic Energy
    ],
  },
  {
    id: "gym-heroes-blaine",
    name: "Mazo de Blaine",
    image: "",
    featuredPokemon: [
      { cardNumber: 1, set: CardSet.GymHeroes }, // Blaine's Moltres
      { cardNumber: 37, set: CardSet.GymHeroes }, // Blaine's Magmar
      { cardNumber: 36, set: CardSet.GymHeroes }, // Blaine's Kangaskhan
    ],
    cards: [
      // Pokémon (21)
      gh(1, 1), // Blaine's Moltres
      gh(35, 2), // Blaine's Growlithe
      gh(62, 2), // Blaine's Growlithe
      gh(36, 2), // Blaine's Kangaskhan
      gh(37, 3), // Blaine's Magmar
      gh(61, 3), // Blaine's Charmander
      gh(63, 3), // Blaine's Ponyta
      gh(64, 2), // Blaine's Tauros
      gh(65, 3), // Blaine's Vulpix
      // Trainers (12)
      gh(105, 2), // Blaine's Last Resort
      gh(121, 2), // Blaine's Gamble
      gh(111, 2), // Good Manners
      gh(118, 1), // Secret Mission
      gh(122, 1), // Energy Flow
      gh(124, 1), // Narrow Gym
      gh(104, 1), // The Rocket's Training Gym
      gh(113, 1), // Minion of Team Rocket
      gh(126, 1), // Trash Exchange
      // Energy (27)
      energy(98, 27), // Fire Energy
    ],
  },
];
