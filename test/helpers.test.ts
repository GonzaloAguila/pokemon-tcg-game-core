import { describe, it, expect } from "vitest";
import { executeAttack } from "@/lib/gameState";
import { EnergyType } from "@/domain/constants";
import { makeState, inPlay, attackIndex } from "./helpers/state";

describe("test helpers", () => {
  it("builds a playable state from catalog cards (Magikarp Tackle vs Pikachu)", () => {
    const magikarp = inPlay("Magikarp", { energy: [EnergyType.Water] });
    const state = makeState({
      player: { active: magikarp },
      opponent: { active: inPlay("Pikachu", { set: "base" }), bench: [inPlay("Pidgey")] },
    });

    const after = executeAttack(state, attackIndex(magikarp, "Placaje"));

    // Turn passed to the opponent; damage stays on the opponent's Pikachu
    expect(after.isPlayerTurn).toBe(false);
    expect(after.opponentActivePokemon?.currentDamage).toBe(10);
    expect(after.turnNumber).toBe(4);
  });
});
