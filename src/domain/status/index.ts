/**
 * Status condition domain
 */

export type {
  SpecialCondition,
  StatusState,
  CheckupResult,
  CheckupOptions,
} from "./types";

export {
  createStatusState,
  hasCondition,
  addCondition,
  removeCondition,
  clearAllConditions,
  getConditions,
  hasAnyCondition,
} from "./status-effects";

export { resolvePokemonCheckup } from "./checkup";
