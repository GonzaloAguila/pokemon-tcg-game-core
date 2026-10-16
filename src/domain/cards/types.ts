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
    /** The effect happens only with at least this many matching coins (Petal Whirlwind: 2 or more heads) */
    minHits?: number;
  };
  /** The attack's own coins are flipped by the opponent (Knock Down, Bench Manipulation): see AttackCoinPlan.attackFlipper */
  coinFlippedBy?: "opponent";
  /**
   * Surprise Thunder: needs the first coin heads; then the second coin picks the amount
   * (heads → `heads`, tails → `tails`). The attack always flips 2 coins (the second is ignored after a tails).
   */
  secondCoinAmounts?: { heads: number; tails: number };
  /** Coin count = Energy cards attached that provide this type (Continuous Fireball: Fire) */
  coinCountFromEnergyType?: EnergyType;
  /** BenchDamage: only the Benched Pokémon with one of these names (Mass Explosion) */
  benchNameFilter?: string[];
  /** BenchDamage: only the Benched Pokémon of one of these types (Blaze: Grass) */
  benchTypes?: EnergyType[];
  /** BenchDamage: only the Benched Pokémon that aren't of these types (Water Ring: not Water) */
  benchExcludeTypes?: EnergyType[];
  /** Names for BonusDamage "namedOnBench" / "namedInPlay" and DamageNamedInPlay (Magnetism, Mass Explosion) */
  names?: string[];
  /** SelfSwitch: "you may switch" — the attacker may decline (Teleport Blast), asked as a pending attack choice */
  optional?: boolean;
  /** AttackFails: only nothing to the Defending Pokémon — the attack's effects on the attacker still happen (Egg Bomb) */
  defenderOnly?: boolean;
  /** ShuffleSelfIntoDeck: the cards attached go into the deck too (Phoenix Flame, Take Away); default: discarded (Vanish) */
  withAttachedCards?: boolean;
  /** ChooseTargetDamage: who can be chosen ("opponentAny": Active or Benched; "opponentBench") */
  targetScope?: "opponentAny" | "opponentBench";
  /** ChooseTargetDamage: apply Weakness and Resistance (Drag Off). Default: don't (Stare, Flitter...). CounterAttack: to its damage (Fire Wall) */
  applyWeaknessResistance?: boolean;
  /** CantAttackNextTurn: only this attack is locked (Screaming Headbutt); default: every attack (Tunneling) */
  thisAttackOnly?: boolean;
  /** CounterAttack: the damage done back is the damage taken × this (Crosscounter: 2) */
  damageMultiplier?: number;
  /** CounterAttack: only if the defending player's coin is heads (the attack's defender coin, Crosscounter) */
  retaliationCoin?: boolean;
  /** ChooseTargetDamage: the chosen Benched Pokémon is first switched with the Defending Pokémon (Drag Off) */
  switchWithDefender?: boolean;
  /** ChooseTargetDamage: the chosen Pokémon's Pokémon Power stops until the end of the opponent's next turn (Stare) */
  suppressTargetPower?: boolean;
  /** ChooseTargetDamage: only if the attacker first discards an attached Energy card of this type, which it may decline (Flame Pillar) */
  optionalEnergyDiscard?: EnergyType;
  status?: StatusCondition;
  poisonDamage?: number;
  amount?: number;
  benchTarget?: BenchDamageTarget;
  discardCostRequirement?: EnergyType[];
  /** Discard (Self): every attached Energy card (Thunderbolt), or only those providing `energyType` (Discharge) */
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
  bonusDamageSource?: "benchCount" | "namedPokemon" | "namedOnBench" | "namedInPlay";
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
  /**
   * Energy type of the effect: DiscardEnergyForMill (the attached Energy that may be discarded),
   * Discard (Self) / RequireAttachedEnergy / AttachEnergyFromDeck / AttachEnergyFromDiscard,
   * MoveAllEnergyToBench (only that type, Electric Current)
   */
  energyType?: EnergyType;
  /** Set by the engine when it resolves a perCoinBenchTarget effect: indexes (in the target bench) that got heads */
  benchTargetIndexes?: number[];
  /** For BenchDamage: max number of bench targets (undefined = all) */
  maxBenchTargets?: number;
  /** Heal: `amount` from each of your Pokémon in play, Active and Benched (Healing Pollen; with a coin: per heads) */
  healAllOwn?: boolean;
  /** Heal (`amount`): heals even if the attack's damage was prevented (Blot); default: not then (Leech Seed) */
  ignorePrevention?: boolean;
  /** For Heal: heal amount equals half the actual damage dealt */
  healFromDamageDealt?: boolean;
  /** For SearchDeck: Pokemon names to search for (e.g., ["Bellsprout"] or ["Nidoran♂", "Nidoran♀"]) */
  searchPokemonNames?: string[];
  /** For ApplyStatus: additional statuses to apply alongside the primary status (e.g., Venomoth Venom Powder: Confused + Poisoned from one coin flip) */
  additionalStatuses?: StatusCondition[];
  /** SearchDeckChoice: which deck cards can be taken (every given condition must hold) */
  deckFilter?: DeckCardFilter;
  /** SearchDeckChoice: where the cards found go */
  destination?: "hand" | "bench";
  /** SearchDeckChoice: first put up to this many cards of the hand on top of the deck, then search for that many (Sleight of Hand) */
  putBackFromHand?: number;
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

/** Cards a search can take (SearchDeckChoice): every given condition must hold. */
export type DeckCardFilter = {
  /** Basic Energy cards (Moonwatching, Sleight of Hand) */
  basicEnergy?: boolean;
  /** Basic Pokémon (Call for Friend) */
  basicPokemon?: boolean;
  /** Exact names (Jellyfish Pod) */
  names?: string[];
  /** Pokémon whose name includes this text ("Misty": "a Basic Pokémon with Misty in its name") */
  nameIncludes?: string;
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
  /** Amount used by the power (Sticky Goo: extra retreat cost; Sinkhole / Frenzy: damage; Final Beam: damage per Water Energy) */
  amount?: number;
  /** StatusFlip powers (Long-Distance Hypnosis: Asleep, Pollen Stench: Confused) */
  status?: StatusCondition;
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
  /** Energy units it provides (default: Double Colorless 2, everything else 1; see getEnergyValue) */
  provides?: number;
  /** Rainbow Energy: while in play it counts as every type of basic Energy (see energyProvidesType) */
  providesAllTypes?: boolean;
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
  /** Printed Trainer subtype, for display ("Rocket's Secret Machine"); no rules attached */
  subtype?: "Rocket's Secret Machine";
};

export type Card = PokemonCard | EnergyCard | TrainerCard;
