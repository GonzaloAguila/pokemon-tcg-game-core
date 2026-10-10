import { describe, it, expect, vi, afterEach } from "vitest";
import {
  clearStatusConditionsOnRetreat,
  executeRetreat,
  applyForceSwitch,
  applySelfSwitch,
} from "@/lib/gameState";
import { executeAIAction } from "@/domain/ai/executor";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, attackIndex } from "./helpers/state";

const { Poisoned, Confused } = StatusCondition;

afterEach(() => vi.restoreAllMocks());

describe("moving to the bench removes ALL special conditions, including Poison", () => {
  it("clearStatusConditionsOnRetreat drops Poison (and Toxic's 20 damage)", () => {
    const machop = inPlay("Machop", { statuses: [Poisoned, Confused], poisonDamage: 20 });

    const benched = clearStatusConditionsOnRetreat(machop);

    expect(benched.statusConditions).toEqual([]);
    expect(benched.poisonDamage).toBeUndefined();
  });

  it("a poisoned Machop that retreats is no longer poisoned on the bench", () => {
    const machop = inPlay("Machop", { statuses: [Poisoned], energy: [EnergyType.Fighting] });
    const state = makeState({
      player: { active: machop, bench: [inPlay("Abra")] },
      opponent: { active: inPlay("Onix") },
    });

    const after = executeRetreat(state, [machop.attachedEnergy[0].id], 0);

    expect(after.playerActivePokemon?.pokemon.name).toBe("Abra");
    expect(after.playerBench[0].pokemon.name).toBe("Machop");
    expect(after.playerBench[0].statusConditions).toEqual([]);
  });

  it("a poisoned defender dragged to the bench by Whirlwind/Lure loses Poison", () => {
    const state = makeState({
      player: { active: inPlay("Pidgey") },
      opponent: { active: inPlay("Machop", { statuses: [Poisoned] }), bench: [inPlay("Abra")] },
      pendingForceSwitch: true,
    });

    const after = applyForceSwitch(state, 0);
    const machop = after.opponentBench.find((p) => p.pokemon.name === "Machop")!;

    expect(machop.statusConditions).toEqual([]);
  });

  it("a poisoned attacker that Teleports to the bench loses Poison", () => {
    const state = makeState({
      player: { active: inPlay("Machop", { statuses: [Poisoned] }), bench: [inPlay("Abra")] },
      opponent: { active: inPlay("Onix") },
      pendingSelfSwitch: true,
    });

    const after = applySelfSwitch(state, 0);
    const machop = after.playerBench.find((p) => p.pokemon.name === "Machop")!;

    expect(machop.statusConditions).toEqual([]);
  });

  it("the AI's Whirlwind sends the human's poisoned active to the bench without Poison", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const pidgey = inPlay("Pidgey", { energy: [EnergyType.Fighting, EnergyType.Fighting] });
    const state = makeState({
      turnNumber: 4,
      isPlayerTurn: false,
      opponent: { active: pidgey },
      player: { active: inPlay("Machop", { statuses: [Poisoned] }), bench: [inPlay("Abra")] },
    });

    const after = executeAIAction(state, { type: "attack", attackIndex: attackIndex(pidgey, "Remolino"), delay: 0 });
    const machop = after.playerBench.find((p) => p.pokemon.name === "Machop")!;

    expect(after.playerActivePokemon?.pokemon.name).toBe("Abra");
    expect(machop.statusConditions).toEqual([]);
  });
});
