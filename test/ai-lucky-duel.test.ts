import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLuckyDuelDeck,
  decideOpponentSetup,
  decideOpponentTurn,
  endTurn,
  executeAIAction,
  findCardById,
  initializeLuckyDuelGame,
  setPlayerReady,
  startPlayingPhase,
  swapSides,
} from "../src";
import type { GameState, PokemonCard } from "../src";
import { EnergyType, GamePhase, StatusCondition } from "../src/domain/constants";
import { mulberry32 } from "../src/domain/simulation/rng";
import { handCardValue, wantedFromDeck } from "../src/domain/ai/cardEffects";
import { armedFor, energies, gameCard, inPlay, makeState } from "./helpers/state";

const basic = (id: string) => findCardById(id) as PokemonCard;

/** One AI turn the way the frontend's useAIOpponent runs it: plans until one ends the turn (max 20). */
function aiTurn(state: GameState): GameState {
  for (let plans = 0; plans < 20 && !state.isPlayerTurn && state.gameResult === null; plans++) {
    const before = state;
    for (const action of decideOpponentTurn(state)) {
      state = executeAIAction(state, action);
      if (state.gameResult !== null) return state;
    }
    if (state === before || state.events.length === before.events.length) state = endTurn(state);
  }
  return state.isPlayerTurn || state.gameResult !== null ? state : endTurn(state);
}

/** A Lucky Duel game state from the human's view ("player"), the AI on the "opponent" side. */
const lucky = (setup: Parameters<typeof makeState>[0]): GameState => ({
  ...makeState(setup),
  gameMode: "lucky-duel",
  luckyDuelRevealed: true,
  prizeCount: 0,
  playerPrizes: [],
  opponentPrizes: [],
});

afterEach(() => vi.restoreAllMocks());

describe("Lucky Duel vs the AI (single-player flow)", () => {
  it("human view: the AI has nothing to set up, both ready, reveal, the AI plays and wins against a passive player", () => {
    vi.spyOn(Math, "random").mockImplementation(mulberry32(5));
    const human = buildLuckyDuelDeck(basic("jungle-005-kangaskhan"), mulberry32(11));
    const ai = buildLuckyDuelDeck(basic("base-set-046-charmander"), mulberry32(12));
    let state = initializeLuckyDuelGame(human, ai, mulberry32(13));
    expect(decideOpponentSetup(state)).toEqual([]);
    state = setPlayerReady(state, false); // the AI is ready at once
    state = setPlayerReady(state, true);
    state = startPlayingPhase(state, "tails"); // the AI starts
    expect(state.luckyDuelRevealed).toBe(true);
    expect(state.isPlayerTurn).toBe(false);

    let aiAttacks = 0;
    for (let turn = 0; turn < 120 && state.gameResult === null; turn++) {
      if (state.isPlayerTurn) {
        state = endTurn(state);
      } else {
        const before = state.events.length;
        state = aiTurn(state);
        if (state.events.slice(before).some((e) => /usó|atac/i.test(e.message))) aiAttacks++;
      }
      // Never a Bench in a Lucky Duel
      expect(state.opponentBench).toEqual([]);
      expect(state.playerBench).toEqual([]);
    }
    expect(aiAttacks).toBeGreaterThan(0);
    expect(state.gameResult).toBe("defeat");
    expect(state.gamePhase).toBe(GamePhase.GameOver);
    expect(state.opponentDeck.length).toBeGreaterThan(0);
  });

  it("the AI attacks for damage instead of passing (no Prize logic)", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const hitmonchan = armedFor(inPlay("Hitmonchan", { set: "base" }), "Puño Bala");
    // AI = "player" side of this state, the human is the opponent: build it from the AI's view and swap
    const aiView = lucky({ player: { active: hitmonchan }, opponent: { active: inPlay("Kangaskhan", { set: "jungle" }) } });
    const humanView = swapSides(aiView);
    const actions = decideOpponentTurn(humanView);
    expect(actions.some((a) => a.type === "attack")).toBe(true);
  });

  it("the AI doesn't Selfdestruct into a loss, but takes a Knock Out that wins", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    // Magnemite's Selfdestruct would Knock Out only itself (Chansey survives): never
    const magnemite = armedFor(inPlay("Magnemite", { set: "base" }), "Autodestrucción");
    const losing = swapSides(lucky({ player: { active: magnemite }, opponent: { active: inPlay("Chansey", { set: "base" }) } }));
    const plan = decideOpponentTurn(losing);
    expect(plan.some((a) => a.type === "attack" && a.attackIndex === 1)).toBe(false);
  });

  it("an AI Selfdestruct that Knocks Out both Actives stays a draw through the executor", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const magnemite = armedFor(inPlay("Magnemite", { set: "base" }), "Autodestrucción");
    const humanView = swapSides(lucky({ player: { active: magnemite }, opponent: { active: inPlay("Abra", { set: "base" }) } }));
    const next = executeAIAction(humanView, { type: "attack", attackIndex: 1, attackName: "Autodestrucción", delay: 0 } as never);
    expect(next.gameResult).toBe("draw");
    expect(next.gamePhase).toBe(GamePhase.GameOver);
  });

  it("Blaine's Moltres, whose only attack may shuffle it away, still attacks", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const moltres = armedFor(inPlay("Blaine's Moltres", { set: "gym-heroes" }), "Llama Fénix");
    const humanView = swapSides(lucky({ player: { active: moltres }, opponent: { active: inPlay("Chansey", { set: "base" }) } }));
    expect(decideOpponentTurn(humanView).some((a) => a.type === "attack")).toBe(true);
  });

  it("the AI keeps its deck: no draw Trainers with a nearly empty deck", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const bill = gameCard("Bill");
    const aiView = (deckSize: number) => lucky({
      player: { active: inPlay("Kangaskhan", { set: "jungle", statuses: [StatusCondition.Paralyzed] }), hand: [bill], deck: energies(...Array(deckSize).fill(EnergyType.Fire)) },
      opponent: { active: inPlay("Chansey", { set: "base" }), deck: energies(...Array(30).fill(EnergyType.Fire)) },
    });
    const plays = (deckSize: number) => decideOpponentTurn(swapSides(aiView(deckSize))).some((a) => a.type === "playTrainer");
    expect(plays(30)).toBe(true);
    expect(plays(3)).toBe(false);
  });

  it("the deck's extra Pokémon: no Poké Ball / Computer Search for a Basic it can't play; it discards extras first", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const ball = gameCard("Poké Ball", "jungle");
    const deck = [gameCard("Pikachu", "base"), gameCard("Abra", "base"), ...energies(...Array(20).fill(EnergyType.Fire))];
    const aiView = lucky({
      player: { active: inPlay("Kangaskhan", { set: "jungle", statuses: [StatusCondition.Paralyzed] }), hand: [ball], deck },
      opponent: { active: inPlay("Chansey", { set: "base" }), deck: energies(...Array(30).fill(EnergyType.Fire)) },
    });
    expect(wantedFromDeck(aiView).some((want) => want(deck[0]))).toBe(false);
    expect(decideOpponentTurn(swapSides(aiView)).some((a) => a.type === "playTrainer")).toBe(false);
    // An extra evolution (nothing it evolves from can be played) is worth less than the line's own
    const withLine = lucky({
      player: { active: inPlay("Charmander", { set: "base" }), hand: [gameCard("Raichu", "base"), gameCard("Charizard", "base")], deck: [gameCard("Charmeleon", "base")] },
      opponent: { active: inPlay("Chansey", { set: "base" }) },
    });
    const [raichu, charizard] = withLine.playerHand;
    expect(handCardValue(withLine, raichu)).toBeLessThan(handCardValue(withLine, charizard));
    expect(handCardValue(withLine, raichu)).toBeLessThan(handCardValue(withLine, energies(EnergyType.Fire)[0]));
  });
});
