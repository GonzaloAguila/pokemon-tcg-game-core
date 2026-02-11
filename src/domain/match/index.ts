/**
 * Match domain - game state, validators, and actions
 *
 * This module provides the full API for game match logic.
 * Implementation is currently in lib/gameState.ts and will be
 * gradually migrated here.
 */

// Types
export type {
  GameCard,
  StatusCondition,
  PokemonInPlay,
  GameEvent,
  GamePhase,
  GameResult,
  GameModifier,
  GameState,
  DrawCardResult,
} from "./types";

// Helpers
export {
  createGameEvent,
  findCardByName,
  createGameCard,
} from "./helpers";

// Re-export validators from lib/gameState (to be migrated)
export {
  hasBasicPokemon,
  canRetreat,
  hasEnoughEnergyToRetreat,
  getRetreatCost,
  getEnergyValue,
  getTotalEnergyValue,
  canUseAttack,
  getAttackDiscardRequirement,
  canEvolveInto,
  findValidEvolutionTargets,
  hasStatusCondition,
  canPokemonAttack,
  canPokemonRetreat,
} from "@/lib/gameState";

// Re-export status functions from lib/gameState (to be migrated)
export {
  applyStatusCondition,
  removeStatusCondition,
  clearAllStatusConditions,
  clearStatusConditionsOnRetreat,
} from "@/lib/gameState";

// Re-export protection functions from lib/gameState (to be migrated)
export {
  applyProtection,
  isProtected,
  protectionBlocksDamage,
  clearProtection,
} from "@/lib/gameState";

// Re-export game actions from lib/gameState (to be migrated)
export {
  initializeGame,
  startGame,
  doMulligan,
  advanceToSetup,
  setPlayerReady,
  startPlayingPhase,
  drawCard,
  endTurn,
  executeAttack,
  executeRetreat,
  takePrize,
  promoteActivePokemon,
  buildDeckFromEntries,
  applyForceSwitch,
  applySelfSwitch,
  skipPendingSwitch,
  executeDeckSearch,
} from "@/lib/gameState";

// Re-export UI helpers from lib/gameState (to be migrated to features/game/model)
export {
  getEnergyTypeInSpanish,
} from "@/lib/gameState";

// Note: getCardImageUrl is now in @/domain/catalog
