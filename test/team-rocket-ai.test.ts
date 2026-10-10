/**
 * The AI with Team Rocket cards: it answers its own attack / power choices, leaves the
 * opponent's choices pending, and answerStepForAI answers steps where it is the chooser.
 */
import { describe, it, expect } from "vitest";
import { executeAIAction, decideOpponentTurn, answerStepForAI } from "@/domain/ai";
import { getTrainerSteps } from "@/domain/effects";
import { EnergyType } from "@/domain/constants";
import { makeState, inPlay, gameCard, armedFor, attackIndex, energy } from "./helpers/state";

const rocket = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "rocket", ...opts });

/** Human = "player", AI = "opponent", AI's turn. */
function aiTurn(ai: ReturnType<typeof inPlay>, human: ReturnType<typeof inPlay>, extra: { aiBench?: ReturnType<typeof inPlay>[]; humanBench?: ReturnType<typeof inPlay>[] } = {}) {
  return makeState({
    isPlayerTurn: false,
    player: { active: human, bench: extra.humanBench ?? [] },
    opponent: { active: ai, bench: extra.aiBench ?? [] },
  });
}

describe("AI with Team Rocket attacks", () => {
  it("answers its own choice (Flitter: hits the Defending Pokémon) and ends its turn", () => {
    const golbat = armedFor(rocket("Dark Golbat"), "Revoloteo");
    const state = aiTurn(golbat, inPlay("Onix"), { humanBench: [inPlay("Machop")] });
    const next = executeAIAction(state, { type: "attack", attackIndex: attackIndex(golbat, "Revoloteo") });
    expect(next.pendingAttackChoice).toBeUndefined();
    expect(next.playerActivePokemon!.currentDamage).toBe(20);
    expect(next.isPlayerTurn).toBe(true);
  });

  it("leaves the human's choice pending (Knock Back: the human picks the new Active)", () => {
    const machoke = armedFor(rocket("Dark Machoke"), "Empujón");
    const state = aiTurn(machoke, inPlay("Onix"), { humanBench: [inPlay("Machop")] });
    const next = executeAIAction(state, { type: "attack", attackIndex: attackIndex(machoke, "Empujón") });
    expect(next.pendingAttackChoice?.step.chooser).toBe("opponent");
  });

  it("Vanish: the AI promotes its Benched Pokémon", () => {
    const abra = armedFor(rocket("Abra"), "Desvanecerse");
    const state = aiTurn(abra, inPlay("Onix"), { aiBench: [inPlay("Machop")] });
    const next = executeAIAction(state, { type: "attack", attackIndex: attackIndex(abra, "Desvanecerse") });
    expect(next.opponentActivePokemon!.pokemon.name).toBe("Machop");
    expect(next.opponentDeck.some((c) => c.name === "Abra")).toBe(true);
  });

  it("doesn't plan attacks it can't use (Fling with no opposing Bench)", () => {
    const machamp = armedFor(rocket("Dark Machamp"), "Lanzamiento");
    const plan = decideOpponentTurn(aiTurn(machamp, inPlay("Onix")));
    expect(plan.some((a) => a.type === "attack" && a.attackIndex === attackIndex(machamp, "Lanzamiento"))).toBe(false);
  });

  it("doesn't Knock Out its own Pokémon with Rainbow Energy", () => {
    const abra = rocket("Abra", { damage: 30 });
    const state = makeState({
      isPlayerTurn: false,
      player: { active: inPlay("Onix") },
      opponent: { active: abra, hand: [gameCard("Rainbow Energy", "rocket")] },
    });
    expect(decideOpponentTurn(state).some((a) => a.type === "attachEnergy")).toBe(false);
  });
});

describe("answerStepForAI as the opponent chooser", () => {
  it("Challenge! played by the human: the AI accepts and benches a Basic", () => {
    const challenge = gameCard("Challenge!", "rocket");
    const state = makeState({
      player: { active: inPlay("Onix"), hand: [challenge], deck: [energy(EnergyType.Fire)] },
      opponent: { active: inPlay("Machop"), deck: [inPlay("Abra").pokemon] },
    });
    const first = getTrainerSteps(state, challenge.id, [])!;
    expect(answerStepForAI(first)).toEqual(["accept"]);
    const theirs = getTrainerSteps(state, challenge.id, [["accept"], []])!;
    expect(answerStepForAI(theirs)).toHaveLength(1);
  });
});
