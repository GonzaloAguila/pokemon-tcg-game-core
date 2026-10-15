import { describe, expect, it } from "vitest";
import { decks, initializeGame, startGame, DEFAULT_PRIZE_COUNT } from "../src";

describe("startGame prizeCount", () => {
  const base = () => initializeGame(decks[0]);

  it("deals 6 Prize cards by default", () => {
    const state = startGame(base());
    expect(state.playerPrizes).toHaveLength(DEFAULT_PRIZE_COUNT);
    expect(state.opponentPrizes).toHaveLength(DEFAULT_PRIZE_COUNT);
    expect(state.prizeCount).toBe(6);
  });

  it("deals fewer Prize cards for a shorter game; the rest stays in the deck", () => {
    for (const prizeCount of [3, 4]) {
      const before = base();
      const state = startGame(before, { prizeCount });
      expect(state.playerPrizes).toHaveLength(prizeCount);
      expect(state.opponentPrizes).toHaveLength(prizeCount);
      expect(state.prizeCount).toBe(prizeCount);
      expect(state.playerHand.length + state.playerPrizes.length + state.playerDeck.length).toBe(before.playerDeck.length);
      expect(state.events.some((e) => e.message.includes(`colocas ${prizeCount} premios`))).toBe(true);
    }
  });

  it("keeps the count between 1 and 6", () => {
    expect(startGame(base(), { prizeCount: 9 }).playerPrizes).toHaveLength(6);
    expect(startGame(base(), { prizeCount: 0 }).playerPrizes).toHaveLength(1);
  });
});
