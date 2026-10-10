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
    onHeads?: StatusCondition | "damage" | "protection" | "preventRetreat";
    onTails?: StatusCondition | "damage" | "protection" | "preventRetreat";
    /** Flip until tails (Stone Barrage): `count` is ignored; the attack's coins are a run ending in the first tails */
    untilTails?: boolean;
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
  /** Only damage bench Pokémon that share a type with the defender (e.g., Chain Lightning) */
  matchDefenderType?: boolean;
  /** Skip this effect entirely if the defender is Colorless */
  skipIfColorless?: boolean;
  /** For BonusDamage: source of the multiplier count */
  bonusDamageSource?: "benchCount" | "namedPokemon";
  /** For BonusDamage with namedPokemon: the Pokemon name to count (e.g., "Nidoking") */
  bonusDamageNameMatch?: string;
  /** For CoinFlipDamage: derive coin count from attached energy count instead of fixed */
  coinCountFromEnergy?: boolean;
  /** Coin count from the board instead of `coinFlip.count` ("opponentBench": one coin per opponent's Benched Pokémon, Thunderstorm) */
  coinCountSource?: "opponentBench";
  /** BenchDamage with a coin per Benched Pokémon: coin i decides the i-th Benched Pokémon of the target side (Thunderstorm) */
  perCoinBenchTarget?: boolean;
  /** BenchDamage with maxBenchTargets: exactly that many must be chosen (all of them when there are fewer, Gigashock) */
  exactBenchTargets?: boolean;
  /** Heal from the damage this attack did to the Defending Pokémon (after W/R): all of it (Leech Life) or half rounded up (Absorb) */
  healFromDamage?: "all" | "halfRoundedUp";
  /** ForceSwitch: who picks the new Defending Pokémon ("opponent": Terror Strike; default the attacker) */
  switchChosenBy?: "opponent";
  /** RecoverFromDiscard: kind of card (`amount` = most cards, `minAmount` = fewest, default 0) */
  recoverCardKind?: "energy" | "trainer";
  minAmount?: number;
  /** DiscardEnergyForMill: type of the attached Energy cards that may be discarded */
  energyType?: EnergyType;
  /** For BenchDamage: max number of bench targets (undefined = all) */
  maxBenchTargets?: number;
  /** For Heal: heal amount equals half the actual damage dealt */
  healFromDamageDealt?: boolean;
  /** For SearchDeck: Pokemon names to search for (e.g., ["Bellsprout"] or ["Nidoran♂", "Nidoran♀"]) */
  searchPokemonNames?: string[];
  /** For ApplyStatus: additional statuses to apply alongside the primary status (e.g., Venomoth Venom Powder: Confused + Poisoned from one coin flip) */
  additionalStatuses?: StatusCondition[];
  /** For DeckSearch: filter criteria for valid Pokemon */
  deckSearchFilter?: {
    /** Exact name matches (e.g., ["Bellsprout"] or ["Nidoran♂", "Nidoran♀"]) */
    names?: string[];
    /** Pokemon type filter (e.g., "fighting" for Marowak) */
    type?: EnergyType;
    /** Always enforce Basic-only selection */
    basicOnly: true;
  };
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
  /** Once per turn (Step In, Curse): marks usedPowersThisTurn when used */
  oncePerTurn?: boolean;
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
  /**
   * Set on the in-play form of a Trainer played as a Basic Pokémon (Mysterious Fossil,
   * Clefairy Doll; see toInPlayCard): the original Trainer card, which is what the card is
   * again as soon as it leaves play (discard, hand, deck).
   */
  trainerCard?: TrainerCard;
  /**
   * Only on a derived "effective card" (never stored in the state): Ditto's printed card when
   * this card is Ditto transformed into the Defending Pokémon (getEffectivePokemonCard). Its
   * Energy counts as Energy of any type.
   */
  transformedFrom?: PokemonCard;
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
  /**
   * "Play this card as if it were a Basic Pokémon" (Mysterious Fossil, Clefairy Doll): it is
   * placed as Active/Benched like a Basic (isPlayableAsBasic, counts for the mulligan) and,
   * while in play, is a Pokémon with these HP (toInPlayCard): no type, no attacks, can't
   * retreat, can't be affected by Special Conditions, gives no Prize when Knocked Out, and
   * may be discarded from play during its owner's turn (canDiscardFromPlay).
   */
  playsAsBasic?: { hp: number };
};

export type Card = PokemonCard | EnergyCard | TrainerCard;
