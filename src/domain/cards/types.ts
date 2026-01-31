/**
 * Card domain types
 * Pure type definitions for all card entities
 */

// Re-export enums for convenience
export {
  EnergyType,
  CardKind,
  CardRarity,
  CardSet,
  PokemonStage,
  TrainerType,
  AttackEffectType,
  ProtectionType,
  BenchDamageTarget,
  AttackTarget,
  PokemonPowerType,
  StatusCondition,
} from "@/domain/constants";

import type {
  EnergyType,
  CardKind,
  CardRarity,
  CardSet,
  PokemonStage,
  TrainerType,
  AttackEffectType,
  ProtectionType,
  BenchDamageTarget,
  AttackTarget,
  PokemonPowerType,
  StatusCondition,
} from "@/domain/constants";

// Legacy type alias for StatusEffect (same as StatusCondition)
export type StatusEffect = StatusCondition;

export type AttackEffect = {
  type: AttackEffectType;
  target: AttackTarget | null;
  coinFlip?: {
    count: number;
    onHeads?: StatusCondition | "damage" | "protection";
    onTails?: StatusCondition | "damage" | "protection";
  };
  status?: StatusCondition;
  poisonDamage?: number;
  amount?: number;
  benchTarget?: BenchDamageTarget;
  discardCostRequirement?: EnergyType[];
  discardAll?: boolean;
  protectionType?: ProtectionType;
  extraDamagePerEnergy?: number;
  maxExtraEnergy?: number;
  extraEnergyType?: EnergyType;
  requiredStatus?: StatusCondition;
};

export type Attack = {
  name: string;
  cost: EnergyType[];
  damage?: number | string;
  text?: string;
  effects?: AttackEffect[];
};

// ============================================================================
// POKEMON POWERS
// ============================================================================

/**
 * Pokemon Power definition
 * Powers are abilities that don't require energy and don't end the turn
 */
export type PokemonPower = {
  name: string;
  text: string;
  type: PokemonPowerType;
  /** Whether the power works when the Pokemon is on the bench (default: false) */
  worksFromBench: boolean;
  /** For unlimitedEnergyAttach: which energy type can be attached */
  energyType?: EnergyType;
  /** For unlimitedEnergyAttach: which Pokemon types can receive the energy */
  targetPokemonTypes?: EnergyType[];
  /** For damageReaction: damage to deal back to attacker (e.g., 10 for Strikes Back) */
  reactionDamage?: number;
  /** For selfSacrifice: energy value when Pokemon becomes energy (e.g., 2 for Buzzap) */
  becomesEnergyValue?: number;
};

export type CardBase = {
  id: string;
  name: string;
  number: number;
  set: CardSet;
  rarity: CardRarity;
  kind: CardKind;
  imageSetVersion?: "bs" | "b2";
};

export type PokemonCard = CardBase & {
  kind: "pokemon";
  stage: PokemonStage;
  hp: number;
  types: EnergyType[];
  evolvesFrom?: string;
  attacks: Attack[];
  retreatCost: number;
  weaknesses?: EnergyType[];
  resistances?: EnergyType[];
  power?: PokemonPower;
};

export type EnergyCard = CardBase & {
  kind: "energy";
  energyType: EnergyType;
  isBasic: boolean;
};

export type TrainerCard = CardBase & {
  kind: "trainer";
  trainerType: TrainerType;
  effect: string;
};

export type Card = PokemonCard | EnergyCard | TrainerCard;
