/**
 * `SelectionStep.answerTimeLimitMs`: steps whose answer could be looked up outside the game (the
 * Blaine's Quiz guesses: a Pokémon's length, a card's name) give their answerer only that long;
 * consumers then answer `defaultSelection` for them (the MP server's answer clock, the
 * single-player countdown of the human's guess). Every other step keeps the normal clocks.
 */
import { describe, it, expect } from "vitest";
import { getTrainerSteps, stepForAnswerer, QUIZ_ANSWER_TIME_LIMIT_MS, type SelectionStep } from "@/domain/effects";
import { swapSides } from "@/domain/board";
import { decideOpponentTurn, executeAIAction } from "@/domain/ai";
import { makeState, inPlay, gameCard } from "./helpers/state";
import type { GameState } from "@/lib/gameState";

const fill = (n: number) => Array.from({ length: n }, () => gameCard("Grass Energy", "base"));

function withHand(hand: ReturnType<typeof gameCard>[]): GameState {
  return makeState({
    player: { active: inPlay("Machop"), hand, deck: fill(20) },
    opponent: { active: inPlay("Onix"), deck: fill(20) },
  });
}

/** Every step the Trainer asks along `answers` (step i is asked with the first i answers). */
function steps(state: GameState, cardId: string, answers: string[][]): (SelectionStep | null)[] {
  return answers.map((_, i) => getTrainerSteps(state, cardId, answers.slice(0, i))).concat([getTrainerSteps(state, cardId, answers)]);
}

describe("Blaine's Quiz guesses are timed", () => {
  it("the limit is 10 seconds", () => {
    expect(QUIZ_ANSWER_TIME_LIMIT_MS).toBe(10_000);
  });

  it("Blaine's Quiz #1: only the opponent's length guess is timed", () => {
    const quiz = gameCard("Blaine's Quiz #1", "gym-heroes");
    const abra = gameCard("Abra", "base");
    const [pick, guess] = steps(withHand([quiz, abra]), quiz.id, [[abra.id]]);
    expect(pick?.answerTimeLimitMs).toBeUndefined();
    expect(guess?.chooser).toBe("opponent");
    expect(guess?.answerTimeLimitMs).toBe(10_000);
    expect(guess?.defaultSelection).toBeDefined();
    expect(stepForAnswerer(guess!).answerTimeLimitMs).toBe(10_000);
  });

  it("Blaine's Quiz #2: only the opponent's card-kind guess is timed", () => {
    const quiz = gameCard("Blaine's Quiz #2", "gym-challenge");
    const abra = gameCard("Abra", "base");
    const [pick, guess] = steps(withHand([quiz, abra]), quiz.id, [[abra.id]]);
    expect(pick?.answerTimeLimitMs).toBeUndefined();
    expect(guess?.chooser).toBe("opponent");
    expect(guess?.answerTimeLimitMs).toBe(10_000);
    expect(guess?.defaultSelection).toBeDefined();
  });

  it("Blaine's Quiz #3: only the opponent's name guess is timed (not the attack the player names)", () => {
    const quiz = gameCard("Blaine's Quiz #3", "gym-challenge");
    const abra = gameCard("Abra", "base");
    const [pick, attack, guess] = steps(withHand([quiz, abra]), quiz.id, [[abra.id], ["0"]]);
    expect(pick?.answerTimeLimitMs).toBeUndefined();
    expect(attack?.answerTimeLimitMs).toBeUndefined();
    expect(guess?.chooser).toBe("opponent");
    expect(guess?.answerTimeLimitMs).toBe(10_000);
    expect(guess?.defaultSelection).toBeDefined();
  });

  it("other steps the opponent answers keep the normal clock (Erika, Lt. Surge's Treaty)", () => {
    const erika = gameCard("Erika", "gym-heroes");
    expect(getTrainerSteps(withHand([erika]), erika.id, [["1"]])?.answerTimeLimitMs).toBeUndefined();
    const treaty = gameCard("Lt. Surge's Treaty", "gym-heroes");
    expect(getTrainerSteps(withHand([treaty]), treaty.id, [])?.answerTimeLimitMs).toBeUndefined();
  });

  it("single-player: the AI's Quiz #3 waits for the human's guess with the limit on its step", () => {
    const ai = swapSides(
      makeState({
        turnNumber: 6,
        player: { active: inPlay("Machop"), hand: [gameCard("Blaine's Quiz #3", "gym-challenge"), gameCard("Kadabra", "base")], deck: fill(30) },
        opponent: { active: inPlay("Onix"), deck: fill(30), hand: fill(5) },
      })
    );
    const action = decideOpponentTurn(ai, { otherPlayerAnswersByHuman: true }).find((a) => a.type === "playTrainer" && a.trainerName === "Blaine's Quiz #3");
    expect(action).toBeDefined();
    const waiting = executeAIAction(ai, action!);
    expect(waiting.pendingOpponentTrainerStep?.step.answerTimeLimitMs).toBe(10_000);
  });
});
