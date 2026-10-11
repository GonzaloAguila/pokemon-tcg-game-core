/**
 * Who flips each coin of a Trainer / power (getTrainerCoinFlippers / getPowerCoinFlippers):
 * consumers caption coins with it instead of keying on card names.
 */
import { describe, it, expect } from "vitest";
import { getPowerCoinFlippers, getTrainerCoinFlippers } from "@/index";
import { makeState, inPlay, gameCard } from "./helpers/state";

describe("getTrainerCoinFlippers", () => {
  it("Digger: you, the opponent, you... for as many coins as were flipped", () => {
    const digger = gameCard("Digger", "rocket");
    const state = makeState({ player: { active: inPlay("Machop"), hand: [digger] }, opponent: { active: inPlay("Onix") } });
    expect(getTrainerCoinFlippers(state, digger.id, 4)).toEqual(["self", "opponent", "self", "opponent"]);
    expect(getTrainerCoinFlippers(state, digger.id, 1)).toEqual(["self"]);
    expect(getTrainerCoinFlippers(state, digger.id, 0)).toEqual([]);
  });

  it("every other Trainer's coins are flipped by its player", () => {
    const gambler = gameCard("Gambler", "fossil");
    const pokeBall = gameCard("Poké Ball", "jungle");
    const state = makeState({ player: { active: inPlay("Machop"), hand: [gambler, pokeBall] }, opponent: { active: inPlay("Onix") } });
    expect(getTrainerCoinFlippers(state, gambler.id, 1)).toEqual(["self"]);
    expect(getTrainerCoinFlippers(state, pokeBall.id, 1)).toEqual(["self"]);
  });

  it("a card that isn't a playable Trainer in the hand: the player (nothing to say otherwise)", () => {
    const state = makeState({ player: { active: inPlay("Machop") }, opponent: { active: inPlay("Onix") } });
    expect(getTrainerCoinFlippers(state, "missing", 2)).toEqual(["self", "self"]);
  });
});

describe("getPowerCoinFlippers", () => {
  it("a power's coins (Long-Distance Hypnosis, Heal) are flipped by its owner", () => {
    const drowzee = inPlay("Drowzee", { set: "rocket" });
    const state = makeState({ player: { active: drowzee }, opponent: { active: inPlay("Onix") } });
    expect(getPowerCoinFlippers(state, drowzee.pokemon.id, 1)).toEqual(["self"]);
  });
});
