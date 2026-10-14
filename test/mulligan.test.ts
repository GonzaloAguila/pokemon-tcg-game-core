import { describe, it, expect } from "vitest";
import { canMulligan, doMulligan } from "@/lib/gameState";
import { GamePhase, EnergyType } from "@/domain/constants";
import { IllegalActionError } from "@/shared/errors";
import { deepFreeze, energies, gameCard, inPlay, makeState } from "./helpers/state";

const { Water, Grass } = EnergyType;

const PRE_GAME = { gamePhase: GamePhase.Mulligan, turnNumber: 0, playerReady: false, opponentReady: false };

/** A pre-game state: hands dealt, nobody has placed anything yet. */
function mulliganState(playerHand = energies(Water, Water, Grass), opponentHand = energies(Grass, Grass)) {
  return makeState({ ...PRE_GAME, player: { hand: playerHand }, opponent: { hand: opponentHand } });
}

describe("doMulligan legality (canMulligan)", () => {
  it("allows a mulligan in the MULLIGAN phase without Basics in hand or Pokémon in play", () => {
    const state = deepFreeze(mulliganState());

    expect(canMulligan(state, true)).toBeNull();
    const next = doMulligan(state, true);

    expect(next.playerHand).toHaveLength(7);
    expect(next.playerHand.length + next.playerDeck.length).toBe(state.playerHand.length + state.playerDeck.length);
  });

  it("works for either side (isPlayer = false acts for the opponent)", () => {
    const state = mulliganState([gameCard("Pikachu", "base")], energies(Grass));

    expect(canMulligan(state, false)).toBeNull();
    expect(doMulligan(state, false).opponentHand).toHaveLength(7);
    expect(canMulligan(state, true)).toMatch(/básico/i);
  });

  it("allows it in the SETUP phase too", () => {
    expect(canMulligan({ ...mulliganState(), gamePhase: GamePhase.Setup }, true)).toBeNull();
  });

  it("refuses a mulligan once the game is being played (even off-turn)", () => {
    const state = makeState({ player: { hand: energies(Water) }, opponent: { hand: energies(Grass) } });

    expect(canMulligan(state, true)).toMatch(/antes de empezar/i);
    expect(canMulligan(state, false)).toMatch(/antes de empezar/i);
    expect(() => doMulligan(state, false)).toThrow(IllegalActionError);
  });

  it("refuses a mulligan after the game is over", () => {
    const state = { ...mulliganState(), gamePhase: GamePhase.GameOver };
    expect(() => doMulligan(state, true)).toThrow(IllegalActionError);
  });

  it("refuses a mulligan with a Basic (or a card played as a Basic) in hand", () => {
    expect(canMulligan(mulliganState([gameCard("Pikachu", "base"), ...energies(Water)]), true)).toMatch(/básico/i);
    expect(canMulligan(mulliganState([gameCard("Mysterious Fossil", "fossil")]), true)).toMatch(/básico/i);
    expect(() => doMulligan(mulliganState([gameCard("Pikachu", "base")]), true)).toThrow(IllegalActionError);
  });

  it("refuses a mulligan when the player already has Pokémon in play", () => {
    const withActive = makeState({ ...PRE_GAME, player: { active: inPlay("Machop"), hand: energies(Water) } });
    const withBench = makeState({ ...PRE_GAME, player: { bench: [inPlay("Machop")], hand: energies(Water) } });

    expect(canMulligan(withActive, true)).toMatch(/en juego/i);
    expect(canMulligan(withBench, true)).toMatch(/en juego/i);
    expect(() => doMulligan(withActive, true)).toThrow(IllegalActionError);
  });
});
