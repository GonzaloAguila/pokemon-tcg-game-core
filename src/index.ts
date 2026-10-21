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
  LogCard,
} from "./domain/match";


export type { PokemonOwner } from "./domain/cards";
export type {
  ExecuteAttackOptions,
  PowerSuppression,
  StadiumInPlay,
  BenchTrim,
  SetAsideHand,
  SideTurns,
  PendingDuel,
  LastDuel,
  RpsChoice,
  PendingResolutionOptions,
  PendingAttackChoice,
  AttackChoiceContext,
  AttackReactions,
  AttackResume,
  AttackCoinPlan,
  AttackCoinOptions,
  PendingPowerChoice,
  OnPlayPowerDef,
  RetreatOptions,
  AvailableAttack,
} from "./lib/gameState";

// PlusPower / Defender modifiers: which Pokémon they are attached to (it keeps them when it evolves)
export { modifierAppliesTo } from "./lib/modifiers";

export type {
  Card,
  PokemonCard,
  TrainerCard,
  EnergyCard,
  Attack,
  AttackEffect,
  DeckCardFilter,
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
  isSpecialEnergy,
  isLimitedInDeck,
  isPlayableAsBasic,
  // Trainers played as Basics (Mysterious Fossil, Clefairy Doll): in-play form and exits
  toInPlayCard,
  isTrainerInPlay,
  isFaceDownCard,
  cardOutOfPlay,
  cardsLeavingPlay,
  givesPrizeWhenKnockedOut,
  // Gym Heroes owner's Pokémon
  POKEMON_OWNERS,
  ownerOf,
  hasOwner,
} from "./domain/cards";

// =============================================================================
// Errors (thrown by actions called when their canX query says no)
// =============================================================================

export { IllegalActionError, assertLegal } from "./shared/errors";

// =============================================================================
// Board actions (engine-owned: put Basics into play, attach Energy, evolve)
// =============================================================================

export type { BoardPosition, OnAttachFromHand, InPlayLocation, PlayBasicOptions } from "./domain/board";
export type { ChaosGymOffer } from "./lib/gameState";
export {
  canPlayBasicPokemon,
  getPlayBasicCoinFlips,
  playBasicPokemon,
  canAttachEnergy,
  attachEnergyCard,
  canEvolve,
  evolvePokemonCard,
  getEvolutionTargets,
  canDiscardFromPlay,
  discardFromPlay,
  canFlipFaceDown,
  flipFaceDown,
  getEvolutionBlocker,
  getTrainerBlocker,
  evolvePokemonInPlay,
  ENERGY_ATTACH_EFFECTS,
  getTurnActionBlocker,
  isSetupPhase,
  findInPlay,
  findOwnPokemon,
  allOwnPokemon,
  MAX_BENCH_SIZE,
  maxBenchSize,
  isBenchFull,
  swapSides,
  // Gym Heroes Stadium in play
  getStadium,
  stadiumNamed,
  // Bench trim after a Stadium shrank the Benches (pendingBenchTrim)
  getBenchTrimStep,
  resolveBenchTrim,
} from "./domain/board";

// Gym Heroes Stadium rules (continuous effects of the Stadium in play)
export {
  stadiumRetreatModifier,
  stadiumIgnoresResistance,
  stadiumExtraTrainerDiscards,
  stadiumBenchLimit,
  stadiumOffersAttackCoin,
  canUseVermilionCoin,
  VERMILION_COIN_DAMAGE,
  // Gym Challenge Stadiums
  RESISTANCE_AMOUNT,
  resistanceAmount,
  stadiumResistanceModifier,
  stadiumIgnoresWeakness,
  stadiumEvolutionHeal,
  stadiumBenchPlayCoin,
  stadiumFlipsTrainers,
  MINEFIELD_DAMAGE,
} from "./domain/stadiums/rules";

// Tickling Machine: hands set aside face down (state.setAsideHands; consumers mask them for BOTH players)
export { setAsideCards, swapSetAsideHands } from "./domain/trainers/set-aside";
export { isTrainerLocked, isBenchProtected, swapSideTurns } from "./domain/trainers/side-marks";
// Lt. Surge's Secret Plan: face-down Bench cards (placeholder `pokemon.faceDownCard`; consumers send
// each player maskFaceDownFor(state, viewer); the owner flips with canFlipFaceDown / flipFaceDown)
export {
  isFaceDown,
  maskFaceDownFor,
  revealFaceDown,
  FACE_DOWN_NAME,
  HIDDEN_FACE_DOWN_NAME,
} from "./domain/trainers/secret-plan";

// Misty's Duel: Rock-Paper-Scissors (state.pendingDuel; see domain/duel/rps.ts for the SP / MP contract)
export {
  rpsWinner,
  submitDuelPick,
  canSubmitDuelPick,
  submitDuelPickVsAI,
  maskDuelFor,
  aiDuelPick,
  swapPendingDuel,
  swapLastDuel,
  RPS_CHOICES,
  RPS_LABELS,
  DUEL_HAND_SIZE,
} from "./domain/duel/rps";

// =============================================================================
// Game Engine (lib/gameState.ts)
// =============================================================================

export type { GameResult } from "./lib/gameState";

// Initialization
export {
  initializeGame,
  initializeMultiplayerGame,
  startGame,
  DEFAULT_PRIZE_COUNT,
  buildDeckFromEntries,
} from "./lib/gameState";

// Lucky Duel (table type): random Basic + deck, locked Benches, no Prizes, draws
export {
  drawLuckyDuel,
  buildLuckyDuelDeck,
  initializeLuckyDuelGame,
  isLuckyDuel,
  isLuckyDuelTrainerAllowed,
  LUCKY_DUEL_EXCLUDED_TRAINERS,
  LUCKY_DUEL_BASICS,
  LUCKY_DUEL_DECK_SIZE,
} from "./domain/lucky-duel";
export type { GameMode, LuckyDuelDraw } from "./domain/lucky-duel";

// Turn Actions
export {
  executeAttack,
  executeMetronome,
  executeCopiedAttack,
  getCopiedAttackCoinPlan,
  energyRemovalBlocked,
  getAttackPreReaction,
  applyNinjaTrickSwitch,
  getAttackCoinFlipCount,
  getAttackCoinPlan,
  flipAttackCoins,
  resolveAttackChoice,
  getAttackChoiceCoinPlan,
  ESP_REFLIP_OPTION,
  isAttackChoiceEffect,
  resolvePowerChoice,
  triggerOnPlayPower,
  ON_PLAY_POWERS,
  resolveConfusionFlip,
  endTurn,
  executeRetreat,
  getRetreatCoinFlips,
  knockOutRetaliationDamage,
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
  knockOutOpponentActive,
  checkKnockouts,
  endGameIfNoPokemonLeft,
  settleLuckyDuelDraw,
} from "./lib/gameState";

// Validation
export {
  canUseAttack,
  canExecuteAttack,
  getAvailableAttacks,
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
  canMulligan,
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
  toLogCards,
  shuffle,
  drawCard,
  getEnergyValue,
  getTotalEnergyValue,
  energyProvidesType,
  energyCardLabel,
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
  CoinFlipper,
} from "./domain/effects";
export {
  TRAINER_EFFECTS,
  POWER_EFFECTS,
  UNSUPPORTED_TRAINERS,
  ACTIVATED_POWER_TYPES,
  isPlayedAsBasic,
  staysInPlay,
  declineBorrowedTrainer,
  // Chaos Gym (Gym Challenge)
  isChaosGymCoinPending,
  getChaosGymOfferStep,
  answerChaosGymOffer,
  declineChaosGymOffer,
  forfeitChaosGymPlay,
  canPlayTrainerCard,
  getTrainerSteps,
  getTrainerCoinFlips,
  getTrainerCoinFlippers,
  playTrainerCard,
  canUsePokemonPower,
  getPowerSteps,
  getPowerCoinFlips,
  getPowerCoinFlippers,
  usePokemonPower,
  getUsablePowerPokemonIds,
  STADIUM_ACTIONS,
  getStadiumActions,
  canUseStadiumAction,
  getStadiumActionSteps,
  getStadiumActionCoinFlips,
  useStadiumAction,
  checkSelection,
  minSelectionsOf,
  stepForAnswerer,
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

export type { AIAction, DecideOpponentTurnOptions, AIExecutionOptions, AICoinRecord, AICoinPurpose } from "./domain/ai";
export {
  decideOpponentTurn,
  decideOpponentSetup,
  decideOpponentPromotion,
  executeAIAction,
  finishAIAttackAfterReaction,
  answerOpponentTrainerStep,
  answerOpponentTrainerStepForAI,
  answerAttackChoiceForAI,
  answerChaosGymOfferForAI,
  attackCoinFlippers,
} from "./domain/ai";
export { answerStepForAI, resolveOwnAttackPendings, resolveOwnPowerChoice, chooseBenchTrim, resolveBenchTrimForAI } from "./domain/ai/pending";

// =============================================================================
// Simulation (headless bot games; used by scripts/simulate.ts and tests)
// =============================================================================

export type { GameOptions, GameOutcome, SideId, Policy, ViewAction, Rng, SeededRng, PolicyName, PolicyPair, BatchResult, BatchFailure } from "./domain/simulation";
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
  // Seeded randomness for server-run games (adventure rooms): withRandom swaps Math.random synchronously
  withRandom,
  createSeededRng,
  hashSeed,
} from "./domain/simulation";

// =============================================================================
// Card Catalog
// =============================================================================

export {
  baseSetCards,
  jungleCards,
  fossilCards,
  teamRocketCards,
  gymHeroesCards,
  gymChallengeCards,
  getBaseSetImageUrl,
  getJungleImageUrl,
  getFossilImageUrl,
  getTeamRocketImageUrl,
  getGymHeroesImageUrl,
  getGymChallengeImageUrl,
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
  isSetInDevelopment,
  // Pokédex lengths (Blaine's Quiz #1)
  POKEDEX_HEIGHTS,
  pokedexSpecies,
  pokedexHeight,
  heightInInches,
  quizLengthOptions,
  // Blaine's Quiz #3's names
  quizCardNameOptions,
} from "./domain/catalog";
export type { CardSetId, CardSetInfo, CardImageInput } from "./domain/catalog";

// =============================================================================
// Decks
// =============================================================================

export type { DeckEntry, FeaturedPokemonRef, Deck, ResolvedDeckEntry, GroupedDeck } from "./domain/decks";
export { decks, gymLeaderDecks, resolveDeck, findCardBySetAndNumber, findCardByNumber, getDeckById, getDeckEnergyTypes, getDeckCardCount, getDeckFeaturedPokemon, groupDeckByKind } from "./domain/decks";

export type { StartGameOptions } from "./lib/gameState";
export { DEFAULT_OPENING_HAND, openingHandSizeOf } from "./lib/gameState";

// =============================================================================
// Adventure mode (Modo Aventura): decks from card ids, deck rules
// =============================================================================

export type { CardEntry, SidePair, TableSide, DeckRules, AdventurePassive, BattlePassives } from "./domain/adventure";
export { deckFromCardEntries, validateDeckEntries, isAdventureCardAllowed, ADVENTURE_PASSIVES, setupOptionsForPassives, applySetupRules, takeLuckyCoin } from "./domain/adventure";
