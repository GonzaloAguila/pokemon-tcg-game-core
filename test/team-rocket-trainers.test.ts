import { prizesOwed } from "@/lib/gameState";
/**
 * Team Rocket Trainers through the effect registry (playTrainerCard / getTrainerSteps).
 */
import { describe, it, expect } from "vitest";
import { endTurn } from "@/lib/gameState";
import type { GameState } from "@/lib/gameState";
import { canPlayTrainerCard, getTrainerCoinFlips, getTrainerSteps, playTrainerCard } from "@/domain/effects";
import { arePrizesRevealed, isPowerActive } from "@/domain/powers";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { IllegalActionError } from "@/shared/errors";
import { makeState, inPlay, gameCard, energy, names, deepFreeze } from "./helpers/state";

const { Fire, Water, Grass } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
const card = (name: string) => gameCard(name, "rocket");
const rocket = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "rocket", ...opts });

function withHand(hand: ReturnType<typeof gameCard>[], extra: Parameters<typeof makeState>[0] = {}): GameState {
  return makeState({ ...extra, player: { active: inPlay("Machop"), hand, ...(extra.player ?? {}) }, opponent: { active: inPlay("Onix"), ...(extra.opponent ?? {}) } });
}

describe("Here Comes Team Rocket!", () => {
  it("both players' Prizes are face up for the rest of the game", () => {
    const trainer = card("Here Comes Team Rocket!");
    const state = deepFreeze(withHand([trainer]));
    expect(arePrizesRevealed(state, "player")).toBe(false);
    const next = playTrainerCard(state, trainer.id);
    expect(arePrizesRevealed(next, "player")).toBe(true);
    expect(arePrizesRevealed(next, "opponent")).toBe(true);
    expect(names(next.playerDiscard)).toEqual(["Here Comes Team Rocket!"]);
    expect(arePrizesRevealed(endTurn(next), "player")).toBe(true);
  });
});

describe("Rocket's Sneak Attack", () => {
  it("shows the opponent's whole hand; a Trainer chosen there is shuffled into their deck", () => {
    const trainer = card("Rocket's Sneak Attack");
    const bill = gameCard("Bill", "base");
    const opponentHand = [energy(Fire), bill, card("Abra")];
    const state = withHand([trainer], { opponent: { hand: opponentHand, deck: [] } });
    const step = getTrainerSteps(state, trainer.id, [])!;
    expect(step.reveals).toBe("opponentHand");
    expect(step.cards).toHaveLength(3);
    expect(step.options.filter((o) => !o.disabled).map((o) => o.label)).toEqual(["Bill"]);
    expect(() => playTrainerCard(state, trainer.id, [[opponentHand[0].id]])).toThrow(IllegalActionError);
    const next = playTrainerCard(state, trainer.id, [[bill.id]]);
    expect(names(next.opponentHand)).toEqual(["Fire Energy", "Abra"]);
    expect(names(next.opponentDeck)).toEqual(["Bill"]);
  });

  it("with no Trainer in that hand the player just looks", () => {
    const trainer = card("Rocket's Sneak Attack");
    const state = withHand([trainer], { opponent: { hand: [energy(Fire)] } });
    expect(getTrainerSteps(state, trainer.id, [])!.minSelections).toBe(0);
    expect(playTrainerCard(state, trainer.id, [[]]).opponentHand).toHaveLength(1);
  });
});

describe("The Boss's Way", () => {
  it("an Evolution card with Dark in its name from the deck into the hand", () => {
    const trainer = card("The Boss's Way");
    const deck = [card("Dark Golbat"), card("Abra"), gameCard("Kadabra", "base"), card("Dark Raichu")];
    const state = withHand([trainer], { player: { deck } });
    const step = getTrainerSteps(state, trainer.id, [])!;
    expect(step.options.filter((o) => !o.disabled).map((o) => o.label)).toEqual(["Dark Golbat", "Dark Raichu"]);
    const next = playTrainerCard(state, trainer.id, [[deck[3].id]]);
    expect(names(next.playerHand)).toEqual(["Dark Raichu"]);
    expect(next.playerDeck).toHaveLength(3);
  });
});

describe("Challenge!", () => {
  it("declined: draw 2 cards", () => {
    const trainer = card("Challenge!");
    const state = withHand([trainer], { player: { deck: [card("Abra"), card("Machop"), card("Zubat")] } });
    const step = getTrainerSteps(state, trainer.id, [])!;
    expect(step.chooser).toBe("opponent");
    expect(step.options.map((o) => o.id)).toEqual(["accept", "decline"]);
    expect(getTrainerSteps(state, trainer.id, [["decline"]])).toBeNull();
    const next = playTrainerCard(state, trainer.id, [["decline"]]);
    expect(names(next.playerHand)).toEqual(["Machop", "Abra"]);
  });

  it("accepted: each player puts any number of Basic Pokémon from their deck onto their Bench (theirs is the opponent's step)", () => {
    const trainer = card("Challenge!");
    const myDeck = [card("Abra"), card("Dark Golbat"), card("Zubat")];
    const theirDeck = [card("Machop"), energy(Water), card("Eevee")];
    const state = withHand([trainer], { player: { deck: myDeck }, opponent: { deck: theirDeck, bench: [rocket("Ekans"), rocket("Ekans"), rocket("Ekans"), rocket("Ekans")] } });
    const mine = getTrainerSteps(state, trainer.id, [["accept"]])!;
    expect(mine.chooser).toBe("self");
    expect(mine.options.filter((o) => !o.disabled).map((o) => o.label)).toEqual(["Abra", "Zubat"]);
    expect(mine.minSelections).toBe(0);
    const theirs = getTrainerSteps(state, trainer.id, [["accept"], [myDeck[0].id]])!;
    expect(theirs.chooser).toBe("opponent");
    expect(theirs.maxSelections).toBe(1);
    const next = playTrainerCard(state, trainer.id, [["accept"], [myDeck[0].id, myDeck[2].id], [theirDeck[2].id]]);
    expect(names(next.playerBench.map((p) => p.pokemon))).toEqual(["Abra", "Zubat"]);
    expect(next.opponentBench).toHaveLength(5);
    expect(next.playerDeck).toHaveLength(1);
    expect(next.opponentDeck).toHaveLength(2);
    expect(next.playerHand).toHaveLength(0);
  });

  it("both Benches full: no question, draw 2", () => {
    const trainer = card("Challenge!");
    const full = Array.from({ length: 5 }, () => rocket("Ekans"));
    const state = withHand([trainer], { player: { bench: full }, opponent: { bench: Array.from({ length: 5 }, () => rocket("Ekans")) } });
    expect(getTrainerSteps(state, trainer.id, [])).toBeNull();
    expect(playTrainerCard(state, trainer.id, []).playerHand).toHaveLength(2);
  });
});

describe("Digger", () => {
  it("coins alternate (you, opponent, you...) until a tails: who got it does 10 to their own Active", () => {
    const trainer = card("Digger");
    const state = withHand([trainer]);
    expect(getTrainerCoinFlips(state, trainer.id)).toBe("untilTails");
    const mine = playTrainerCard(state, trainer.id, [], { coinResults: [T] });
    expect(mine.playerActivePokemon!.currentDamage).toBe(10);
    const theirs = playTrainerCard(state, trainer.id, [], { coinResults: [H, T] });
    expect(theirs.opponentActivePokemon!.currentDamage).toBe(10);
    expect(theirs.playerActivePokemon!.currentDamage).toBe(0);
    const mineAgain = playTrainerCard(state, trainer.id, [], { coinResults: [H, H, T] });
    expect(mineAgain.playerActivePokemon!.currentDamage).toBe(10);
  });

  it("can Knock Out your own Active (the opponent takes a Prize)", () => {
    const trainer = card("Digger");
    const state = makeState({ player: { active: inPlay("Machop", { damage: 40 }), bench: [inPlay("Abra")], hand: [trainer] }, opponent: { active: inPlay("Onix") } });
    const next = playTrainerCard(state, trainer.id, [], { coinResults: [T] });
    expect(next.playerActivePokemon).toBeNull();
    expect(next.playerNeedsToPromote).toBe(true);
    expect(prizesOwed(next, "opponent")).toBe(1);
  });
});

describe("Imposter Oak's Revenge", () => {
  it("discard a card from your hand: the opponent shuffles their hand into their deck and draws 4", () => {
    const trainer = card("Imposter Oak's Revenge");
    const bill = gameCard("Bill", "base");
    const state = withHand([trainer, bill], { opponent: { hand: [energy(Fire), energy(Fire)], deck: [energy(Grass), energy(Grass), energy(Grass)] } });
    expect(canPlayTrainerCard(withHand([trainer]), trainer.id)).not.toBeNull();
    const next = playTrainerCard(state, trainer.id, [[bill.id]]);
    expect(next.opponentHand).toHaveLength(4);
    expect(next.opponentDeck).toHaveLength(1);
    expect(names(next.playerDiscard).sort()).toEqual(["Bill", "Imposter Oak's Revenge"]);
    expect(next.playerHand).toHaveLength(0);
  });
});

describe("Nightly Garbage Run", () => {
  it("up to 3 Basic Pokémon, Evolution cards or basic Energy from the discard pile into the deck", () => {
    const trainer = card("Nightly Garbage Run");
    const discard = [card("Abra"), gameCard("Bill", "base"), energy(Fire), card("Dark Golbat"), card("Rainbow Energy"), gameCard("Mysterious Fossil", "fossil")];
    const state = withHand([trainer], { player: { discard, deck: [] } });
    const step = getTrainerSteps(state, trainer.id, [])!;
    expect(step.options.map((o) => o.label)).toEqual(["Abra", "Energía Fuego", "Dark Golbat"]);
    expect(step.maxSelections).toBe(3);
    const next = playTrainerCard(state, trainer.id, [[discard[0].id, discard[3].id]]);
    expect(names(next.playerDeck).sort()).toEqual(["Abra", "Dark Golbat"]);
    expect(names(next.playerDiscard).sort()).toEqual(["Bill", "Fire Energy", "Mysterious Fossil", "Nightly Garbage Run", "Rainbow Energy"]);
  });
});

describe("Goop Gas Attack", () => {
  it("every Pokémon Power stops until the end of the opponent's next turn", () => {
    const trainer = card("Goop Gas Attack");
    const state = withHand([trainer], { player: { bench: [inPlay("Venusaur")] }, opponent: { bench: [inPlay("Blastoise")] } });
    const next = playTrainerCard(state, trainer.id);
    expect(isPowerActive(next, next.playerBench[0])).toBe(false);
    const theirTurn = endTurn(next);
    expect(isPowerActive(theirTurn, theirTurn.opponentBench[0])).toBe(false);
    const back = endTurn(theirTurn);
    expect(isPowerActive(back, back.playerBench[0])).toBe(true);
  });
});

describe("Goop Gas Attack ending (simulator seed 74)", () => {
  it("a Ditto whose Transform works again is Knocked Out at the turn change when the copy's HP is too low", () => {
    const ditto = inPlay("Ditto", { set: "fossil", damage: 40 });
    const state = makeState({
      player: { active: inPlay("Magnemite") },
      opponent: { active: ditto, bench: [inPlay("Abra")] },
      powersSuppressed: [{ source: "Goop Gas Attack", expiresAfterTurn: 3 }],
    });
    const next = endTurn(state, true);
    expect(next.opponentActivePokemon).toBeNull();
    expect(next.opponentNeedsToPromote).toBe(true);
    expect(prizesOwed(next, "player")).toBe(1);
    expect(next.turnNumber).toBe(3);
  });
});

describe("Sleep!", () => {
  it("heads: the Defending Pokémon is now Asleep; tails: nothing", () => {
    const trainer = card("Sleep!");
    const state = withHand([trainer]);
    expect(getTrainerCoinFlips(state, trainer.id)).toBe(1);
    expect(playTrainerCard(state, trainer.id, [], { coinResults: [H] }).opponentActivePokemon!.statusConditions).toEqual([StatusCondition.Asleep]);
    expect(playTrainerCard(state, trainer.id, [], { coinResults: [T] }).opponentActivePokemon!.statusConditions).toEqual([]);
  });
});
