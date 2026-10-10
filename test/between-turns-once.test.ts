import { describe, it, expect } from "vitest";
import { endTurn, takePrize, promoteActivePokemon } from "@/lib/gameState";
import { canPlayBasicPokemon } from "@/domain/board";
import { StatusCondition } from "@/domain/constants";
import { makeState, inPlay, gameCard } from "./helpers/state";

describe("the Pokémon Checkup happens once per turn change", () => {
  it("a poison KO that pauses endTurn (prize + promotion) does not poison the other Active twice", () => {
    const state = makeState({
      player: {
        active: inPlay("Machop", { damage: 40, statuses: [StatusCondition.Poisoned] }), // 50 HP: KO'd by poison
        bench: [inPlay("Abra")],
        hand: [gameCard("Pikachu", "base")],
      },
      opponent: { active: inPlay("Onix", { statuses: [StatusCondition.Poisoned] }) },
    });

    const paused = endTurn(state);
    expect(paused.isPlayerTurn).toBe(true); // waiting for the prize and the promotion
    expect(paused.playerActivePokemon).toBeNull();
    expect(paused.opponentActivePokemon!.currentDamage).toBe(10);
    // The turn is over: no more normal actions while it waits
    expect(canPlayBasicPokemon(paused, paused.playerHand[0].id, "bench")).not.toBeNull();

    const prized = takePrize(paused, 0, false);
    const promoted = promoteActivePokemon(prized, 0, true);
    const next = endTurn(promoted);

    expect(next.isPlayerTurn).toBe(false);
    expect(next.turnNumber).toBe(state.turnNumber + 1);
    expect(next.opponentActivePokemon!.currentDamage).toBe(10);
  });
});
