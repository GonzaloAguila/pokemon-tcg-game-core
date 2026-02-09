/**
 * Theme deck definitions - Base Set & Jungle
 *
 * Card numbers reference the Base Set (1-102) and Jungle (1-64) catalogs.
 * Entries without `set` default to Base Set (backward compatible).
 * Entries with `set: CardSet.Jungle` reference the Jungle catalog.
 */

import { CardSet } from "@/domain/constants";
import type { Deck } from "./types";

export const decks: Deck[] = [
  {
    id: "overgrowth",
    name: "Overgrowth",
    image: "/theme-decks/Overgrowth.jpg",
    featuredPokemon: [
      { cardNumber: 7, set: CardSet.Jungle },  // Nidoqueen
      { cardNumber: 6 },                        // Gyarados
      { cardNumber: 64 },                       // Starmie
    ],
    cards: [
      // Pokemon (23)
      { cardNumber: 6, quantity: 1 },   // Gyarados
      { cardNumber: 35, quantity: 2 },  // Magikarp
      { cardNumber: 64, quantity: 3 },  // Starmie
      { cardNumber: 65, quantity: 4 },  // Staryu
      { cardNumber: 7, quantity: 1, set: CardSet.Jungle },   // Nidoqueen
      { cardNumber: 40, quantity: 2, set: CardSet.Jungle },  // Nidorina
      { cardNumber: 30, quantity: 2 },  // Ivysaur
      { cardNumber: 57, quantity: 4, set: CardSet.Jungle },  // Nidoran♀
      { cardNumber: 44, quantity: 4 },  // Bulbasaur
      // Trainers (9)
      { cardNumber: 94, quantity: 1 },  // Potion
      { cardNumber: 91, quantity: 2 },  // Bill
      { cardNumber: 90, quantity: 2 },  // Super Potion
      { cardNumber: 95, quantity: 2 },  // Switch
      { cardNumber: 93, quantity: 2 },  // Gust of Wind
      // Energy (28)
      { cardNumber: 102, quantity: 12 }, // Water Energy
      { cardNumber: 99, quantity: 16 },  // Grass Energy
    ],
  },
  {
    id: "zap",
    name: "Zap!",
    image: "/theme-decks/Zap.jpg",
    featuredPokemon: [
      { cardNumber: 29 },                       // Haunter
      { cardNumber: 10 },                        // Mewtwo
      { cardNumber: 4, set: CardSet.Jungle },    // Jolteon
    ],
    cards: [
      // Pokemon (21)
      { cardNumber: 10, quantity: 1 },  // Mewtwo
      { cardNumber: 32, quantity: 1 },  // Kadabra
      { cardNumber: 4, quantity: 2, set: CardSet.Jungle },   // Jolteon
      { cardNumber: 29, quantity: 2 },  // Haunter
      { cardNumber: 50, quantity: 3 },  // Gastly
      { cardNumber: 51, quantity: 2, set: CardSet.Jungle },  // Eevee
      { cardNumber: 43, quantity: 3 },  // Abra
      { cardNumber: 58, quantity: 4 },  // Pikachu
      { cardNumber: 53, quantity: 3 },  // Magnemite
      // Trainers (11)
      { cardNumber: 71, quantity: 1 },  // Computer Search
      { cardNumber: 80, quantity: 1 },  // Defender
      { cardNumber: 90, quantity: 1 },  // Super Potion
      { cardNumber: 88, quantity: 1 },  // Professor Oak
      { cardNumber: 95, quantity: 2 },  // Switch
      { cardNumber: 94, quantity: 1 },  // Potion
      { cardNumber: 93, quantity: 2 },  // Gust of Wind
      { cardNumber: 91, quantity: 2 },  // Bill
      // Energy (28)
      { cardNumber: 100, quantity: 12 }, // Lightning Energy
      { cardNumber: 101, quantity: 16 }, // Psychic Energy
    ],
  },
  {
    id: "blackout",
    name: "Blackout",
    image: "/theme-decks/Blackout.jpg",
    featuredPokemon: [
      { cardNumber: 34 },                        // Machoke
      { cardNumber: 7 },                          // Hitmonchan
      { cardNumber: 43, set: CardSet.Jungle },    // Primeape
    ],
    cards: [
      // Pokemon (24)
      { cardNumber: 7, quantity: 1 },   // Hitmonchan
      { cardNumber: 34, quantity: 2 },  // Machoke
      { cardNumber: 52, quantity: 4 },  // Machop
      { cardNumber: 56, quantity: 3 },  // Onix
      { cardNumber: 43, quantity: 2, set: CardSet.Jungle },  // Primeape
      { cardNumber: 42, quantity: 2 },  // Wartortle
      { cardNumber: 63, quantity: 4 },  // Squirtle
      { cardNumber: 65, quantity: 3 },  // Staryu
      { cardNumber: 55, quantity: 3, set: CardSet.Jungle },  // Mankey
      // Trainers (9)
      { cardNumber: 79, quantity: 1 },  // Super Energy Removal
      { cardNumber: 84, quantity: 1 },  // PlusPower
      { cardNumber: 88, quantity: 1 },  // Professor Oak
      { cardNumber: 92, quantity: 4 },  // Energy Removal
      { cardNumber: 93, quantity: 2 },  // Gust of Wind
      // Energy (28)
      { cardNumber: 97, quantity: 16 }, // Fighting Energy
      { cardNumber: 102, quantity: 12 }, // Water Energy
    ],
  },
  {
    id: "brushfire",
    name: "Brushfire",
    image: "/theme-decks/Brushfire.jpg",
    featuredPokemon: [
      { cardNumber: 24 },                        // Charmeleon
      { cardNumber: 12 },                         // Ninetales
      { cardNumber: 3, set: CardSet.Jungle },     // Flareon
    ],
    cards: [
      // Pokemon (22)
      { cardNumber: 12, quantity: 1 },  // Ninetales
      { cardNumber: 23, quantity: 1 },  // Arcanine
      { cardNumber: 24, quantity: 2 },  // Charmeleon
      { cardNumber: 28, quantity: 2 },  // Growlithe
      { cardNumber: 46, quantity: 4 },  // Charmander
      { cardNumber: 68, quantity: 2 },  // Vulpix
      { cardNumber: 3, quantity: 2, set: CardSet.Jungle },   // Flareon
      { cardNumber: 51, quantity: 4, set: CardSet.Jungle },  // Eevee
      { cardNumber: 49, quantity: 2, set: CardSet.Jungle },  // Bellsprout
      { cardNumber: 66, quantity: 2 },  // Tangela
      // Trainers (11)
      { cardNumber: 75, quantity: 1 },  // Lass
      { cardNumber: 81, quantity: 2 },  // Energy Retrieval
      { cardNumber: 84, quantity: 1 },  // PlusPower
      { cardNumber: 95, quantity: 1 },  // Switch
      { cardNumber: 94, quantity: 3 },  // Potion
      { cardNumber: 93, quantity: 2 },  // Gust of Wind
      { cardNumber: 92, quantity: 1 },  // Energy Removal
      // Energy (28)
      { cardNumber: 98, quantity: 16 }, // Fire Energy
      { cardNumber: 99, quantity: 12 }, // Grass Energy
    ],
  },
  {
    id: "haymaker",
    name: "Haymaker",
    image: "/theme-decks/Haymaker.webp",
    featuredPokemon: [
      { cardNumber: 7 },   // Hitmonchan
      { cardNumber: 20 },  // Electabuzz
      { cardNumber: 27 },  // Farfetch'd
    ],
    cards: [
      // Pokemon (11)
      { cardNumber: 7, quantity: 4 },   // Hitmonchan
      { cardNumber: 20, quantity: 4 },  // Electabuzz
      { cardNumber: 27, quantity: 3 },  // Farfetch'd
      // Trainers (32)
      { cardNumber: 88, quantity: 4 },  // Professor Oak
      { cardNumber: 84, quantity: 4 },  // PlusPower
      { cardNumber: 92, quantity: 4 },  // Energy Removal
      { cardNumber: 91, quantity: 3 },  // Bill
      { cardNumber: 93, quantity: 3 },  // Gust of Wind
      { cardNumber: 78, quantity: 3 },  // Scoop Up
      { cardNumber: 81, quantity: 3 },  // Energy Retrieval
      { cardNumber: 74, quantity: 3 },  // Item Finder
      { cardNumber: 79, quantity: 3 },  // Super Energy Removal
      { cardNumber: 71, quantity: 2 },  // Computer Search
      // Energy (17)
      { cardNumber: 97, quantity: 7 },  // Fighting Energy
      { cardNumber: 100, quantity: 6 }, // Lightning Energy
      { cardNumber: 96, quantity: 4 },  // Double Colorless Energy
    ],
  },
  {
    id: "raindance",
    name: "Raindance",
    image: "/theme-decks/Raindance.webp",
    featuredPokemon: [
      { cardNumber: 25 },  // Dewgong
      { cardNumber: 2 },   // Blastoise
      { cardNumber: 63 },  // Squirtle
    ],
    cards: [
      // Pokemon (15)
      { cardNumber: 63, quantity: 4 },  // Squirtle
      { cardNumber: 42, quantity: 1 },  // Wartortle
      { cardNumber: 2, quantity: 3 },   // Blastoise
      { cardNumber: 41, quantity: 4 },  // Seel
      { cardNumber: 25, quantity: 3 },  // Dewgong
      // Trainers (31)
      { cardNumber: 88, quantity: 4 },  // Professor Oak
      { cardNumber: 91, quantity: 4 },  // Bill
      { cardNumber: 71, quantity: 3 },  // Computer Search
      { cardNumber: 76, quantity: 4 },  // Pokémon Breeder
      { cardNumber: 81, quantity: 3 },  // Energy Retrieval
      { cardNumber: 74, quantity: 3 },  // Item Finder
      { cardNumber: 95, quantity: 2 },  // Switch
      { cardNumber: 79, quantity: 1 },  // Super Energy Removal
      { cardNumber: 83, quantity: 2 },  // Maintenance
      { cardNumber: 90, quantity: 2 },  // Super Potion
      { cardNumber: 84, quantity: 1 },  // PlusPower
      { cardNumber: 93, quantity: 1 },  // Gust of Wind
      { cardNumber: 75, quantity: 1 },  // Lass
      // Energy (14)
      { cardNumber: 102, quantity: 14 }, // Water Energy
    ],
  },
  {
    id: "damage-swap",
    name: "Damage Swap",
    image: "/theme-decks/DamageSwap.webp",
    featuredPokemon: [
      { cardNumber: 6, set: CardSet.Jungle },  // Mr. Mime
      { cardNumber: 1 },                        // Alakazam
      { cardNumber: 3 },                        // Chansey
    ],
    cards: [
      // Pokemon (16)
      { cardNumber: 43, quantity: 4 },  // Abra
      { cardNumber: 32, quantity: 3 },  // Kadabra
      { cardNumber: 1, quantity: 3 },   // Alakazam
      { cardNumber: 3, quantity: 4 },   // Chansey
      { cardNumber: 6, quantity: 2, set: CardSet.Jungle },  // Mr. Mime
      // Trainers (28)
      { cardNumber: 81, quantity: 1 },  // Energy Retrieval
      { cardNumber: 74, quantity: 4 },  // Item Finder
      { cardNumber: 88, quantity: 4 },  // Professor Oak
      { cardNumber: 95, quantity: 2 },  // Switch
      { cardNumber: 71, quantity: 3 },  // Computer Search
      { cardNumber: 85, quantity: 3 },  // Pokémon Center
      { cardNumber: 77, quantity: 2 },  // Pokémon Trader
      { cardNumber: 91, quantity: 4 },  // Bill
      { cardNumber: 93, quantity: 2 },  // Gust of Wind
      { cardNumber: 76, quantity: 2 },  // Pokémon Breeder
      { cardNumber: 78, quantity: 1 },  // Scoop Up
      // Energy (16)
      { cardNumber: 101, quantity: 12 }, // Psychic Energy
      { cardNumber: 96, quantity: 4 },   // Double Colorless Energy
    ],
  },
  {
    id: "venucenter",
    name: "Venucenter",
    image: "/theme-decks/Venucenter.webp",
    featuredPokemon: [
      { cardNumber: 11 },  // Nidoking
      { cardNumber: 15 },  // Venusaur
      { cardNumber: 3 },   // Chansey
    ],
    cards: [
      // Pokemon (21)
      { cardNumber: 44, quantity: 4 },  // Bulbasaur
      { cardNumber: 30, quantity: 3 },  // Ivysaur
      { cardNumber: 15, quantity: 3 },  // Venusaur
      { cardNumber: 3, quantity: 4 },   // Chansey
      { cardNumber: 55, quantity: 3 },  // Nidoran♂
      { cardNumber: 37, quantity: 2 },  // Nidorino
      { cardNumber: 11, quantity: 2 },  // Nidoking
      // Trainers (23)
      { cardNumber: 81, quantity: 1 },  // Energy Retrieval
      { cardNumber: 74, quantity: 2 },  // Item Finder
      { cardNumber: 88, quantity: 3 },  // Professor Oak
      { cardNumber: 95, quantity: 2 },  // Switch
      { cardNumber: 71, quantity: 2 },  // Computer Search
      { cardNumber: 85, quantity: 2 },  // Pokémon Center
      { cardNumber: 77, quantity: 1 },  // Pokémon Trader
      { cardNumber: 91, quantity: 3 },  // Bill
      { cardNumber: 93, quantity: 2 },  // Gust of Wind
      { cardNumber: 76, quantity: 2 },  // Pokémon Breeder
      { cardNumber: 83, quantity: 1 },  // Maintenance
      { cardNumber: 79, quantity: 1 },  // Super Energy Removal
      { cardNumber: 78, quantity: 1 },  // Scoop Up
      // Energy (16)
      { cardNumber: 99, quantity: 12 }, // Grass Energy
      { cardNumber: 96, quantity: 4 },  // Double Colorless Energy
    ],
  },
  {
    id: "fire-fighting",
    name: "Fire & Fighting",
    image: "/theme-decks/FireFighting.webp",
    featuredPokemon: [
      { cardNumber: 4 },   // Charizard
      { cardNumber: 8 },   // Machamp
      { cardNumber: 24 },  // Charmeleon
    ],
    cards: [
      // Pokemon (18)
      { cardNumber: 46, quantity: 4 },  // Charmander
      { cardNumber: 24, quantity: 3 },  // Charmeleon
      { cardNumber: 4, quantity: 2 },   // Charizard
      { cardNumber: 52, quantity: 4 },  // Machop
      { cardNumber: 34, quantity: 3 },  // Machoke
      { cardNumber: 8, quantity: 2 },   // Machamp
      // Trainers (20)
      { cardNumber: 91, quantity: 4 },  // Bill
      { cardNumber: 88, quantity: 3 },  // Professor Oak
      { cardNumber: 71, quantity: 3 },  // Computer Search
      { cardNumber: 76, quantity: 3 },  // Pokémon Breeder
      { cardNumber: 95, quantity: 2 },  // Switch
      { cardNumber: 93, quantity: 2 },  // Gust of Wind
      { cardNumber: 81, quantity: 2 },  // Energy Retrieval
      { cardNumber: 84, quantity: 1 },  // PlusPower
      // Energy (22)
      { cardNumber: 98, quantity: 10 }, // Fire Energy
      { cardNumber: 97, quantity: 8 },  // Fighting Energy
      { cardNumber: 96, quantity: 4 },  // Double Colorless Energy
    ],
  },
  {
    id: "thunderstorm",
    name: "Thunderstorm",
    image: "/theme-decks/Thunderstorm.webp",
    featuredPokemon: [
      { cardNumber: 16 },  // Zapdos
      { cardNumber: 14 },  // Raichu
      { cardNumber: 21 },  // Electrode
    ],
    cards: [
      // Pokemon (20)
      { cardNumber: 16, quantity: 4 },  // Zapdos
      { cardNumber: 67, quantity: 4 },  // Voltorb
      { cardNumber: 21, quantity: 4 },  // Electrode
      { cardNumber: 58, quantity: 4 },  // Pikachu
      { cardNumber: 14, quantity: 4 },  // Raichu
      // Trainers (20)
      { cardNumber: 88, quantity: 4 },  // Professor Oak
      { cardNumber: 91, quantity: 4 },  // Bill
      { cardNumber: 74, quantity: 4 },  // Item Finder
      { cardNumber: 71, quantity: 4 },  // Computer Search
      { cardNumber: 72, quantity: 2 },  // Devolution Spray
      { cardNumber: 73, quantity: 2 },  // Imposter Professor Oak
      // Energy (20)
      { cardNumber: 100, quantity: 20 }, // Lightning Energy
    ],
  },
  {
    id: "colorless",
    name: "Normaltype",
    image: "/theme-decks/Normaltype.webp",
    featuredPokemon: [
      { cardNumber: 16, set: CardSet.Jungle },  // Wigglytuff
      { cardNumber: 18 },                        // Dragonair
      { cardNumber: 1, set: CardSet.Jungle },    // Clefable
    ],
    cards: [
      // Pokemon (24)
      { cardNumber: 5, quantity: 4 },   // Clefairy
      { cardNumber: 26, quantity: 3 },  // Dratini
      { cardNumber: 18, quantity: 2 },  // Dragonair
      { cardNumber: 16, quantity: 2, set: CardSet.Jungle },  // Wigglytuff
      { cardNumber: 61, quantity: 4 },  // Rattata
      { cardNumber: 40, quantity: 3 },  // Raticate
      { cardNumber: 54, quantity: 4, set: CardSet.Jungle },  // Jigglypuff
      { cardNumber: 1, quantity: 2, set: CardSet.Jungle },   // Clefable
      // Trainers (16)
      { cardNumber: 91, quantity: 4 },  // Bill
      { cardNumber: 88, quantity: 3 },  // Professor Oak
      { cardNumber: 71, quantity: 2 },  // Computer Search
      { cardNumber: 77, quantity: 2 },  // Pokémon Trader
      { cardNumber: 95, quantity: 2 },  // Switch
      { cardNumber: 93, quantity: 2 },  // Gust of Wind
      { cardNumber: 82, quantity: 1 },  // Full Heal
      // Energy (20)
      { cardNumber: 96, quantity: 4 },  // Double Colorless Energy
      { cardNumber: 101, quantity: 16 }, // Psychic Energy
    ],
  },
];
