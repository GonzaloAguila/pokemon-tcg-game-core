/**
 * Domain Enums
 * Using `as const` pattern for type safety while maintaining string literal compatibility
 *
 * This pattern provides:
 * - Enum-like syntax: EnergyType.Grass
 * - String literal union types: "grass" | "fire" | ...
 * - Backward compatibility with existing string literals
 * - Tree-shakeable (no runtime overhead if unused)
 */

// ============================================================================
// ENERGY
// ============================================================================

export const EnergyType = {
  Grass: "grass",
  Fire: "fire",
  Water: "water",
  Lightning: "lightning",
  Psychic: "psychic",
  Fighting: "fighting",
  Colorless: "colorless",
} as const;
export type EnergyType = (typeof EnergyType)[keyof typeof EnergyType];

// ============================================================================
// CARDS
// ============================================================================

export const CardKind = {
  Pokemon: "pokemon",
  Trainer: "trainer",
  Energy: "energy",
} as const;
export type CardKind = (typeof CardKind)[keyof typeof CardKind];

export const CardRarity = {
  Common: "common",
  Uncommon: "uncommon",
  Rare: "rare",
  RareHolo: "rare-holo",
} as const;
export type CardRarity = (typeof CardRarity)[keyof typeof CardRarity];

export const CardSet = {
  BaseSet: "Base Set",
  Jungle: "Jungle",
  Fossil: "Fossil",
} as const;
export type CardSet = (typeof CardSet)[keyof typeof CardSet];

export const PokemonStage = {
  Basic: "basic",
  Stage1: "stage-1",
  Stage2: "stage-2",
} as const;
export type PokemonStage = (typeof PokemonStage)[keyof typeof PokemonStage];

export const TrainerType = {
  Item: "item",
  Supporter: "supporter",
  Stadium: "stadium",
} as const;
export type TrainerType = (typeof TrainerType)[keyof typeof TrainerType];

// ============================================================================
// GAME STATE
// ============================================================================

export const GamePhase = {
  Mulligan: "MULLIGAN",
  Setup: "SETUP",
  Playing: "PLAYING",
  GameOver: "GAME_OVER",
} as const;
export type GamePhase = (typeof GamePhase)[keyof typeof GamePhase];

export const StatusCondition = {
  Paralyzed: "paralyzed",
  Poisoned: "poisoned",
  Confused: "confused",
  Asleep: "asleep",
  CannotAttack: "cannotAttack",
} as const;
export type StatusCondition = (typeof StatusCondition)[keyof typeof StatusCondition];

// ============================================================================
// ATTACK EFFECTS
// ============================================================================

export const AttackEffectType = {
  ApplyStatus: "applyStatus",
  Heal: "heal",
  Discard: "discard",
  Draw: "draw",
  SelfDamage: "selfDamage",
  BonusDamage: "bonusDamage",
  BenchDamage: "benchDamage",
  Recover: "recover",
  Protection: "protection",
  CoinFlipDamage: "coinFlipDamage",
  ExtraEnergy: "extraEnergy",
  ForceSwitch: "forceSwitch",
  SelfSwitch: "selfSwitch",
  CopyAttack: "copyAttack",
  MirrorMove: "mirrorMove",
  ReduceDamage: "reduceDamage",
  RequireStatus: "requireStatus",
  DamagePerCounter: "damagePerCounter",
  SelfDamageReduction: "selfDamageReduction",
  ChangeType: "changeType",
  ChangeWeakness: "changeWeakness",
  ChangeResistance: "changeResistance",
  DestinyBond: "destinyBond",
  HalfHPDamage: "halfHPDamage",
  UseOnce: "useOnce",
  ReturnToHand: "returnToHand",
  PreventRetreat: "preventRetreat",
  DeckSearch: "deckSearch",
  SearchDeck: "searchDeck",
  SandAttack: "sandAttack",
  /** Sonicboom: don't apply Weakness and Resistance for this attack */
  IgnoreWeaknessResistance: "ignoreWeaknessResistance",
  /** With a coin (onTails): the attack does nothing at all, not even damage (Dive Bomb, Clamp) */
  AttackFails: "attackFails",
  /** Can't be used unless this Pokémon (target Self) has damage counters (Spacing Out) */
  RequireDamageCounters: "requireDamageCounters",
  /** Wildfire: discard any number of attached Energy of `energyType`, then that many cards from the top of the opponent's deck */
  DiscardEnergyForMill: "discardEnergyForMill",
  /** Put up to `amount` cards of `recoverCardKind` from your discard pile into your hand (Energy Conversion, Scavenge) */
  RecoverFromDiscard: "recoverFromDiscard",
  /** Headache: the opponent can't play Trainer cards during their next turn */
  BlockTrainers: "blockTrainers",
  /** Prophecy: look at up to `amount` cards from the top of either player's deck and rearrange them */
  ReorderDeckTop: "reorderDeckTop",
} as const;
export type AttackEffectType = (typeof AttackEffectType)[keyof typeof AttackEffectType];

export const ProtectionType = {
  DamageOnly: "damageOnly",
  DamageAndEffects: "damageAndEffects",
} as const;
export type ProtectionType = (typeof ProtectionType)[keyof typeof ProtectionType];

export const BenchDamageTarget = {
  Own: "own",
  Opponent: "opponent",
  Both: "both",
} as const;
export type BenchDamageTarget = (typeof BenchDamageTarget)[keyof typeof BenchDamageTarget];

export const AttackTarget = {
  Defender: "defender",
  Self: "self",
} as const;
export type AttackTarget = (typeof AttackTarget)[keyof typeof AttackTarget];

// ============================================================================
// POKEMON POWERS
// ============================================================================

export const PokemonPowerType = {
  UnlimitedEnergyAttach: "unlimitedEnergyAttach",
  MoveEnergy: "moveEnergy",
  MoveDamage: "moveDamage",
  DamageReaction: "damageReaction",
  EnergyConversion: "energyConversion",
  SelfSacrifice: "selfSacrifice",
  DamageBarrier: "damageBarrier",
  StatusImmunity: "statusImmunity",
  TypeShift: "typeShift",
  HealFlip: "healFlip",
  RetreatReduction: "retreatReduction",
  Peek: "peek",
  /** Aerodactyl's Prehistoric Power: no Evolution cards can be played (both players) */
  PreventEvolution: "preventEvolution",
  /** Muk's Toxic Gas: every other Pokémon Power (other than Toxic Gas) is ignored */
  SuppressPowers: "suppressPowers",
  /** Ditto's Transform: as the Active, it is a copy of the Defending Pokémon */
  Transform: "transform",
  /** Dragonite's Step In: once per turn, switch it from the Bench with the Active */
  SwitchFromBench: "switchFromBench",
  /** Gengar's Curse: once per turn, move 1 damage counter between the opponent's Pokémon */
  MoveOpponentDamage: "moveOpponentDamage",
  /** Haunter's Transparency: the Defending side flips; heads prevents everything the attack does to it */
  PreventAttackOnFlip: "preventAttackOnFlip",
  /** Slowbro's Strange Behavior: move damage counters from your Pokémon onto it (not to a KO) */
  MoveDamageToSelf: "moveDamageToSelf",
  /** Kabuto Armor: damage done to it by attacks is halved (rounded down to 10) */
  HalveAttackDamage: "halveAttackDamage",
  /** Omanyte's Clairvoyance: the opponent plays with the hand face up */
  RevealHand: "revealHand",
  /** Tentacool's Cowardice: return it to the hand, discarding the attached cards */
  ReturnSelfToHand: "returnSelfToHand",
} as const;
export type PokemonPowerType = (typeof PokemonPowerType)[keyof typeof PokemonPowerType];

// ============================================================================
// COIN FLIP
// ============================================================================

export const CoinFlipResult = {
  Heads: "heads",
  Tails: "tails",
} as const;
export type CoinFlipResult = (typeof CoinFlipResult)[keyof typeof CoinFlipResult];

export const CoinFlipModeType = {
  Fixed: "fixed",
  UntilTails: "untilTails",
} as const;
export type CoinFlipModeType = (typeof CoinFlipModeType)[keyof typeof CoinFlipModeType];

export const CoinFlipPurposeType = {
  GameStart: "gameStart",
  Attack: "attack",
  Confusion: "confusion",
  Trainer: "trainer",
} as const;
export type CoinFlipPurposeType = (typeof CoinFlipPurposeType)[keyof typeof CoinFlipPurposeType];

// ============================================================================
// UI
// ============================================================================

export const CardSize = {
  XS: "xs",
  SM: "sm",
  MD: "md",
  LG: "lg",
} as const;
export type CardSize = (typeof CardSize)[keyof typeof CardSize];

export const PokemonLocation = {
  Active: "active",
  Bench: "bench",
} as const;
export type PokemonLocation = (typeof PokemonLocation)[keyof typeof PokemonLocation];
