import { describe, expect, it } from "vitest";
import {
  ADVENTURE_PASSIVES,
  applySetupRules,
  setupOptionsForPassives,
  startPlayingPhase,
  swapSides,
  takeLuckyCoin,
  type GameState,
} from "../src";
import { GamePhase } from "../src/domain/constants";
import { deepFreeze, gameCard, inPlay, makeState, names } from "./helpers/state";

/** Both players ready, before the starting coin (the both-ready transition comes next). */
function readyState(setup: Parameters<typeof makeState>[0]): GameState {
  return makeState({ turnNumber: 0, gamePhase: GamePhase.Setup, ...setup });
}

describe("setupOptionsForPassives", () => {
  it("opening_hand_plus_1 and prize_minus_one change the player's side only", () => {
    expect(setupOptionsForPassives({ prizeCount: 3, openingHand: 7, playerPassives: ["opening_hand_plus_1", "prize_minus_one"] })).toEqual({
      prizeCount: { player: 2, opponent: 3 },
      openingHand: { player: 8, opponent: 7 },
    });
  });

  it("the rival's passives change its side; Prizes never go below 1", () => {
    expect(
      setupOptionsForPassives({ prizeCount: 1, openingHand: 7, playerPassives: ["prize_minus_one"], opponentPassives: ["opening_hand_plus_1"] })
    ).toEqual({ prizeCount: { player: 1, opponent: 1 }, openingHand: { player: 7, opponent: 8 } });
  });

  it("per-side base values are kept", () => {
    expect(setupOptionsForPassives({ prizeCount: { player: 1, opponent: 2 }, openingHand: { player: 7, opponent: 9 }, playerPassives: [] })).toEqual({
      prizeCount: { player: 1, opponent: 2 },
      openingHand: { player: 7, opponent: 9 },
    });
  });

  it("extra_heart, lucky_coin and start_attached_energy don't touch the setup options", () => {
    expect(setupOptionsForPassives({ prizeCount: 3, openingHand: 7, playerPassives: ["extra_heart", "lucky_coin", "start_attached_energy"] })).toEqual({
      prizeCount: { player: 3, opponent: 3 },
      openingHand: { player: 7, opponent: 7 },
    });
  });

  it("lists the five passives", () => {
    expect([...ADVENTURE_PASSIVES].sort()).toEqual(["extra_heart", "lucky_coin", "opening_hand_plus_1", "prize_minus_one", "start_attached_energy"]);
  });
});

describe("start_attached_energy", () => {
  it("Charmander gets the first Energy its attacks use (Fire, not the Grass before it); the deck is shuffled", () => {
    const deck = [gameCard("Grass Energy", "base"), gameCard("Potion", "base"), gameCard("Fire Energy", "base"), gameCard("Fire Energy", "base")];
    const state = deepFreeze(readyState({ player: { active: inPlay("Charmander"), deck }, opponent: { active: inPlay("Rattata") }, passives: { player: ["start_attached_energy"] } }));
    const after = applySetupRules(state);
    expect(names(after.playerActivePokemon!.attachedEnergy)).toEqual(["Fire Energy"]);
    expect(after.playerActivePokemon!.attachedEnergy[0].id).toBe(deck[2].id);
    expect(after.playerDeck).toHaveLength(3);
    expect(names(after.playerDeck).sort()).toEqual(["Fire Energy", "Grass Energy", "Potion"]);
    expect(after.events.at(-1)?.message).toBe("Arranque rápido: Charmander recibe Energía Fuego");
  });

  it("a Colorless-only Active (Rattata) gets the first basic Energy", () => {
    const deck = [gameCard("Potion", "base"), gameCard("Double Colorless Energy", "base"), gameCard("Grass Energy", "base"), gameCard("Fire Energy", "base")];
    const state = readyState({ player: { active: inPlay("Rattata"), deck }, opponent: { active: inPlay("Pidgey") }, passives: { player: ["start_attached_energy"] } });
    expect(names(applySetupRules(state).playerActivePokemon!.attachedEnergy)).toEqual(["Grass Energy"]);
  });

  it("no usable basic Energy in the deck: nothing happens", () => {
    const deck = [gameCard("Potion", "base"), gameCard("Double Colorless Energy", "base"), gameCard("Water Energy", "base")];
    const state = readyState({ player: { active: inPlay("Charmander"), deck }, opponent: { active: inPlay("Pidgey") }, passives: { player: ["start_attached_energy"] } });
    expect(applySetupRules(state)).toBe(state);
  });

  it("works for the rival's side, also on a swapped view (the AI plans on swapped states)", () => {
    const state = readyState({
      player: { active: inPlay("Charmander"), deck: [gameCard("Fire Energy", "base")] },
      opponent: { active: inPlay("Weedle"), deck: [gameCard("Grass Energy", "base")] },
      passives: { opponent: ["start_attached_energy"] },
    });
    const after = applySetupRules(state);
    expect(names(after.opponentActivePokemon!.attachedEnergy)).toEqual(["Grass Energy"]);
    expect(after.playerActivePokemon!.attachedEnergy).toHaveLength(0);
    const swapped = applySetupRules(swapSides(state));
    expect(names(swapped.playerActivePokemon!.attachedEnergy)).toEqual(["Grass Energy"]);
    expect(swapSides(swapped).passives).toEqual(state.passives);
  });

  it("happens at the both-ready transition, before the first draw", () => {
    const deck = [gameCard("Fire Energy", "base"), gameCard("Potion", "base")];
    const state = readyState({ player: { active: inPlay("Charmander"), deck, hand: [] }, opponent: { active: inPlay("Rattata") }, passives: { player: ["start_attached_energy"] } });
    const started = startPlayingPhase(state, "heads");
    expect(names(started.playerActivePokemon!.attachedEnergy)).toEqual(["Fire Energy"]);
    expect(names(started.playerHand)).toEqual(["Potion"]);
    expect(started.playerDeck).toHaveLength(0);
  });

  it("extra_heart is accepted and ignored by the engine", () => {
    const state = readyState({ player: { active: inPlay("Charmander") }, opponent: { active: inPlay("Rattata") }, passives: { player: ["extra_heart"] } });
    expect(applySetupRules(state)).toBe(state);
  });
});

describe("takeLuckyCoin", () => {
  it("gives heads once per battle to a side with lucky_coin", () => {
    const state = deepFreeze(makeState({ passives: { player: ["lucky_coin"] } }));
    const first = takeLuckyCoin(state, "player");
    expect(first?.coin).toBe("heads");
    expect(first?.state.passives?.luckyCoinUsed).toEqual({ player: true });
    expect(takeLuckyCoin(first!.state, "player")).toBeNull();
  });

  it("null for a side without it", () => {
    const state = makeState({ passives: { player: ["lucky_coin"] } });
    expect(takeLuckyCoin(state, "opponent")).toBeNull();
    expect(takeLuckyCoin(makeState(), "player")).toBeNull();
  });

  it("follows swapSides (passives and the used mark)", () => {
    const state = makeState({ passives: { opponent: ["lucky_coin"] } });
    const taken = takeLuckyCoin(swapSides(state), "player");
    expect(taken?.coin).toBe("heads");
    const back = swapSides(taken!.state);
    expect(back.passives).toEqual({ opponent: ["lucky_coin"], luckyCoinUsed: { opponent: true } });
    expect(takeLuckyCoin(back, "opponent")).toBeNull();
  });
});
