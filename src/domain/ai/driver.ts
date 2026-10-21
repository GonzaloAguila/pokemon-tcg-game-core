/**
 * Headless AI driver: what the AI seat ("opponent") does now, one atomic step at a time, for a
 * consumer that runs the game itself (the API's adventure rooms). A pure port of the frontend's
 * single-player loop (`useAIOpponent.ts` + `model/ai-setup.ts`) — same decisions, same order —
 * with the coins coming from the caller (`applyAIStep(..., { flip, onCoins })`).
 *
 * The state is the human's view ("player" = human, "opponent" = the AI). Usage:
 *
 * ```ts
 * let plan: AIPlanState | null = null;
 * for (let next = nextAIStep(state, plan); next; next = nextAIStep(state, plan)) {
 *   // wait next.step.delay ms, then (inside withRandom(room.rng), synchronously):
 *   state = applyAIStep(state, next.step, { flip, onCoins });
 *   plan = next.plan; // plain JSON: persist it with the state
 * }
 * ```
 *
 * `nextAIStep` is pure: the step it returns is applied only by `applyAIStep`; asking twice without
 * applying returns the same step. Null when the human must act (their turn, their promotion, a
 * step they answer, both players ready and the starting coin to flip) or the game is over.
 */

import type { GameState } from "@/lib/gameState";
import {
  canMulligan,
  doMulligan,
  endTurn,
  flipAttackCoins,
  getAttackChoiceCoinPlan,
  promoteActivePokemon,
  resolveAttackChoice,
  setPlayerReady,
  takePrize,
} from "@/lib/gameState";
import { hasBasicPokemon } from "@/lib/gameState";
import { GamePhase, type CoinFlipResult } from "@/domain/constants";
import { swapSides } from "@/domain/board";
import { aiDuelPick, submitDuelPick } from "@/domain/duel/rps";
import { declineChaosGymOffer } from "@/domain/effects";
import { IllegalActionError } from "@/shared/errors";
import type { CoinFlipper } from "@/domain/effects/types";
import type { AIAction } from "./types";
import { decideOpponentPromotion, decideOpponentSetup, decideOpponentTurn, type DecideOpponentTurnOptions } from "./smart";
import { answerAttackChoiceForAI } from "./attackAnswers";
import { resolveBenchTrimForAI, resolveOwnPowerChoice } from "./pending";
import {
  answerChaosGymOfferForAI,
  attackCoinFlippers,
  executeAIAction,
  finishAIAttackAfterReaction,
  type AIExecutionOptions,
} from "./executor";

/** Safety cap on the plans of one AI turn (each hand-changing Trainer / power gets its own plan; frontend MAX_AI_PLANS_PER_TURN). */
export const MAX_AI_PLANS_PER_TURN = 20;

/** Safety cap on the AI's mulligans (frontend MAX_OPPONENT_MULLIGANS). */
export const MAX_AI_MULLIGANS = 500;

/**
 * The AI's plan between steps (plain JSON — persist it with the state). `turnNumber`: the AI turn
 * it belongs to (a plan of another turn is dropped); `queue`: the planned actions not applied yet;
 * `plans`: plans decided this turn; `eventsAtPlan`: events when the last plan was decided (a plan
 * that added none changed nothing: the turn ends); `finishedMarker`: the log index of the last
 * "…: el defensor debe elegir" line whose attack the driver already finished after the human's
 * answer; `mulligans`: AI mulligans so far (capped).
 */
export type AIPlanState = {
  turnNumber: number;
  queue: AIAction[];
  plans: number;
  eventsAtPlan: number | null;
  finishedMarker?: number;
  mulligans?: number;
  /** Events when a forced endTurn was last applied (it changed nothing: the driver waits instead of repeating it) */
  endTurnTriedAt?: number;
};

/** The line an attack writes when it leaves a choice to the defending player (executor DEFENDER_CHOOSES). */
const DEFENDER_CHOOSES = /: el defensor debe elegir$/;

/**
 * The log index of the last "…: el defensor debe elegir" line of the current turn (the turn starts
 * at its "Turno N - …" line), or -1.
 */
function defenderChoiceMarker(state: GameState): number {
  const turnStart = `Turno ${state.turnNumber} - `;
  for (let i = state.events.length - 1; i >= 0; i--) {
    const message = state.events[i].message;
    if (DEFENDER_CHOOSES.test(message)) return i;
    if (message.startsWith(turnStart) || message === "¡Comienza el turno 1!") return -1;
  }
  return -1;
}

/**
 * One atomic thing the AI does. `delay`: the pause (ms) the consumer waits before applying it, so
 * the human can follow; `actionType` (`aiStepActionType`) names it for animations.
 */
export type AIStep =
  | { kind: "mulligan"; delay: number }
  /** Its Basics into play (decideOpponentSetup), then ready (setPlayerReady). */
  | { kind: "setup"; delay: number }
  /** Its Prize after a Knock Out (the first card); ends its own turn like the frontend does. */
  | { kind: "takePrize"; delay: number }
  | { kind: "promote"; benchIndex: number; delay: number }
  /** A choice of the human's attack the AI answers (Terror Strike, Flee, Bench Guard, Ninja Trick...). */
  | { kind: "answerAttackChoice"; delay: number }
  /** A choice of the AI's own attack the human answered: the AI finishes its attack (finishAIAttackAfterReaction from `eventsBefore`). */
  | { kind: "finishAttack"; eventsBefore: number; delay: number }
  | { kind: "trimBench"; delay: number }
  | { kind: "answerChaosOffer"; delay: number }
  | { kind: "duelPick"; delay: number }
  /** Its own "when you play it from your hand" power left pending (normally the executor resolves it). */
  | { kind: "powerChoice"; delay: number }
  /** One planned action of its turn (executeAIAction). */
  | { kind: "action"; action: AIAction; delay: number }
  /** Its turn ends: the plan said so, or a plan changed nothing / too many plans (`forced`). */
  | { kind: "endTurn"; forced: boolean; delay: number };

export type AIStepKind = AIStep["kind"];

/** What `applyAIStep` reports and flips: the executor's coin source (`flip`, `onCoins`). */
export type AIStepOptions = AIExecutionOptions;

const DEFAULT_TURN_OPTIONS: DecideOpponentTurnOptions = { otherPlayerAnswersByHuman: true, otherPlayerDuels: true };

/** The type a consumer animates for a step: the action's type for planned actions, else the step's kind. */
export function aiStepActionType(step: AIStep): string {
  return step.kind === "action" ? step.action.type : step.kind;
}

function isSetupPhase(state: GameState): boolean {
  return state.gamePhase === GamePhase.Mulligan || state.gamePhase === GamePhase.Setup;
}

/** The human must act first (their answer to something the AI's turn waits on). */
function waitsForHuman(state: GameState): boolean {
  if (state.pendingBenchTrim?.length && state.pendingBenchTrim[0].side !== "opponent") return true;
  if (state.pendingDuel && state.pendingDuel.playerPick === null && state.pendingDuel.opponentPick !== null) return true;
  if (state.pendingOpponentTrainerStep) return true;
  if (state.pendingChaosOffer && !(state.pendingChaosOffer.offeredTo === "opponent" && !state.pendingChaosOffer.accepted)) return true;
  // The human's Prize (Knocked Out by the AI's own attack, Confusion...) or promotion
  return state.playerCanTakePrize || state.playerNeedsToPromote;
}

/** Choices of the acting side's own attack still open (they belong to the side whose turn it is). */
function hasOwnAttackPending(state: GameState): boolean {
  return !!(state.pendingForceSwitch || state.pendingSelfSwitch || state.pendingDeckSearch || state.pendingBenchDamageSelection);
}

/** The AI still has to pick in Misty's Duel. */
function aiMustPickDuel(state: GameState): boolean {
  return !!state.pendingDuel && state.pendingDuel.opponentPick === null;
}

function aiMustAnswerChaosOffer(state: GameState): boolean {
  const offer = state.pendingChaosOffer;
  return !!offer && offer.offeredTo === "opponent" && !offer.accepted;
}

/** A fresh plan for the AI turn of `state` (or the given plan when it is that turn's). */
function planFor(state: GameState, plan: AIPlanState | null): AIPlanState {
  return plan && plan.turnNumber === state.turnNumber && !state.isPlayerTurn
    ? plan
    : { turnNumber: state.turnNumber, queue: [], plans: 0, eventsAtPlan: null };
}

/**
 * The next step of the AI seat ("opponent") on the human's view, with the plan to keep after
 * applying it; null when the human must act or the game is over. Order: opening (mulligans, setup,
 * ready) → its Prize → its promotion → answers it owes on the human's turn (attack choice, Bench
 * trim, Chaos Gym offer, Misty's Duel) → its turn (Bench trim, duel pick, finishing an attack the
 * human answered, then the planned actions: a plan that ends without `attack`/`endTurn` is followed
 * by a new one; a plan that changed nothing, or the 20th, ends the turn). `options`: decideOpponentTurn's
 * (default: the human answers the AI's Trainer steps and duels).
 */
export function nextAIStep(
  state: GameState,
  plan: AIPlanState | null,
  options: DecideOpponentTurnOptions = DEFAULT_TURN_OPTIONS
): { step: AIStep; plan: AIPlanState | null } | null {
  if (state.gameResult !== null || state.gamePhase === GamePhase.GameOver) return null;

  if (isSetupPhase(state)) {
    if (state.opponentReady) return null;
    const mulligans = plan?.mulligans ?? 0;
    if (!state.opponentActivePokemon && canMulligan(state, false) === null) {
      // A deck without any Basic can never start: the consumer sees null (the opening stalls)
      if (!hasBasicPokemon([...state.opponentHand, ...state.opponentDeck]) || mulligans >= MAX_AI_MULLIGANS) return null;
      return { step: { kind: "mulligan", delay: 300 }, plan: { turnNumber: 0, queue: [], plans: 0, eventsAtPlan: null, mulligans: mulligans + 1 } };
    }
    return { step: { kind: "setup", delay: 800 }, plan: null };
  }

  if (state.gamePhase !== GamePhase.Playing) return null;

  // The human answered a choice of the AI's attack (resumed on the AI's view with skipEndTurn): the
  // AI finishes it first — its own choices, its promotion, the log reworded, its Prize left pending,
  // the turn ended — like the frontend's finishAIAttackAfterReaction, once per such answer
  // (also when the answer left the AI's own choices of that attack pending: switch, search, Bench damage)
  if (!state.isPlayerTurn && state.attackedThisTurn && !state.pendingAttackChoice) {
    const current = planFor(state, plan);
    const marker = defenderChoiceMarker(state);
    const unfinished = marker !== -1 && marker !== current.finishedMarker;
    if (unfinished || hasOwnAttackPending(state)) {
      return {
        step: { kind: "finishAttack", eventsBefore: unfinished ? marker + 1 : state.events.length, delay: 500 },
        plan: { ...current, finishedMarker: unfinished ? marker : current.finishedMarker },
      };
    }
  }

  if (state.opponentCanTakePrize && state.opponentPrizes.length > 0) return { step: { kind: "takePrize", delay: 500 }, plan };
  if (state.opponentNeedsToPromote && state.opponentBench.some((p) => p != null)) {
    return { step: { kind: "promote", benchIndex: decideOpponentPromotion(state, !state.isPlayerTurn), delay: 700 }, plan };
  }

  if (state.isPlayerTurn) {
    // The human's turn: only the answers the AI owes
    if (state.pendingBenchTrim?.[0]?.side === "opponent") return { step: { kind: "trimBench", delay: 700 }, plan: null };
    if (aiMustAnswerChaosOffer(state)) return { step: { kind: "answerChaosOffer", delay: 700 }, plan: null };
    if (state.pendingAttackChoice?.step.chooser === "opponent") return { step: { kind: "answerAttackChoice", delay: 700 }, plan: null };
    if (aiMustPickDuel(state)) return { step: { kind: "duelPick", delay: 500 }, plan: null };
    return null;
  }

  // The AI's turn
  let current = planFor(state, plan);
  if (state.pendingBenchTrim?.[0]?.side === "opponent") return { step: { kind: "trimBench", delay: 700 }, plan: current };
  if (aiMustPickDuel(state)) return { step: { kind: "duelPick", delay: 500 }, plan: current };
  // A choice of its attack the human answers (Terror Strike, Flee...): wait for the answer
  if (state.pendingAttackChoice) return null;
  if (waitsForHuman(state)) return null;
  if (state.pendingPowerChoice) return { step: { kind: "powerChoice", delay: 500 }, plan: current };

  if (current.queue.length > 0) {
    const [action, ...rest] = current.queue;
    return { step: { kind: "action", action, delay: action.delay || 500 }, plan: { ...current, queue: rest } };
  }

  const stalled = current.eventsAtPlan !== null && (state.events.length === current.eventsAtPlan || current.plans >= MAX_AI_PLANS_PER_TURN);
  if (stalled) {
    // endTurn refused (something still pending that this driver doesn't answer): never spin on it
    if (current.endTurnTriedAt === state.events.length) return null;
    return { step: { kind: "endTurn", forced: true, delay: 500 }, plan: { ...current, endTurnTriedAt: state.events.length } };
  }

  const actions = decideOpponentTurn(state, options);
  current = { ...current, plans: current.plans + 1, eventsAtPlan: state.events.length };
  if (actions.length === 0) return { step: { kind: "endTurn", forced: false, delay: 800 }, plan: current };
  const [first, ...rest] = actions;
  return { step: { kind: "action", action: first, delay: Math.max(800, first.delay || 0) }, plan: { ...current, queue: rest } };
}


/** Coins of a choice of the human's attack the AI answered (Ninja Trick): the attacker is the human. */
function invertFlippers(flippers: CoinFlipper[]): CoinFlipper[] {
  return flippers.map((f) => (f === "self" ? "opponent" : "self"));
}

/**
 * Apply a step from `nextAIStep` (human's view in, human's view out). Every coin comes from
 * `options.flip` and is reported to `options.onCoins` (flippedBy relative to the AI). An action the
 * engine refuses leaves the state as it was (the next `nextAIStep` replans or ends the turn).
 */
export function applyAIStep(state: GameState, step: AIStep, options: AIStepOptions = {}): GameState {
  const flip = options.flip ?? ((): CoinFlipResult => (Math.random() < 0.5 ? "heads" : "tails"));
  switch (step.kind) {
    case "mulligan":
      return canMulligan(state, false) === null ? doMulligan(state, false) : state;

    case "setup": {
      // The best Basic as its Active and the rest on the Bench (only the Bench when it already has an Active)
      const placed = decideOpponentSetup(state).reduce((current, action) => executeAIAction(current, action, options), state);
      return placed.opponentActivePokemon ? setPlayerReady(placed, false) : placed;
    }

    case "takePrize":
      // The last owed Prize ends a turn that is already over (takePrize checks it)
      return takePrize(state, 0, false, true);

    case "promote":
      return promoteActivePokemon(state, step.benchIndex, false);

    case "answerAttackChoice": {
      const pending = state.pendingAttackChoice;
      if (!pending || pending.step.chooser !== "opponent") return state;
      const answer = answerAttackChoiceForAI(state);
      // Koga's Ninja Trick: the human's attack's coins come with the answer
      const coinPlan = getAttackChoiceCoinPlan(state, answer);
      if (!coinPlan) return resolveAttackChoice(state, answer);
      const coinResults = flipAttackCoins(coinPlan, flip);
      if (coinResults.length > 0) {
        options.onCoins?.({ purpose: "attack", label: pending.reaction?.powerName ?? pending.step.title, results: coinResults, flippedBy: invertFlippers(attackCoinFlippers(coinPlan, coinResults)) });
      }
      return resolveAttackChoice(state, answer, { coinResults });
    }

    case "finishAttack":
      return finishAIAttackAfterReaction(state, step.eventsBefore, options);

    case "trimBench":
      return resolveBenchTrimForAI(state, "opponent");

    case "answerChaosOffer":
      try {
        return answerChaosGymOfferForAI(state, options);
      } catch (error) {
        if (error instanceof IllegalActionError) return declineChaosGymOffer(state);
        throw error;
      }

    case "duelPick":
      return aiMustPickDuel(state) ? submitDuelPick(state, "opponent", aiDuelPick()) : state;

    case "powerChoice":
      return state.pendingPowerChoice ? swapSides(resolveOwnPowerChoice(swapSides(state))) : state;

    case "action":
      if (state.isPlayerTurn || state.gameResult !== null) return state;
      return executeAIAction(state, step.action, options);

    case "endTurn":
      return state.isPlayerTurn ? state : endTurn(state);
  }
}
