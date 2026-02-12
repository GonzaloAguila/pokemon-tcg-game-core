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
} from "./domain/cards";

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
  endTurn,
  executeRetreat,
  applyForceSwitch,
  applySelfSwitch,
  skipPendingSwitch,
  executeDeckSearch,
  executeBenchDamage,
  doMulligan,
  setPlayerReady,
  startPlayingPhase,
  advanceToSetup,
} from "./lib/gameState";

// Validation
export {
  canUseAttack,
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
// Card Catalog
// =============================================================================

export {
  baseSetCards,
  jungleCards,
  getBaseSetImageUrl,
  getJungleImageUrl,
  getCardImageUrl as getCatalogImageUrl,
} from "./domain/catalog";

// =============================================================================
// Decks
// =============================================================================

export type { DeckEntry, FeaturedPokemonRef, Deck, ResolvedDeckEntry, GroupedDeck } from "./domain/decks";
export { decks, resolveDeck, getDeckById, getDeckEnergyTypes, getDeckCardCount, getDeckFeaturedPokemon, groupDeckByKind } from "./domain/decks";
