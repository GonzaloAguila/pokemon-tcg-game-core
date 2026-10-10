import { describe, it, expect, vi, afterEach } from "vitest";
import { endTurn, applyStatusCondition, canPokemonAttack, hasStatusCondition } from "@/lib/gameState";
import { executeAIAction } from "@/domain/ai/executor";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { makeState, inPlay, attackIndex } from "./helpers/state";

afterEach(() => vi.restoreAllMocks());

describe("Leer (CannotAttack): lasts through the defending player's next turn only", () => {
  it("survives the end of the turn in which it was applied and wears off after the defender's turn", () => {
    // Turn 3: the player's Rhyhorn hit Leer (heads) on the opponent's Machop
    const leered = applyStatusCondition(inPlay("Machop"), StatusCondition.CannotAttack, 3);
    const state = makeState({
      turnNumber: 3,
      player: { active: inPlay("Rhyhorn", { set: "jungle" }) },
      opponent: { active: leered },
    });

    const opponentsTurn = endTurn(state);
    expect(opponentsTurn.isPlayerTurn).toBe(false);
    expect(hasStatusCondition(opponentsTurn.opponentActivePokemon!, StatusCondition.CannotAttack)).toBe(true);
    expect(canPokemonAttack(opponentsTurn.opponentActivePokemon!)).toBe(false);

    const backToPlayer = endTurn(opponentsTurn);
    expect(hasStatusCondition(backToPlayer.opponentActivePokemon!, StatusCondition.CannotAttack)).toBe(false);
    expect(canPokemonAttack(backToPlayer.opponentActivePokemon!)).toBe(true);
  });

  it("the AI's Leer (heads) stops the human's Pokémon from attacking on the human's next turn", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1); // heads
    const rhyhorn = inPlay("Rhyhorn", { set: "jungle", energy: [EnergyType.Fighting] });
    const state = makeState({
      turnNumber: 4,
      isPlayerTurn: false,
      opponent: { active: rhyhorn },
      player: { active: inPlay("Machop") },
    });

    const after = executeAIAction(state, { type: "attack", attackIndex: attackIndex(rhyhorn, "Leer"), delay: 0 });

    expect(after.isPlayerTurn).toBe(true);
    expect(canPokemonAttack(after.playerActivePokemon!)).toBe(false);
  });
});
