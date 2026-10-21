import { describe, expect, it } from "vitest";
import {
  adventureBattleConfig,
  answerAttackChoiceForAI,
  answerOpponentTrainerStep,
  answerStepForAI,
  applyAIStep,
  createAdventureGame,
  createSeededRng,
  endTurn,
  executeAttack,
  flipAttackCoins,
  getAttackChoiceCoinPlan,
  nextAIStep,
  randomLegalPolicy,
  resolveAttackChoice,
  startPlayingPhase,
  stepForAnswerer,
  swapSides,
  withRandom,
  type AdventureContentLike,
  type AIPlanState,
  type CoinFlipResult,
  type GameState,
} from "../src";
import { GamePhase } from "../src/domain/constants";
import adventureJson from "./fixtures/adventure-1.json";
import { armedFor, attackIndex, inPlay, makeState } from "./helpers/state";

const ADVENTURE = adventureJson as unknown as AdventureContentLike;
const STARTERS = ["charmander", "squirtle", "bulbasaur"] as const;

type Harness = { state: GameState; aiPlan: AIPlanState | null; humanPlan: AIPlanState | null; steps: number };

/**
 * One move of the table like an adventure room: the AI seat through the driver; the human seat by
 * `humanPolicy` on its own turn ("random": randomLegalPolicy, "ai": the driver on the swapped view),
 * its answers by the driver on the swapped view, and its answers to choices of the AI's attack the
 * API way (resolveAttackChoice on the AI's view with skipEndTurn). Returns false when nothing moved.
 */
function move(h: Harness, flip: () => CoinFlipResult, rng: () => number, humanPolicy: "random" | "ai"): boolean {
  const state = h.state;
  if (state.gameResult !== null) return false;
  const ai = nextAIStep(state, h.aiPlan);
  if (ai) {
    h.state = applyAIStep(state, ai.step, { flip });
    h.aiPlan = ai.plan;
    h.steps++;
    return true;
  }
  // Both ready: the room flips the starting coin
  if ((state.gamePhase === GamePhase.Mulligan || state.gamePhase === GamePhase.Setup) && state.playerReady && state.opponentReady) {
    h.state = startPlayingPhase(state, flip());
    return true;
  }
  // The human answers a choice of the AI's attack: on the AI's view, skipEndTurn (the driver finishes it)
  if (!state.isPlayerTurn && state.pendingAttackChoice) {
    const aiView = swapSides(state);
    const answer = answerAttackChoiceForAI(aiView);
    const plan = getAttackChoiceCoinPlan(aiView, answer);
    const coinResults = plan ? flipAttackCoins(plan, flip) : undefined;
    h.state = swapSides(resolveAttackChoice(aiView, answer, { skipEndTurn: true, ...(coinResults && { coinResults }) }));
    return true;
  }
  if (!state.isPlayerTurn && state.pendingOpponentTrainerStep) {
    h.state = answerOpponentTrainerStep(state, answerStepForAI(stepForAnswerer(state.pendingOpponentTrainerStep.step)), { flip });
    return true;
  }
  const humanView = swapSides(state);
  if (humanPolicy === "random" && state.isPlayerTurn && state.gamePhase === GamePhase.Playing) {
    // Pending choices of the human's own turn first (the driver answers them for the human seat)
    const own = nextAIStep(humanView, h.humanPlan);
    const isOwnPending = !!own && own.step.kind !== "action" && own.step.kind !== "endTurn";
    if (!isOwnPending) {
      const action = state.turnNumber < 120 ? randomLegalPolicy.nextAction(state, rng, h.steps) : null;
      h.state = action ? action.run(state) : endTurn(state, true);
      h.steps++;
      return true;
    }
  }
  const human = nextAIStep(humanView, h.humanPlan);
  if (!human) return false;
  h.state = swapSides(applyAIStep(humanView, human.step, { flip }));
  h.humanPlan = human.plan;
  h.steps++;
  return true;
}

function playBattle(starter: string, battle: number, seed: number, options: { humanPolicy?: "random" | "ai"; difficulty?: "normal" | "hard" } = {}): GameState {
  const rng = createSeededRng(seed);
  const flip = (): CoinFlipResult => (rng.next() < 0.5 ? "heads" : "tails");
  return withRandom(rng.next, () => {
    const h: Harness = { state: createAdventureGame(adventureBattleConfig(ADVENTURE, starter, battle, { difficulty: options.difficulty })), aiPlan: null, humanPlan: null, steps: 0 };
    for (let guard = 0; guard < 20000 && h.state.gameResult === null; guard++) {
      if (h.state.turnNumber > 300) throw new Error(`turn cap: ${starter} vs battle ${battle} seed ${seed}`);
      if (!move(h, flip, rng.next, options.humanPolicy ?? "ai")) {
        throw new Error(`stuck: ${starter} vs battle ${battle} seed ${seed}, turn ${h.state.turnNumber}: ${h.state.events.slice(-5).map((e) => e.message).join(" | ")}`);
      }
    }
    return h.state;
  });
}

describe("AI driver: full adventure battles", () => {
  it("every starter against every rival deck ends with a result (driver vs driver)", () => {
    let seed = 1;
    for (const starter of STARTERS) {
      for (let battle = 1; battle <= 10; battle++) {
        const end = playBattle(starter, battle, seed++);
        expect(end.gameResult, `${starter} vs ${battle}`).not.toBeNull();
      }
      expect(playBattle(starter, 10, seed++, { difficulty: "hard" }).gameResult).not.toBeNull();
    }
  }, 300_000);

  it("ends with a random human for 20 seeds", () => {
    for (let seed = 100; seed < 120; seed++) {
      const starter = STARTERS[seed % 3];
      const battle = 1 + (seed % 10);
      expect(playBattle(starter, battle, seed, { humanPolicy: "random" }).gameResult, `${starter} vs ${battle} seed ${seed}`).not.toBeNull();
    }
  }, 300_000);

  it("is deterministic for a seed", () => {
    const a = playBattle("charmander", 7, 9);
    const b = playBattle("charmander", 7, 9);
    expect(a.turnNumber).toBe(b.turnNumber);
    expect(a.gameResult).toBe(b.gameResult);
    expect(a.events.map((e) => e.message)).toEqual(b.events.map((e) => e.message));
  }, 120_000);
});

describe("AI driver: when it acts", () => {
  it("null on the human's turn with nothing to answer", () => {
    const state = makeState({ player: { active: inPlay("Charmander") }, opponent: { active: inPlay("Rattata") } });
    expect(nextAIStep(state, null)).toBeNull();
  });

  it("null while the human must promote (the AI's turn waits)", () => {
    const state = makeState({ isPlayerTurn: false, player: { active: null, bench: [inPlay("Charmander")] }, opponent: { active: inPlay("Rattata") }, playerNeedsToPromote: true });
    expect(nextAIStep(state, null)).toBeNull();
  });

  it("null when the game is over", () => {
    expect(nextAIStep(makeState({ isPlayerTurn: false, gameResult: "victory", gamePhase: GamePhase.GameOver }), null)).toBeNull();
  });

  it("after the human's attack Knocks Out its Active, it promotes", () => {
    const charmander = armedFor(inPlay("Charmander"), "Ascuas");
    const state = makeState({ player: { active: charmander }, opponent: { active: inPlay("Rattata"), bench: [inPlay("Pidgey"), inPlay("Weedle")] } });
    const attacked = executeAttack(state, attackIndex(charmander, "Ascuas"), { coinResults: [], skipDefenderPromotion: true });
    expect(attacked.opponentNeedsToPromote).toBe(true);
    const next = nextAIStep(attacked, null);
    expect(next?.step.kind).toBe("promote");
    const promoted = applyAIStep(attacked, next!.step);
    expect(promoted.opponentActivePokemon).not.toBeNull();
    expect(promoted.opponentNeedsToPromote).toBe(false);
  });

  it("answers a choice of the human's attack whose chooser is the AI (Terror Strike)", () => {
    const arbok = armedFor(inPlay("Arbok", { set: "fossil" }), "Golpe Terrorífico");
    const state = makeState({ player: { active: arbok }, opponent: { active: inPlay("Machamp"), bench: [inPlay("Abra"), inPlay("Machop")] } });
    const attacked = executeAttack(state, attackIndex(arbok, "Golpe Terrorífico"), { coinResults: ["heads"] });
    expect(attacked.pendingAttackChoice?.step.chooser).toBe("opponent");
    const next = nextAIStep(attacked, null);
    expect(next?.step.kind).toBe("answerAttackChoice");
    const answered = applyAIStep(attacked, next!.step);
    expect(answered.pendingAttackChoice).toBeUndefined();
    expect(answered.opponentActivePokemon?.pokemon.name).not.toBe("Machamp");
  });

  it("the plan survives JSON mid-turn and the game continues identically", () => {
    const run = (roundTrip: boolean) => {
      const rng = createSeededRng(77);
      const flip = (): CoinFlipResult => (rng.next() < 0.5 ? "heads" : "tails");
      return withRandom(rng.next, () => {
        const h: Harness = { state: createAdventureGame(adventureBattleConfig(ADVENTURE, "squirtle", 3)), aiPlan: null, humanPlan: null, steps: 0 };
        for (let guard = 0; guard < 20000 && h.state.gameResult === null; guard++) {
          if (roundTrip) {
            h.state = JSON.parse(JSON.stringify(h.state));
            h.aiPlan = JSON.parse(JSON.stringify(h.aiPlan));
            h.humanPlan = JSON.parse(JSON.stringify(h.humanPlan));
          }
          if (!move(h, flip, rng.next, "ai")) throw new Error("stuck");
        }
        return h.state;
      });
    };
    const plain = run(false);
    const persisted = run(true);
    expect(persisted.gameResult).toBe(plain.gameResult);
    expect(persisted.events.map((e) => e.message)).toEqual(plain.events.map((e) => e.message));
  }, 120_000);
});
