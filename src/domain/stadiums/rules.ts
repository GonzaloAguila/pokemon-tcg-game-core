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
 * | Vermilion City Gym | optional coin when a Pokémon with Lt. Surge in its name attacks: heads 10 more to the Defending Pokémon (after W/R, only if the attack damaged it), tails 10 to the attacker | stadiumOffersAttackCoin, canUseVermilionCoin (getAttackCoinPlan / executeAttack `vermilionCoin`) |
 *
 * Only this file and effects/stadiums.ts name Stadium cards. Narrow Gym's on-play discard-down
 * lives in effects/stadiums.ts (and board/bench-trim.ts); Celadon City Gym's action is a
 * STADIUM_ACTIONS entry there.
 */

import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { hasOwner } from "@/domain/cards/owner";
import { stadiumNamed } from "@/domain/board/stadium";
import { getEffectivePokemonCard } from "@/domain/powers";

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

/** Vermilion City Gym: heads = this much more damage to the Defending Pokémon; tails = this much to the attacker. */
export const VERMILION_COIN_DAMAGE = 10;

/**
 * Vermilion City Gym: the player attacking with `attacker` (a Pokémon with Lt. Surge in its
 * name) may flip a coin (the `vermilionCoin` attack option).
 */
export function stadiumOffersAttackCoin(state: GameState, attacker: PokemonInPlay): boolean {
  return stadiumNamed(state, "Vermilion City Gym") && hasOwner(attacker.pokemon, "Lt. Surge");
}

/**
 * Why the side whose turn it is ("player") can't add Vermilion City Gym's coin to its Active's
 * attack `attackIndex`, or null (then `getAttackCoinPlan` / `executeAttack` take
 * `{ vermilionCoin: true }`). Whether the attack itself is legal is canExecuteAttack's job.
 */
export function canUseVermilionCoin(state: GameState, attackIndex: number): string | null {
  if (!stadiumNamed(state, "Vermilion City Gym")) return "Vermilion City Gym no está en juego";
  const attacker = state.playerActivePokemon;
  if (!attacker) return "No tienes Pokémon activo";
  if (!getEffectivePokemonCard(state, attacker)?.attacks[attackIndex]) return "Ese ataque no existe";
  if (!stadiumOffersAttackCoin(state, attacker)) return `${attacker.pokemon.name} no tiene a Lt. Surge en su nombre`;
  return null;
}
