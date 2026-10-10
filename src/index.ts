/**
 * @poke-tcg/game-core
 *
 * Shared game logic for Pokemon TCG multiplayer.
 * This package contains all pure game logic used by both frontend and backend.
 */

// =============================================================================
// Domain Types
// =============================================================================

export type {
  GameState,
  PokemonInPlay,
  GameCard,
  GameModifier,
  GameEvent,
} from "./domain/match";

export type { ExecuteAttackOptions, PowerSuppression } from "./lib/gameState";

export type {
  Card,
  PokemonCard,
  TrainerCard,
  EnergyCard,
  Attack,
  AttackEffect,
  PokemonPower,
} from "./domain/cards";

// =============================================================================
// Constants & Enums
// =============================================================================

export {
  EnergyType,
  CardKind,
  CardRarity,
  CardSet,
  PokemonStage,
  TrainerType,
  GamePhase,
  StatusCondition,
  AttackEffectType,
  ProtectionType,
  BenchDamageTarget,
  AttackTarget,
  PokemonPowerType,
  CoinFlipResult,
  CoinFlipModeType,
  CoinFlipPurposeType,
  CardSize,
  PokemonLocation,
} from "./domain/constants";

// =============================================================================
// Type Guards
// =============================================================================

export {
  isPokemonCard,
  isEnergyCard,
  isTrainerCard,
  isBasicEnergy,
  isPlayableAsBasic,
  // Trainers played as Basics (Mysterious Fossil, Clefairy Doll): in-play form and exits
  toInPlayCard,
  isTrainerInPlay,
  cardOutOfPlay,
  cardsLeavingPlay,
  givesPrizeWhenKnockedOut,
} from "./domain/cards";

// =============================================================================
// Errors (thrown by actions called when their canX query says no)
// =============================================================================

export { IllegalActionError, assertLegal } from "./shared/errors";

// =============================================================================
// Board actions (engine-owned: put Basics into play, attach Energy, evolve)
// =============================================================================

export type { BoardPosition, OnAttachFromHand, InPlayLocation } from "./domain/board";
export {
  canPlayBasicPokemon,
  playBasicPokemon,
  canAttachEnergy,
  attachEnergyCard,
  canEvolve,
  evolvePokemonCard,
  getEvolutionTargets,
  canDiscardFromPlay,
  discardFromPlay,
  evolvePokemonInPlay,
  ENERGY_ATTACH_EFFECTS,
  getTurnActionBlocker,
  isSetupPhase,
  findInPlay,
  findOwnPokemon,
  allOwnPokemon,
  MAX_BENCH_SIZE,
  swapSides,
} from "./domain/board";

// =============================================================================
// Game Engine (lib/gameState.ts)
// =============================================================================

// Initialization
export {
  initializeGame,
  initializeMultiplayerGame,
  startGame,
  buildDeckFromEntries,
} from "./lib/gameState";

// Turn Actions
export {
  executeAttack,
  executeMetronome,
  getAttackCoinFlipCount,
  resolveConfusionFlip,
  endTurn,
  executeRetreat,
  applyForceSwitch,
  applySelfSwitch,
  skipPendingSwitch,
  executeDeckSearch,
  executeBenchDamage,
  processBenchKnockouts,
  doMulligan,
  setPlayerReady,
  startPlayingPhase,
  advanceToSetup,
  knockOutPlayerActive,
  endGameIfNoPokemonLeft,
} from "./lib/gameState";

// Validation
export {
  canUseAttack,
  canExecuteAttack,
  canExecuteMetronome,
  calculateBaseDamage,
  meetsAttackRequirements,
  canRetreat,
  canEvolveInto,
  findValidEvolutionTargets,
  hasStatusCondition,
  canPokemonAttack,
  canPokemonRetreat,
  hasBasicPokemon,
  hasEnoughEnergyToRetreat,
} from "./lib/gameState";

// Prize & KO
export {
  takePrize,
  promoteActivePokemon,
} from "./lib/gameState";

// Utilities
export {
  createGameEvent,
  shuffle,
  drawCard,
  getEnergyValue,
  getTotalEnergyValue,
  getRetreatCost,
  getCardImageUrl,
  getEnergyTypeInSpanish,
  getAttackDiscardRequirement,
} from "./lib/gameState";

// Status Effects
export {
  CONFUSION_SELF_DAMAGE,
  applyStatusCondition,
  removeStatusCondition,
  clearAllStatusConditions,
  clearStatusConditionsOnRetreat,
  applyProtection,
  isProtected,
  protectionBlocksDamage,
  clearProtection,
} from "./lib/gameState";

// =============================================================================
// Card effect registry (generic Trainer / activated Pokémon Power dispatch)
// =============================================================================

export type {
  SelectionOption,
  SelectionStep,
  CardEffectDef,
  CardEffectContext,
  CoinFlipRequirement,
} from "./domain/effects";
export {
  TRAINER_EFFECTS,
  POWER_EFFECTS,
  UNSUPPORTED_TRAINERS,
  ACTIVATED_POWER_TYPES,
  isPlayedAsBasic,
  canPlayTrainerCard,
  getTrainerSteps,
  getTrainerCoinFlips,
  playTrainerCard,
  canUsePokemonPower,
  getPowerSteps,
  getPowerCoinFlips,
  usePokemonPower,
  getUsablePowerPokemonIds,
  checkSelection,
  minSelectionsOf,
} from "./domain/effects";

// =============================================================================
// Trainers
// =============================================================================

export * from "./domain/trainers";

// =============================================================================
// Powers
// =============================================================================

export * from "./domain/powers";

// =============================================================================
// Status Effects
// =============================================================================

export * from "./domain/status";

// =============================================================================
// AI (for single-player mode)
// =============================================================================

export type { AIAction } from "./domain/ai";
export {
  decideOpponentTurn,
  decideOpponentSetup,
  executeAIAction,
} from "./domain/ai";

// =============================================================================
// Simulation (headless bot games; used by scripts/simulate.ts and tests)
// =============================================================================

export type { GameOptions, GameOutcome, SideId, Policy, ViewAction, Rng, PolicyName, PolicyPair, BatchResult, BatchFailure } from "./domain/simulation";
export {
  playAIGame,
  runBatch,
  policyPair,
  SimulationFailure,
  randomLegalPolicy,
  createGreedyPolicy,
  buildRandomDeck,
  checkInvariants,
  mulberry32,
} from "./domain/simulation";

// =============================================================================
// Card Catalog
// =============================================================================

export {
  baseSetCards,
  jungleCards,
  fossilCards,
  getBaseSetImageUrl,
  getJungleImageUrl,
  getFossilImageUrl,
  getCardImageUrl as getCatalogImageUrl,
  // Set registry: iterate these instead of hard-coding the sets
  CARD_SETS,
  ALL_CARDS,
  getSetById,
  getSet,
  getSetForCard,
  findCardById,
  findCardDefinition,
  findCardByName,
} from "./domain/catalog";
export type { CardSetId, CardSetInfo, CardImageInput } from "./domain/catalog";

// =============================================================================
// Decks
// =============================================================================

export type { DeckEntry, FeaturedPokemonRef, Deck, ResolvedDeckEntry, GroupedDeck } from "./domain/decks";
export { decks, resolveDeck, findCardBySetAndNumber, findCardByNumber, getDeckById, getDeckEnergyTypes, getDeckCardCount, getDeckFeaturedPokemon, groupDeckByKind } from "./domain/decks";
