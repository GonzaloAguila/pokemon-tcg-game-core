/**
 * Gym Challenge Stadiums (Task 9): Resistance Gym, Cinnabar City Gym, Viridian City Gym, Fuchsia
 * City Gym, Saffron City Gym, Rocket's Minefield Gym and Chaos Gym, from the printed text and the
 * accepted defaults of docs/card-doubts.md → "Gym Challenge".
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { endTurn, executeAttack, type GameState } from "@/lib/gameState";
import {
  answerChaosGymOffer,
  canPlayTrainerCard,
  declineChaosGymOffer,
  getChaosGymOfferStep,
  getStadiumActionCoinFlips,
  getStadiumActionSteps,
  getStadiumActions,
  canUseStadiumAction,
  getTrainerCoinFlippers,
  getTrainerCoinFlips,
  getTrainerSteps,
  isChaosGymCoinPending,
  playTrainerCard,
  stepForAnswerer,
  useStadiumAction,
} from "@/domain/effects";
import { evolvePokemonCard, getPlayBasicCoinFlips, getTurnActionBlocker, playBasicPokemon, swapSides } from "@/domain/board";
import { answerChaosGymOfferForAI, stadiumValue } from "@/domain/ai";
import { IllegalActionError } from "@/shared/errors";
import { makeState, inPlay, gameCard, names, deepFreeze, armedFor } from "./helpers/state";

const H = "heads" as const;
const T = "tails" as const;
const card = (name: string) => gameCard(name, "gym-challenge");
const gc = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "gym-challenge", ...opts });
type Setup = NonNullable<Parameters<typeof makeState>[0]>;

function withStadium(name: string, extra: Setup = {}): GameState {
  return makeState({
    ...extra,
    player: { active: inPlay("Machop"), ...(extra.player ?? {}) },
    opponent: { active: inPlay("Onix"), ...(extra.opponent ?? {}) },
    stadium: { card: card(name), playedBy: "opponent" },
  });
}

afterEach(() => vi.restoreAllMocks());

// ============================================================================
// Resistance Gym / Cinnabar City Gym
// ============================================================================

describe("Resistance Gym", () => {
  it("Resistance −30 becomes −10 (Machop's 20 against a Pidgey resisting Fighting)", () => {
    const base = withStadium("Resistance Gym", { player: { active: armedFor(inPlay("Machop"), "Patada baja") }, opponent: { active: inPlay("Pidgey") } });
    expect(executeAttack(base, 0, { coinResults: [] }).opponentActivePokemon?.currentDamage).toBe(10);
    const none = { ...base, stadium: null };
    expect(executeAttack(none, 0, { coinResults: [] }).opponentActivePokemon?.currentDamage).toBe(0);
  });
});

describe("Cinnabar City Gym", () => {
  const attack = (defender: ReturnType<typeof inPlay>, stadium = "Cinnabar City Gym") =>
    executeAttack(withStadium(stadium, { player: { active: armedFor(inPlay("Seel"), "Cabezazo") }, opponent: { active: defender } }), 0, { coinResults: [] })
      .opponentActivePokemon?.currentDamage;

  it("a Water attacker ignores the Weakness of a Pokémon with Blaine in its name", () => {
    expect(attack(gc("Blaine's Charmander"))).toBe(10);
    expect(attack(gc("Blaine's Charmander"), "Resistance Gym")).toBe(20);
  });

  it("other Pokémon keep their Weakness", () => {
    expect(attack(inPlay("Charmander"))).toBe(20);
  });
});

// ============================================================================
// Viridian City Gym
// ============================================================================

describe("Viridian City Gym", () => {
  it("a Pokémon with Giovanni in its name that evolves loses 2 damage counters (1 if it has 1)", () => {
    const machoke = card("Giovanni's Machoke");
    const state = withStadium("Viridian City Gym", { player: { active: gc("Giovanni's Machop", { damage: 30 }), hand: [machoke] } });
    const evolved = evolvePokemonCard(deepFreeze(state), machoke.id, state.playerActivePokemon!.pokemon.id);
    expect(evolved.playerActivePokemon?.pokemon.name).toBe("Giovanni's Machoke");
    expect(evolved.playerActivePokemon?.currentDamage).toBe(10);
    const one = withStadium("Viridian City Gym", { player: { active: gc("Giovanni's Machop", { damage: 10 }), hand: [machoke] } });
    expect(evolvePokemonCard(one, machoke.id, one.playerActivePokemon!.pokemon.id).playerActivePokemon?.currentDamage).toBe(0);
  });

  it("Pokémon Breeder's evolution heals too; other Pokémon don't", () => {
    const machamp = card("Giovanni's Machamp");
    const breeder = gameCard("Pokémon Breeder", "base");
    const state = withStadium("Viridian City Gym", { player: { active: gc("Giovanni's Machop", { damage: 40 }), hand: [machamp, breeder] } });
    const bred = playTrainerCard(state, breeder.id, [[machamp.id], [state.playerActivePokemon!.pokemon.id]]);
    expect(bred.playerActivePokemon?.pokemon.name).toBe("Giovanni's Machamp");
    expect(bred.playerActivePokemon?.currentDamage).toBe(20);
    const machoke = gameCard("Machoke", "base");
    const plain = withStadium("Viridian City Gym", { player: { active: inPlay("Machop", { damage: 30 }), hand: [machoke] } });
    expect(evolvePokemonCard(plain, machoke.id, plain.playerActivePokemon!.pokemon.id).playerActivePokemon?.currentDamage).toBe(30);
  });
});

// ============================================================================
// Fuchsia City Gym / Saffron City Gym
// ============================================================================

describe("Fuchsia City Gym", () => {
  const setup = () => withStadium("Fuchsia City Gym", { player: { active: gc("Koga's Zubat", { energy: ["grass"] as never }), bench: [inPlay("Machop")] } });

  it("heads: a Pokémon with Koga in its name and its cards are shuffled into the deck (Active → promote)", () => {
    const state = setup();
    expect(getStadiumActions(state)).toEqual([{ name: "Fuchsia City Gym", available: null }]);
    expect(getStadiumActionCoinFlips(state)).toBe(1);
    const step = getStadiumActionSteps(state, [], [H])!;
    expect(step.options.map((o) => o.label)).toEqual(["Koga's Zubat"]);
    const deckBefore = state.playerDeck.length;
    const next = useStadiumAction(deepFreeze(state), [[state.playerActivePokemon!.pokemon.id]], { coinResults: [H] });
    expect(next.playerActivePokemon).toBeNull();
    expect(next.playerNeedsToPromote).toBe(true);
    expect(next.playerDeck.length).toBe(deckBefore + 2);
    expect(names(next.playerDeck)).toContain("Koga's Zubat");
  });

  it("once during each player's turn (tails included); the next turn it can be used again", () => {
    const state = setup();
    expect(getStadiumActionSteps(state, [], [T])).toBeNull();
    const used = useStadiumAction(state, [], { coinResults: [T] });
    expect(used.playerActivePokemon?.pokemon.name).toBe("Koga's Zubat");
    expect(canUseStadiumAction(used)).toMatch(/Ya usaste Fuchsia City Gym/);
    expect(canUseStadiumAction({ ...used, turnNumber: used.turnNumber + 2 })).toBeNull();
  });

  it("never the last Pokémon (an Active alone can't go)", () => {
    const alone = withStadium("Fuchsia City Gym", { player: { active: gc("Koga's Zubat") } });
    expect(canUseStadiumAction(alone)).toMatch(/Koga/);
  });
});

describe("Saffron City Gym", () => {
  it("any number of times: a basic Energy card of a Pokémon with Sabrina in its name back to the hand", () => {
    const abra = gc("Sabrina's Abra", { energy: ["psychic", "psychic"] as never });
    const dce = gameCard("Double Colorless Energy", "base");
    const state = withStadium("Saffron City Gym", { player: { active: { ...abra, attachedEnergy: [...abra.attachedEnergy, dce] } } });
    const step = getStadiumActionSteps(state, [[abra.pokemon.id]])!;
    expect(step.options).toHaveLength(2);
    expect(step.options.map((o) => o.id)).not.toContain(dce.id);
    const once = useStadiumAction(state, [[abra.pokemon.id], [step.options[0].id]]);
    expect(once.playerHand.map((c) => c.id)).toEqual([step.options[0].id]);
    const twice = useStadiumAction(once, [[abra.pokemon.id], [step.options[1].id]]);
    expect(twice.playerActivePokemon?.attachedEnergy.map((e) => e.id)).toEqual([dce.id]);
    expect(canUseStadiumAction(twice)).not.toBeNull();
  });
});

// ============================================================================
// Rocket's Minefield Gym
// ============================================================================

describe("Rocket's Minefield Gym", () => {
  it("a Basic put onto the Bench from the hand flips: tails 2 damage counters, heads nothing", () => {
    const pikachu = gameCard("Pikachu", "base");
    const state = withStadium("Rocket's Minefield Gym", { player: { hand: [pikachu] } });
    expect(getPlayBasicCoinFlips(state, pikachu.id, "bench")).toBe(1);
    expect(playBasicPokemon(deepFreeze(state), pikachu.id, "bench", { coinResults: [T] }).playerBench[0].currentDamage).toBe(20);
    expect(playBasicPokemon(state, pikachu.id, "bench", { coinResults: [H] }).playerBench[0].currentDamage).toBe(0);
    expect(() => playBasicPokemon(state, pikachu.id, "bench", { coinResults: [] })).toThrow(IllegalActionError);
  });

  it("omitted coins: the engine flips", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const pikachu = gameCard("Pikachu", "base");
    const state = withStadium("Rocket's Minefield Gym", { player: { hand: [pikachu] } });
    expect(playBasicPokemon(state, pikachu.id, "bench").playerBench[0].currentDamage).toBe(20);
  });

  it("a Mysterious Fossil is Knocked Out by the 2 counters: no Prize", () => {
    const fossil = gameCard("Mysterious Fossil", "fossil");
    const state = withStadium("Rocket's Minefield Gym", { player: { hand: [fossil] } });
    const next = playBasicPokemon(state, fossil.id, "bench", { coinResults: [T] });
    expect(next.playerBench).toHaveLength(0);
    expect(names(next.playerDiscard)).toContain("Mysterious Fossil");
    expect(next.opponentCanTakePrize).toBe(false);
  });

  it("no coin without the Stadium", () => {
    const pikachu = gameCard("Pikachu", "base");
    const state = withStadium("Resistance Gym", { player: { hand: [pikachu] } });
    expect(getPlayBasicCoinFlips(state, pikachu.id, "bench")).toBe(0);
  });
});

// ============================================================================
// Chaos Gym
// ============================================================================

describe("Chaos Gym", () => {
  const bill = () => gameCard("Bill", "base");

  it("a non-Stadium Trainer flips first: 1 coin, no steps; Stadiums don't flip", () => {
    const b = bill();
    const resistance = card("Resistance Gym");
    const state = withStadium("Chaos Gym", { player: { hand: [b, resistance] } });
    expect(isChaosGymCoinPending(state, b.id)).toBe(true);
    expect(getTrainerCoinFlips(state, b.id)).toBe(1);
    expect(getTrainerCoinFlippers(state, b.id, 1)).toEqual(["self"]);
    expect(getTrainerSteps(state, b.id, [], [H])).toBeNull();
    expect(isChaosGymCoinPending(state, resistance.id)).toBe(false);
    expect(getTrainerCoinFlips(state, resistance.id)).toBe(0);
  });

  it("heads: the card is then played normally (its own flow)", () => {
    const b = bill();
    const state = withStadium("Chaos Gym", { player: { hand: [b] } });
    const heads = playTrainerCard(deepFreeze(state), b.id, [], { coinResults: [H] });
    expect(heads.pendingChaosGymPlay).toEqual({ cardId: b.id, cardName: "Bill" });
    expect(heads.playerHand.map((c) => c.id)).toEqual([b.id]);
    expect(getTurnActionBlocker(heads)).toMatch(/Chaos Gym/);
    expect(isChaosGymCoinPending(heads, b.id)).toBe(false);
    expect(getTrainerCoinFlips(heads, b.id)).toBe(0);
    const played = playTrainerCard(heads, b.id, [], { coinResults: [] });
    expect(played.pendingChaosGymPlay).toBeUndefined();
    expect(played.playerHand).toHaveLength(2);
    expect(names(played.playerDiscard)).toEqual(["Bill"]);
  });

  it("tails: it never resolves for its owner, goes to its owner's discard pile and is offered to the opponent", () => {
    const b = bill();
    const state = withStadium("Chaos Gym", { player: { hand: [b] } });
    const tails = playTrainerCard(deepFreeze(state), b.id, [], { coinResults: [T] });
    expect(tails.playerHand).toHaveLength(0);
    expect(tails.playerDeck).toHaveLength(state.playerDeck.length);
    expect(names(tails.playerDiscard)).toEqual(["Bill"]);
    expect(tails.pendingChaosOffer).toEqual({ cardId: b.id, cardName: "Bill", owner: "player", offeredTo: "opponent" });
    const step = getChaosGymOfferStep(tails)!;
    expect(step.chooser).toBe("opponent");
    expect(step.defaultSelection).toEqual(["decline"]);
    expect(stepForAnswerer(step).description).toMatch(/quieres usarla/);
    expect(getTurnActionBlocker(tails)).toMatch(/Chaos Gym/);
    expect(endTurn(tails)).toBe(tails);
    const declined = answerChaosGymOffer(tails, ["decline"]);
    expect(declined.pendingChaosOffer).toBeUndefined();
    expect(names(declined.playerDiscard)).toEqual(["Bill"]);
    expect(getTurnActionBlocker(declined)).toBeNull();
  });

  it("the opponent accepts: it plays the card on its own view, out of turn, as if from its hand; the card ends in its owner's discard pile", () => {
    const b = bill();
    const state = withStadium("Chaos Gym", { player: { hand: [b] } });
    const accepted = answerChaosGymOffer(playTrainerCard(state, b.id, [], { coinResults: [T] }), ["accept"]);
    expect(accepted.pendingChaosOffer?.accepted).toBe(true);
    const theirs = swapSides(accepted);
    expect(theirs.pendingChaosOffer).toMatchObject({ owner: "opponent", offeredTo: "player", accepted: true });
    expect(canPlayTrainerCard(theirs, b.id)).toBeNull();
    // No second Chaos Gym coin for the opponent's use
    expect(getTrainerCoinFlips(theirs, b.id)).toBe(0);
    const used = swapSides(playTrainerCard(deepFreeze(theirs), b.id, [], { coinResults: [] }));
    expect(used.opponentHand).toHaveLength(2);
    expect(used.opponentDeck).toHaveLength(state.opponentDeck.length - 2);
    expect(names(used.playerDiscard)).toEqual(["Bill"]);
    expect(used.opponentDiscard).toHaveLength(0);
    expect(used.pendingChaosOffer).toBeUndefined();
    expect(used.isPlayerTurn).toBe(true);
    expect(getTurnActionBlocker(used)).toBeNull();
  });

  it("Review Focus 4: the owner is never asked the card's coins or steps; the opponent's use asks them on its own view", () => {
    const ball = gameCard("Poké Ball");
    const state = withStadium("Chaos Gym", {
      player: { hand: [ball], deck: [gameCard("Pikachu", "base")] },
      opponent: { deck: [gameCard("Charmander", "base"), gameCard("Bulbasaur", "base")] },
    });
    expect(getTrainerCoinFlips(state, ball.id)).toBe(1);
    expect(getTrainerSteps(state, ball.id, [], [T])).toBeNull();
    // Poké Ball's own coin would make this 2 coins: refused
    expect(() => playTrainerCard(state, ball.id, [], { coinResults: [T, H] })).toThrow(IllegalActionError);
    const tails = playTrainerCard(state, ball.id, [], { coinResults: [T] });
    expect(tails.playerDeck).toHaveLength(1);
    const theirs = swapSides(answerChaosGymOffer(tails, ["accept"]));
    expect(getTrainerCoinFlips(theirs, ball.id)).toBe(1);
    const step = getTrainerSteps(theirs, ball.id, [], [H])!;
    expect(step.options.map((o) => o.label).sort()).toEqual(["Bulbasaur", "Charmander"]);
    const charmander = theirs.playerDeck.find((c) => c.name === "Charmander")!;
    const used = swapSides(playTrainerCard(theirs, ball.id, [[charmander.id]], { coinResults: [H] }));
    expect(names(used.opponentHand)).toEqual(["Charmander"]);
    expect(names(used.playerDiscard)).toEqual(["Poké Ball"]);
    expect(names(used.opponentDiscard)).toEqual([]);
  });

  it("a Trainer that stays in play (PlusPower) is just discarded on tails: nobody uses it", () => {
    const plus = gameCard("PlusPower", "base");
    const state = withStadium("Chaos Gym", { player: { hand: [plus] } });
    const tails = playTrainerCard(state, plus.id, [], { coinResults: [T] });
    expect(tails.pendingChaosOffer).toBeUndefined();
    expect(tails.activeModifiers).toHaveLength(0);
    expect(names(tails.playerDiscard)).toEqual(["PlusPower"]);
  });

  it("a Trainer played as a Basic flips with getPlayBasicCoinFlips: tails, discarded", () => {
    const fossil = gameCard("Mysterious Fossil", "fossil");
    const state = withStadium("Chaos Gym", { player: { hand: [fossil] } });
    expect(getPlayBasicCoinFlips(state, fossil.id, "bench")).toBe(1);
    const tails = playBasicPokemon(state, fossil.id, "bench", { coinResults: [T] });
    expect(tails.playerBench).toHaveLength(0);
    expect(names(tails.playerDiscard)).toEqual(["Mysterious Fossil"]);
    expect(playBasicPokemon(state, fossil.id, "bench", { coinResults: [H] }).playerBench).toHaveLength(1);
    const pikachu = gameCard("Pikachu", "base");
    expect(getPlayBasicCoinFlips({ ...state, playerHand: [pikachu] }, pikachu.id, "bench")).toBe(0);
  });

  it("Psychic Control's borrowed card flips too: tails, it stays in its owner's discard pile and is offered to its owner", () => {
    const b = bill();
    const state = withStadium("Chaos Gym", { opponent: { discard: [b] } });
    const borrowing = { ...state, pendingBorrowedTrainer: { cardId: b.id, cardName: "Bill" } };
    expect(getTrainerCoinFlips(borrowing, b.id)).toBe(1);
    const tails = playTrainerCard(borrowing, b.id, [], { coinResults: [T], borrowedFromOpponentDiscard: true });
    expect(tails.pendingBorrowedTrainer).toBeUndefined();
    expect(tails.playerHand).toHaveLength(0);
    expect(names(tails.opponentDiscard)).toEqual(["Bill"]);
    expect(tails.pendingChaosOffer).toMatchObject({ owner: "opponent", offeredTo: "opponent" });
    const heads = playTrainerCard(borrowing, b.id, [], { coinResults: [H], borrowedFromOpponentDiscard: true });
    const played = playTrainerCard(heads, b.id, [], { coinResults: [], borrowedFromOpponentDiscard: true });
    expect(played.playerHand).toHaveLength(2);
    expect(names(played.opponentDiscard)).toEqual(["Bill"]);
    expect(played.pendingChaosGymPlay).toBeUndefined();
  });

  it("the AI declines the offer; declining after accepting also works; the AI never plays Chaos Gym", () => {
    const b = bill();
    const state = withStadium("Chaos Gym", { player: { hand: [b] } });
    const tails = playTrainerCard(state, b.id, [], { coinResults: [T] });
    expect(answerChaosGymOfferForAI(tails).pendingChaosOffer).toBeUndefined();
    expect(declineChaosGymOffer(swapSides(answerChaosGymOffer(tails, ["accept"]))).pendingChaosOffer).toBeUndefined();
    expect(() => answerChaosGymOffer(tails, ["maybe"])).toThrow(IllegalActionError);
    expect(stadiumValue(state, card("Chaos Gym"))).toBeLessThan(0);
  });

  it("endTurn discards a heads card that was never played", () => {
    const b = bill();
    const state = withStadium("Chaos Gym", { player: { hand: [b] } });
    const heads = playTrainerCard(state, b.id, [], { coinResults: [H] });
    const ended = endTurn(heads);
    expect(ended.pendingChaosGymPlay).toBeUndefined();
    expect(names(ended.playerDiscard)).toContain("Bill");
  });
});
