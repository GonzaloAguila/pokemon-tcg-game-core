/**
 * Status condition domain types
 */

import type { StatusCondition } from "@/domain/constants";

// SpecialCondition extends StatusCondition to include "burned" for future use
export type SpecialCondition = StatusCondition | "burned";

export type StatusState = {
  conditions: Set<SpecialCondition>;
};

export type CheckupResult = {
  nextState: StatusState;
  damageCountersAdded: number;
  cured: SpecialCondition[];
};

export type CheckupOptions = {
  rng?: () => number;
  poisonDamage?: number;
  burnDamage?: number;
  clearParalyzed?: boolean;
};
