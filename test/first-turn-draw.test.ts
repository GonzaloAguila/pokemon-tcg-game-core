import { describe, it, expect } from "vitest";
import { startPlayingPhase } from "@/lib/gameState";
import { GamePhase } from "@/domain/constants";
import { makeState, inPlay } from "./helpers/state";

describe("the starting player draws at the start of turn 1 (classic: every turn starts with a draw)", () => {
  const setup = () =>
    makeState({
      gamePhase: GamePhase.Setup,
      turnNumber: 0,
      player: { active: inPlay("Machop"), hand: [] },
      opponent: { active: inPlay("Onix"), hand: [] },
    });

  it("heads: the player draws 1", () => {
    const state = setup();
    const next = startPlayingPhase(state, "heads");
    expect(next.playerHand).toHaveLength(1);
    expect(next.playerDeck).toHaveLength(state.playerDeck.length - 1);
    expect(next.opponentHand).toHaveLength(0);
  });

  it("tails: the opponent draws 1", () => {
    const state = setup();
    const next = startPlayingPhase(state, "tails");
    expect(next.opponentHand).toHaveLength(1);
    expect(next.playerHand).toHaveLength(0);
  });
});
