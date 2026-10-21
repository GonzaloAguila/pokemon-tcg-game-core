import { describe, expect, it } from "vitest";
import {
  adventureBattleConfig,
  advanceToSetup,
  createAdventureGame,
  createSeededRng,
  playBasicPokemon,
  setPlayerReady,
  startPlayingPhase,
  swapSides,
  withRandom,
  type AdventureContentLike,
  type AdventureGameConfig,
  type GameState,
} from "../src";
import { GamePhase } from "../src/domain/constants";
import { IllegalActionError } from "../src/shared/errors";
import adventureJson from "./fixtures/adventure-1.json";
import { names } from "./helpers/state";

const ADVENTURE = adventureJson as unknown as AdventureContentLike;

function create(config: AdventureGameConfig, seed = 1): GameState {
  return withRandom(createSeededRng(seed).next, () => createAdventureGame(config));
}

/** Put the human's first Basic of the hand as Active, both ready, then the starting coin. */
function startBattle(state: GameState, coin: "heads" | "tails" = "heads"): GameState {
  let next = advanceToSetup(state);
  const basic = next.playerHand.find((c) => c.kind === "pokemon" && c.stage === "basic");
  if (!basic) throw new Error("no Basic in the opening hand: pick another seed");
  next = playBasicPokemon(next, basic.id, "active");
  next = setPlayerReady(setPlayerReady(next, true), false);
  return startPlayingPhase(next, coin);
}

describe("createAdventureGame", () => {
  it("Charmander starter vs battle 1: 7-card hands, 3 Prizes each, MULLIGAN phase", () => {
    const state = create(adventureBattleConfig(ADVENTURE, "charmander", 1));
    expect(state.gamePhase).toBe(GamePhase.Mulligan);
    expect(state.gameMode).toBeUndefined();
    expect(state.playerHand).toHaveLength(7);
    expect(state.opponentHand).toHaveLength(7);
    expect(state.playerPrizes).toHaveLength(3);
    expect(state.opponentPrizes).toHaveLength(3);
    expect(state.playerDeck).toHaveLength(24 - 10);
    expect(state.opponentDeck).toHaveLength(20 - 10);
    expect(state.passives).toBeUndefined();
    expect(state.tableRules).toBeUndefined();
    const all = [...state.playerHand, ...state.playerPrizes, ...state.playerDeck];
    expect(all.filter((c) => c.name === "Charmander")).toHaveLength(4);
    expect(all.every((c) => c.id.startsWith("p1-"))).toBe(true);
    expect([...state.opponentHand, ...state.opponentPrizes, ...state.opponentDeck].every((c) => c.id.startsWith("p2-"))).toBe(true);
  });

  it("the run's passives: prize_minus_one deals the player 2 Prizes, opening_hand_plus_1 an 8-card hand", () => {
    const config = adventureBattleConfig(ADVENTURE, "squirtle", 2, { playerPassives: ["prize_minus_one", "opening_hand_plus_1", "lucky_coin"] });
    const state = create(config);
    expect(state.playerPrizes).toHaveLength(2);
    expect(state.opponentPrizes).toHaveLength(3);
    expect(state.playerHand).toHaveLength(8);
    expect(state.openingHandSize).toEqual({ player: 8, opponent: 7 });
    expect(state.passives).toEqual({ player: ["prize_minus_one", "opening_hand_plus_1", "lucky_coin"] });
  });

  it("hard battle 10 uses the deck for the run's starter", () => {
    const config = adventureBattleConfig(ADVENTURE, "bulbasaur", 10, { difficulty: "hard" });
    const state = create(config);
    const rival = [...state.opponentHand, ...state.opponentPrizes, ...state.opponentDeck];
    expect(rival).toHaveLength(24);
    expect(rival.filter((c) => c.name === "Charmander")).toHaveLength(4);
  });

  it("the battle 7 config (spec §3.6): preset board, 1 Prize each, the 3 bonus cards at the both-ready transition", () => {
    const config = adventureBattleConfig(ADVENTURE, "charmander", 7);
    const state = create(config, 3);
    expect(state.playerPrizes).toHaveLength(1);
    expect(state.opponentPrizes).toHaveLength(1);
    expect(state.opponentActivePokemon?.pokemon.name).toBe("Metapod");
    expect(names(state.opponentActivePokemon!.previousEvolutions!)).toEqual(["Caterpie"]);
    expect(state.opponentBench.map((p) => p.pokemon.name)).toEqual(["Metapod", "Metapod"]);
    expect(state.opponentHand).toHaveLength(7);
    expect(state.opponentDeck).toHaveLength(40 - 6 - 7 - 1);
    expect(state.tableRules).toEqual({ noPrizeFor: { opponent: ["Metapod"] } });
    expect(state.setupRules?.bonusCards?.player).toHaveLength(3);
    expect(state.playerHand.some((c) => c.name === "Pokémon Flute")).toBe(false);

    const started = startBattle(state, "tails");
    expect(started.gamePhase).toBe(GamePhase.Playing);
    expect(names(started.playerHand)).toEqual(expect.arrayContaining(["Pokémon Flute", "Gust of Wind", "PlusPower"]));
    expect(started.setupRules).toBeUndefined();
    expect(started.playerDeck.some((c) => c.name === "Pokémon Flute")).toBe(false);
  });

  it("is deterministic for a seed (card ids and order included)", () => {
    const config = adventureBattleConfig(ADVENTURE, "charmander", 7);
    const a = create(config, 42);
    const b = create(config, 42);
    const ids = (s: GameState) => [s.playerHand, s.playerDeck, s.playerPrizes, s.opponentHand, s.opponentDeck, s.opponentPrizes].map((pile) => pile.map((c) => c.id));
    expect(ids(a)).toEqual(ids(b));
    expect(ids(create(config, 43))).not.toEqual(ids(a));
  });

  it("an unknown card id or an impossible opponentSetup throws", () => {
    const config = adventureBattleConfig(ADVENTURE, "charmander", 1);
    expect(() => create({ ...config, playerDeck: [{ cardId: "base-set-999-nope", qty: 20 }] })).toThrow(IllegalActionError);
    expect(() => create({ ...config, modifiers: [{ type: "opponentSetup", active: ["base-set-045-caterpie", "base-set-054-metapod"], bench: [] }] })).toThrow(IllegalActionError);
  });

  it("the rival's passives (opponentPassives) act on its side, also through swapSides", () => {
    const config = { ...adventureBattleConfig(ADVENTURE, "charmander", 4), modifiers: [{ type: "opponentPassives" as const, passives: ["start_attached_energy" as const] }] };
    const state = create(config, 5);
    expect(state.passives).toEqual({ opponent: ["start_attached_energy"] });
    expect(swapSides(state).passives).toEqual({ player: ["start_attached_energy"] });
  });
});
