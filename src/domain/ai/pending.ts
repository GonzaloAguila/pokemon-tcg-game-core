/**
 * AI answers to the choices its own attack leaves pending (switch targets, deck search,
 * bench damage targets). Runs on the AI's view (AI = "player") right after executeAttack
 * with skipEndTurn, and never ends the turn: the executor does that after swapping back.
 */

import type { GameState, PokemonInPlay } from "@/lib/gameState";
import {
  applyForceSwitch,
  applySelfSwitch,
  resolveAttackChoice,
  executeBenchDamage,
  executeDeckSearch,
  skipPendingSwitch,
} from "@/lib/gameState";
import { isPokemonCard } from "@/domain/cards";
import { PokemonStage } from "@/domain/constants";
import type { SelectionStep } from "@/domain/effects/types";
import { minSelectionsOf } from "@/domain/effects/validate";

/**
 * The AI's answer to any selection step (attack choices, and what a consumer needs when the
 * AI is the "opponent" chooser of the human's attack, e.g. Terror Strike): as many options as
 * the step requires (at least one when allowed), in order; an ordering keeps the current order.
 */
export function answerStepForAI(step: SelectionStep): string[] {
  const enabled = step.options.filter((o) => !o.disabled).map((o) => o.id);
  if (step.orderingCards) return enabled.slice(0, step.maxSelections);
  const count = Math.max(minSelectionsOf(step), Math.min(1, step.maxSelections));
  return enabled.slice(0, Math.min(count, enabled.length));
}

const NO_END = { skipEndTurn: true } as const;

function remainingHp(pokemon: PokemonInPlay): number {
  return isPokemonCard(pokemon.pokemon) ? pokemon.pokemon.hp - (pokemon.currentDamage ?? 0) : 0;
}

/** Bench indexes sorted by remaining HP, lowest first. */
function weakestFirst(bench: PokemonInPlay[]): number[] {
  return bench.map((_, i) => i).sort((a, b) => remainingHp(bench[a]) - remainingHp(bench[b]));
}

/**
 * Resolve every pending choice of the AI's own attack (view: AI = "player"). Choices that
 * belong to the other side (an attack choice with `chooser: "opponent"`) are left pending.
 */
export function resolveOwnAttackPendings(view: GameState): GameState {
  let state = view;
  for (let guard = 0; guard < 10; guard++) {
    if (state.gameResult !== null) return state;

    if (state.pendingForceSwitch) {
      // Bring up the opponent's weakest benched Pokémon (easiest Knock Out next turn)
      const [index] = weakestFirst(state.opponentBench);
      state = index === undefined ? skipPendingSwitch(state, NO_END) : applyForceSwitch(state, index, NO_END);
      continue;
    }
    if (state.pendingSelfSwitch) {
      // Send in the healthiest benched Pokémon
      const order = weakestFirst(state.playerBench);
      const index = order[order.length - 1];
      state = index === undefined ? skipPendingSwitch(state, NO_END) : applySelfSwitch(state, index, NO_END);
      continue;
    }
    if (state.pendingDeckSearch) {
      const filter = state.pendingDeckSearch.filter;
      const card = state.playerDeck.find(
        (c) =>
          isPokemonCard(c) &&
          c.stage === PokemonStage.Basic &&
          (!filter.names?.length || filter.names.includes(c.name)) &&
          (!filter.type || c.types.includes(filter.type))
      );
      state = executeDeckSearch(state, card?.id ?? null, NO_END);
      continue;
    }
    if (state.pendingAttackChoice) {
      const step = state.pendingAttackChoice.step;
      // The other player's choice (Terror Strike) stays pending: the consumer asks them
      if (step.chooser === "opponent") return state;
      state = resolveAttackChoice(state, answerStepForAI(step), NO_END);
      continue;
    }
    if (state.pendingBenchDamageSelection) {
      const pending = state.pendingBenchDamageSelection;
      const bench = pending.targetSide === "opponent" ? state.opponentBench : state.playerBench;
      const eligible = bench.filter(
        (p) => !pending.matchDefenderType || !isPokemonCard(p.pokemon) || p.pokemon.types.some((t) => pending.defenderTypes?.includes(t))
      );
      // Opponent's bench: hit the weakest; own bench: as few as allowed, the healthiest
      const sorted = [...eligible].sort((a, b) => remainingHp(a) - remainingHp(b));
      const count = pending.targetSide === "opponent"
        ? Math.min(pending.maxTargets, sorted.length)
        : Math.min(pending.minTargets ?? 1, sorted.length);
      const chosen = (pending.targetSide === "opponent" ? sorted : sorted.reverse()).slice(0, count);
      state = executeBenchDamage(state, chosen.map((p) => p.pokemon.id), NO_END);
      continue;
    }
    return state;
  }
  return state;
}
