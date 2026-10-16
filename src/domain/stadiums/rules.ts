/**
 * Continuous Stadium rules (Gym Heroes), read by the engine through one hook each:
 *
 * | Stadium | Rule | Hook (called from) |
 * |---|---|---|
 * | The Rocket's Training Gym | each player pays Colorless more to retreat | stadiumRetreatModifier (getRetreatCost) |
 * | Cerulean City Gym | Colorless less to retreat a Pokémon with Misty in its name | stadiumRetreatModifier |
 * | Pewter City Gym | no Resistance against attacks of Pokémon with Brock in their names | stadiumIgnoresResistance (executeAttack, dealChosenTargetDamage, AI estimate) |
 * | Narrow Gym | no Bench may hold more than 4 Pokémon | stadiumBenchLimit (maxBenchSize) |
 * | No Removal Gym | discard 2 cards from the hand to play Energy Removal / Super Energy Removal | stadiumExtraTrainerDiscards (Trainer entry points) |
 *
 * Only this file and effects/stadiums.ts name Stadium cards. Narrow Gym's on-play discard-down
 * lives in effects/stadiums.ts (and board/bench-trim.ts).
 */

import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { hasOwner } from "@/domain/cards/owner";
import { stadiumNamed } from "@/domain/board/stadium";

/** Bench size while Narrow Gym is in play. */
export const NARROW_GYM_BENCH_SIZE = 4;

const ENERGY_REMOVAL_CARDS = ["Energy Removal", "Super Energy Removal"];

/**
 * Change of `pokemon`'s Retreat Cost from the Stadium in play: +1 with The Rocket's Training
 * Gym (everyone), −1 with Cerulean City Gym for a Pokémon with Misty in its name, else 0.
 * Callers floor the total at 0.
 */
export function stadiumRetreatModifier(state: GameState, pokemon: PokemonInPlay): number {
  if (stadiumNamed(state, "The Rocket's Training Gym")) return 1;
  if (stadiumNamed(state, "Cerulean City Gym") && hasOwner(pokemon.pokemon, "Misty")) return -1;
  return 0;
}

/** Pewter City Gym: Resistance doesn't apply to the attacks of `attacker` (Brock in its name). */
export function stadiumIgnoresResistance(state: GameState, attacker: PokemonInPlay): boolean {
  return stadiumNamed(state, "Pewter City Gym") && hasOwner(attacker.pokemon, "Brock");
}

/** Cards from the hand a player must discard to play the Trainer `trainerName` (No Removal Gym: 2 for (Super) Energy Removal). */
export function stadiumExtraTrainerDiscards(state: GameState, trainerName: string): number {
  return stadiumNamed(state, "No Removal Gym") && ENERGY_REMOVAL_CARDS.includes(trainerName) ? 2 : 0;
}

/** The Bench limit the Stadium in play sets for both players (Narrow Gym: 4), or null. */
export function stadiumBenchLimit(state: GameState): number | null {
  return stadiumNamed(state, "Narrow Gym") ? NARROW_GYM_BENCH_SIZE : null;
}
