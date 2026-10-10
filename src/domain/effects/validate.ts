/**
 * Generic checks shared by trainers and powers: coins and selections are validated against
 * what the effect itself asked for (its coinFlips and getSteps), so every resolve can trust
 * its input.
 */

import type { GameState } from "@/lib/gameState";
import type { CoinFlipResult } from "@/domain/constants";
import { IllegalActionError } from "@/shared/errors";
import type { CardEffectDef, CoinFlipRequirement, SelectionStep } from "./types";

/** Coins requested by an effect before its first step. */
export function coinRequirement(def: CardEffectDef, state: GameState, sourceId: string): CoinFlipRequirement {
  return def.coinFlips?.(state, sourceId, []) ?? 0;
}

/** Throws unless `coins` satisfies the requirement (a caller bug: the outcome would change). */
export function checkCoins(requirement: CoinFlipRequirement, coins: CoinFlipResult[]): void {
  if (requirement === "untilTails") {
    const tailsAt = coins.indexOf("tails");
    if (coins.length === 0 || tailsAt !== coins.length - 1) {
      throw new IllegalActionError("Las monedas deben lanzarse hasta que salga cruz");
    }
    return;
  }
  if (coins.length !== requirement) {
    throw new IllegalActionError(`Se necesitan ${requirement} moneda(s) y se recibieron ${coins.length}`);
  }
}

/** Fewest options a step accepts. */
export function minSelectionsOf(step: SelectionStep): number {
  return step.minSelections ?? step.maxSelections;
}

/** Throws unless `chosen` is a valid answer to `step`. */
export function checkSelection(step: SelectionStep, chosen: string[] | undefined): void {
  if (!Array.isArray(chosen)) throw new IllegalActionError(`Falta elegir: ${step.description}`);
  const allowed = new Set(step.options.filter((option) => !option.disabled).map((option) => option.id));
  if (new Set(chosen).size !== chosen.length) throw new IllegalActionError("No puedes elegir la misma opción dos veces");
  for (const id of chosen) {
    if (!allowed.has(id)) throw new IllegalActionError(`Opción no válida para "${step.title}"`);
  }
  if (chosen.length > step.maxSelections || chosen.length < minSelectionsOf(step)) {
    throw new IllegalActionError(`Cantidad de opciones no válida para "${step.title}"`);
  }
}

/**
 * Walk the effect's steps with the given answers: every answer must be valid for its step,
 * and the answers must end exactly when getSteps returns null.
 */
export function checkSelections(
  def: CardEffectDef,
  state: GameState,
  sourceId: string,
  selections: string[][],
  coins: CoinFlipResult[] | undefined
): void {
  if (!Array.isArray(selections)) throw new IllegalActionError("Selecciones no válidas");
  // Bounded: a step is never asked twice for the same answers, and selections is finite
  for (let index = 0; index <= selections.length; index++) {
    const step = def.getSteps(state, sourceId, selections.slice(0, index), coins);
    if (step === null) {
      if (index !== selections.length) throw new IllegalActionError("Hay selecciones de más");
      return;
    }
    checkSelection(step, selections[index]);
  }
}
