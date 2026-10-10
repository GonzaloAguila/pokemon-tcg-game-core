/**
 * Finding Pokémon in play by id (PokemonInPlay ids are the in-play card's instance id).
 */

import type { GameState, PokemonInPlay } from "@/lib/gameState";

export const MAX_BENCH_SIZE = 5;

export type InPlayLocation = {
  pokemon: PokemonInPlay;
  side: "player" | "opponent";
  location: "active" | "bench";
  /** Index in the bench array (-1 for the Active Pokémon) */
  benchIndex: number;
};

/** A Pokémon in play on `side` by id, or null. */
export function findInPlay(state: GameState, side: "player" | "opponent", pokemonId: string): InPlayLocation | null {
  const active = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  if (active && active.pokemon.id === pokemonId) return { pokemon: active, side, location: "active", benchIndex: -1 };
  const bench = side === "player" ? state.playerBench : state.opponentBench;
  const benchIndex = bench.findIndex((p) => p != null && p.pokemon.id === pokemonId);
  return benchIndex === -1 ? null : { pokemon: bench[benchIndex], side, location: "bench", benchIndex };
}

/** One of the player's Pokémon in play by id, or null. */
export function findOwnPokemon(state: GameState, pokemonId: string): InPlayLocation | null {
  return findInPlay(state, "player", pokemonId);
}

/** Active (if any) then benched Pokémon of a side. */
export function allOwnPokemon(state: GameState, side: "player" | "opponent" = "player"): PokemonInPlay[] {
  const active = side === "player" ? state.playerActivePokemon : state.opponentActivePokemon;
  const bench = side === "player" ? state.playerBench : state.opponentBench;
  return [active, ...bench].filter((p): p is PokemonInPlay => p != null);
}
