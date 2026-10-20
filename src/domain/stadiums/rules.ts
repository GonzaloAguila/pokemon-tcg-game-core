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
 * | Resistance Gym (GC) | every Resistance is 20 less (−30 → −10) | resistanceAmount (every Weakness / Resistance site, AI estimates) |
 * | Cinnabar City Gym (GC) | no Weakness when a Water Pokémon (current type) damages a Pokémon with Blaine in its name | stadiumIgnoresWeakness (same sites) |
 * | Viridian City Gym (GC) | a Pokémon with Giovanni in its name that evolves (any path) loses 2 damage counters (1 if it has 1) | stadiumEvolutionHeal (evolvePokemonInPlay) |
 * | Rocket's Minefield Gym (GC) | a Basic put onto the Bench from the hand flips: tails 2 damage counters | stadiumBenchPlayCoin (getPlayBasicCoinFlips / playBasicPokemon) |
 * | Chaos Gym (GC) | every non-Stadium Trainer played flips first (effects/chaos-gym.ts) | stadiumFlipsTrainers |
 *
 * Fuchsia City Gym and Saffron City Gym (GC) are STADIUM_ACTIONS entries (effects/stadiums.ts).
 *
 * stadiumFavoredOwner says whose Pokémon the leader Gyms favor (the AI judges a Stadium with the
 * hooks). Only this file and effects/stadiums.ts name Stadium cards. Narrow Gym's on-play discard-down
 * lives in effects/stadiums.ts (and board/bench-trim.ts); Celadon City Gym's action is a
 * STADIUM_ACTIONS entry there.
 */

import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { EnergyType } from "@/domain/constants";
import { getAvailableAttacks } from "@/lib/gameState";
import { hasOwner, type PokemonOwner } from "@/domain/cards/owner";
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

/**
 * Pewter City Gym: Resistance doesn't apply to the attacks of `attacker` (Brock in its name).
 * `attacker` may be a Pokémon in play or a card (`{ pokemon: card }`, the AI's estimates).
 */
export function stadiumIgnoresResistance(state: GameState, attacker: { pokemon: { name: string } }): boolean {
  return stadiumNamed(state, "Pewter City Gym") && hasOwner(attacker.pokemon, "Brock");
}

/** The leader each Gym's rule favors: Pokémon with that owner in their names (see the table above). */
const FAVORED_OWNER: Readonly<Record<string, PokemonOwner>> = {
  "Pewter City Gym": "Brock",
  "Cerulean City Gym": "Misty",
  "Vermilion City Gym": "Lt. Surge",
  "Celadon City Gym": "Erika",
  "Cinnabar City Gym": "Blaine",
  "Viridian City Gym": "Giovanni",
  "Fuchsia City Gym": "Koga",
  "Saffron City Gym": "Sabrina",
};

/**
 * Whose Pokémon the Stadium in play favors (Pewter City Gym: Brock — no Resistance against
 * them; Cerulean City Gym: Misty — cheaper retreat; Vermilion City Gym: Lt. Surge — the attack
 * coin; Celadon City Gym: Erika — its action), or null. For judgements (the AI); the rules
 * themselves are the hooks.
 */
export function stadiumFavoredOwner(state: GameState): PokemonOwner | null {
  const name = state.stadium?.card.name;
  return (name && FAVORED_OWNER[name]) || null;
}

/** Printed Resistance of every classic card: −30. */
export const RESISTANCE_AMOUNT = 30;

/** How much the Stadium in play lowers every Resistance (Resistance Gym: 20, so −30 → −10), else 0. */
export function stadiumResistanceModifier(state: GameState): number {
  return stadiumNamed(state, "Resistance Gym") ? 20 : 0;
}

/** Damage a Resistance takes off now: 30, 10 with Resistance Gym. */
export function resistanceAmount(state: GameState): number {
  return RESISTANCE_AMOUNT - stadiumResistanceModifier(state);
}

/**
 * Cinnabar City Gym: no Weakness when damage of type `damageType` (the attacker's current type:
 * Conversion / Venomoth's Shift / Transform count) is done to `damaged` (Blaine in its name).
 */
export function stadiumIgnoresWeakness(state: GameState, damageType: string | undefined, damaged: { pokemon: { name: string } }): boolean {
  return stadiumNamed(state, "Cinnabar City Gym") && damageType === EnergyType.Water && hasOwner(damaged.pokemon, "Blaine");
}

/** Damage Viridian City Gym removes from `evolvedCard` (Giovanni in its name) when it evolves: up to 20, else 0. */
export function stadiumEvolutionHeal(state: GameState, evolvedCard: { name: string }, currentDamage: number): number {
  if (!stadiumNamed(state, "Viridian City Gym") || !hasOwner(evolvedCard, "Giovanni")) return 0;
  return Math.min(20, Math.max(0, currentDamage));
}

/** Rocket's Minefield Gym: damage counters (as damage) a Basic put onto the Bench from the hand gets on tails. */
export const MINEFIELD_DAMAGE = 20;

/** Rocket's Minefield Gym is in play: a Basic (Mysterious Fossil / Clefairy Doll too) put onto the Bench from the hand flips a coin. */
export function stadiumBenchPlayCoin(state: GameState): boolean {
  return stadiumNamed(state, "Rocket's Minefield Gym");
}

/** Chaos Gym is in play: every non-Stadium Trainer played flips a coin first (effects/chaos-gym.ts). */
export function stadiumFlipsTrainers(state: GameState): boolean {
  return stadiumNamed(state, "Chaos Gym");
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
  if (!getAvailableAttacks(state, attacker)[attackIndex]) return "Ese ataque no existe";
  if (!stadiumOffersAttackCoin(state, attacker)) return `${attacker.pokemon.name} no tiene a Lt. Surge en su nombre`;
  return null;
}
