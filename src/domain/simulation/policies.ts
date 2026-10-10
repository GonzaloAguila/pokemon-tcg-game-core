/**
 * Bot policies for headless games. A policy plays one action at a time for its side (the
 * runner keeps the state in side A's perspective and hands each policy its own view), and
 * answers choices (selection steps, promotions, prizes).
 *
 * - greedy: the existing single-player AI (decideOpponentTurn + executeAIAction).
 * - randomLegal: a fuzzer — picks uniformly among action categories, then among every legal
 *   action of that category (board actions, Trainers and powers through the effect registry
 *   with random valid selections, retreat, attack, end turn). Coins come from the run's rng.
 */

import type { GameState, PokemonInPlay } from "@/lib/gameState";
import {
  canExecuteAttack,
  canExecuteMetronome,
  canRetreat,
  endTurn,
  executeAttack,
  executeMetronome,
  executeRetreat,
  getAttackCoinFlipCount,
  getEnergyValue,
  getRetreatCost,
  hasEnoughEnergyToRetreat,
  hasStatusCondition,
  resolveConfusionFlip,
} from "@/lib/gameState";
import type { Attack } from "@/domain/cards";
import { isEnergyCard, isPokemonCard } from "@/domain/cards";
import { AttackEffectType, PokemonStage, StatusCondition, type CoinFlipResult } from "@/domain/constants";
import {
  canAttachEnergy,
  canDiscardFromPlay,
  discardFromPlay,
  canPlayBasicPokemon,
  getEvolutionTargets,
  getTurnActionBlocker,
  playBasicPokemon,
  attachEnergyCard,
  evolvePokemonCard,
} from "@/domain/board";
import {
  canPlayTrainerCard,
  canUsePokemonPower,
  getPowerCoinFlips,
  getPowerSteps,
  getTrainerCoinFlips,
  getTrainerSteps,
  minSelectionsOf,
  playTrainerCard,
  usePokemonPower,
  type CoinFlipRequirement,
  type SelectionStep,
} from "@/domain/effects";
import { decideOpponentTurn, decideOpponentSetup, executeAIAction, type AIAction } from "@/domain/ai";
import { getEffectivePokemonCard } from "@/domain/powers";
import { swapSides } from "@/domain/board";
import { flipCoin, pick, pickSome, randomInt, shuffled, type Rng } from "./rng";

/** One action for the acting side, applied to ITS view (actor = "player"). */
export type ViewAction = { label: string; run: (view: GameState) => GameState };

export class UnanswerableStepError extends Error {}

export interface Policy {
  readonly name: string;
  /** Setup: actions placing the Active and Bench (view = this side as "player"). */
  setup(view: GameState, rng: Rng): ViewAction[];
  /**
   * Next main-phase action for the side whose turn it is, or null to end the turn.
   * `actionsThisTurn` lets policies stop long turns.
   */
  nextAction(view: GameState, rng: Rng, actionsThisTurn: number): ViewAction | null;
  /** Answer a selection step (null = it can't be answered: a registry bug). */
  answer(step: SelectionStep, rng: Rng): string[] | null;
  /** Bench index to promote (view = this side as "player") */
  promotion(view: GameState, rng: Rng): number;
  /** Prize index to take */
  prize(view: GameState, rng: Rng): number;
}

// ============================================================================
// Shared helpers
// ============================================================================

export function flipFor(requirement: CoinFlipRequirement, rng: Rng): CoinFlipResult[] {
  if (requirement === "untilTails") {
    const coins: CoinFlipResult[] = [];
    for (let i = 0; i < 100; i++) {
      const coin = flipCoin(rng);
      coins.push(coin);
      if (coin === "tails") break;
    }
    return coins;
  }
  return Array.from({ length: requirement }, () => flipCoin(rng));
}

/** Random valid answer: between min and max distinct enabled options (ordering: all, shuffled). */
export function randomAnswer(step: SelectionStep, rng: Rng): string[] | null {
  const enabled = step.options.filter((o) => !o.disabled).map((o) => o.id);
  const min = minSelectionsOf(step);
  if (enabled.length < min) return null;
  if (step.orderingCards) return shuffled(rng, enabled).slice(0, step.maxSelections);
  return pickSome(rng, enabled, Math.max(min, Math.min(1, step.maxSelections)), step.maxSelections);
}

/** First valid answer (deterministic, used by the greedy policy for registry choices). */
export function firstAnswer(step: SelectionStep): string[] | null {
  const enabled = step.options.filter((o) => !o.disabled).map((o) => o.id);
  const count = Math.max(minSelectionsOf(step), Math.min(1, step.maxSelections));
  return enabled.length < count ? null : enabled.slice(0, step.orderingCards ? step.maxSelections : count);
}

/** Collect every answer of a registry effect, then resolve it. */
function runEffectWithAnswers(
  view: GameState,
  rng: Rng,
  answer: (step: SelectionStep) => string[] | null,
  coins: CoinFlipResult[],
  getSteps: (selections: string[][]) => SelectionStep | null,
  resolve: (selections: string[][]) => GameState
): GameState {
  const selections: string[][] = [];
  for (let guard = 0; guard < 20; guard++) {
    const step = getSteps(selections);
    if (!step) return resolve(selections);
    const chosen = answer(step);
    if (!chosen) throw new UnanswerableStepError(`No valid answer for step "${step.title}": ${step.description}`);
    selections.push(chosen);
  }
  throw new UnanswerableStepError("More than 20 selection steps");
}

export function trainerAction(cardId: string, name: string, rng: Rng, answer: (step: SelectionStep) => string[] | null): ViewAction {
  return {
    label: `playTrainer ${name}`,
    run: (view) => {
      const coins = flipFor(getTrainerCoinFlips(view, cardId), rng);
      return runEffectWithAnswers(
        view,
        rng,
        answer,
        coins,
        (selections) => getTrainerSteps(view, cardId, selections, coins.length > 0 ? coins : undefined),
        (selections) => playTrainerCard(view, cardId, selections, { coinResults: coins })
      );
    },
  };
}

export function powerAction(pokemon: PokemonInPlay, rng: Rng, answer: (step: SelectionStep) => string[] | null): ViewAction {
  const pokemonId = pokemon.pokemon.id;
  const powerName = isPokemonCard(pokemon.pokemon) ? pokemon.pokemon.power?.name : "?";
  return {
    label: `usePower ${powerName} (${pokemon.pokemon.name})`,
    run: (view) => {
      const coins = flipFor(getPowerCoinFlips(view, pokemonId), rng);
      return runEffectWithAnswers(
        view,
        rng,
        answer,
        coins,
        (selections) => getPowerSteps(view, pokemonId, selections, coins.length > 0 ? coins : undefined),
        (selections) => usePokemonPower(view, pokemonId, selections, { coinResults: coins })
      );
    },
  };
}

const isCopyAttack = (attack: Attack) => attack.effects?.some((e) => e.type === AttackEffectType.CopyAttack) ?? false;

/**
 * Attack with the Active: confusion flip first (any attack, Metronome included), then the
 * attack with its coins. The runner ends the turn (attackedThisTurn) and resolves pendings.
 */
export function attackAction(attackIndex: number, rng: Rng): ViewAction {
  return {
    label: `attack #${attackIndex}`,
    run: (view) => {
      let state = view;
      const active = state.playerActivePokemon!;
      if (hasStatusCondition(active, StatusCondition.Confused)) {
        const confusion = resolveConfusionFlip(state, flipCoin(rng) === "heads", true);
        if (!confusion.canAttack) return confusion.state;
        state = confusion.state;
      }
      const attack = getEffectivePokemonCard(state, active)?.attacks[attackIndex];
      if (attack && isCopyAttack(attack)) {
        const defender = state.opponentActivePokemon!;
        const copyable = (getEffectivePokemonCard(state, defender)?.attacks ?? []).filter((a) => canExecuteMetronome(state, a) === null);
        if (copyable.length === 0) return endTurn({ ...state, attackedThisTurn: true }, true);
        const copied = pick(rng, copyable);
        const coins = flipFor(getAttackCoinFlipCount(state, copied), rng);
        return executeMetronome(state, copied, { coinResults: coins, skipEndTurn: true, skipDefenderPromotion: true });
      }
      const coins = flipFor(getAttackCoinFlipCount(state, attackIndex), rng);
      return executeAttack(state, attackIndex, { coinResults: coins, skipEndTurn: true, skipDefenderPromotion: true });
    },
  };
}

function retreatAction(view: GameState, rng: Rng): ViewAction | null {
  const active = view.playerActivePokemon;
  if (!active || getTurnActionBlocker(view)) return null;
  if (!canRetreat(active, view.playerBench.length, view.retreatedThisTurn)) return null;
  if (!hasEnoughEnergyToRetreat(active, view.playerBench, view)) return null;
  const cost = getRetreatCost(active, view.playerBench, view);
  const energyIds: string[] = [];
  let paid = 0;
  for (const energy of shuffled(rng, active.attachedEnergy)) {
    if (paid >= cost) break;
    energyIds.push(energy.id);
    paid += getEnergyValue(energy);
  }
  const benchIndex = randomInt(rng, view.playerBench.length);
  return { label: `retreat to bench #${benchIndex}`, run: (v) => executeRetreat(v, energyIds, benchIndex) };
}

// ============================================================================
// randomLegal
// ============================================================================

/** Every legal main-phase action, grouped by category. */
export function legalActions(view: GameState, rng: Rng, answer: (step: SelectionStep) => string[] | null): Record<string, ViewAction[]> {
  const categories: Record<string, ViewAction[]> = {};
  const add = (category: string, action: ViewAction) => (categories[category] ??= []).push(action);
  if (getTurnActionBlocker(view)) return categories;

  for (const card of view.playerHand) {
    if (canPlayBasicPokemon(view, card.id, "bench") === null) {
      add("bench", { label: `bench ${card.name}`, run: (v) => playBasicPokemon(v, card.id, "bench") });
    }
    if (isPokemonCard(card) && card.stage !== PokemonStage.Basic) {
      for (const targetId of getEvolutionTargets(view, card.id)) {
        add("evolve", { label: `evolve into ${card.name}`, run: (v) => evolvePokemonCard(v, card.id, targetId) });
      }
    }
    if (isEnergyCard(card)) {
      for (const target of [view.playerActivePokemon, ...view.playerBench]) {
        if (target && canAttachEnergy(view, card.id, target.pokemon.id) === null) {
          add("attach", { label: `attach ${card.name} to ${target.pokemon.name}`, run: (v) => attachEnergyCard(v, card.id, target.pokemon.id) });
        }
      }
    }
    if (card.kind === "trainer" && canPlayTrainerCard(view, card.id) === null) {
      add("trainer", trainerAction(card.id, card.name, rng, answer));
    }
  }
  for (const pokemon of [view.playerActivePokemon, ...view.playerBench]) {
    if (pokemon && canUsePokemonPower(view, pokemon.pokemon.id) === null) add("power", powerAction(pokemon, rng, answer));
    if (pokemon && canDiscardFromPlay(view, pokemon.pokemon.id) === null) {
      add("discardFromPlay", { label: `discardFromPlay ${pokemon.pokemon.name}`, run: (v) => discardFromPlay(v, pokemon.pokemon.id) });
    }
  }
  const retreat = retreatAction(view, rng);
  if (retreat) add("retreat", retreat);
  const active = view.playerActivePokemon;
  const activeCard = active ? getEffectivePokemonCard(view, active) : undefined;
  if (activeCard) {
    activeCard.attacks.forEach((_, index) => {
      if (canExecuteAttack(view, index) === null) add("attack", attackAction(index, rng));
    });
  }
  return categories;
}

export const randomLegalPolicy: Policy = {
  name: "random",
  setup(view, rng) {
    const basics = shuffled(rng, view.playerHand.filter((c) => canPlayBasicPokemon(view, c.id, "active") === null));
    if (basics.length === 0) return [];
    const [active, ...rest] = basics;
    const benched = rest.slice(0, randomInt(rng, Math.min(5, rest.length) + 1));
    return [
      { label: `setup active ${active.name}`, run: (v) => playBasicPokemon(v, active.id, "active") },
      ...benched.map((card) => ({ label: `setup bench ${card.name}`, run: (v: GameState) => playBasicPokemon(v, card.id, "bench") })),
    ];
  },
  nextAction(view, rng, actionsThisTurn) {
    const categories = legalActions(view, rng, (step) => randomAnswer(step, rng));
    // Long turns (Energy Trans / Damage Swap ping-pong): only attack or end
    const names = Object.keys(categories).filter((c) => actionsThisTurn < 40 || c === "attack");
    // End the turn without attacking now and then (10%), otherwise act (an attack ends it)
    if (names.length === 0 || rng() < 0.1) return null;
    return pick(rng, categories[pick(rng, names)]);
  },
  answer: (step, rng) => randomAnswer(step, rng),
  promotion: (view, rng) => randomInt(rng, view.playerBench.length),
  prize: (view, rng) => randomInt(rng, view.playerPrizes.length),
};

// ============================================================================
// greedy (existing AI)
// ============================================================================

/**
 * The single-player AI. It plans a whole turn on its own (it plays as "opponent"), so the
 * plan is kept per turn and executed one action at a time; every action runs on the AI's
 * view (actor = "opponent") through executeAIAction.
 */
export function createGreedyPolicy(): Policy & { aiViewAction(action: AIAction): ViewAction } {
  let planKey = "";
  let plan: AIAction[] = [];
  const toAiView = (view: GameState) => swapSides(view);
  const aiViewAction = (action: AIAction): ViewAction => ({
    label: `greedy ${action.type}${"trainerName" in action ? ` ${action.trainerName}` : ""}`,
    run: (view) => swapSides(executeAIAction(toAiView(view), action)),
  });
  return {
    name: "greedy",
    aiViewAction,
    setup(view) {
      return decideOpponentSetup(toAiView(view)).map(aiViewAction);
    },
    nextAction(view, _rng, actionsThisTurn) {
      const key = `${view.turnNumber}`;
      if (key !== planKey || actionsThisTurn === 0) {
        planKey = key;
        plan = decideOpponentTurn(toAiView(view));
      }
      const next = plan.shift();
      return next ? aiViewAction(next) : null;
    },
    answer: (step) => firstAnswer(step),
    promotion: () => 0,
    prize: () => 0,
  };
}
