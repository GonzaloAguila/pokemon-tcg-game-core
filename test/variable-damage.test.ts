import { describe, it, expect } from "vitest";
import { executeAttack } from "@/lib/gameState";
import { estimateAttackDamage } from "@/domain/ai/actions";
import { EnergyType } from "@/domain/constants";
import { makeState, inPlay, attackIndex } from "./helpers/state";

const { Water, Fighting, Grass, Colorless } = EnergyType;

describe("\"Nx\" damage attacks", () => {
  it("Magikarp's Flail does 10 per damage counter on Magikarp (no double count)", () => {
    const magikarp = inPlay("Magikarp", { damage: 20, energy: [Water] });
    const state = makeState({ player: { active: magikarp }, opponent: { active: inPlay("Onix") } });

    const after = executeAttack(state, attackIndex(magikarp, "Azote"), true);

    expect(after.opponentActivePokemon?.currentDamage).toBe(20);
  });

  it("Magikarp's Flail does nothing without damage counters", () => {
    const magikarp = inPlay("Magikarp", { energy: [Water] });
    const state = makeState({ player: { active: magikarp }, opponent: { active: inPlay("Onix") } });

    const after = executeAttack(state, attackIndex(magikarp, "Azote"), true);

    expect(after.opponentActivePokemon?.currentDamage).toBe(0);
  });

  it.each([
    ["Marowak", "Bonemerang", [Fighting, Fighting]],
    ["Nidorina", "Double Kick", [Grass, Colorless, Colorless]],
    ["Primeape", "Fury Swipes", [Fighting, Fighting]],
    ["Nidoran♀", "Fury Swipes", [Grass]],
  ] as const)(
    "%s's %s (coin-flip \"Nx\") deals no engine damage from its own damage counters",
    (name, attack, cost) => {
      const attacker = inPlay(name, { set: "jungle", damage: 30, energy: [...cost] });
      const state = makeState({ player: { active: attacker }, opponent: { active: inPlay("Chansey") } });

      // skipEndTurn=true is how callers run coin-flip attacks: they add the flip damage afterwards
      const after = executeAttack(state, attackIndex(attacker, attack), true);

      expect(after.opponentActivePokemon?.currentDamage).toBe(0);
    },
  );

  it("Cubone's Rage still does 10 + 10 per damage counter", () => {
    const cubone = inPlay("Cubone", { damage: 20, energy: [Fighting, Fighting] });
    const state = makeState({ player: { active: cubone }, opponent: { active: inPlay("Onix") } });

    const after = executeAttack(state, attackIndex(cubone, "Rage"), true);

    expect(after.opponentActivePokemon?.currentDamage).toBe(30);
  });

  it("the AI estimates Flail from Magikarp's damage counters", () => {
    const magikarp = inPlay("Magikarp", { damage: 20, energy: [Water] });
    // AI is the "opponent" side
    const state = makeState({ opponent: { active: magikarp }, player: { active: inPlay("Onix") } });

    expect(estimateAttackDamage(state, "opponent", attackIndex(magikarp, "Azote"))).toBe(20);
  });
});
