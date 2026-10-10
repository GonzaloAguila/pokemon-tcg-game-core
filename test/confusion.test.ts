import { describe, it, expect, vi, afterEach } from "vitest";
import { CONFUSION_SELF_DAMAGE } from "@/index";
import { executeAIAction } from "@/domain/ai/executor";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, attackIndex } from "./helpers/state";

afterEach(() => vi.restoreAllMocks());

describe("Confusion (Base Set rule): tails on the attack flip -> 20 damage to itself", () => {
  it("exports the rule value for consumers", () => {
    expect(CONFUSION_SELF_DAMAGE).toBe(20);
  });

  it("a confused AI Machop that flips tails takes 20 damage and does not attack", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9); // tails
    const machop = inPlay("Machop", { energy: [EnergyType.Fighting], statuses: [StatusCondition.Confused] });
    const state = makeState({
      turnNumber: 4,
      isPlayerTurn: false,
      opponent: { active: machop },
      player: { active: inPlay("Onix") },
    });

    const after = executeAIAction(state, { type: "attack", attackIndex: attackIndex(machop, "Patada baja"), delay: 0 });

    expect(after.opponentActivePokemon?.currentDamage).toBe(20);
    expect(after.playerActivePokemon?.currentDamage).toBe(0);
  });
});
