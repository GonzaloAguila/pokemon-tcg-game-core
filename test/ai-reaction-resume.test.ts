/**
 * Single-player: the AI's attack waits for the human's answer to a power asked mid-attack
 * (Flee, Bench Guard). The frontend answers it on the AI's view (resolveAttackChoice with
 * skipEndTurn, swapped back) and then calls finishAIAttackAfterReaction, which runs the
 * executor's post-attack step: the AI's own choices raised after the resume, its promotion,
 * the log lines in the human's perspective and the end of the turn.
 *
 * Human = "player", AI = "opponent", the AI's turn.
 */
import { describe, it, expect } from "vitest";
import { executeAIAction, finishAIAttackAfterReaction } from "@/domain/ai";
import { swapSides } from "@/domain/board";
import { resolveAttackChoice, type GameState } from "@/lib/gameState";
import { EnergyType } from "@/domain/constants";
import { makeState, inPlay, attackIndex, names } from "./helpers/state";

const { Fighting, Lightning } = EnergyType;
const gym = (name: string) => inPlay(name, { set: "gym-heroes" });

/** What the frontend does with the human's answer to the AI's attack (engine-action.ts), then the helper. */
function humanAnswers(state: GameState, selection: string[]): GameState {
  const resolved = swapSides(resolveAttackChoice(swapSides(state), selection, { skipEndTurn: true }));
  return finishAIAttackAfterReaction(resolved);
}

const lines = (before: GameState, after: GameState) => after.events.slice(before.events.length).map((e) => e.message);

describe("finishAIAttackAfterReaction", () => {
  it("Flee: the human flees, the AI's attack completes and the turn passes to the human (log in the human's perspective)", () => {
    const machop = inPlay("Machop", { energy: [Fighting] });
    const abra = inPlay("Abra");
    const state = makeState({
      isPlayerTurn: false,
      player: { active: gym("Misty's Tentacruel"), bench: [abra] },
      opponent: { active: machop },
    });
    const paused = executeAIAction(state, { type: "attack", attackIndex: attackIndex(machop, "Patada baja"), delay: 0 } as never);
    expect(paused.pendingAttackChoice?.step.chooser).toBe("opponent");
    expect(paused.isPlayerTurn).toBe(false);
    expect(paused.turnNumber).toBe(state.turnNumber);
    // Nothing to do yet: the human hasn't answered
    expect(finishAIAttackAfterReaction(paused)).toBe(paused);

    const done = humanAnswers(paused, [abra.pokemon.id]);
    expect(done.pendingAttackChoice).toBeUndefined();
    expect(done.turnNumber).toBe(state.turnNumber + 1);
    expect(done.isPlayerTurn).toBe(true);
    expect(done.playerActivePokemon!.pokemon.name).toBe("Abra");
    expect(done.playerBench.find((p) => p.pokemon.name === "Misty's Tentacruel")!.currentDamage).toBe(20);
    const log = lines(paused, done);
    expect(log).toContain("Machop usó Patada baja e hizo 20 de daño");
    expect(log.some((m) => /Tu turno/.test(m))).toBe(true);
    expect(log.some((m) => /Turno del rival/.test(m))).toBe(false);
  });

  it("Bench Guard on both Benches (Selfdestruct): the AI's own Bench Guard raised after the resume is answered, the AI promotes, Prizes in the human's perspective", () => {
    const magneton = inPlay("Magneton", { set: "fossil", energy: [Lightning, Lightning, Lightning, Lightning] });
    const humanAbra = inPlay("Abra");
    const aiAbra = inPlay("Abra");
    const state = makeState({
      isPlayerTurn: false,
      player: { active: inPlay("Machop"), bench: [humanAbra, gym("Brock's Rhydon")] },
      opponent: { active: magneton, bench: [aiAbra, gym("Brock's Rhydon")] },
    });
    const paused = executeAIAction(state, { type: "attack", attackIndex: attackIndex(magneton, "Autodestrucción"), delay: 0 } as never);
    expect(paused.pendingAttackChoice?.step.chooser).toBe("opponent");
    expect(paused.pendingAttackChoice?.reaction?.side).toBe("opponent");

    const done = humanAnswers(paused, [humanAbra.pokemon.id]);
    expect(done.pendingAttackChoice).toBeUndefined();
    // Both Benches: 20 each, 10 of Abra's moved to its Rhydon (the AI took Bench Guard too)
    expect(done.playerBench.map((p) => p.currentDamage)).toEqual([10, 30]);
    expect(done.opponentBench.map((p) => [p.pokemon.name, p.currentDamage])).toEqual([["Brock's Rhydon", 30]]);
    // Magneton Knocked itself Out: the AI promoted its Abra; the human got a Prize
    expect(done.opponentActivePokemon!.pokemon.id).toBe(aiAbra.pokemon.id);
    expect(names(done.opponentDiscard)).toContain("Magneton");
    expect(done.playerPrizes).toHaveLength(5);
    // Machop Knocked Out: the AI's Prize and the human's promotion are pending, the turn waits
    expect(done.opponentCanTakePrize).toBe(true);
    expect(done.playerNeedsToPromote).toBe(true);
    expect(done.turnNumber).toBe(state.turnNumber);
    const log = lines(paused, done);
    expect(log).toContain("Tomaste un premio");
    expect(log).toContain("El rival puede tomar un premio");
    expect(log).not.toContain("¡Puedes tomar un premio!");
    expect(log).not.toContain("El rival tomó un premio");
  });
});
