/**
 * Pokemon Powers domain types
 */

import type { GameCard, PokemonInPlay } from "@/domain/match/types";
import type { EnergyType } from "@/domain/cards/types";

/**
 * Result of using a Pokemon Power
 */
export type PowerResult = {
  success: boolean;
  errorMessage?: string;
};

/**
 * Target selection for moveEnergy power
 */
export type MoveEnergySelection = {
  sourcePokemonId: string; // Pokemon ID to take energy from
  targetPokemonId: string; // Pokemon ID to give energy to
  energyCardId: string; // Energy card to move
};

/**
 * Target selection for moveDamage power
 */
export type MoveDamageSelection = {
  sourcePokemonId: string; // Pokemon ID to take damage from
  targetPokemonId: string; // Pokemon ID to give damage to
  amount: number; // Amount of damage to move (must be multiple of 10)
};

/**
 * Context for checking if a power can be used
 */
export type PowerContext = {
  pokemon: PokemonInPlay;
  isActive: boolean;
  side: "player" | "opponent";
};
