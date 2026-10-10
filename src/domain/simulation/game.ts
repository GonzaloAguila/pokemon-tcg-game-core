/**
 * Headless game runner: two policies play a complete game (mulligans, setup, opening coin,
 * turns, prizes, promotions, every pending state on both sides, deck-out, turn cap), with
 * the invariants checked after every action.
 *
 * The state is kept in side A's perspective ("player" = A). Each action runs on the acting
 * side's view (that side as "player", via swapSides) and is converted back.
 */

import type { GameState, GameEvent } from "@/lib/gameState";
import {
  advanceToSetup,
  applyForceSwitch,
  applySelfSwitch,
  doMulligan,
  endTurn,
  executeBenchDamage,
  executeDeckSearch,
  hasBasicPokemon,
  initializeMultiplayerGame,
  promoteActivePokemon,
  resolveAttackChoice,
  setPlayerReady,
  skipPendingSwitch,
  startGame,
  startPlayingPhase,
  takePrize,
} from "@/lib/gameState";
import { isPokemonCard } from "@/domain/cards";
import { GamePhase, PokemonStage } from "@/domain/constants";
import type { Deck } from "@/domain/decks";
import { swapSides } from "@/domain/board";
import type { SelectionStep } from "@/domain/effects";
import { checkInvariants, ownedCardIds } from "./invariants";
import { flipCoin, withRandom, type Rng } from "./rng";
import type { Policy, ViewAction } from "./policies";

export type SideId = "A" | "B";

export type GameOptions = {
  /** Drives every random choice; Math.random is replaced by it during the game */
  rng: Rng;
  policyA: Policy;
  policyB: Policy;
  /** Turn cap (a game reaching it is reported as a failure: games must end). Default 300 */
  maxTurns?: number;
  /** Actions allowed in one turn before it is reported as stuck. Default 150 */
  maxActionsPerTurn?: number;
};

export type GameOutcome = {
  winner: SideId;
  reason: "prizes" | "no-pokemon" | "deck-out";
  turns: number;
  actions: number;
  /** How many times each kind of action ran (Trainer / power names included) */
  actionCounts: Record<string, number>;
};

/** A violated invariant or an unexpected exception, with what is needed to replay it. */
export class SimulationFailure extends Error {
  constructor(
    readonly problem: string,
    readonly action: string,
    readonly lastEvents: string[],
    readonly turn: number,
    /** State (side A's perspective) when it failed, for debugging */
    readonly state?: GameState
  ) {
    super(`${problem} (turn ${turn}, after "${action}")`);
    this.name = "SimulationFailure";
  }
}

const EVENTS_KEPT = 200;

/**
 * "playTrainer Bill" / "usePower Heal" / "attack Kabutops: Absorber" keep the card (and attack);
 * other labels keep their first word(s)
 */
function actionKind(label: string): string {
  if (label.startsWith("attack ") || label.startsWith("greedy attack ")) return label.replace(/^greedy /, "");
  if (label.startsWith("benchTrainer ") || label.startsWith("discardFromPlay ")) return label;
  if (label.startsWith("playTrainer ") || label.startsWith("greedy playTrainer ")) return label.replace(/^greedy /, "");
  if (label.startsWith("usePower ")) return label.replace(/ \(.*\)$/, "");
  if (label.startsWith("greedy ")) return label.split(" ").slice(0, 2).join(" ");
  return label.split(/ #| [A-Z]|\d/)[0].trim();
}

class GameRunner {
  state: GameState;
  actions = 0;
  actionsThisTurn = 0;
  readonly actionCounts: Record<string, number> = {};
  private lastAction = "start";
  private readonly recentActions: string[] = [];
  private readonly initialIds: { player: string[]; opponent: string[] };

  constructor(
    initial: GameState,
    private readonly options: Required<GameOptions>
  ) {
    this.state = initial;
    this.initialIds = {
      player: [...ownedCardIds(initial, "player")].sort(),
      opponent: [...ownedCardIds(initial, "opponent")].sort(),
    };
  }

  policy(side: SideId): Policy {
    return side === "A" ? this.options.policyA : this.options.policyB;
  }

  /** "player" side of the A-perspective state for a side id */
  view(side: SideId): GameState {
    return side === "A" ? this.state : swapSides(this.state);
  }

  actingSide(): SideId {
    return this.state.isPlayerTurn ? "A" : "B";
  }

  other(side: SideId): SideId {
    return side === "A" ? "B" : "A";
  }

  fail(problem: string): never {
    // Collapse repeated lines (a stuck loop repeats the same event)
    const messages = this.state.events.map((e: GameEvent) => e.message).filter((m, i, all) => m !== all[i - 1]);
    throw new SimulationFailure(
      problem,
      `${this.lastAction} | previous: ${this.recentActions.slice(-12, -1).join(" > ")}`,
      messages.slice(-20),
      this.state.turnNumber,
      this.state
    );
  }

  /** Apply an action on `side`'s view, convert back, check invariants. */
  apply(side: SideId, action: ViewAction): void {
    const before = this.state;
    this.lastAction = `${side}: ${action.label}`;
    if (this.recentActions[this.recentActions.length - 1] !== this.lastAction) {
      this.recentActions.push(this.lastAction);
      if (this.recentActions.length > 30) this.recentActions.shift();
    }
    let next: GameState;
    try {
      const result = action.run(this.view(side));
      next = side === "A" ? result : swapSides(result);
    } catch (error) {
      this.fail(`exception: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`);
    }
    if (next.events.length > EVENTS_KEPT) next = { ...next, events: next.events.slice(-EVENTS_KEPT) };
    this.state = next;
    this.actions++;
    const kind = actionKind(action.label);
    this.actionCounts[kind] = (this.actionCounts[kind] ?? 0) + 1;
    if (next.turnNumber !== before.turnNumber) this.actionsThisTurn = 0;
    else this.actionsThisTurn++;
    const problems = checkInvariants(next, { initialIds: this.initialIds, before });
    if (problems.length > 0) this.fail(problems.join("; "));
  }

  /** The acting side's answer to a selection step (deck search, bench damage). */
  answer(side: SideId, step: SelectionStep): string[] {
    const chosen = this.policy(side).answer(step, this.options.rng);
    if (!chosen) this.fail(`no valid answer for "${step.title}"`);
    return chosen;
  }

  /**
   * Resolve one pending decision (either side), or end a finished turn. Returns false when
   * nothing is pending and the acting side may play normally.
   */
  resolvePending(): boolean {
    const actor = this.actingSide();
    const other = this.other(actor);
    const view = this.view(actor);
    const rng = this.options.rng;

    if (view.pendingForceSwitch) {
      const bench = view.opponentBench;
      if (bench.length === 0) this.apply(actor, { label: "skip force switch", run: skipPendingSwitch });
      else {
        const index = this.policy(actor).promotion(swapSides(view), rng);
        this.apply(actor, { label: `force switch #${index}`, run: (v) => applyForceSwitch(v, index) });
      }
      return true;
    }
    if (view.pendingSelfSwitch) {
      if (view.playerBench.length === 0) this.apply(actor, { label: "skip self switch", run: skipPendingSwitch });
      else {
        const index = this.policy(actor).promotion(view, rng);
        this.apply(actor, { label: `self switch #${index}`, run: (v) => applySelfSwitch(v, index) });
      }
      return true;
    }
    if (view.pendingDeckSearch) {
      const filter = view.pendingDeckSearch.filter;
      const valid = view.playerDeck.filter(
        (c) =>
          isPokemonCard(c) &&
          c.stage === PokemonStage.Basic &&
          (!filter.names?.length || filter.names.includes(c.name)) &&
          (!filter.type || c.types.includes(filter.type))
      );
      const chosen = valid.length === 0
        ? null
        : this.answer(actor, {
            title: "Búsqueda",
            description: "Pokémon Básico del mazo",
            options: valid.map((c) => ({ id: c.id, label: c.name })),
            maxSelections: 1,
            minSelections: 0,
          })[0] ?? null;
      this.apply(actor, { label: `deck search ${chosen ?? "none"}`, run: (v) => executeDeckSearch(v, chosen) });
      return true;
    }
    if (view.pendingBenchDamageSelection) {
      const pending = view.pendingBenchDamageSelection;
      const bench = pending.targetSide === "opponent" ? view.opponentBench : view.playerBench;
      const targets = bench.filter((p) =>
        !pending.matchDefenderType || !isPokemonCard(p.pokemon) || p.pokemon.types.some((t) => pending.defenderTypes?.includes(t))
      );
      const chosen = targets.length === 0 ? [] : this.answer(actor, {
        title: "Daño a la banca",
        description: "Pokémon que reciben daño",
        options: targets.map((p) => ({ id: p.pokemon.id, label: p.pokemon.name })),
        maxSelections: Math.min(pending.maxTargets, targets.length),
        minSelections: Math.min(pending.minTargets ?? 1, targets.length),
      });
      this.apply(actor, { label: `bench damage ${chosen.length}`, run: (v) => executeBenchDamage(v, chosen) });
      return true;
    }
    if (view.pendingAttackChoice) {
      // The attack's choice: the step says who answers; it always resolves in the attacker's view
      const step = view.pendingAttackChoice.step;
      const chooser = step.chooser === "opponent" ? other : actor;
      const chosen = this.answer(chooser, step);
      this.apply(actor, {
        label: `attack choice ${step.title} (${step.chooser ?? "self"})`,
        run: (v) => resolveAttackChoice(v, chosen, { skipEndTurn: true }),
      });
      return true;
    }
    if (view.playerCanTakePrize) {
      const index = this.policy(actor).prize(view, rng);
      this.apply(actor, { label: `take prize #${index}`, run: (v) => takePrize(v, index, true, false) });
      return true;
    }
    if (view.opponentCanTakePrize) {
      const otherView = this.view(other);
      const index = this.policy(other).prize(otherView, rng);
      this.apply(other, { label: `take prize #${index}`, run: (v) => takePrize(v, index, true, false) });
      return true;
    }
    if (view.playerNeedsToPromote) {
      const index = this.policy(actor).promotion(view, rng);
      this.apply(actor, { label: `promote #${index}`, run: (v) => promoteActivePokemon(v, index, true) });
      return true;
    }
    if (view.opponentNeedsToPromote) {
      const index = this.policy(other).promotion(this.view(other), rng);
      this.apply(other, { label: `promote #${index}`, run: (v) => promoteActivePokemon(v, index, true) });
      return true;
    }
    if (view.attackedThisTurn || view.checkupDoneOnTurn === view.turnNumber) {
      this.apply(actor, { label: "end turn (after attack / checkup)", run: (v) => endTurn(v, true) });
      return true;
    }
    return false;
  }

  isOver(): boolean {
    return this.state.gamePhase === GamePhase.GameOver;
  }

  play(): GameOutcome {
    const { rng, maxTurns, maxActionsPerTurn } = this.options;

    // Mulligans (classic: reveal and redraw until there is a Basic)
    for (const side of ["A", "B"] as const) {
      for (let mulligans = 0; !hasBasicPokemon(this.view(side).playerHand); mulligans++) {
        if (mulligans > 30) this.fail("no Basic Pokémon after 30 mulligans");
        this.apply(side, { label: "mulligan", run: (v) => doMulligan(v, true) });
      }
    }
    this.apply("A", { label: "advance to setup", run: advanceToSetup });
    for (const side of ["A", "B"] as const) {
      for (const action of this.policy(side).setup(this.view(side), rng)) this.apply(side, action);
      if (!this.view(side).playerActivePokemon) this.fail(`side ${side} placed no Active Pokémon in setup`);
      this.apply(side, { label: "ready", run: (v) => setPlayerReady(v, true) });
    }
    const opening = flipCoin(rng);
    this.apply("A", { label: `opening coin ${opening}`, run: (v) => startPlayingPhase(v, opening) });

    while (!this.isOver()) {
      if (this.state.turnNumber > maxTurns) this.fail(`turn cap ${maxTurns} reached`);
      if (this.actionsThisTurn > maxActionsPerTurn) this.fail(`more than ${maxActionsPerTurn} actions in one turn`);
      if (this.resolvePending()) continue;
      const actor = this.actingSide();
      const action = this.policy(actor).nextAction(this.view(actor), rng, this.actionsThisTurn);
      if (action) this.apply(actor, action);
      else this.apply(actor, { label: "end turn", run: (v) => endTurn(v, true) });
    }

    const winner: SideId = this.state.gameResult === "victory" ? "A" : "B";
    const winnerView = this.view(winner);
    const loserView = this.view(this.other(winner));
    const reason: GameOutcome["reason"] =
      winnerView.playerPrizes.length === 0 ? "prizes" : loserView.playerDeck.length === 0 ? "deck-out" : "no-pokemon";
    return { winner, reason, turns: this.state.turnNumber, actions: this.actions, actionCounts: this.actionCounts };
  }
}

/**
 * Play a complete headless game between two decks. Throws SimulationFailure on any
 * exception or invariant violation. Deterministic for a given rng seed.
 */
export function playAIGame(deckA: Deck, deckB: Deck, options: GameOptions): GameOutcome {
  const settings: Required<GameOptions> = { maxTurns: 300, maxActionsPerTurn: 150, ...options };
  return withRandom(settings.rng, () => {
    const initial = startGame(initializeMultiplayerGame(deckA, deckB));
    return new GameRunner(initial, settings).play();
  });
}
