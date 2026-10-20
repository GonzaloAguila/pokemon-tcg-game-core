/**
 * Cards shown in the log (LogCard: name + image, never an id) and deck searches that list the
 * whole deck (the cards that can't be taken are disabled options).
 */
import { describe, it, expect } from "vitest";
import { createGameEvent, executeAttack, endTurn, toLogCards } from "@/lib/gameState";
import type { GameState } from "@/lib/gameState";
import { resolveAttackChoice } from "@/lib/attackChoices";
import { getTrainerSteps, playTrainerCard } from "@/domain/effects";
import { swapSides } from "@/domain/board";
import { EnergyType } from "@/domain/constants";
import { IllegalActionError } from "@/shared/errors";
import { makeState, inPlay, gameCard, energy, armedFor, names, deepFreeze, takeable } from "./helpers/state";

const { Water, Fire, Psychic } = EnergyType;

describe("LogCard events", () => {
  it("createGameEvent carries cards as name + image only; no cards = no field", () => {
    const abra = gameCard("Abra");
    const event = createGameEvent("x", "info", toLogCards([abra]));
    expect(event.cards).toEqual([{ name: "Abra", imageUrl: expect.stringMatching(/^https?:\/\//) }]);
    expect(JSON.stringify(event.cards)).not.toContain(abra.id);
    expect(createGameEvent("x", "info", []).cards).toBeUndefined();
    expect("cards" in createGameEvent("x")).toBe(false);
  });

  it("swapping sides keeps the events (and their cards) untouched", () => {
    const event = createGameEvent("x", "info", toLogCards([gameCard("Abra")]));
    const state = makeState({ events: [event] });
    expect(swapSides(state).events[0]).toEqual(event);
  });
});

describe("Lass shows both hands in the log", () => {
  it("one event per player with the hand as it was when Lass was played (Lass aside)", () => {
    const lass = gameCard("Lass", "base");
    const mine = [lass, gameCard("Potion", "base"), gameCard("Abra")];
    const theirs = [gameCard("Bill", "base"), gameCard("Onix")];
    const state = deepFreeze(makeState({ player: { hand: mine, active: inPlay("Abra") }, opponent: { hand: theirs, active: inPlay("Onix") } }));
    const next = playTrainerCard(state, lass.id, []);
    const shown = (prefix: string) => next.events.find((e) => e.message === prefix)!;
    expect(shown("Lass: mano de quien la jugó").cards!.map((c) => c.name)).toEqual(["Potion", "Abra"]);
    expect(shown("Lass: mano del otro jugador").cards!.map((c) => c.name)).toEqual(["Bill", "Onix"]);
    // The Trainers still go back to the decks
    expect(names(next.playerHand)).toEqual(["Abra"]);
    expect(names(next.opponentHand)).toEqual(["Onix"]);
  });

  it("an empty hand is said, with no cards", () => {
    const lass = gameCard("Lass", "base");
    const state = makeState({ player: { hand: [lass], active: inPlay("Abra") }, opponent: { hand: [], active: inPlay("Onix") } });
    const next = playTrainerCard(state, lass.id, []);
    const empty = next.events.filter((e) => /está vacía/.test(e.message));
    expect(empty.map((e) => e.message)).toEqual(["Lass: la mano de quien la jugó está vacía", "Lass: la mano del otro jugador está vacía"]);
    expect(empty.every((e) => e.cards === undefined)).toBe(true);
  });
});

describe("Sabrina's Mr. Mime — Juego de Manos, end to end", () => {
  const mime = () => armedFor(inPlay("Sabrina's Mr. Mime", { set: "gym-heroes" }), "Juego de Manos");
  const table = (hand: ReturnType<typeof gameCard>[], deck: ReturnType<typeof gameCard>[]) =>
    deepFreeze(makeState({ player: { active: mime(), hand, deck }, opponent: { active: inPlay("Onix") } }));
  const attack = (state: GameState) => executeAttack(state, 0, { coinResults: [] });
  const passed = (state: GameState) => {
    expect(state.pendingAttackChoice).toBeUndefined();
    expect(state.isPlayerTurn).toBe(false);
  };

  it("put back 2, take 2 basic Energy: the found Energy is shown in the log; the turn ends", () => {
    const hand = [gameCard("Abra"), gameCard("Potion", "base"), gameCard("Machop")];
    const deck = [energy(Water), gameCard("Onix"), energy(Fire), energy(Psychic)];
    const first = attack(table(hand, deck));
    const putBack = first.pendingAttackChoice!.step;
    expect(putBack.source).toBe("hand");
    const second = resolveAttackChoice(first, [hand[0].id, hand[2].id]);
    const search = second.pendingAttackChoice!.step;
    // The whole deck (the 2 cards put back on top included); only basic Energy can be taken
    expect(search.cards!.length).toBe(6);
    expect(names(takeable(search))).toEqual(["Water Energy", "Fire Energy", "Psychic Energy"]);
    expect(() => resolveAttackChoice(second, [hand[0].id, deck[0].id])).toThrow(IllegalActionError);
    const done = resolveAttackChoice(second, [deck[0].id, deck[3].id]);
    passed(done);
    const found = done.events.find((e) => e.cards && /Juego de Manos/.test(e.message))!;
    expect(found.cards!.map((c) => c.name)).toEqual(["Water Energy", "Psychic Energy"]);
  });

  it("nothing put back: no search, the deck is shuffled and the turn ends", () => {
    const hand = [gameCard("Abra")];
    const first = attack(table(hand, [energy(Water), gameCard("Onix")]));
    const done = resolveAttackChoice(first, []);
    passed(done);
    expect(names(done.playerHand)).toEqual(["Abra"]);
    expect(done.events.some((e) => /Se mezcló el mazo/.test(e.message))).toBe(true);
  });

  it("an empty hand: no question at all, the turn ends", () => {
    const after = attack(table([], [energy(Water)]));
    expect(after.pendingAttackChoice).toBeUndefined();
    expect(after.isPlayerTurn).toBe(false);
  });

  it("cards put back but no basic Energy in the deck: resolved, nothing is stuck", () => {
    const hand = [gameCard("Abra")];
    const first = attack(table(hand, [gameCard("Onix")]));
    const done = resolveAttackChoice(first, [hand[0].id]);
    passed(done);
    expect(names(done.playerDeck).sort()).toEqual(["Abra", "Onix"]);
    expect(() => endTurn(done)).not.toThrow();
  });
});

describe("deck searches list the whole deck", () => {
  it("Energy Search: every deck card, only basic Energy enabled; a disabled card is rejected", () => {
    const search = gameCard("Energy Search");
    const deck = [gameCard("Abra"), energy(Water), gameCard("Double Colorless Energy", "base"), gameCard("Potion", "base")];
    const state = makeState({ player: { hand: [search], deck, active: inPlay("Abra") }, opponent: { active: inPlay("Onix") } });
    const step = getTrainerSteps(state, search.id, [])!;
    expect(step.cards!.map((c) => c.id).sort()).toEqual(deck.map((c) => c.id).sort());
    expect(step.options.length).toBe(deck.length);
    expect(names(takeable(step))).toEqual(["Water Energy"]);
    expect(step.maxSelections).toBe(1);
    expect(() => playTrainerCard(state, search.id, [[deck[0].id]])).toThrow(IllegalActionError);
    expect(names(playTrainerCard(state, search.id, [[deck[1].id]]).playerHand)).toEqual(["Water Energy"]);
  });

  it("Poké Ball (heads) and The Boss's Way: the whole deck, Pokémon / Dark Evolutions enabled", () => {
    const ball = gameCard("Poké Ball");
    const boss = gameCard("The Boss's Way", "rocket");
    const deck = [energy(Fire), gameCard("Dark Golbat", "rocket"), gameCard("Potion", "base"), gameCard("Abra")];
    const state = makeState({ player: { hand: [ball, boss], deck, active: inPlay("Abra") }, opponent: { active: inPlay("Onix") } });
    const ballStep = getTrainerSteps(state, ball.id, [], ["heads"])!;
    expect(ballStep.cards!.length).toBe(4);
    expect(names(takeable(ballStep))).toEqual(["Dark Golbat", "Abra"]);
    const bossStep = getTrainerSteps(state, boss.id, [])!;
    expect(bossStep.cards!.length).toBe(4);
    expect(names(takeable(bossStep))).toEqual(["Dark Golbat"]);
  });
});
