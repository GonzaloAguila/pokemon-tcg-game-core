/**
 * Theme deck definitions - Base Set
 *
 * Card numbers reference the Base Set catalog (1-102).
 * See src/domain/catalog/base-set.ts for the full card list.
 */

import type { Deck } from "./types";

export const decks: Deck[] = [
  {
    id: "overgrowth",
    name: "Overgrowth",
    image: "/theme-decks/Overgrowth.jpg",
    featuredPokemon: [17, 6, 64], // Beedrill, Gyarados, Starmie
    cards: [
      // Pokemon (23)
      { cardNumber: 6, quantity: 1 },   // Gyarados
      { cardNumber: 35, quantity: 2 },  // Magikarp
      { cardNumber: 64, quantity: 3 },  // Starmie
      { cardNumber: 65, quantity: 4 },  // Staryu
      { cardNumber: 17, quantity: 1 },  // Beedrill
      { cardNumber: 33, quantity: 2 },  // Kakuna
      { cardNumber: 30, quantity: 2 },  // Ivysaur
      { cardNumber: 69, quantity: 4 },  // Weedle
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
    featuredPokemon: [29, 10, 58], // Haunter, Mewtwo, Pikachu
    cards: [
      // Pokemon (21)
      { cardNumber: 10, quantity: 1 },  // Mewtwo
      { cardNumber: 32, quantity: 1 },  // Kadabra
      { cardNumber: 31, quantity: 2 },  // Jynx
      { cardNumber: 29, quantity: 2 },  // Haunter
      { cardNumber: 50, quantity: 3 },  // Gastly
      { cardNumber: 49, quantity: 2 },  // Drowzee
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
    featuredPokemon: [34, 7, 42], // Machoke, Hitmonchan, Wartortle
    cards: [
      // Pokemon (24)
      { cardNumber: 7, quantity: 1 },   // Hitmonchan
      { cardNumber: 34, quantity: 2 },  // Machoke
      { cardNumber: 52, quantity: 4 },  // Machop
      { cardNumber: 56, quantity: 3 },  // Onix
      { cardNumber: 62, quantity: 3 },  // Sandshrew
      { cardNumber: 42, quantity: 2 },  // Wartortle
      { cardNumber: 63, quantity: 4 },  // Squirtle
      { cardNumber: 65, quantity: 3 },  // Staryu
      { cardNumber: 27, quantity: 2 },  // Farfetch'd
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
    featuredPokemon: [24, 12, 23], // Charmeleon, Ninetales, Arcanine
    cards: [
      // Pokemon (22)
      { cardNumber: 12, quantity: 1 },  // Ninetales
      { cardNumber: 23, quantity: 1 },  // Arcanine
      { cardNumber: 24, quantity: 2 },  // Charmeleon
      { cardNumber: 28, quantity: 2 },  // Growlithe
      { cardNumber: 46, quantity: 4 },  // Charmander
      { cardNumber: 68, quantity: 2 },  // Vulpix
      { cardNumber: 55, quantity: 4 },  // Nidoran♂
      { cardNumber: 69, quantity: 4 },  // Weedle
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
    featuredPokemon: [7, 20, 27], // Hitmonchan, Electabuzz, Farfetch'd
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
    featuredPokemon: [25, 2, 63], // Dewgong, Blastoise, Squirtle
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
    featuredPokemon: [31, 1, 3], // Jynx, Alakazam, Chansey
    cards: [
      // Pokemon (16)
      { cardNumber: 43, quantity: 4 },  // Abra
      { cardNumber: 32, quantity: 3 },  // Kadabra
      { cardNumber: 1, quantity: 3 },   // Alakazam
      { cardNumber: 3, quantity: 4 },   // Chansey
      { cardNumber: 31, quantity: 2 },  // Jynx
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
    featuredPokemon: [11, 15, 3], // Nidoking, Venusaur, Chansey
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
    featuredPokemon: [4, 8, 24], // Charizard, Machamp, Charmeleon
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
    featuredPokemon: [16, 14, 21], // Zapdos, Raichu, Electrode
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
    featuredPokemon: [5, 18, 40], // Clefairy, Dragonair, Raticate
    cards: [
      // Pokemon (24)
      { cardNumber: 5, quantity: 4 },   // Clefairy
      { cardNumber: 26, quantity: 3 },  // Dratini
      { cardNumber: 18, quantity: 2 },  // Dragonair
      { cardNumber: 39, quantity: 4 },  // Porygon
      { cardNumber: 61, quantity: 4 },  // Rattata
      { cardNumber: 40, quantity: 3 },  // Raticate
      { cardNumber: 48, quantity: 4 },  // Doduo
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
