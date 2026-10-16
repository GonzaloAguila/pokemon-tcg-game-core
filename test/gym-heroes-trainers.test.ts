/**
 * Gym Heroes Trainers through the effect registry (playTrainerCard / getTrainerSteps), from the
 * printed text (data/pokemontcg/gym1.json). The Trainers that need new machinery (Charity,
 * Sabrina's ESP, Recall, Tickling Machine, Erika, Lt. Surge's Treaty, Blaine's Quiz #1, Misty's
 * Duel) are covered by their own test files.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { endTurn, executeAttack, type GameState } from "@/lib/gameState";
import { canPlayTrainerCard, getTrainerCoinFlips, getTrainerSteps, playTrainerCard } from "@/domain/effects";
import { EnergyType, StatusCondition } from "@/domain/constants";
import { IllegalActionError } from "@/shared/errors";
import { decideOpponentTurn, executeAIAction, type AIAction } from "@/domain/ai";
import { makeState, inPlay, gameCard, energy, names, deepFreeze, armedFor, attackIndex } from "./helpers/state";

const { Fire, Water, Grass, Fighting } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
const card = (name: string) => gameCard(name, "gym-heroes");
const gym = (name: string, opts: Parameters<typeof inPlay>[1] = {}) => inPlay(name, { set: "gym-heroes", ...opts });
type Setup = NonNullable<Parameters<typeof makeState>[0]>;

function withHand(hand: ReturnType<typeof gameCard>[], extra: Setup = {}): GameState {
  return makeState({
    ...extra,
    player: { active: inPlay("Machop"), hand, ...(extra.player ?? {}) },
    opponent: { active: inPlay("Onix"), ...(extra.opponent ?? {}) },
  });
}

const enabled = (state: GameState, cardId: string, selections: string[][] = [], coins?: ("heads" | "tails")[]) =>
  getTrainerSteps(state, cardId, selections, coins)!.options.filter((o) => !o.disabled).map((o) => o.label);

/** Log lines added by `after` that name a side (only the classic leading forms are allowed; see event-perspective.test.ts). */
const RELATIVE = /\b(tu|tus|Tu|Tus|te|rival|Rival|Pusiste|Tomaste|Mostraste|miraste|Barajaste|barajaste|descartaste)\b/;
const ALLOWED = [/^Jugaste [^:]*$/, /^Jugaste [^-]+ - Monedas?: (\[coin:(heads|tails)\][ ,]*)+$/, /^Robaste \d+ cartas?$/, /^Descartaste [^:]*$/];
function badLines(before: GameState, after: GameState): string[] {
  return after.events
    .slice(before.events.length)
    .map((e) => e.message)
    .filter((m) => !ALLOWED.some((ok) => ok.test(m)) && RELATIVE.test(m));
}

describe("Brock", () => {
  it("removes 1 damage counter from each of the player's damaged Pokémon", () => {
    const trainer = card("Brock");
    const active = inPlay("Machop", { damage: 30 });
    const benchHurt = inPlay("Abra", { damage: 10 });
    const benchFine = inPlay("Gastly");
    const theirs = inPlay("Onix", { damage: 20 });
    const state = deepFreeze(withHand([trainer], { player: { active, bench: [benchHurt, benchFine] }, opponent: { active: theirs } }));
    const next = playTrainerCard(state, trainer.id);
    expect(next.playerActivePokemon!.currentDamage).toBe(20);
    expect(next.playerBench.map((p) => p.currentDamage)).toEqual([0, 0]);
    expect(next.opponentActivePokemon!.currentDamage).toBe(20);
    expect(names(next.playerDiscard)).toEqual(["Brock"]);
    expect(badLines(state, next)).toEqual([]);
  });

  it("can't be played when none of the player's Pokémon has damage counters", () => {
    const trainer = card("Brock");
    const state = withHand([trainer]);
    expect(canPlayTrainerCard(state, trainer.id)).not.toBeNull();
    expect(() => playTrainerCard(state, trainer.id)).toThrow(IllegalActionError);
  });
});

describe("Lt. Surge", () => {
  it("a Basic Pokémon card from the hand becomes the Active; the old Active goes to the Bench", () => {
    const trainer = card("Lt. Surge");
    const pikachu = card("Lt. Surge's Pikachu");
    const evolution = card("Lt. Surge's Raichu");
    const doll = gameCard("Clefairy Doll", "base");
    const old = inPlay("Machop", { damage: 20, energy: [Fighting], statuses: [StatusCondition.Paralyzed] });
    const state = deepFreeze(withHand([trainer, pikachu, evolution, doll], { turnNumber: 5, player: { active: old } }));
    expect(enabled(state, trainer.id)).toEqual(["Lt. Surge's Pikachu"]);
    const next = playTrainerCard(state, trainer.id, [[pikachu.id]]);
    expect(next.playerActivePokemon!.pokemon.name).toBe("Lt. Surge's Pikachu");
    expect(next.playerActivePokemon!.playedOnTurn).toBe(5);
    const benched = next.playerBench.find((p) => p.pokemon.id === old.pokemon.id)!;
    expect(benched.currentDamage).toBe(20);
    expect(benched.attachedEnergy).toHaveLength(1);
    expect(benched.statusConditions).toEqual([]);
    expect(names(next.playerHand)).toEqual(["Lt. Surge's Raichu", "Clefairy Doll"]);
    expect(names(next.playerDiscard)).toEqual(["Lt. Surge"]);
    expect(badLines(state, next)).toEqual([]);
  });

  it("needs a Basic Pokémon card in the hand and room on the Bench", () => {
    const trainer = card("Lt. Surge");
    expect(canPlayTrainerCard(withHand([trainer, card("Lt. Surge's Raichu")]), trainer.id)).not.toBeNull();
    const bench = ["Abra", "Gastly", "Machop", "Abra", "Gastly"].map((n) => inPlay(n));
    expect(canPlayTrainerCard(withHand([trainer, card("Lt. Surge's Pikachu")], { player: { bench } }), trainer.id)).not.toBeNull();
    // Narrow Gym: 4 Benched Pokémon is a full Bench
    const narrow = withHand([trainer, card("Lt. Surge's Pikachu")], { player: { bench: bench.slice(0, 4) }, stadium: { card: card("Narrow Gym"), playedBy: "opponent" } });
    expect(canPlayTrainerCard(narrow, trainer.id)).not.toBeNull();
  });
});

describe("Misty", () => {
  function mistyState(attacker = armedFor(gym("Misty's Seel"), "Rayo Aurora"), defender = inPlay("Arcanine")) {
    const trainer = card("Misty");
    const discards = [energy(Fire), card("Brock")];
    const keep = energy(Water);
    const armed = attacker;
    const state = withHand([trainer, ...discards, keep], { player: { active: armed }, opponent: { active: defender } });
    return { state, trainer, discards, keep, armed };
  }

  it("costs 2 other cards from the hand", () => {
    const trainer = card("Misty");
    expect(canPlayTrainerCard(withHand([trainer, energy(Fire)]), trainer.id)).not.toBeNull();
    const { state, discards, keep } = mistyState();
    const step = getTrainerSteps(state, state.playerHand[0].id, [])!;
    expect(step.source).toBe("hand");
    expect(step.maxSelections).toBe(2);
    const next = playTrainerCard(state, state.playerHand[0].id, [discards.map((c) => c.id)]);
    expect(names(next.playerHand)).toEqual([keep.name]);
    expect(names(next.playerDiscard).sort()).toEqual(["Brock", "Fire Energy", "Misty"].sort());
    expect(badLines(state, next)).toEqual([]);
  });

  it("this turn's attack of a Pokémon with Misty in its name does 20 more after Weakness and Resistance", () => {
    const { state, trainer, discards, armed } = mistyState();
    const played = playTrainerCard(state, trainer.id, [discards.map((c) => c.id)]);
    const attacked = executeAttack(played, attackIndex(armed, "Rayo Aurora"), { skipEndTurn: true });
    // Rayo Aurora 20, Arcanine is weak to Water: 20 × 2 + 20
    expect(attacked.opponentActivePokemon!.currentDamage).toBe(60);
  });

  it("a Pokémon without Misty in its name gets nothing", () => {
    const seel = armedFor(inPlay("Seel"), "Cabezazo");
    const { state, trainer, discards } = mistyState(seel);
    const played = playTrainerCard(state, trainer.id, [discards.map((c) => c.id)]);
    const attacked = executeAttack(played, attackIndex(seel, "Cabezazo"), { skipEndTurn: true });
    expect(attacked.opponentActivePokemon!.currentDamage).toBe(20); // 10 × 2 (weak to Water)
  });

  it("ends with the turn and its card isn't discarded twice", () => {
    const { state, trainer, discards } = mistyState();
    const played = playTrainerCard(state, trainer.id, [discards.map((c) => c.id)]);
    expect(played.activeModifiers.map((m) => m.source)).toEqual(["misty"]);
    const ended = endTurn(played);
    expect(ended.activeModifiers).toEqual([]);
    expect(names(ended.playerDiscard).filter((n) => n === "Misty")).toHaveLength(1);
  });
});

describe("The Rocket's Trap", () => {
  it("heads: 3 random cards of the opponent's hand are shuffled into their deck", () => {
    const trainer = card("The Rocket's Trap");
    const hand = [energy(Fire), energy(Water), energy(Grass), card("Brock"), card("Misty")];
    const state = deepFreeze(withHand([trainer], { opponent: { hand, deck: [] } }));
    expect(getTrainerCoinFlips(state, trainer.id)).toBe(1);
    const next = playTrainerCard(state, trainer.id, [], { coinResults: [H] });
    expect(next.opponentHand).toHaveLength(2);
    expect(next.opponentDeck).toHaveLength(3);
    expect([...names(next.opponentHand), ...names(next.opponentDeck)].sort()).toEqual(names(hand).sort());
    expect(badLines(state, next)).toEqual([]);
  });

  it("heads with fewer than 3 cards takes them all; tails does nothing", () => {
    const trainer = card("The Rocket's Trap");
    const state = withHand([trainer], { opponent: { hand: [energy(Fire), energy(Water)], deck: [] } });
    expect(playTrainerCard(state, trainer.id, [], { coinResults: [H] }).opponentHand).toEqual([]);
    const tails = playTrainerCard(state, trainer.id, [], { coinResults: [T] });
    expect(tails.opponentHand).toHaveLength(2);
    expect(names(tails.playerDiscard)).toEqual(["The Rocket's Trap"]);
  });
});

describe("Blaine's Last Resort", () => {
  it("only with no other card in the hand (other copies are fine): show the hand, draw 5", () => {
    const trainer = card("Blaine's Last Resort");
    const copy = card("Blaine's Last Resort");
    expect(canPlayTrainerCard(withHand([trainer, energy(Fire)]), trainer.id)).not.toBeNull();
    const state = deepFreeze(withHand([trainer, copy]));
    const next = playTrainerCard(state, trainer.id);
    expect(next.playerHand).toHaveLength(6);
    expect(next.playerDeck).toHaveLength(5);
    expect(names(next.playerDiscard)).toEqual(["Blaine's Last Resort"]);
    expect(badLines(state, next)).toEqual([]);
  });
});

describe("Brock's Training Method", () => {
  it("a Basic Pokémon or Evolution card with Brock in its name from the deck into the hand", () => {
    const trainer = card("Brock's Training Method");
    const deck = [card("Brock's Geodude"), card("Misty's Seel"), card("Brock's Graveler"), gameCard("Geodude", "fossil"), card("Brock")];
    const state = deepFreeze(withHand([trainer], { player: { deck } }));
    expect(enabled(state, trainer.id)).toEqual(["Brock's Geodude", "Brock's Graveler"]);
    const next = playTrainerCard(state, trainer.id, [[deck[2].id]]);
    expect(names(next.playerHand)).toEqual(["Brock's Graveler"]);
    expect(next.playerDeck).toHaveLength(4);
    expect(badLines(state, next)).toEqual([]);
  });

  it("no such card in the deck: just shuffles", () => {
    const trainer = card("Brock's Training Method");
    const state = withHand([trainer], { player: { deck: [card("Misty's Seel")] } });
    expect(getTrainerSteps(state, trainer.id, [])).toBeNull();
    expect(playTrainerCard(state, trainer.id).playerDeck).toHaveLength(1);
  });
});

describe("Erika's Maids", () => {
  it("trades 2 other cards of the hand for up to 2 Pokémon with Erika in their names from the deck", () => {
    const trainer = card("Erika's Maids");
    const traded = [energy(Fire), card("Brock")];
    const deck = [card("Erika's Oddish"), card("Misty's Seel"), card("Erika's Gloom"), card("Erika's Bellsprout")];
    const state = deepFreeze(withHand([trainer, ...traded, energy(Water)], { player: { deck } }));
    const first = getTrainerSteps(state, trainer.id, [])!;
    expect(first.source).toBe("hand");
    expect(first.maxSelections).toBe(2);
    const second = getTrainerSteps(state, trainer.id, [traded.map((c) => c.id)])!;
    expect(second.options.map((o) => o.label)).toEqual(["Erika's Oddish", "Erika's Gloom", "Erika's Bellsprout"]);
    expect(second.maxSelections).toBe(2);
    expect(second.minSelections).toBe(0);
    const next = playTrainerCard(state, trainer.id, [traded.map((c) => c.id), [deck[0].id, deck[2].id]]);
    expect(names(next.playerHand).sort()).toEqual(["Erika's Gloom", "Erika's Oddish", "Water Energy"]);
    expect(names(next.playerDeck).sort()).toEqual(["Brock", "Erika's Bellsprout", "Fire Energy", "Misty's Seel"]);
    expect(names(next.playerDiscard)).toEqual(["Erika's Maids"]);
    expect(badLines(state, next)).toEqual([]);
  });

  it("needs 2 other cards in the hand", () => {
    const trainer = card("Erika's Maids");
    expect(canPlayTrainerCard(withHand([trainer, energy(Fire)]), trainer.id)).not.toBeNull();
  });
});

describe("Erika's Perfume", () => {
  it("shows the opponent's hand; any of its Basic Pokémon cards go onto their Bench (as long as there's room)", () => {
    const trainer = card("Erika's Perfume");
    const abra = gameCard("Abra", "base");
    const gastly = gameCard("Gastly", "base");
    const hand = [abra, gameCard("Kadabra", "base"), energy(Fire), gastly, gameCard("Clefairy Doll", "base")];
    const bench = ["Machop", "Machop", "Machop", "Machop"].map((n) => inPlay(n));
    const state = deepFreeze(withHand([trainer], { turnNumber: 7, opponent: { hand, bench } }));
    const step = getTrainerSteps(state, trainer.id, [])!;
    expect(step.reveals).toBe("opponentHand");
    expect(step.cards).toHaveLength(5);
    expect(step.options.filter((o) => !o.disabled).map((o) => o.label)).toEqual(["Abra", "Gastly"]);
    expect(step.maxSelections).toBe(1);
    expect(step.minSelections).toBe(0);
    expect(() => playTrainerCard(state, trainer.id, [[abra.id, gastly.id]])).toThrow(IllegalActionError);
    const next = playTrainerCard(state, trainer.id, [[gastly.id]]);
    expect(next.opponentBench.map((p) => p.pokemon.name)).toEqual(["Machop", "Machop", "Machop", "Machop", "Gastly"]);
    expect(next.opponentBench[4].playedOnTurn).toBe(7);
    expect(next.opponentHand).toHaveLength(4);
    expect(badLines(state, next)).toEqual([]);
  });

  it("the player may only look", () => {
    const trainer = card("Erika's Perfume");
    const state = withHand([trainer], { opponent: { hand: [gameCard("Abra", "base")] } });
    expect(playTrainerCard(state, trainer.id, [[]]).opponentBench).toEqual([]);
  });
});

describe("Good Manners", () => {
  it("only without Basic Pokémon cards in the hand: show it, then a Basic Pokémon card from the deck", () => {
    const trainer = card("Good Manners");
    expect(canPlayTrainerCard(withHand([trainer, gameCard("Abra", "base")]), trainer.id)).not.toBeNull();
    const deck = [gameCard("Kadabra", "base"), gameCard("Abra", "base"), energy(Fire)];
    const state = deepFreeze(withHand([trainer, gameCard("Kadabra", "base")], { player: { deck } }));
    expect(enabled(state, trainer.id)).toEqual(["Abra"]);
    const next = playTrainerCard(state, trainer.id, [[deck[1].id]]);
    expect(names(next.playerHand)).toEqual(["Kadabra", "Abra"]);
    expect(next.playerDeck).toHaveLength(2);
    expect(badLines(state, next)).toEqual([]);
  });
});

describe("Minion of Team Rocket", () => {
  const minionState = () => {
    const trainer = card("Minion of Team Rocket");
    const benched = inPlay("Kadabra", { energy: [Fire], damage: 30, evolvedFrom: ["Abra"] });
    const state = withHand([trainer], { opponent: { bench: [benched, inPlay("Gastly")] } });
    return { trainer, benched, state };
  };

  it("two heads: one of the opponent's Benched Pokémon and its cards go back to their hand", () => {
    const { trainer, benched, state } = minionState();
    expect(getTrainerCoinFlips(state, trainer.id)).toBe(2);
    expect(getTrainerSteps(state, trainer.id, [], [H, T])).toBeNull();
    expect(enabled(state, trainer.id, [], [H, H])).toEqual(["Kadabra (Banca rival)", "Gastly (Banca rival)"]);
    const next = playTrainerCard(deepFreeze(state), trainer.id, [[benched.pokemon.id]], { coinResults: [H, H] });
    expect(next.opponentBench.map((p) => p.pokemon.name)).toEqual(["Gastly"]);
    expect(names(next.opponentHand).sort()).toEqual(["Abra", "Fire Energy", "Kadabra"]);
    expect(next.isPlayerTurn).toBe(true);
    expect(badLines(state, next)).toEqual([]);
  });

  it("a tails: the turn ends immediately", () => {
    const { trainer, state } = minionState();
    const next = playTrainerCard(state, trainer.id, [], { coinResults: [H, T] });
    expect(next.isPlayerTurn).toBe(false);
    expect(next.turnNumber).toBe(state.turnNumber + 1);
    expect(next.opponentBench).toHaveLength(2);
    expect(names(next.playerDiscard)).toEqual(["Minion of Team Rocket"]);
  });

  it("skipEndTurn: the turn is over (no more actions) and the caller ends it", () => {
    const { trainer, state } = minionState();
    const next = playTrainerCard(state, trainer.id, [], { coinResults: [T, T], skipEndTurn: true });
    expect(next.isPlayerTurn).toBe(true);
    expect(next.attackedThisTurn).toBe(true);
    expect(canPlayTrainerCard({ ...next, playerHand: [card("Brock")] }, "x")).not.toBeNull();
    expect(badLines(state, next)).toEqual([]);
    expect(endTurn(next).isPlayerTurn).toBe(false);
  });
});

describe("Misty's Wrath", () => {
  it("looks at the top 7 cards: 2 into the hand, the rest discarded", () => {
    const trainer = card("Misty's Wrath");
    const deck = [...Array.from({ length: 8 }, (_, i) => (i === 2 ? card("Brock") : energy(Water)))];
    const state = deepFreeze(withHand([trainer], { player: { deck } }));
    const step = getTrainerSteps(state, trainer.id, [])!;
    expect(step.cards).toHaveLength(7);
    expect(step.maxSelections).toBe(2);
    expect(step.minSelections ?? step.maxSelections).toBe(2);
    const next = playTrainerCard(state, trainer.id, [[deck[2].id, deck[6].id]]);
    expect(names(next.playerHand)).toEqual(["Brock", "Water Energy"]);
    expect(next.playerDeck).toEqual([deck[7]]);
    expect(next.playerDiscard).toHaveLength(6);
    expect(badLines(state, next)).toEqual([]);
  });

  it("a short deck: what there is", () => {
    const trainer = card("Misty's Wrath");
    const one = withHand([trainer], { player: { deck: [energy(Water)] } });
    expect(getTrainerSteps(one, trainer.id, [])!.maxSelections).toBe(1);
    expect(canPlayTrainerCard(withHand([trainer], { player: { deck: [] } }), trainer.id)).not.toBeNull();
  });
});

describe("Secret Mission", () => {
  it("looks at the opponent's hand, then discards any number of other cards and draws that many", () => {
    const trainer = card("Secret Mission");
    const mine = [energy(Fire), energy(Grass), card("Brock")];
    const state = deepFreeze(withHand([trainer, ...mine], { opponent: { hand: [energy(Water), card("Misty")] } }));
    const look = getTrainerSteps(state, trainer.id, [])!;
    expect(look.reveals).toBe("opponentHand");
    expect(look.cards).toHaveLength(2);
    expect(look.maxSelections).toBe(0);
    const discard = getTrainerSteps(state, trainer.id, [[]])!;
    expect(discard.source).toBe("hand");
    expect(discard.minSelections).toBe(0);
    expect(discard.maxSelections).toBe(3);
    const next = playTrainerCard(state, trainer.id, [[], [mine[0].id, mine[1].id]]);
    expect(next.playerHand).toHaveLength(3);
    expect(names(next.playerHand)).toContain("Brock");
    expect(next.playerDeck).toHaveLength(8);
    expect(names(next.playerDiscard).sort()).toEqual(["Fire Energy", "Grass Energy", "Secret Mission"]);
    expect(badLines(state, next)).toEqual([]);
  });
});

describe("Blaine's Gamble", () => {
  it("the coin is flipped after the discards are chosen; heads draws twice that many", () => {
    const trainer = card("Blaine's Gamble");
    const mine = [energy(Fire), energy(Grass), card("Brock")];
    const state = deepFreeze(withHand([trainer, ...mine]));
    // No coin before the choice (the player must not know it when discarding)
    expect(getTrainerCoinFlips(state, trainer.id)).toBe(0);
    const step = getTrainerSteps(state, trainer.id, [])!;
    expect(step.source).toBe("hand");
    expect(step.minSelections).toBe(0);
    const chosen = [[mine[0].id, mine[1].id]];
    expect(getTrainerCoinFlips(state, trainer.id, chosen)).toBe(1);
    expect(() => playTrainerCard(state, trainer.id, chosen)).toThrow(IllegalActionError);
    const heads = playTrainerCard(state, trainer.id, chosen, { coinResults: [H] });
    expect(names(heads.playerHand)).toContain("Brock");
    expect(heads.playerHand).toHaveLength(5);
    expect(names(heads.playerDiscard).sort()).toEqual(["Blaine's Gamble", "Fire Energy", "Grass Energy"]);
    expect(badLines(state, heads)).toEqual([]);
    const tails = playTrainerCard(state, trainer.id, chosen, { coinResults: [T] });
    expect(names(tails.playerHand)).toEqual(["Brock"]);
  });
});

describe("Energy Flow", () => {
  it("returns any of the Energy cards attached to the player's Pokémon to the hand", () => {
    const trainer = card("Energy Flow");
    const active = inPlay("Machop", { energy: [Fighting, Fighting] });
    const benched = inPlay("Abra", { energy: [Fire] });
    const state = deepFreeze(withHand([trainer], { player: { active, bench: [benched] }, opponent: { active: inPlay("Onix", { energy: [Fighting] }) } }));
    const step = getTrainerSteps(state, trainer.id, [])!;
    expect(step.options).toHaveLength(3);
    expect(step.minSelections).toBe(0);
    expect(step.maxSelections).toBe(3);
    const next = playTrainerCard(state, trainer.id, [[active.attachedEnergy[1].id, benched.attachedEnergy[0].id]]);
    expect(next.playerActivePokemon!.attachedEnergy).toHaveLength(1);
    expect(next.playerBench[0].attachedEnergy).toEqual([]);
    expect(names(next.playerHand).sort()).toEqual(["Fighting Energy", "Fire Energy"]);
    expect(badLines(state, next)).toEqual([]);
  });

  it("needs an Energy card attached to one of the player's Pokémon", () => {
    const trainer = card("Energy Flow");
    expect(canPlayTrainerCard(withHand([trainer]), trainer.id)).not.toBeNull();
  });
});

describe("Sabrina's Gaze", () => {
  it("each player shuffles their hand into their deck and draws as many cards", () => {
    const trainer = card("Sabrina's Gaze");
    const mine = [card("Brock"), card("Misty")];
    const theirs = [energy(Fire), energy(Fire), energy(Fire)];
    const state = deepFreeze(withHand([trainer, ...mine], { player: { deck: [energy(Water), energy(Water)] }, opponent: { hand: theirs, deck: [energy(Grass)] } }));
    const next = playTrainerCard(state, trainer.id);
    expect(next.playerHand).toHaveLength(2);
    expect(next.playerDeck).toHaveLength(2);
    expect(next.opponentHand).toHaveLength(3);
    expect(next.opponentDeck).toHaveLength(1);
    expect(names(next.playerDiscard)).toEqual(["Sabrina's Gaze"]);
    expect(badLines(state, next)).toEqual([]);
  });
});

describe("Trash Exchange", () => {
  it("the discard pile is shuffled into the deck, then as many cards are discarded from its top", () => {
    const trainer = card("Trash Exchange");
    const discard = [energy(Fire), energy(Fire), card("Brock")];
    const deck = [energy(Water), energy(Water)];
    const state = deepFreeze(withHand([trainer], { player: { deck, discard } }));
    const next = playTrainerCard(state, trainer.id);
    expect(next.playerDeck).toHaveLength(2);
    expect(next.playerDiscard).toHaveLength(4);
    expect(names(next.playerDiscard)).toContain("Trash Exchange");
    expect([...names(next.playerDeck), ...names(next.playerDiscard)].sort()).toEqual(
      ["Brock", "Fire Energy", "Fire Energy", "Trash Exchange", "Water Energy", "Water Energy"].sort()
    );
    expect(badLines(state, next)).toEqual([]);
  });
});

describe("the catalog's Stadiums", () => {
  const STADIUMS = [
    "No Removal Gym",
    "The Rocket's Training Gym",
    "Celadon City Gym",
    "Cerulean City Gym",
    "Pewter City Gym",
    "Vermilion City Gym",
    "Narrow Gym",
  ];

  it.each(STADIUMS)("%s is a Stadium played from the hand into play", (name) => {
    const stadium = card(name);
    expect(stadium.kind === "trainer" && stadium.trainerType).toBe("stadium");
    const state = withHand([stadium]);
    const next = playTrainerCard(state, stadium.id);
    expect(next.stadium).toEqual({ card: stadium, playedBy: "player" });
    expect(next.playerHand).toEqual([]);
  });

  it("the real Narrow Gym makes each 5-Pokémon Bench return one (the opponent first)", () => {
    const narrow = card("Narrow Gym");
    const five = () => ["Abra", "Gastly", "Machop", "Abra", "Gastly"].map((n) => inPlay(n));
    const state = withHand([narrow], { player: { bench: five() }, opponent: { bench: five() } });
    const next = playTrainerCard(state, narrow.id);
    expect(next.pendingBenchTrim?.map((t) => t.side)).toEqual(["opponent", "player"]);
  });
});

describe("the AI and the Gym Heroes Trainers (AI = opponent, its turn)", () => {
  afterEach(() => vi.restoreAllMocks());
  const aiTurn = (ai: Setup["opponent"], human: Setup["player"] = { active: inPlay("Onix") }, extra: Setup = {}) =>
    makeState({ turnNumber: 6, isPlayerTurn: false, ...extra, player: human, opponent: ai });
  const run = (state: GameState, plan: AIAction[]) => plan.reduce((s, action) => executeAIAction(s, action), state);
  const trainersIn = (plan: AIAction[]) => plan.flatMap((a) => (a.type === "playTrainer" ? [a.trainerName] : []));

  it("Misty before attacking with a Pokémon with Misty in its name: 20 more damage", () => {
    const misty = card("Misty");
    const seel = armedFor(gym("Misty's Seel"), "Rayo Aurora");
    const state = aiTurn({ active: seel, hand: [misty, card("Brock"), card("Trash Exchange")] }, { active: inPlay("Arcanine") });
    const plan = decideOpponentTurn(state);
    expect(trainersIn(plan)).toContain("Misty");
    expect(plan.at(-1)?.type).toBe("attack");
    const after = run(state, plan);
    expect(after.playerActivePokemon!.currentDamage).toBe(60);
  });

  it("Minion of Team Rocket is the last action of a turn without an attack; a tails ends its turn", () => {
    const minion = card("Minion of Team Rocket");
    const evolved = inPlay("Kadabra", { evolvedFrom: ["Abra"], energy: [Fire] });
    const state = aiTurn({ active: inPlay("Machop"), hand: [minion] }, { active: inPlay("Onix"), bench: [evolved] });
    const plan = decideOpponentTurn(state);
    expect(plan.at(-1)).toMatchObject({ type: "playTrainer", trainerName: "Minion of Team Rocket" });
    vi.spyOn(Math, "random").mockReturnValue(0.9); // tails
    const after = run(state, plan);
    expect(after.isPlayerTurn).toBe(true);
    expect(after.turnNumber).toBe(7);
    expect(after.events.map((e) => e.message)).toContain("Fin del turno del rival");
  });

  it("Minion of Team Rocket with two heads sends the evolved Benched Pokémon back to the human's hand", () => {
    const minion = card("Minion of Team Rocket");
    const evolved = inPlay("Kadabra", { evolvedFrom: ["Abra"], energy: [Fire] });
    const state = aiTurn({ active: inPlay("Machop"), hand: [minion] }, { active: inPlay("Onix"), bench: [inPlay("Gastly"), evolved] });
    vi.spyOn(Math, "random").mockReturnValue(0.1); // heads
    const after = executeAIAction(state, { type: "playTrainer", cardId: minion.id, trainerName: minion.name, selections: [], answerAtPlay: true, delay: 0 });
    expect(after.isPlayerTurn).toBe(false);
    expect(after.playerBench.map((p) => p.pokemon.name)).toEqual(["Gastly"]);
    expect(names(after.playerHand).sort()).toEqual(["Abra", "Fire Energy", "Kadabra"]);
  });

  it("Blaine's Gamble: discards its cards of little value, then flips", () => {
    const gamble = card("Blaine's Gamble");
    // Trainers it never plays: worth nothing to it
    const junk = [gameCard("Challenge!", "rocket"), gameCard("Digger", "rocket")];
    const deck = Array.from({ length: 20 }, () => energy(Fighting));
    const state = aiTurn({ active: inPlay("Machop"), hand: [gamble, ...junk], deck });
    const plan = decideOpponentTurn(state);
    expect(trainersIn(plan)).toEqual(["Blaine's Gamble"]);
    vi.spyOn(Math, "random").mockReturnValue(0.1); // heads
    const after = run(state, plan);
    expect(after.opponentHand).toHaveLength(4);
    expect(names(after.opponentDiscard)).toContain("Blaine's Gamble");
  });

  it("Lt. Surge swaps a Paralyzed Active for the Basic in hand with the most HP", () => {
    const surge = card("Lt. Surge");
    const pikachu = card("Lt. Surge's Pikachu");
    const snorlax = gameCard("Snorlax", "jungle");
    const state = aiTurn({ active: inPlay("Machop", { statuses: [StatusCondition.Paralyzed] }), hand: [surge, pikachu, snorlax] });
    const plan = decideOpponentTurn(state);
    expect(trainersIn(plan)).toContain("Lt. Surge");
    const after = run(state, plan);
    expect(after.opponentActivePokemon!.pokemon.name).toBe("Snorlax");
  });

  it("Erika's Perfume puts the human's weak Basics onto their Bench", () => {
    const perfume = card("Erika's Perfume");
    const abra = gameCard("Abra", "base");
    const snorlax = gameCard("Snorlax", "jungle");
    const state = aiTurn({ active: inPlay("Machop"), hand: [perfume] }, { active: inPlay("Onix"), hand: [abra, snorlax, energy(Fire)] });
    expect(trainersIn(decideOpponentTurn(state))).toContain("Erika's Perfume");
    const after = executeAIAction(state, { type: "playTrainer", cardId: perfume.id, trainerName: perfume.name, selections: [], answerAtPlay: true, delay: 0 });
    expect(after.playerBench.map((p) => p.pokemon.name)).toEqual(["Abra"]);
  });
});
