/**
 * Card factory functions
 * Functions to create card instances with proper defaults
 */

import { CardKind, CardSet } from "@/domain/constants";
import type {
  CardBase,
  PokemonCard,
  EnergyCard,
  TrainerCard,
} from "./types";

const BASE_SET = CardSet.BaseSet;

/**
 * Input types for card creation:
 * - `set` is optional (defaults to Base Set)
 * - `kind` is NOT allowed in input (set by factory)
 * - `imageSetVersion` is optional (defaults to bs)
 */
type CreateBaseInput = Omit<CardBase, "set" | "kind"> & {
  set?: CardSet;
  imageSetVersion?: "bs" | "b2";
};

type CreatePokemonInput = CreateBaseInput &
  Omit<PokemonCard, keyof CardBase | "kind" | "set">;

type CreateEnergyInput = CreateBaseInput &
  Omit<EnergyCard, keyof CardBase | "kind" | "set">;

type CreateTrainerInput = CreateBaseInput &
  Omit<TrainerCard, keyof CardBase | "kind" | "set">;

/** Internal helper to apply default set */
const withDefaults = <T extends { set?: CardSet }>(input: T) => ({
  ...input,
  set: input.set ?? BASE_SET,
});

export const createPokemonCard = (input: CreatePokemonInput): PokemonCard => {
  const base = withDefaults(input);
  return {
    ...base,
    kind: CardKind.Pokemon,
  };
};

export const createEnergyCard = (input: CreateEnergyInput): EnergyCard => {
  const base = withDefaults(input);
  return {
    ...base,
    kind: CardKind.Energy,
  };
};

export const createTrainerCard = (input: CreateTrainerInput): TrainerCard => {
  const base = withDefaults(input);
  return {
    ...base,
    kind: CardKind.Trainer,
  };
};

/**
 * Creates a slug-based card ID from set, number and name
 */
export const makeCardId = (set: CardSet, number: number, name: string): string => {
  const slug = name
    .toLowerCase()
    .replace(/é/g, "e")
    .replace(/♀/g, "f")
    .replace(/♂/g, "m")
    .replace(/'/g, "")
    .replace(/\./g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");

  const setSlug = (set as string).toLowerCase().replace(/\s+/g, "-");
  return `${setSlug}-${String(number).padStart(3, "0")}-${slug}`;
};
