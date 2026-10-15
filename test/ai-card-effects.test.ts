/**
 * The AI plays Fossil / Team Rocket Trainers and activated powers when clearly useful.
 * Human = "player", AI = "opponent", AI's turn. Cards that change the AI's hand are played
 * alone (the plan has no endTurn) so the turn is planned again with the new cards.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { decideOpponentTurn, executeAIAction, type AIAction } from "@/domain/ai";
import type { GameState, PokemonInPlay } from "@/lib/gameState";
import { EnergyType } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, armedFor, names } from "./helpers/state";

const { Fire, Water, Fighting, Psychic, Grass } = EnergyType;
type Setup = NonNullable<Parameters<typeof makeState>[0]>;

afterEach(() => vi.restoreAllMocks());

function aiTurn(ai: Setup["opponent"], human: Setup["player"] = { active: inPlay("Onix") }, extra: Setup = {}): GameState {
  return makeState({ turnNumber: 6, isPlayerTurn: false, ...extra, player: human, opponent: ai });
}

const run = (state: GameState, plan: AIAction[]) => plan.reduce((s, action) => executeAIAction(s, action), state);
const trainersIn = (plan: AIAction[]) => plan.flatMap((a) => (a.type === "playTrainer" ? [a.trainerName] : []));
const powersIn = (plan: AIAction[]) => plan.flatMap((a) => (a.type === "usePower" ? [a.powerName] : []));
const endsTurn = (plan: AIAction[]) => plan.some((a) => a.type === "endTurn" || a.type === "attack");
const firstAttack = (p: PokemonInPlay) => (p.pokemon.kind === "pokemon" ? p.pokemon.attacks[0].name : "");

describe("Trainers that change the AI's hand are played first, then the turn is planned again", () => {
  it("Energy Search with no Energy in hand: takes the type its Active needs, then attaches it", () => {
    const search = gameCard("Energy Search", "fossil");
    const state = aiTurn({ active: inPlay("Charmander", { set: "base" }), hand: [search], deck: [energy(Water), energy(Fire), energy(Water), energy(Water), energy(Water)] });
    const plan = decideOpponentTurn(state);
    expect(trainersIn(plan)).toEqual(["Energy Search"]);
    expect(endsTurn(plan)).toBe(false);
    const after = run(state, plan);
    expect(names(after.opponentHand)).toEqual(["Fire Energy"]);
    expect(after.isPlayerTurn).toBe(false);
    expect(decideOpponentTurn(after).some((a) => a.type === "attachEnergy")).toBe(true);
  });

  it("Bill is played before the rest of the turn", () => {
    const bill = gameCard("Bill", "base");
    const deck = Array.from({ length: 30 }, () => energy(Fighting));
    const state = aiTurn({ active: inPlay("Machop"), hand: [bill], deck });
    const plan = decideOpponentTurn(state);
    expect(trainersIn(plan)).toEqual(["Bill"]);
    expect(endsTurn(plan)).toBe(false);
    expect(run(state, plan).opponentHand).toHaveLength(2);
  });

  it("no Bill late in a long game when its deck would run out before the other one", () => {
    const bill = gameCard("Bill", "base");
    // 10 cards left on both sides: drawing 2 more risks losing the deck-out race
    const state = aiTurn({ active: inPlay("Machop"), hand: [bill] });
    expect(trainersIn(decideOpponentTurn(state))).toEqual([]);
  });

  it("Gambler only with a small hand", () => {
    const gambler = gameCard("Gambler", "fossil");
    const small = aiTurn({ active: inPlay("Machop"), hand: [gambler] });
    expect(trainersIn(decideOpponentTurn(small))).toEqual(["Gambler"]);
    vi.spyOn(Math, "random").mockReturnValue(0.1); // heads: 8 cards
    expect(run(small, decideOpponentTurn(small)).opponentHand).toHaveLength(8);
    const big = aiTurn({ active: inPlay("Machop"), hand: [gambler, energy(Fire), energy(Fire), gameCard("Potion", "base")] });
    expect(trainersIn(decideOpponentTurn(big))).not.toContain("Gambler");
  });

  it("The Boss's Way takes a Dark evolution of a Pokémon it has in play", () => {
    const boss = gameCard("The Boss's Way", "rocket");
    const state = aiTurn({ active: inPlay("Ekans"), hand: [boss], deck: [energy(Grass), gameCard("Dark Arbok", "rocket"), energy(Grass)] });
    const plan = decideOpponentTurn(state);
    expect(trainersIn(plan)).toEqual(["The Boss's Way"]);
    expect(names(run(state, plan).opponentHand)).toEqual(["Dark Arbok"]);
  });
});

describe("other Trainers", () => {
  it("Recycle puts an Energy back on top of the deck", () => {
    const recycle = gameCard("Recycle", "fossil");
    const state = aiTurn({ active: inPlay("Machop"), hand: [recycle], discard: [gameCard("Bill", "base"), energy(Fighting)] });
    const plan = decideOpponentTurn(state);
    expect(trainersIn(plan)).toContain("Recycle");
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    expect(run(state, plan.filter((a) => a.type === "playTrainer")).opponentDeck[0].name).toBe("Fighting Energy");
  });

  it("Nightly Garbage Run when the deck runs low", () => {
    const garbage = gameCard("Nightly Garbage Run", "rocket");
    const discard = [energy(Fighting), gameCard("Machoke")];
    const low = aiTurn({ active: inPlay("Machop"), hand: [garbage], deck: [energy(Fighting), energy(Fighting)], discard });
    const plan = decideOpponentTurn(low);
    expect(trainersIn(plan)).toContain("Nightly Garbage Run");
    expect(run(low, plan.filter((a) => a.type === "playTrainer")).opponentDeck).toHaveLength(4);
    const full = aiTurn({ active: inPlay("Machop"), hand: [garbage], discard });
    expect(trainersIn(decideOpponentTurn(full))).not.toContain("Nightly Garbage Run");
  });

  it("Imposter Oak's Revenge against a big hand, discarding a card it doesn't need", () => {
    const oak = gameCard("Imposter Oak's Revenge", "rocket");
    const digger = gameCard("Digger", "rocket");
    const humanHand = Array.from({ length: 7 }, () => energy(Water));
    const state = aiTurn({ active: inPlay("Machop"), hand: [oak, digger] }, { active: inPlay("Onix"), hand: humanHand });
    const plan = decideOpponentTurn(state);
    expect(trainersIn(plan)).toContain("Imposter Oak's Revenge");
    const after = run(state, plan.filter((a) => a.type === "playTrainer"));
    expect(after.playerHand).toHaveLength(4);
    expect(names(after.opponentDiscard)).toEqual(["Digger", "Imposter Oak's Revenge"]);
    const small = aiTurn({ active: inPlay("Machop"), hand: [oak, digger] }, { active: inPlay("Onix"), hand: humanHand.slice(0, 3) });
    expect(trainersIn(decideOpponentTurn(small))).not.toContain("Imposter Oak's Revenge");
  });

  it("Rocket's Sneak Attack shuffles one of the human's Trainers into their deck", () => {
    const sneak = gameCard("Rocket's Sneak Attack", "rocket");
    const bill = gameCard("Bill", "base");
    const state = aiTurn({ active: inPlay("Machop"), hand: [sneak] }, { active: inPlay("Onix"), hand: [energy(Water), bill, energy(Water)] });
    const plan = decideOpponentTurn(state);
    expect(trainersIn(plan)).toContain("Rocket's Sneak Attack");
    const after = run(state, plan.filter((a) => a.type === "playTrainer"));
    expect(names(after.playerHand)).toEqual(["Water Energy", "Water Energy"]);
  });

  it("Goop Gas Attack before attacking into a passive power; Sleep! on an awake Defending Pokémon", () => {
    const goop = gameCard("Goop Gas Attack", "rocket");
    const sleep = gameCard("Sleep!", "rocket");
    const machop = armedFor(inPlay("Machop"), firstAttack(inPlay("Machop")));
    const state = aiTurn({ active: machop, hand: [goop, sleep] }, { active: inPlay("Mr. Mime", { set: "jungle" }) });
    const plan = decideOpponentTurn(state);
    expect(trainersIn(plan)).toEqual(expect.arrayContaining(["Goop Gas Attack", "Sleep!"]));
    expect(plan.at(-1)!.type).toBe("attack");
    const noPower = aiTurn({ active: machop, hand: [goop] }, { active: inPlay("Onix") });
    expect(trainersIn(decideOpponentTurn(noPower))).not.toContain("Goop Gas Attack");
  });

  it("Mr. Fuji only for a badly damaged Benched Pokémon without Energy", () => {
    const fuji = gameCard("Mr. Fuji", "fossil");
    const hurt = inPlay("Abra", { damage: 20 });
    const state = aiTurn({ active: inPlay("Machop"), bench: [hurt, inPlay("Machop")], hand: [fuji] });
    const plan = decideOpponentTurn(state);
    expect(trainersIn(plan)).toContain("Mr. Fuji");
    expect(run(state, plan.filter((a) => a.type === "playTrainer")).opponentBench.map((p) => p.pokemon.name)).toEqual(["Machop"]);
    const fine = aiTurn({ active: inPlay("Machop"), bench: [inPlay("Abra"), inPlay("Machop")], hand: [fuji] });
    expect(trainersIn(decideOpponentTurn(fine))).not.toContain("Mr. Fuji");
  });

  it("never plays Challenge! (the human would have to answer), Digger or Here Comes Team Rocket!", () => {
    const hand = [gameCard("Challenge!", "rocket"), gameCard("Digger", "rocket"), gameCard("Here Comes Team Rocket!", "rocket")];
    const state = aiTurn({ active: inPlay("Machop"), hand, deck: [gameCard("Abra"), gameCard("Abra")] });
    expect(trainersIn(decideOpponentTurn(state))).toEqual([]);
  });

  it("no Trainer at all under Hay Fever", () => {
    const state = aiTurn({ active: inPlay("Machop"), hand: [gameCard("Bill", "base"), gameCard("Sleep!", "rocket")] }, {
      active: inPlay("Onix"),
      bench: [inPlay("Dark Vileplume", { set: "rocket" })],
    });
    expect(trainersIn(decideOpponentTurn(state))).toEqual([]);
  });
});

describe("activated powers", () => {
  it("Step In: a Benched Dragonite that can attack replaces an Active that can't, then attacks", () => {
    const dragonite = inPlay("Dragonite", { set: "fossil" });
    const armed = armedFor(dragonite, firstAttack(dragonite));
    const state = aiTurn({ active: inPlay("Machop"), bench: [armed] });
    const plan = decideOpponentTurn(state);
    expect(powersIn(plan)).toEqual(["Entrada"]);
    expect(plan.at(-1)!.type).toBe("attack");
    const after = run(state, plan);
    expect(after.opponentActivePokemon!.pokemon.name).toBe("Dragonite");
    expect(after.isPlayerTurn).toBe(true);
  });

  it("Gather Fire: Charmander takes a Fire Energy from the Bench when it can't attack", () => {
    const charmander = inPlay("Charmander", { set: "rocket" });
    const magmar = inPlay("Magmar", { set: "base", energy: [Fire] });
    const state = aiTurn({ active: charmander, bench: [magmar] });
    const plan = decideOpponentTurn(state);
    expect(powersIn(plan)).toEqual(["Reunir Fuego"]);
    const after = run(state, plan);
    expect(after.opponentActivePokemon!.attachedEnergy).toHaveLength(1);
  });

  it("Evolutionary Light fetches an evolution of a Pokémon in play (hand changes: planned alone)", () => {
    const dragonair = inPlay("Dark Dragonair", { set: "rocket" });
    const state = aiTurn({ active: inPlay("Charmander", { set: "base" }), bench: [dragonair], deck: [energy(Psychic), gameCard("Charmeleon", "base"), energy(Psychic)] });
    const plan = decideOpponentTurn(state);
    expect(powersIn(plan)).toEqual(["Luz Evolutiva"]);
    expect(endsTurn(plan)).toBe(false);
    expect(names(run(state, plan).opponentHand)).toEqual(["Charmeleon"]);
  });

  it("Matter Exchange swaps a card it doesn't need for a new one", () => {
    const kadabra = inPlay("Dark Kadabra", { set: "rocket" });
    const digger = gameCard("Digger", "rocket");
    const state = aiTurn({ active: inPlay("Machop"), bench: [kadabra], hand: [digger] });
    const plan = decideOpponentTurn(state);
    expect(powersIn(plan)).toEqual(["Intercambio de Materia"]);
    const after = run(state, plan);
    expect(names(after.opponentDiscard)).toEqual(["Digger"]);
    expect(after.opponentHand).toHaveLength(1);
    expect(powersIn(decideOpponentTurn(aiTurn({ active: inPlay("Machop"), bench: [kadabra], hand: [energy(Fighting)] })))).toEqual([]);
  });

  it("Strange Behavior moves the Active's damage onto a Benched Slowbro, keeping Slowbro alive", () => {
    const slowbro = inPlay("Slowbro", { set: "fossil" });
    const state = aiTurn({ active: inPlay("Machop", { damage: 30 }), bench: [slowbro] });
    const plan = decideOpponentTurn(state);
    expect(powersIn(plan)).toEqual(["Comportamiento Extraño", "Comportamiento Extraño", "Comportamiento Extraño"]);
    const after = run(state, plan);
    expect(after.opponentActivePokemon?.currentDamage ?? 0).toBe(0);
    expect(after.opponentBench[0].currentDamage).toBe(30);
  });
});
