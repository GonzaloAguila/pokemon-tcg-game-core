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
  DiscardFromPlayAction,
  UsePowerAction,
  UseStadiumAction,
  EndTurnAction,
  AttackEvaluation,
  PokemonEvaluation,
} from "./types";

// Strategy (decision making): the smart AI; the previous greedy script stays as a simulator baseline
export { decideOpponentTurn, decideOpponentSetup, decideOpponentPromotion } from "./smart";
export { choosePromotion, chooseForcedSwitch } from "./choices";
export { decideOpponentTurnLegacy, decideOpponentSetupLegacy } from "./legacy";
export { knowledgeView } from "./knowledge";
export { evaluateBoard } from "./evaluate";

// Executor (apply actions to state)
export { executeAIAction } from "./executor";
export { answerStepForAI, resolveOwnAttackPendings, resolveOwnPowerChoice, chooseBenchTrim, resolveBenchTrimForAI } from "./pending";

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
