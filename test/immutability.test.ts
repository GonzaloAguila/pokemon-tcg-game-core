import { describe, it, expect } from "vitest";
import { endTurn, executeAttack } from "@/lib/gameState";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, deepFreeze, attackIndex } from "./helpers/state";

describe("endTurn is pure", () => {
  it("promotes the opponent's bench after a poison KO without mutating the input state", () => {
    // Rattata (30 HP) with 20 damage dies to poison between turns
    const state = deepFreeze(
      makeState({
        player: { active: inPlay("Machop") },
        opponent: {
          active: inPlay("Rattata", { damage: 20, statuses: [StatusCondition.Poisoned] }),
          bench: [inPlay("Pidgey"), inPlay("Abra")],
        },
      }),
    );

    const after = endTurn(state);

    expect(after.opponentActivePokemon?.pokemon.name).toBe("Pidgey");
    expect(after.opponentBench.map((p) => p.pokemon.name)).toEqual(["Abra"]);
    expect(after.opponentDiscard.map((c) => c.name)).toContain("Rattata");
    expect(after.playerCanTakePrize).toBe(true);
    // Input untouched
    expect(state.opponentBench.map((p) => p.pokemon.name)).toEqual(["Pidgey", "Abra"]);
    expect(state.opponentActivePokemon?.pokemon.name).toBe("Rattata");
  });

  it("does not mutate the input on a normal turn change", () => {
    const state = deepFreeze(
      makeState({
        player: { active: inPlay("Machop", { statuses: [StatusCondition.Poisoned] }), bench: [inPlay("Abra")] },
        opponent: { active: inPlay("Onix"), bench: [inPlay("Pidgey")] },
      }),
    );

    const after = endTurn(state);

    expect(after.isPlayerTurn).toBe(false);
    expect(after.playerActivePokemon?.currentDamage).toBe(10);
    expect(state.playerActivePokemon?.currentDamage).toBe(0);
  });
});

describe("executeAttack is pure", () => {
  it("Magneton's Selfdestruct with KOs on both benches does not mutate the input state", () => {
    const magneton = inPlay("Magneton", {
      energy: [EnergyType.Lightning, EnergyType.Lightning, EnergyType.Lightning, EnergyType.Lightning],
    });
    const state = deepFreeze(
      makeState({
        player: { active: magneton, bench: [inPlay("Abra", { damage: 10 }), inPlay("Machop")] },
        opponent: { active: inPlay("Pidgey"), bench: [inPlay("Rattata", { damage: 10 }), inPlay("Onix")] },
      }),
    );

    expect(() => executeAttack(state, attackIndex(magneton, "Autodestrucción"))).not.toThrow();
    expect(state.playerBench).toHaveLength(2);
    expect(state.opponentBench).toHaveLength(2);
  });
});
