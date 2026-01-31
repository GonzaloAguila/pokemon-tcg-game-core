/**
 * AI Module
 *
 * Sistema de IA para el oponente en el juego de Pokemon TCG.
 *
 * Uso:
 * ```typescript
 * import { decideOpponentTurn, executeAIAction } from "@/domain/ai";
 *
 * // Obtener las acciones que la IA quiere tomar
 * const actions = decideOpponentTurn(gameState);
 *
 * // Ejecutar cada acción secuencialmente (con delays para efectos visuales)
 * for (const action of actions) {
 *   await delay(action.delay || 500);
 *   gameState = executeAIAction(gameState, action);
 * }
 * ```
 */

// Types
export type {
  Side,
  AIAction,
  AIActionType,
  PlayBasicToActiveAction,
  PlayBasicToBenchAction,
  AttachEnergyAction,
  EvolveAction,
  AttackAction,
  PlayTrainerAction,
  RetreatAction,
  EndTurnAction,
  AttackEvaluation,
  PokemonEvaluation,
} from "./types";

// Strategy (decision making)
export { decideOpponentTurn, decideOpponentSetup } from "./strategy";

// Executor (apply actions to state)
export { executeAIAction } from "./executor";

// Actions (low-level state transformations)
export {
  playBasicToActive,
  playBasicToBench,
  attachEnergy,
  evolve,
  getBasicPokemonInHand,
  getEnergiesInHand,
  getPlayableEvolutions,
  getFirstEmptyBenchSlot,
  getUsableAttacks,
  getBestEnergyTarget,
  canKnockOut,
  estimateAttackDamage,
} from "./actions";
