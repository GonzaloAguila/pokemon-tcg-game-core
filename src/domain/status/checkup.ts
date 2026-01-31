/**
 * Pokemon checkup phase - resolves status conditions between turns
 */

import { flipCoin, isHeads } from "@/domain/coin";
import { StatusCondition } from "@/domain/constants";
import type {
  SpecialCondition,
  StatusState,
  CheckupResult,
  CheckupOptions,
} from "./types";

/**
 * Resolves Pokemon checkup phase
 * - Poison deals damage
 * - Burn deals damage + coin flip to cure
 * - Asleep coin flip to wake up
 * - Paralyzed is cleared
 */
export const resolvePokemonCheckup = (
  state: StatusState,
  options: CheckupOptions = {}
): CheckupResult => {
  const rng = options.rng ?? Math.random;
  const poisonDamage = options.poisonDamage ?? 10;
  const burnDamage = options.burnDamage ?? 20;
  const clearParalyzed = options.clearParalyzed ?? true;

  const next = new Set(state.conditions);
  const cured: SpecialCondition[] = [];
  let damageCountersAdded = 0;

  // Poison damage
  if (next.has(StatusCondition.Poisoned)) {
    damageCountersAdded += poisonDamage;
  }

  // Burn damage + possible cure
  if (next.has("burned")) {
    damageCountersAdded += burnDamage;
    if (isHeads(flipCoin(rng))) {
      next.delete("burned");
      cured.push("burned");
    }
  }

  // Asleep wake-up check
  if (next.has(StatusCondition.Asleep)) {
    if (isHeads(flipCoin(rng))) {
      next.delete(StatusCondition.Asleep);
      cured.push(StatusCondition.Asleep);
    }
  }

  // Clear paralyzed
  if (clearParalyzed && next.has(StatusCondition.Paralyzed)) {
    next.delete(StatusCondition.Paralyzed);
    cured.push(StatusCondition.Paralyzed);
  }

  return { nextState: { conditions: next }, damageCountersAdded, cured };
};
