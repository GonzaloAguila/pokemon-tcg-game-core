/**
 * AI answers to the choices its own attack leaves pending (switch targets, deck search,
 * bench damage targets). Runs on the AI's view (AI = "player") right after executeAttack
 * with skipEndTurn, and never ends the turn: the executor does that after swapping back.
 */

import type { GameState, PokemonInPlay } from "@/lib/gameState";
import {
  getAttackChoiceCoinPlan,
  resolvePowerChoice,
  applyForceSwitch,
  applySelfSwitch,
  resolveAttackChoice,
  executeBenchDamage,
  executeDeckSearch,
  flipAttackCoins,
  skipPendingSwitch,
} from "@/lib/gameState";
import type { CoinFlipResult } from "@/domain/constants";
import { isPokemonCard } from "@/domain/cards";
import { resolveBenchTrim, swapSides } from "@/domain/board";
import { PokemonStage } from "@/domain/constants";
import type { SelectionStep } from "@/domain/effects/types";
import { minSelectionsOf } from "@/domain/effects/validate";
import { chooseForcedSwitch, choosePromotion } from "./choices";
import { knowledgeView } from "./knowledge";
import { pokemonWorth } from "./evaluate";
import { answerAttackChoiceForAI } from "./attackAnswers";

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

/**
 * The AI's own "when you play it from your hand" power (Summon Minions, Sneak Attack, Reel In):
 * it takes as much as it may (as many Basics / cards as allowed; Sneak Attack hits the first
 * option, the Defending Pokémon). View: AI = "player".
 */
export function resolveOwnPowerChoice(view: GameState): GameState {
  const pending = view.pendingPowerChoice;
  if (!pending) return view;
  const enabled = pending.step.options.filter((o) => !o.disabled).map((o) => o.id);
  return resolvePowerChoice(view, enabled.slice(0, pending.step.maxSelections));
}

/**
 * The Bench trim (pendingBenchTrim) for the player who answers it (view: that player = "player", the
 * first entry of pendingBenchTrim): its lowest-value Benched Pokémon, as many as it must return.
 */
export function chooseBenchTrim(view: GameState): string[] {
  const trim = view.pendingBenchTrim?.[0];
  if (!trim) return [];
  const known = knowledgeView(view);
  const count = Math.max(0, known.playerBench.length - trim.keep);
  return [...known.playerBench]
    .sort((a, b) => pokemonWorth(known, a) - pokemonWorth(known, b))
    .slice(0, count)
    .map((p) => p.pokemon.id);
}

/**
 * The AI answers the Bench trim (pendingBenchTrim) while the first entry of pendingBenchTrim is its own
 * (`aiSide` in `state`; consumers: "opponent"). When the other player must answer first the
 * state is returned as is: call it again after their answer.
 */
export function resolveBenchTrimForAI(state: GameState, aiSide: "player" | "opponent" = "opponent"): GameState {
  let next = state;
  while (next.pendingBenchTrim?.[0]?.side === aiSide && next.gameResult === null) {
    const view = aiSide === "player" ? next : swapSides(next);
    next = resolveBenchTrim(next, chooseBenchTrim(view));
  }
  return next;
}

/**
 * The AI judging its own attack (view: AI = "player"): its own choices resolved as
 * resolveOwnAttackPendings does, and the other player's powers asked mid-attack (Flee, Bench
 * Guard: `pendingAttackChoice.reaction`, which leave the board untouched until answered) answered
 * with answerAttackChoiceForAI — a guess at the other player's answer, so the attack is judged by what it does.
 */
export function resolveAttackForEvaluation(view: GameState): GameState {
  let state = resolveOwnAttackPendings(view);
  for (let guard = 0; guard < 6 && state.gameResult === null; guard++) {
    const pending = state.pendingAttackChoice;
    if (!pending?.reaction || pending.step.chooser !== "opponent") break;
    const answer = answerAttackChoiceForAI(state);
    state = resolveOwnAttackPendings(resolveReactionForEvaluation(state, answer));
  }
  return state;
}

/**
 * Answer a reaction while judging an attack. Koga's Ninja Trick's answer needs the attack's coins
 * (getAttackChoiceCoinPlan): the scenario's own coins when they still fit the plan, else heads.
 */
function resolveReactionForEvaluation(state: GameState, answer: string[]): GameState {
  const plan = getAttackChoiceCoinPlan(state, answer);
  if (!plan) return resolveAttackChoice(state, answer, NO_END);
  const resume = state.pendingAttackChoice?.reaction?.resume;
  const scenario = resume?.kind === "attack" ? resume.options.coinResults : undefined;
  if (scenario && scenario.length > 0) {
    try {
      return resolveAttackChoice(state, answer, { ...NO_END, coinResults: scenario });
    } catch {
      // The plan changed with the switch (a coin more or less): heads below
    }
  }
  return resolveAttackChoice(state, answer, { ...NO_END, coinResults: flipAttackCoins(plan, () => "heads") });
}

function remainingHp(pokemon: PokemonInPlay): number {
  return isPokemonCard(pokemon.pokemon) ? pokemon.pokemon.hp - (pokemon.currentDamage ?? 0) : 0;
}

/**
 * Sabrina's ESP: the AI re-flips its attack's own coins when fewer than half came up heads (heads
 * is what every coin attack of a Pokémon with Sabrina in its name wants).
 */
export function wantsEspReflip(coins: CoinFlipResult[]): boolean {
  return coins.filter((c) => c === "heads").length * 2 < coins.length;
}

/**
 * Resolve every pending choice of the AI's own attack (view: AI = "player"). Choices that
 * belong to the other side (an attack choice with `chooser: "opponent"`) are left pending.
 * `flip`: the AI's coin, for an answer that needs new coins (Sabrina's ESP's re-flip, see
 * wantsEspReflip); without it (judging an attack) the AI keeps its coins. Charity: never reduces.
 */
export function resolveOwnAttackPendings(view: GameState, options: { flip?: () => CoinFlipResult } = {}): GameState {
  let state = view;
  for (let guard = 0; guard < 10; guard++) {
    if (state.gameResult !== null) return state;

    if (state.pendingForceSwitch) {
      // Bring up the opponent's Pokémon that hurts the AI least / is stuck / can be Knocked Out
      // (public information only: knowledgeView)
      state = state.opponentBench.length === 0
        ? skipPendingSwitch(state, NO_END)
        : applyForceSwitch(state, chooseForcedSwitch(knowledgeView(state)), NO_END);
      continue;
    }
    if (state.pendingSelfSwitch) {
      // Send in the Benched Pokémon that does best (the opponent moves next)
      state = state.playerBench.length === 0
        ? skipPendingSwitch(state, NO_END)
        : applySelfSwitch(state, choosePromotion(knowledgeView(state), false), NO_END);
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
      // Sabrina's ESP: re-flip bad coins with its own flips (without them — judging an attack — it
      // keeps them); every other choice: answerAttackChoiceForAI (Charity: "0", Fairy Power...)
      const reflip = state.pendingAttackChoice.reflip;
      if (reflip) {
        const again = !!options.flip && wantsEspReflip(reflip.coins);
        state = again
          ? resolveAttackChoice(state, [reflip.option], { ...NO_END, coinResults: flipAttackCoins(reflip.plan, options.flip!) })
          : resolveAttackChoice(state, answerStepForAI(step), NO_END);
        continue;
      }
      // An answer that needs coins (ESP's copied attack): its own flips, else (judging) heads
      const answer = answerAttackChoiceForAI(state);
      const plan = getAttackChoiceCoinPlan(state, answer);
      const coinResults = plan ? flipAttackCoins(plan, options.flip ?? (() => "heads")) : undefined;
      state = resolveAttackChoice(state, answer, { ...NO_END, ...(coinResults && { coinResults }) });
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
