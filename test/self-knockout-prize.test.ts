import { prizesOwed, takePrize } from "@/lib/gameState";
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
    // Exactly one Prize owed to the opponent, picked by hand (no automatic Prize, no second one)
    expect(after.opponentPrizes).toHaveLength(state.opponentPrizes.length);
    expect(prizesOwed(after, "opponent")).toBe(1);
    expect(prizesOwed(takePrize(after, 0, false, false), "opponent")).toBe(0);
  });
});
