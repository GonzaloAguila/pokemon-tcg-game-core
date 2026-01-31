/**
 * Status condition management - pure functions
 */

import type { SpecialCondition, StatusState } from "./types";
import { StatusCondition } from "@/domain/constants";

/**
 * Conditions that are mutually exclusive
 * (a Pokemon can only have one of these at a time)
 */
const EXCLUSIVE_CONDITIONS: SpecialCondition[] = [
  StatusCondition.Asleep,
  StatusCondition.Confused,
  StatusCondition.Paralyzed,
];

/**
 * Creates a new status state
 */
export const createStatusState = (
  conditions: SpecialCondition[] = []
): StatusState => ({
  conditions: new Set(conditions),
});

/**
 * Checks if status has a specific condition
 */
export const hasCondition = (
  state: StatusState,
  condition: SpecialCondition
): boolean => state.conditions.has(condition);

/**
 * Adds a condition to status state
 * Handles exclusive conditions (asleep/confused/paralyzed replace each other)
 */
export const addCondition = (
  state: StatusState,
  condition: SpecialCondition
): StatusState => {
  const next = new Set(state.conditions);
  if (EXCLUSIVE_CONDITIONS.includes(condition)) {
    EXCLUSIVE_CONDITIONS.forEach((exclusive) => next.delete(exclusive));
  }
  next.add(condition);
  return { conditions: next };
};

/**
 * Removes a condition from status state
 */
export const removeCondition = (
  state: StatusState,
  condition: SpecialCondition
): StatusState => {
  const next = new Set(state.conditions);
  next.delete(condition);
  return { conditions: next };
};

/**
 * Clears all conditions from status state
 */
export const clearAllConditions = (): StatusState => ({
  conditions: new Set<SpecialCondition>(),
});

/**
 * Gets all active conditions as an array
 */
export const getConditions = (state: StatusState): SpecialCondition[] =>
  Array.from(state.conditions);

/**
 * Checks if status has any conditions
 */
export const hasAnyCondition = (state: StatusState): boolean =>
  state.conditions.size > 0;
