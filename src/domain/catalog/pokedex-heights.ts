/**
 * Pokédex lengths (Blaine's Quiz #1: "your opponent guesses the length of that Pokémon").
 *
 * The source card data (api.pokemontcg.io) has no lengths, so this is one table keyed by
 * Pokédex species: the official Generation I Pokédex heights in imperial units, as the
 * classic cards print them ("Length: 5' 7""). Card names map to their species with
 * `pokedexSpecies` (owner prefix and "Dark " stripped: "Brock's Onix" → Onix, "Dark Charizard"
 * → Charizard; Base Set's "Nidoran" is Nidoran♂). Trainers played as Basics (Mysterious
 * Fossil, Clefairy Doll) are not Pokémon cards and have no length.
 */

import { POKEMON_OWNERS } from "@/domain/cards/owner";

/** Species → length as printed (feet and inches). Every Pokémon of the catalog's sets (test-checked). */
export const POKEDEX_HEIGHTS: Readonly<Record<string, string>> = {
  Bulbasaur: `2' 4"`, Ivysaur: `3' 3"`, Venusaur: `6' 7"`,
  Charmander: `2' 0"`, Charmeleon: `3' 7"`, Charizard: `5' 7"`,
  Squirtle: `1' 8"`, Wartortle: `3' 3"`, Blastoise: `5' 3"`,
  Caterpie: `1' 0"`, Metapod: `2' 4"`, Butterfree: `3' 7"`,
  Weedle: `1' 0"`, Kakuna: `2' 0"`, Beedrill: `3' 3"`,
  Pidgey: `1' 0"`, Pidgeotto: `3' 7"`, Pidgeot: `4' 11"`,
  Rattata: `1' 0"`, Raticate: `2' 4"`,
  Spearow: `1' 0"`, Fearow: `3' 11"`,
  Ekans: `6' 7"`, Arbok: `11' 6"`,
  Pikachu: `1' 4"`, Raichu: `2' 7"`,
  Sandshrew: `2' 0"`, Sandslash: `3' 3"`,
  "Nidoran♀": `1' 4"`, Nidorina: `2' 7"`, Nidoqueen: `4' 3"`,
  "Nidoran♂": `1' 8"`, Nidorino: `2' 11"`, Nidoking: `4' 7"`,
  Clefairy: `2' 0"`, Clefable: `4' 3"`,
  Vulpix: `2' 0"`, Ninetales: `3' 7"`,
  Jigglypuff: `1' 8"`, Wigglytuff: `3' 3"`,
  Zubat: `2' 7"`, Golbat: `5' 3"`,
  Oddish: `1' 8"`, Gloom: `2' 7"`, Vileplume: `3' 11"`,
  Paras: `1' 0"`, Parasect: `3' 3"`,
  Venonat: `3' 3"`, Venomoth: `4' 11"`,
  Diglett: `0' 8"`, Dugtrio: `2' 4"`,
  Meowth: `1' 4"`, Persian: `3' 3"`,
  Psyduck: `2' 7"`, Golduck: `5' 7"`,
  Mankey: `1' 8"`, Primeape: `3' 3"`,
  Growlithe: `2' 4"`, Arcanine: `6' 3"`,
  Poliwag: `2' 0"`, Poliwhirl: `3' 3"`, Poliwrath: `4' 3"`,
  Abra: `2' 11"`, Kadabra: `4' 3"`, Alakazam: `4' 11"`,
  Machop: `2' 7"`, Machoke: `4' 11"`, Machamp: `5' 3"`,
  Bellsprout: `2' 4"`, Weepinbell: `3' 3"`, Victreebel: `5' 7"`,
  Tentacool: `2' 11"`, Tentacruel: `5' 3"`,
  Geodude: `1' 4"`, Graveler: `3' 3"`, Golem: `4' 7"`,
  Ponyta: `3' 3"`, Rapidash: `5' 7"`,
  Slowpoke: `3' 11"`, Slowbro: `5' 3"`,
  Magnemite: `1' 0"`, Magneton: `3' 3"`,
  "Farfetch'd": `2' 7"`,
  Doduo: `4' 7"`, Dodrio: `5' 11"`,
  Seel: `3' 7"`, Dewgong: `5' 7"`,
  Grimer: `2' 11"`, Muk: `3' 11"`,
  Shellder: `1' 0"`, Cloyster: `4' 11"`,
  Gastly: `4' 3"`, Haunter: `5' 3"`, Gengar: `4' 11"`,
  Onix: `28' 10"`,
  Drowzee: `3' 3"`, Hypno: `5' 3"`,
  Krabby: `1' 4"`, Kingler: `4' 3"`,
  Voltorb: `1' 8"`, Electrode: `3' 11"`,
  Exeggcute: `1' 4"`, Exeggutor: `6' 7"`,
  Cubone: `1' 4"`, Marowak: `3' 3"`,
  Hitmonlee: `4' 11"`, Hitmonchan: `4' 7"`,
  Lickitung: `3' 11"`,
  Koffing: `2' 0"`, Weezing: `3' 11"`,
  Rhyhorn: `3' 3"`, Rhydon: `6' 3"`,
  Chansey: `3' 7"`,
  Tangela: `3' 3"`,
  Kangaskhan: `7' 3"`,
  Horsea: `1' 4"`, Seadra: `3' 11"`,
  Goldeen: `2' 0"`, Seaking: `4' 3"`,
  Staryu: `2' 7"`, Starmie: `3' 7"`,
  "Mr. Mime": `4' 3"`,
  Scyther: `4' 11"`,
  Jynx: `4' 7"`,
  Electabuzz: `3' 7"`,
  Magmar: `4' 3"`,
  Pinsir: `4' 11"`,
  Tauros: `4' 7"`,
  Magikarp: `2' 11"`, Gyarados: `21' 4"`,
  Lapras: `8' 2"`,
  Ditto: `1' 0"`,
  Eevee: `1' 0"`, Vaporeon: `3' 3"`, Jolteon: `2' 7"`, Flareon: `2' 11"`,
  Porygon: `2' 7"`,
  Omanyte: `1' 4"`, Omastar: `3' 3"`,
  Kabuto: `1' 8"`, Kabutops: `4' 3"`,
  Aerodactyl: `5' 11"`,
  Snorlax: `6' 11"`,
  Articuno: `5' 7"`, Zapdos: `5' 3"`, Moltres: `6' 7"`,
  Dratini: `5' 11"`, Dragonair: `13' 1"`, Dragonite: `7' 3"`,
  Mewtwo: `6' 7"`, Mew: `1' 4"`,
};

/** Card names that aren't their species' Pokédex name. */
const SPECIES_ALIASES: Readonly<Record<string, string>> = { Nidoran: "Nidoran♂", "Nidoran ♀": "Nidoran♀", "Nidoran ♂": "Nidoran♂" };

/** The Pokédex species of a Pokémon card name ("Brock's Onix" → "Onix", "Dark Charizard" → "Charizard"). */
export function pokedexSpecies(name: string): string {
  const owner = POKEMON_OWNERS.find((o) => name.startsWith(`${o}'s `));
  const bare = (owner ? name.slice(owner.length + 3) : name).replace(/^Dark /, "");
  return SPECIES_ALIASES[bare] ?? bare;
}

/** The printed length of a Pokémon card (by its species), or undefined (not a Pokémon / unknown). */
export function pokedexHeight(card: { name: string }): string | undefined {
  return POKEDEX_HEIGHTS[pokedexSpecies(card.name)];
}

/** `5' 11"` → 71 */
export function heightInInches(text: string): number {
  const match = /^(\d+)' (\d+)"$/.exec(text);
  if (!match) throw new Error(`Not a length: ${text}`);
  return Number(match[1]) * 12 + Number(match[2]);
}

/** FNV-1a: a stable number from a string (same on every client and the server). */
function hashOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/** How many of the nearest other lengths the wrong answers are drawn from. */
const NEAR = 6;

/**
 * The 4 lengths Blaine's Quiz #1 offers for a species: its own and 3 different lengths of other
 * species, picked among the NEAR closest ones (so they are plausible), sorted shortest first.
 * Deterministic from the species name (no RNG): the server and every client build the same step.
 */
export function quizLengthOptions(species: string): string[] {
  const right = POKEDEX_HEIGHTS[species];
  if (!right) return [];
  const rightInches = heightInInches(right);
  const others = [...new Set(Object.values(POKEDEX_HEIGHTS))]
    .filter((h) => h !== right)
    .sort((a, b) => Math.abs(heightInInches(a) - rightInches) - Math.abs(heightInInches(b) - rightInches) || heightInInches(a) - heightInInches(b))
    .slice(0, NEAR);
  // Pick 3 of them with a seeded Fisher-Yates (xorshift on the species hash)
  let seed = hashOf(species) || 1;
  const next = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) / 0x100000000;
  };
  const pool = [...others];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return [right, ...pool.slice(0, 3)].sort((a, b) => heightInInches(a) - heightInInches(b));
}
