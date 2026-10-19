/** Gym Heroes / Gym Challenge owners: the name prefix of their Pokémon ("Brock's Onix"; Giovanni and Koga are Gym Challenge's). */
export const POKEMON_OWNERS = ["Brock", "Misty", "Erika", "Lt. Surge", "Sabrina", "Blaine", "Rocket", "Giovanni", "Koga"] as const;
export type PokemonOwner = (typeof POKEMON_OWNERS)[number];

/** The owner in a card's name, or null ("Brock's Onix" → "Brock"; "Onix" → null). */
export function ownerOf(card: { name: string }): PokemonOwner | null {
  return POKEMON_OWNERS.find((owner) => card.name.startsWith(`${owner}'s `)) ?? null;
}

/** "a Pokémon with <owner> in its name" */
export function hasOwner(card: { name: string }, owner: PokemonOwner): boolean {
  return ownerOf(card) === owner;
}
