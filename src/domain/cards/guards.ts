/**
 * Card type guards
 * Type narrowing functions for card discrimination
 */

import { CardKind, PokemonStage } from "@/domain/constants";
import type { Card, PokemonCard, TrainerCard, EnergyCard } from "./types";

export const isPokemonCard = (c: Card): c is PokemonCard =>
  c.kind === CardKind.Pokemon;

export const isTrainerCard = (c: Card): c is TrainerCard =>
  c.kind === CardKind.Trainer;

export const isEnergyCard = (c: Card): c is EnergyCard =>
  c.kind === CardKind.Energy;

/** Checks if card is a basic energy (Fire, Water, Grass, Lightning, Psychic, Fighting) */
export const isBasicEnergy = (c: Card): c is EnergyCard =>
  c.kind === CardKind.Energy && c.isBasic;

/**
 * Can be put into play from the hand as a Basic Pokémon (setup, bench, mulligan check):
 * Basic Pokémon, plus Trainers printed "play this card as if it were a Basic Pokémon"
 * (data flag `playsAsBasic`).
 */
export const isPlayableAsBasic = (c: Card): boolean =>
  (c.kind === CardKind.Pokemon && c.stage === PokemonStage.Basic) ||
  (c.kind === CardKind.Trainer && !!c.playsAsBasic);

/** Checks if card is a special energy (Double Colorless, etc.) */
export const isSpecialEnergy = (c: Card): c is EnergyCard =>
  c.kind === CardKind.Energy && !c.isBasic;
