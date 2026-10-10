import { describe, expect, it } from "vitest";
import { executeAttack } from "@/lib/gameState";
import { EnergyType } from "@/domain/constants";
import { attackIndex, inPlay, makeState } from "./helpers/state";

const Lightning = EnergyType.Lightning;

describe("attacker knocks itself out", () => {
  it("the opponent gets exactly one prize, taken automatically (no second manual pick)", () => {
    const magneton = inPlay("Magneton", { energy: [Lightning, Lightning, Lightning, Lightning] });
    const state = makeState({
      player: { active: magneton, bench: [inPlay("Machop")] },
      opponent: { active: inPlay("Chansey"), bench: [inPlay("Rattata")] },
    });

    const after = executeAttack(state, attackIndex(magneton, "Autodestrucción"));

    expect(after.playerActivePokemon).toBeNull();
    expect(after.opponentPrizes).toHaveLength(state.opponentPrizes.length - 1);
    expect(after.opponentCanTakePrize).toBe(false);
  });
});
