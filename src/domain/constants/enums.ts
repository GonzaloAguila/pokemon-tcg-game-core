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
  TeamRocket: "Team Rocket",
  GymHeroes: "Gym Heroes",
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
  // ---------------------------------------------------------------- Team Rocket
  /**
   * The attacker chooses a Pokémon (`targetScope`) and the attack does `amount` damage to it
   * (pending attack choice). Stare, Flitter, Dig Under, Coin Hurl (any opponent's Pokémon, no
   * W/R), Drag Off (`switchWithDefender`: a Benched Pokémon becomes the Defending Pokémon first,
   * W/R applied), Flame Pillar (`optionalEnergyDiscard`: only after discarding that Energy).
   * The attack's printed damage is done through this choice, not by the normal damage step.
   */
  ChooseTargetDamage: "chooseTargetDamage",
  /** Can't be used unless the opponent has Benched Pokémon (Fling, Drag Off, Fascinate) */
  RequireOpponentBench: "requireOpponentBench",
  /** Can't be used unless this Pokémon has an Energy card providing `energyType` attached (Fireball) */
  RequireAttachedEnergy: "requireAttachedEnergy",
  /** Fling: the Defending Pokémon and every card attached to it are shuffled into its owner's deck */
  ShuffleDefenderIntoDeck: "shuffleDefenderIntoDeck",
  /** Magnetic Lines: move 1 basic Energy card of the Defending Pokémon to one of the opponent's Benched Pokémon */
  MoveDefenderEnergyToBench: "moveDefenderEnergyToBench",
  /** Mass Explosion: `amount` damage (no W/R) to each Pokémon in play named in `names`, both sides, itself included */
  DamageNamedInPlay: "damageNamedInPlay",
  /** Energy Bomb: every Energy card attached moves to your Benched Pokémon as you choose (discarded with no Bench) */
  MoveAllEnergyToBench: "moveAllEnergyToBench",
  /** Third Eye: discard 1 attached Energy card in order to draw up to `amount` cards */
  DiscardEnergyToDraw: "discardEnergyToDraw",
  /** Mirror Shell: during the opponent's next turn, attack damage done to it is done back to the attacker */
  MirrorShell: "mirrorShell",
  /** Rapid Evolution: an Evolution card named in `searchPokemonNames` from the deck goes on this Pokémon (counts as evolving) */
  EvolveFromDeck: "evolveFromDeck",
  /** Vanish: shuffle this Pokémon into its owner's deck, discarding the attached cards */
  ShuffleSelfIntoDeck: "shuffleSelfIntoDeck",
  /** Mischief: shuffle the opponent's deck */
  ShuffleOpponentDeck: "shuffleOpponentDeck",
  /** Afternoon Nap: search the deck for a basic Energy card of `energyType` and attach it to this Pokémon */
  AttachEnergyFromDeck: "attachEnergyFromDeck",
  // ---------------------------------------------------------------- Gym Heroes
  /** Charge: up to `amount` (at least `minAmount`) basic Energy cards of `energyType` from the discard pile onto this Pokémon */
  AttachEnergyFromDiscard: "attachEnergyFromDiscard",
  /** Fairy Power: return any number of your Pokémon in play, with every card attached, to your hand */
  ReturnPokemonToHand: "returnPokemonToHand",
  /**
   * Crosscounter / Fire Wall: if an attack damages this Pokémon during the opponent's next turn
   * (even a Knock Out), it does damage to the attacker: `amount`, or the damage × `damageMultiplier`;
   * `retaliationCoin`: only if the defending player's coin is heads; `applyWeaknessResistance`
   */
  CounterAttack: "counterAttack",
  /**
   * Shadow Images: whenever this Pokémon is attacked, the attacking player flips; tails = that
   * attack does no damage to it. Until it takes damage (or is Benched / evolved)
   */
  EvadeOnFlip: "evadeOnFlip",
  /** Pain Amplifier: `amount` (a damage counter) on each of the opponent's Pokémon that already has damage counters */
  DamageCountersOnDamaged: "damageCountersOnDamaged",
  /** Tunneling: this Pokémon can't attack during your next turn (`thisAttackOnly`: only this attack, Screaming Headbutt) */
  CantAttackNextTurn: "cantAttackNextTurn",
  /** Can't be used unless the attacker's side has Benched Pokémon (Alert) */
  RequireOwnBench: "requireOwnBench",
  /**
   * Search your deck for cards matching `deckFilter` (up to `amount`, any number if omitted, at
   * least `minAmount`) and put them into your hand or onto your Bench (`destination`); shuffle the
   * deck afterward. `putBackFromHand`: first put up to that many cards of your hand on top of the
   * deck, then search for that many (Sleight of Hand). Attack choice.
   */
  SearchDeckChoice: "searchDeckChoice",
  /** Lava Burst: discard the top `amount` cards of your deck; `extraDamagePerEnergy` per basic Energy card of `energyType` among them */
  MillSelfForDamage: "millSelfForDamage",
  /** Deflector: during the opponent's next turn, damage done to this Pokémon is halved (rounded down to 10) */
  HalveDamageNextTurn: "halveDamageNextTurn",
  /** Psychic Exchange: shuffle your hand into your deck, then draw `amount` cards */
  ShuffleHandDraw: "shuffleHandDraw",
  /** Fidget: shuffle your deck */
  ShuffleOwnDeck: "shuffleOwnDeck",
  /** Magic Pollen: the Defending Pokémon is now the Special Condition of `statusOptions` the attacker chooses (attack choice) */
  ChooseStatus: "chooseStatus",
  /** Crystal Beam: the opponent can't attach Energy cards to the Defending Pokémon during their next turn */
  BlockEnergyAttach: "blockEnergyAttach",
  /** Good Morning: if the Defending Pokémon has `status`, it no longer does */
  RemoveStatus: "removeStatus",
  /** Swift: the damage isn't affected by Weakness, Resistance, Pokémon Powers or any other effect on the Defending Pokémon */
  IgnoreDefenderEffects: "ignoreDefenderEffects",
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
  // ---------------------------------------------------------------- Team Rocket
  /** "When you play <it> from your hand" (Summon Minions, Sneak Attack, Reel In): a pending power choice, keyed by power name */
  OnPlayFromHand: "onPlayFromHand",
  /** Dark Vileplume's Hay Fever: no Trainer cards can be played (both players) */
  PreventTrainers: "preventTrainers",
  /** Dark Muk's Sticky Goo: while it is your Active, the opponent's Active pays `amount` more to retreat */
  IncreaseRetreatCost: "increaseRetreatCost",
  /** Dark Dugtrio's Sinkhole: when the opponent's Active retreats, they flip; tails = `amount` damage to it */
  RetreatDamageFlip: "retreatDamageFlip",
  /** Dark Gyarados' Final Beam: Knocked Out by an attack → flip; heads = `amount` × Water Energy to the attacker (W/R) */
  KnockOutRetaliation: "knockOutRetaliation",
  /** Dark Primeape's Frenzy: damage it does while Confused (even to itself) is `amount` more */
  ConfusedDamageBonus: "confusedDamageBonus",
  /** Rattata's Trickery: once per turn, switch 1 of your Prizes with the top card of your deck */
  SwapPrize: "swapPrize",
  /** Dark Dragonair's Evolutionary Light: once per turn, an Evolution card from the deck into the hand */
  SearchEvolution: "searchEvolution",
  /** Dark Kadabra's Matter Exchange: once per turn, discard a card from the hand to draw a card */
  DiscardToDraw: "discardToDraw",
  /** Charmander's Gather Fire: once per turn, move an `energyType` Energy card from another own Pokémon to it */
  GatherEnergy: "gatherEnergy",
  /** Drowzee / Dark Gloom: once per turn, flip; heads = Defending Pokémon gets `status`, tails = your Active does */
  StatusFlip: "statusFlip",
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
