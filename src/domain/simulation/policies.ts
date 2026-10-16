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
  getAttackCoinPlan,
  getAvailableAttacks,
  flipAttackCoins,
  getEnergyValue,
  getRetreatCost,
  getRetreatCoinFlips,
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
  canUseStadiumAction,
  getStadiumActionCoinFlips,
  getStadiumActionSteps,
  useStadiumAction,
  type CoinFlipRequirement,
  type SelectionStep,
} from "@/domain/effects";
import {
  choosePromotion,
  chooseForcedSwitch,
  answerAttackChoiceForAI,
  decideOpponentTurn,
  decideOpponentSetup,
  decideOpponentTurnLegacy,
  decideOpponentSetupLegacy,
  executeAIAction,
  knowledgeView,
  type AIAction,
} from "@/domain/ai";
import { getEffectivePokemonCard } from "@/domain/powers";
import { maxBenchSize, swapSides } from "@/domain/board";
import { canUseVermilionCoin } from "@/domain/stadiums/rules";
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
  /**
   * Answer the pending attack choice of `attackerView` (the attacking side's view, where the engine
   * keeps it) as the side its step asks (`chooser`); default: `answer` on the step.
   */
  attackChoice?(attackerView: GameState, rng: Rng): string[] | null;
  /** Bench index to promote (view = this side as "player") */
  promotion(view: GameState, rng: Rng): number;
  /**
   * Bench index of the OTHER side's Pokémon this side's attack brings up (Whirlwind...; view =
   * this side as "player"). Default: `promotion` on the other side's view.
   */
  forceSwitch?(view: GameState, rng: Rng): number;
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
        // A coin flipped after the choices (Blaine's Gamble); a Trainer that ends the turn
        // (Minion of Team Rocket) leaves it to the runner (attackedThisTurn → endTurn)
        (selections) =>
          playTrainerCard(view, cardId, selections, {
            coinResults: coins.length > 0 ? coins : flipFor(getTrainerCoinFlips(view, cardId, selections), rng),
            skipEndTurn: true,
          })
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

/** The action of the Stadium in play (Celadon City Gym), with its coins and answers. */
export function stadiumAction(view: GameState, rng: Rng, answer: (step: SelectionStep) => string[] | null): ViewAction {
  return {
    label: `useStadium ${view.stadium?.card.name ?? "?"}`,
    run: (v) => {
      const coins = flipFor(getStadiumActionCoinFlips(v), rng);
      return runEffectWithAnswers(
        v,
        rng,
        answer,
        coins,
        (selections) => getStadiumActionSteps(v, selections, coins.length > 0 ? coins : undefined),
        (selections) => useStadiumAction(v, selections, { coinResults: coins })
      );
    },
  };
}

const isCopyAttack = (attack: Attack) => attack.effects?.some((e) => e.type === AttackEffectType.CopyAttack) ?? false;

/**
 * Attack with the Active: confusion flip first (any attack, Metronome included), then the
 * attack with its coins. The runner ends the turn (attackedThisTurn) and resolves pendings.
 */
/** "Pokémon: Attack" of the acting side's Active attack (for labels / coverage stats). */
export function attackName(view: GameState, attackIndex: number): string {
  const active = view.playerActivePokemon;
  const card = active ? getEffectivePokemonCard(view, active) : undefined;
  const entry = active ? getAvailableAttacks(view, active)[attackIndex] : undefined;
  // A lower stage's attack through Recall: "Graveler: Placaje (Recall: Brock's Geodude)"
  const recalled = entry?.recalled ? ` (Recall: ${entry.fromCard})` : "";
  return card ? `${card.name}: ${entry?.attack.name ?? `#${attackIndex}`}${recalled}` : `#${attackIndex}`;
}

export function attackAction(attackIndex: number, rng: Rng, name = `#${attackIndex}`, { vermilionCoin = false } = {}): ViewAction {
  return {
    label: `attack ${name}${vermilionCoin ? " +stadium coin" : ""}`,
    run: (view) => {
      let state = view;
      const active = state.playerActivePokemon!;
      if (hasStatusCondition(active, StatusCondition.Confused)) {
        const confusion = resolveConfusionFlip(state, flipCoin(rng) === "heads", true);
        if (!confusion.canAttack) return confusion.state;
        state = confusion.state;
      }
      const attack = getAvailableAttacks(state, active)[attackIndex]?.attack;
      if (attack && isCopyAttack(attack)) {
        const defender = state.opponentActivePokemon!;
        const copyable = (getEffectivePokemonCard(state, defender)?.attacks ?? []).filter((a) => canExecuteMetronome(state, a) === null);
        if (copyable.length === 0) return endTurn({ ...state, attackedThisTurn: true }, true);
        const copied = pick(rng, copyable);
        const coins = flipAttackCoins(getAttackCoinPlan(state, copied), () => flipCoin(rng));
        return executeMetronome(state, copied, { coinResults: coins, skipEndTurn: true, skipDefenderPromotion: true });
      }
      // Vermilion City Gym's optional coin (still offered after the confusion flip)
      const withCoin = vermilionCoin && canUseVermilionCoin(state, attackIndex) === null;
      const coins = flipAttackCoins(getAttackCoinPlan(state, attackIndex, { vermilionCoin: withCoin }), () => flipCoin(rng));
      return executeAttack(state, attackIndex, {
        coinResults: coins,
        skipEndTurn: true,
        skipDefenderPromotion: true,
        ...(withCoin && { vermilionCoin: true }),
      });
    },
  };
}

/** Random Energy cards paying the Active's retreat cost, or null when it can't retreat now */
function retreatPayment(view: GameState, rng: Rng): string[] | null {
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
  return energyIds;
}

function retreatWith(energyIds: string[], benchIndex: number, rng: Rng): ViewAction {
  // Sinkhole (Dark Dugtrio): the retreating side flips the coins
  return {
    label: `retreat to bench #${benchIndex}`,
    run: (v) => executeRetreat(v, energyIds, benchIndex, { coinResults: flipFor(getRetreatCoinFlips(v), rng) }),
  };
}

function retreatAction(view: GameState, rng: Rng): ViewAction | null {
  const energyIds = retreatPayment(view, rng);
  if (!energyIds) return null;
  return retreatWith(energyIds, randomInt(rng, view.playerBench.length), rng);
}

/** Retreat the Active to a chosen Bench slot (random payment), or null when it can't */
export function retreatTo(view: GameState, benchIndex: number, rng: Rng): ViewAction | null {
  const energyIds = retreatPayment(view, rng);
  return energyIds ? retreatWith(energyIds, benchIndex, rng) : null;
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
      // Trainers played as Basics keep their name in the stats ("benchTrainer Mysterious Fossil")
      const label = card.kind === "trainer" ? `benchTrainer ${card.name}` : `bench ${card.name}`;
      add("bench", { label, run: (v) => playBasicPokemon(v, card.id, "bench") });
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
  if (canUseStadiumAction(view) === null) add("stadium", stadiumAction(view, rng, answer));
  const retreat = retreatAction(view, rng);
  if (retreat) add("retreat", retreat);
  const active = view.playerActivePokemon;
  if (active) {
    // Recall's attacks too (indices after the own ones)
    getAvailableAttacks(view, active).forEach(({ index }) => {
      if (canExecuteAttack(view, index) !== null) return;
      add("attack", attackAction(index, rng, attackName(view, index)));
      // Vermilion City Gym: the same attack with the Stadium's optional coin
      if (canUseVermilionCoin(view, index) === null) add("attack", attackAction(index, rng, attackName(view, index), { vermilionCoin: true }));
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
    const benched = rest.slice(0, randomInt(rng, Math.min(maxBenchSize(view, "player"), rest.length) + 1));
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
 * view (actor = "opponent") through executeAIAction. A plan that doesn't end the turn (a
 * Trainer / power that changed the hand) is followed by a new plan, like the frontend's loop.
 */
export function createGreedyPolicy(
  variant: "smart" | "legacy" = "smart",
  name: string = variant === "smart" ? "greedy" : "legacy"
): Policy & { aiViewAction(action: AIAction, view?: GameState): ViewAction } {
  // Both seats are bots: the other side's answers to the AI's Trainers come from an AI too
  const decideTurn = variant === "smart" ? (state: GameState) => decideOpponentTurn(state, { otherPlayerAnswersByAI: true, otherPlayerDuels: true }) : decideOpponentTurnLegacy;
  const decideSetup = variant === "smart" ? decideOpponentSetup : decideOpponentSetupLegacy;
  let planKey = "";
  let plan: AIAction[] = [];
  let planEndsTurn = true;
  let replans = 0;
  const newPlan = (view: GameState): AIAction[] => {
    const next = decideTurn(toAiView(view));
    planEndsTurn = next.some((a) => a.type === "attack" || a.type === "endTurn");
    return next;
  };
  const toAiView = (view: GameState) => swapSides(view);
  const aiViewAction = (action: AIAction, view?: GameState): ViewAction => ({
    label: `greedy ${action.type}${"trainerName" in action ? ` ${action.trainerName}` : ""}${"powerName" in action ? ` ${action.powerName}` : ""}${"stadiumName" in action ? ` ${action.stadiumName}` : ""}${
      action.type === "attack" && view ? ` ${attackName(view, action.attackIndex)}` : ""
    }`,
    run: (view) => swapSides(executeAIAction(toAiView(view), action)),
  });
  return {
    name,
    aiViewAction,
    setup(view) {
      return decideSetup(toAiView(view)).map((action) => aiViewAction(action));
    },
    nextAction(view, _rng, actionsThisTurn) {
      const key = `${view.turnNumber}`;
      if (key !== planKey || actionsThisTurn === 0) {
        planKey = key;
        replans = 0;
        plan = newPlan(view);
      } else if (plan.length === 0 && !planEndsTurn && replans < 20) {
        replans++;
        plan = newPlan(view);
      }
      const next = plan.shift();
      return next ? aiViewAction(next, view) : null;
    },
    answer: (step) => firstAnswer(step),
    // The smart AI's answers to attack choices (its own, and the defender's: Flee, Bench Guard...)
    attackChoice: variant === "smart" ? (attackerView) => answerAttackChoiceForAI(attackerView) : undefined,
    // The legacy AI promoted its first Benched Pokémon; the smart one chooses (it moves next
    // when it promotes off-turn, after the other side Knocked Out its Active)
    promotion: (view) => (variant === "smart" ? choosePromotion(knowledgeView(view), !view.isPlayerTurn) : 0),
    forceSwitch: variant === "smart" ? (view) => chooseForcedSwitch(knowledgeView(view)) : undefined,
    prize: () => 0,
  };
}
