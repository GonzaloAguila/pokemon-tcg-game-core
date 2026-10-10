import { describe, it, expect } from "vitest";
import { endTurn } from "@/lib/gameState";
import { EnergyType } from "@/domain/constants";
import { makeState, inPlay, energy } from "./helpers/state";

describe("endTurn and pending flags", () => {
  const base = () => ({
    player: { active: inPlay("Venomoth", { set: "jungle" }) },
    opponent: { active: inPlay("Onix") },
  });

  it.each([
    ["pendingForceSwitch", { pendingForceSwitch: true }],
    ["pendingSelfSwitch", { pendingSelfSwitch: true }],
    ["pendingDeckSearch", { pendingDeckSearch: { filter: { basicOnly: true as const } } }],
    [
      "pendingBenchDamageSelection",
      { pendingBenchDamageSelection: { damageAmount: 10, targetSide: "opponent" as const, maxTargets: 1 } },
    ],
  ])("blocks while %s is set (attack still resolving)", (_name, flags) => {
    const state = makeState({ ...base(), ...flags });

    expect(endTurn(state)).toBe(state);
  });

  it("does not block on an open Shift/Peek prompt (optional power UI), and clears both", () => {
    const state = makeState({
      ...base(),
      pendingTypeShift: { pokemonId: "venomoth", availableTypes: [EnergyType.Fire] },
      pendingPeek: { peekType: "opponentHand", revealedCards: [energy(EnergyType.Water)] },
    });

    const after = endTurn(state);

    expect(after.isPlayerTurn).toBe(false);
    expect(after.pendingTypeShift).toBeUndefined();
    expect(after.pendingPeek).toBeUndefined();
  });
});
