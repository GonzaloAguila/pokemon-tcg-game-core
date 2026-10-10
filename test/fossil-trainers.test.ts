/**
 * Fossil Trainers through playTrainerCard: Mr. Fuji, Energy Search, Gambler, Recycle.
 */
import { describe, it, expect } from "vitest";
import { canPlayTrainerCard, getTrainerCoinFlips, getTrainerSteps, playTrainerCard, TRAINER_EFFECTS } from "@/domain/effects";
import { ownedCardIds } from "@/domain/simulation";
import { EnergyType } from "@/domain/constants";
import { makeState, inPlay, gameCard, energy, deepFreeze, names } from "./helpers/state";

const { Water, Fire, Grass } = EnergyType;

describe("Mr. Fuji: shuffle a Benched Pokémon and its cards into the deck", () => {
  it("needs a Benched Pokémon; the Pokémon, its Energy and lower stages go into the deck", () => {
    const fuji = gameCard("Mr. Fuji", "fossil");
    const kabuto = inPlay("Kabuto", { set: "fossil", energy: [Water], evolvedFrom: ["Mysterious Fossil"], damage: 10 });
    const state = deepFreeze(makeState({ player: { active: inPlay("Machop"), bench: [kabuto], hand: [fuji] }, opponent: { active: inPlay("Abra") } }));
    expect(TRAINER_EFFECTS["Mr. Fuji"]).toBeDefined();
    expect(canPlayTrainerCard(makeState({ player: { active: inPlay("Machop"), hand: [fuji] } }), fuji.id)).toMatch(/[Bb]anca/);
    expect(getTrainerSteps(state, fuji.id, [])!.options.map((o) => o.id)).toEqual([kabuto.pokemon.id]);

    const next = playTrainerCard(state, fuji.id, [[kabuto.pokemon.id]]);
    expect(next.playerBench).toEqual([]);
    expect(next.playerDeck).toHaveLength(13);
    expect(names(next.playerDeck).filter((n) => n !== "Grass Energy").sort()).toEqual(["Kabuto", "Mysterious Fossil", "Water Energy"]);
    expect(next.playerDeck.find((c) => c.name === "Mysterious Fossil")!.kind).toBe("trainer");
    expect(names(next.playerDiscard)).toEqual(["Mr. Fuji"]);
    expect(ownedCardIds(next, "player").sort()).toEqual(ownedCardIds(state, "player").sort());
  });
});

describe("Energy Search: a basic Energy card from the deck to the hand", () => {
  it("offers the basic Energy cards of the deck (not Double Colorless) and shuffles", () => {
    const search = gameCard("Energy Search", "fossil");
    const deck = [energy(Fire), gameCard("Abra"), energy(EnergyType.Colorless)];
    const state = makeState({ player: { active: inPlay("Machop"), hand: [search], deck } });
    const step = getTrainerSteps(state, search.id, [])!;
    expect(step.options.map((o) => o.id)).toEqual([deck[0].id]);
    const next = playTrainerCard(state, search.id, [[deck[0].id]]);
    expect(names(next.playerHand)).toEqual(["Fire Energy"]);
    expect(next.playerDeck).toHaveLength(2);
    expect(names(next.playerDiscard)).toEqual(["Energy Search"]);
  });

  it("with no basic Energy in the deck it is still played (the search finds nothing); refused with an empty deck", () => {
    const search = gameCard("Energy Search", "fossil");
    const state = makeState({ player: { active: inPlay("Machop"), hand: [search], deck: [gameCard("Abra")] } });
    expect(getTrainerSteps(state, search.id, [])).toBeNull();
    expect(playTrainerCard(state, search.id, []).playerHand).toEqual([]);
    expect(canPlayTrainerCard(makeState({ player: { active: inPlay("Machop"), hand: [search], deck: [] } }), search.id)).toMatch(/mazo/);
  });
});

describe("Gambler: shuffle the hand into the deck; heads draw 8, tails draw 1", () => {
  it("flips one coin (the caller flips it)", () => {
    const gambler = gameCard("Gambler", "fossil");
    const hand = [gambler, gameCard("Abra"), energy(Grass)];
    const state = makeState({ player: { active: inPlay("Machop"), hand } });
    expect(getTrainerCoinFlips(state, gambler.id)).toBe(1);
    const heads = playTrainerCard(state, gambler.id, [], { coinResults: ["heads"] });
    expect(heads.playerHand).toHaveLength(8);
    expect(heads.playerDeck).toHaveLength(10 + 2 - 8);
    expect(names(heads.playerDiscard)).toEqual(["Gambler"]);
    const tails = playTrainerCard(state, gambler.id, [], { coinResults: ["tails"] });
    expect(tails.playerHand).toHaveLength(1);
    expect(tails.playerDeck).toHaveLength(11);
    expect(() => playTrainerCard(state, gambler.id, [])).toThrow();
  });

  it("draws what is left when the deck is short", () => {
    const gambler = gameCard("Gambler", "fossil");
    const state = makeState({ player: { active: inPlay("Machop"), hand: [gambler, gameCard("Abra")], deck: [energy(Water)] } });
    expect(playTrainerCard(state, gambler.id, [], { coinResults: ["heads"] }).playerHand).toHaveLength(2);
  });
});

describe("Recycle: flip a coin; heads puts a card of the discard pile on top of the deck", () => {
  it("heads asks for a card of the discard pile; tails does nothing else", () => {
    const recycle = gameCard("Recycle", "fossil");
    const discard = [gameCard("Bill"), energy(Water)];
    const state = makeState({ player: { active: inPlay("Machop"), hand: [recycle], discard } });
    expect(getTrainerCoinFlips(state, recycle.id)).toBe(1);
    expect(getTrainerSteps(state, recycle.id, [], ["heads"])!.options.map((o) => o.id)).toEqual(discard.map((c) => c.id));
    expect(getTrainerSteps(state, recycle.id, [], ["tails"])).toBeNull();
    const heads = playTrainerCard(state, recycle.id, [[discard[0].id]], { coinResults: ["heads"] });
    expect(heads.playerDeck[0].name).toBe("Bill");
    expect(names(heads.playerDiscard)).toEqual(["Water Energy", "Recycle"]);
    const tails = playTrainerCard(state, recycle.id, [], { coinResults: ["tails"] });
    expect(names(tails.playerDiscard)).toEqual(["Bill", "Water Energy", "Recycle"]);
    expect(tails.playerDeck).toHaveLength(10);
  });
});
