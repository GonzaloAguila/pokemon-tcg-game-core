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
  PokemonStage,
  TrainerType,
  GamePhase,
  StatusCondition,
  AttackEffectType,
  PokemonPowerType,
  CoinFlipResult,
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
  startGame,
  createInitialGameState,
} from "./lib/gameState";

// Turn Actions
export {
  executeAttack,
  endTurn,
  executeRetreat,
  playBasicPokemon,
  attachEnergy,
  evolvePokemon,
} from "./lib/gameState";

// Validation
export {
  canUseAttack,
  canRetreat,
  canEvolvePokemon,
  findValidEvolutionTargets,
  hasStatusCondition,
  canPokemonAttack,
} from "./lib/gameState";

// Prize & KO
export {
  takePrize,
  promoteActivePokemon,
  checkForKnockouts,
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

export {
  decideOpponentTurn,
  executeAIAction,
} from "./domain/ai";

// =============================================================================
// Card Catalog
// =============================================================================

export {
  BASE_SET_CARDS,
  getCardById,
  getCardImageUrl,
} from "./domain/catalog";
