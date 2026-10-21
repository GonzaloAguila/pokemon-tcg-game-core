/**
 * Gym Challenge attacks with choices, searches and hidden cards (Task 3 of
 * docs/superpowers/plans/2026-10-19-gym-challenge.md; rulings in docs/card-doubts.md →
 * "Gym Challenge"). Every choice is a `pendingAttackChoice` step answered by the attacker.
 *
 * | # | Card | Attack | Effect data |
 * |---|---|---|---|
 * | 4 | Erika's Venusaur | Growth | AttachEnergyFromHand Grass, up to 2 (heads) |
 * | 12 | Misty's Golduck | Super Removal | DiscardEnergyEachOpponent (heads), one step per Pokémon |
 * | 40 | Erika's Clefairy | Lunar Power | EvolveBenchedFromDeck (heads): card, then the Benched Pokémon if several |
 * | 43 | Giovanni's Meowth | False Charity | RevealOpponentDeckTop (heads, `reveals: "opponentCards"`) |
 * | 49 | Koga's Pidgey | Messenger | ShuffleSelfIntoDeck `deckTop` + SearchDeckChoice `pokemon`, not Koga's Pidgey |
 * | 51 | Lt. Surge's Eevee | Surprise | ShuffleRandomHandCard (`reveals: "opponentCards"`) |
 * | 56 | Sabrina's Hypno | Invigorate | ReviveBasicToBench (either discard pile, half HP in counters) |
 * | 57 | Sabrina's Jynx | Helping Hand | HealOpponentToDraw: Pokémon, then how many counters |
 * | 63 | Blaine's Mankey | Pranks | OpponentDiscardToDeckTop (heads) |
 * | 83 | Koga's Zubat | Group Attack | SearchDeckChoice `beforeDamage` (a reaction before the damage) + 10 × Koga's Zubat in play |
 * | 89 | Misty's Poliwag (and Base Set Poliwhirl) | Amnesia | LockDefenderAttack (attackLock T+1) |
 * | 90 | Misty's Psyduck | ESP | 3 coins, `exactHits`: 1 draw / 2 → 20 / 3 → CopyDefenderAttackChoice (coins via getAttackChoiceCoinPlan) |
 * | 94 | Sabrina's Abra | Psyscan | LookAtOpponentHand (`reveals: "opponentHand"`) |
 */
import { describe, it, expect } from "vitest";
import { canExecuteAttack, endTurn, energyRemovalBlocked, executeAttack, getAttackChoiceCoinPlan, resolveAttackChoice } from "@/lib/gameState";
import type { GameCard, GameState, PokemonInPlay } from "@/lib/gameState";
import { gymChallengeCards } from "@/domain/catalog";
import type { PokemonCard } from "@/domain/cards";
import { swapSides } from "@/domain/board";
import { EnergyType } from "@/domain/constants";
import { answerAttackChoiceForAI } from "@/domain/ai/attackAnswers";
import { makeState, inPlay, gameCard, energy, armedFor, attackIndex, names, deepFreeze, takeable } from "./helpers/state";

const { Fire, Grass, Water, Psychic } = EnergyType;
const H = "heads" as const;
const T = "tails" as const;
type Coin = typeof H | typeof T;

const vs = (attacker: PokemonInPlay, defender: PokemonInPlay, extra: Parameters<typeof makeState>[0] = {}) =>
  makeState({ ...extra, player: { active: attacker, ...(extra.player ?? {}) }, opponent: { active: defender, ...(extra.opponent ?? {}) } });
const choose = (state: GameState, selection: string[], coinResults?: Coin[]) =>
  resolveAttackChoice(state, selection, { skipEndTurn: true, ...(coinResults && { coinResults }) });

let uid = 0;
function gym(number: number, opts: Parameters<typeof inPlay>[1] = {}): PokemonInPlay {
  const card = structuredClone(gymChallengeCards.find((c) => c.number === number)!);
  uid += 1;
  return { ...inPlay("Abra", opts), pokemon: { ...card, id: `${card.id}#c${uid}` } as GameCard };
}
function dummy(opts: Parameters<typeof inPlay>[1] = {}): PokemonInPlay {
  const p = inPlay("Chansey", opts);
  uid += 1;
  return { ...p, pokemon: { ...(p.pokemon as PokemonCard), id: `chansey#${uid}`, weaknesses: [], resistances: [] } };
}
const gymCard = (number: number): GameCard => {
  const card = structuredClone(gymChallengeCards.find((c) => c.number === number)!);
  uid += 1;
  return { ...card, id: `${card.id}#k${uid}` } as GameCard;
};
function attack(state: GameState, name: string, coins: Coin[] = []): GameState {
  const armed = { ...state, playerActivePokemon: armedFor(state.playerActivePokemon!, name) };
  return executeAttack(armed, attackIndex(armed.playerActivePokemon!, name), { coinResults: coins, skipEndTurn: true });
}
const step = (state: GameState) => state.pendingAttackChoice!.step;
const ids = (cards: GameCard[]) => cards.map((c) => c.id);
const log = (state: GameState) => state.events.map((e) => e.message).join("\n");

describe("Growth (Erika's Venusaur)", () => {
  const setup = () => {
    const grass = [energy(Grass), energy(Grass), energy(Grass)];
    const fire = energy(Fire);
    return { grass, fire, state: vs(gym(4), dummy(), { player: { hand: [...grass, fire] } }) };
  };
  it("heads: up to 2 basic Grass Energy cards from the hand go to Venusaur", () => {
    const { grass, state } = setup();
    const after = attack(state, "Crecimiento", [H]);
    const s = step(after);
    expect(s.chooser).toBe("self");
    expect(s.source).toBe("hand");
    expect(s.options.map((o) => o.id)).toEqual(ids(grass));
    expect([s.minSelections, s.maxSelections]).toEqual([0, 2]);
    expect(answerAttackChoiceForAI(after)).toHaveLength(2);
    const done = choose(after, ids(grass).slice(0, 2));
    expect(done.playerActivePokemon!.attachedEnergy.map((e) => e.id)).toEqual(expect.arrayContaining(ids(grass).slice(0, 2)));
    expect(done.playerHand).toHaveLength(2);
  });
  it("tails: nothing to choose", () => {
    expect(attack(setup().state, "Crecimiento", [T]).pendingAttackChoice).toBeUndefined();
  });
});

describe("Super Removal (Misty's Golduck)", () => {
  it("heads: 1 Energy card chosen on each opposing Pokémon that has any", () => {
    const active = dummy({ energy: [Fire, Water] });
    const benchA = dummy({ energy: [Grass] });
    const benchB = dummy();
    const state = deepFreeze(vs(gym(12), active, { opponent: { bench: [benchA, benchB] } }));
    expect(energyRemovalBlocked(state, active, "opponent")).toBe(false);
    const after = attack(state, "Supereliminación", [H]);
    expect(step(after).options.map((o) => o.id)).toEqual(ids(active.attachedEnergy));
    const second = choose(after, [active.attachedEnergy[1].id]);
    expect(step(second).options.map((o) => o.id)).toEqual(ids(benchA.attachedEnergy));
    const done = choose(second, [benchA.attachedEnergy[0].id]);
    expect(done.pendingAttackChoice).toBeUndefined();
    expect(done.opponentActivePokemon!.attachedEnergy.map((e) => e.id)).toEqual([active.attachedEnergy[0].id]);
    expect(done.opponentBench[0].attachedEnergy).toHaveLength(0);
    expect(done.opponentDiscard).toHaveLength(2);
  });
  it("tails: nothing", () => {
    expect(attack(vs(gym(12), dummy({ energy: [Fire] })), "Supereliminación", [T]).pendingAttackChoice).toBeUndefined();
  });
});

describe("Lunar Power (Erika's Clefairy)", () => {
  it("heads: an Evolution card of the deck on a Benched Pokémon, even one played this turn", () => {
    const charmander = inPlay("Charmander", { set: "base", playedOnTurn: 3 });
    const charmeleon = gameCard("Charmeleon", "base");
    const state = vs(gym(40), dummy(), { player: { bench: [charmander], deck: [charmeleon, energy(Fire)] } });
    const after = attack(state, "Poder Lunar", [H]);
    expect(takeable(step(after)).map((c) => c.id)).toEqual([charmeleon.id]);
    const done = choose(after, [charmeleon.id]);
    expect(done.playerBench[0].pokemon.name).toBe("Charmeleon");
    expect(names(done.playerBench[0].previousEvolutions ?? [])).toEqual(["Charmander"]);
    expect(done.playerDeck).toHaveLength(1);
  });
  it("two Pokémon it can evolve: a second step picks which", () => {
    const a = inPlay("Charmander", { set: "base" });
    const b = inPlay("Charmander", { set: "base" });
    const charmeleon = gameCard("Charmeleon", "base");
    const after = attack(vs(gym(40), dummy(), { player: { bench: [a, b], deck: [charmeleon] } }), "Poder Lunar", [H]);
    const second = choose(after, [charmeleon.id]);
    expect(step(second).options.map((o) => o.id)).toEqual([a.pokemon.id, b.pokemon.id]);
    const done = choose(second, [b.pokemon.id]);
    expect(done.playerBench.map((p) => p.pokemon.name)).toEqual(["Charmander", "Charmeleon"]);
  });
  it("Prehistoric Power stops it", () => {
    const state = vs(gym(40), dummy(), {
      player: { bench: [inPlay("Charmander", { set: "base" })], deck: [gameCard("Charmeleon", "base")] },
      opponent: { bench: [inPlay("Aerodactyl", { set: "fossil" })] },
    });
    expect(attack(state, "Poder Lunar", [H]).pendingAttackChoice).toBeUndefined();
  });
});

describe("False Charity (Giovanni's Meowth)", () => {
  it("heads: a Trainer on top goes to their discard pile", () => {
    const trainer = gameCard("Bill", "base");
    const after = attack(vs(gym(43), dummy(), { opponent: { deck: [trainer, energy(Fire)] } }), "Falsa Caridad", [H]);
    const s = step(after);
    expect(s.reveals).toBe("opponentCards");
    expect(s.cards!.map((c) => c.id)).toEqual([trainer.id]);
    const done = choose(after, []);
    expect(ids(done.opponentDiscard)).toEqual([trainer.id]);
    expect(done.opponentDeck).toHaveLength(1);
  });
  it("heads: anything else goes to their hand, and the log doesn't name it", () => {
    const top = gameCard("Charmander", "base");
    const after = attack(vs(gym(43), dummy(), { opponent: { deck: [top, energy(Fire)] } }), "Falsa Caridad", [H]);
    const done = choose(after, []);
    expect(ids(done.opponentHand)).toEqual([top.id]);
    expect(log(done)).not.toContain("Charmander");
  });
  it("tails: nothing", () => {
    expect(attack(vs(gym(43), dummy()), "Falsa Caridad", [T]).pendingAttackChoice).toBeUndefined();
  });
});

describe("Messenger (Koga's Pidgey)", () => {
  it("Pidgey and its cards go on top of the deck, then a Pokémon card that isn't Koga's Pidgey to the hand", () => {
    const pidgey = gym(49, { energy: [Fire] });
    const charmander = gameCard("Charmander", "base");
    const otherPidgey = gymCard(49);
    const bench = inPlay("Abra", { set: "base" });
    const state = deepFreeze(vs(pidgey, dummy(), { player: { bench: [bench], deck: [energy(Water), charmander, otherPidgey] } }));
    const after = attack(state, "Mensajero");
    expect(after.playerActivePokemon).toBeNull();
    expect(after.playerNeedsToPromote).toBe(true);
    expect(after.playerDeck.slice(0, 2).map((c) => c.id)).toEqual([pidgey.pokemon.id, pidgey.attachedEnergy[0].id]);
    expect(takeable(step(after)).map((c) => c.id)).toEqual([charmander.id]);
    const done = choose(after, [charmander.id]);
    expect(ids(done.playerHand)).toEqual([charmander.id]);
    expect(done.playerDeck).toHaveLength(4);
    expect(ids(done.playerDeck)).toEqual(expect.arrayContaining([pidgey.pokemon.id, otherPidgey.id]));
  });
  it("nothing to find: the deck is shuffled anyway, no step", () => {
    const after = attack(vs(gym(49), dummy(), { player: { bench: [inPlay("Abra", { set: "base" })], deck: [energy(Water)] } }), "Mensajero");
    expect(after.pendingAttackChoice).toBeUndefined();
    expect(after.playerDeck).toHaveLength(3);
  });
});

describe("Surprise (Lt. Surge's Eevee)", () => {
  it("a random card of their hand, shown to the attacker only, is shuffled into their deck", () => {
    const hand = [gameCard("Charmander", "base"), gameCard("Bill", "base"), gameCard("Potion", "base")];
    const after = attack(vs(gym(51), dummy(), { opponent: { hand, deck: [energy(Fire)] } }), "Sorpresa");
    const s = step(after);
    expect(s.reveals).toBe("opponentCards");
    expect(s.chooser).toBe("self");
    expect(s.cards).toHaveLength(1);
    const picked = s.cards![0];
    expect(ids(hand)).toContain(picked.id);
    const done = choose(after, []);
    expect(done.opponentHand).toHaveLength(2);
    expect(ids(done.opponentDeck)).toContain(picked.id);
    expect(log(done)).not.toContain(picked.name);
  });
  it("an empty hand: nothing", () => {
    expect(attack(vs(gym(51), dummy()), "Sorpresa").pendingAttackChoice).toBeUndefined();
  });
});

describe("Psyscan (Sabrina's Abra)", () => {
  it("the step shows their hand; nothing changes", () => {
    const hand = [gameCard("Charmander", "base"), gameCard("Bill", "base")];
    const after = attack(vs(gym(94), dummy(), { opponent: { hand } }), "Psicoescáner");
    const s = step(after);
    expect(s.reveals).toBe("opponentHand");
    expect(s.cards!.map((c) => c.id)).toEqual(ids(hand));
    const done = choose(after, answerAttackChoiceForAI(after));
    expect(ids(done.opponentHand)).toEqual(ids(hand));
    expect(log(done)).not.toContain("Charmander");
  });
});

describe("Invigorate (Sabrina's Hypno)", () => {
  it("a Basic Pokémon card from either discard pile to its owner's Bench with half its HP in counters", () => {
    const own = gameCard("Charmander", "base");
    const theirs = gameCard("Chansey", "base");
    const state = vs(gym(56), dummy(), {
      player: { discard: [own, gameCard("Charmeleon", "base"), gameCard("Mysterious Fossil", "fossil")] },
      opponent: { discard: [theirs] },
    });
    const after = attack(state, "Vigorizar");
    expect(step(after).options.map((o) => o.id)).toEqual([own.id, theirs.id]);
    const mine = choose(after, [own.id]);
    expect(mine.playerBench.map((p) => [p.pokemon.id, p.currentDamage])).toEqual([[own.id, 20]]);
    expect(mine.playerDiscard).toHaveLength(2);
    const other = choose(after, [theirs.id]);
    expect(other.opponentBench.map((p) => [p.pokemon.id, p.currentDamage])).toEqual([[theirs.id, 60]]);
  });
  it("a full Bench isn't offered", () => {
    const bench = Array.from({ length: 5 }, () => inPlay("Abra", { set: "base" }));
    const theirs = gameCard("Chansey", "base");
    const after = attack(vs(gym(56), dummy(), { player: { bench, discard: [gameCard("Charmander", "base")] }, opponent: { discard: [theirs] } }), "Vigorizar");
    expect(step(after).options.map((o) => o.id)).toEqual([theirs.id]);
  });
});

describe("Helping Hand (Sabrina's Jynx)", () => {
  it("counters off 1 of their Pokémon, then draw that many", () => {
    const hurt = dummy({ damage: 30 });
    const state = vs(gym(57), dummy(), { opponent: { bench: [hurt] } });
    const after = attack(state, "Mano Amiga");
    expect(step(after).options.map((o) => o.id)).toEqual([hurt.pokemon.id]);
    const second = choose(after, [hurt.pokemon.id]);
    expect(step(second).options.map((o) => o.id)).toEqual(["0", "1", "2", "3"]);
    expect(answerAttackChoiceForAI(second)).toEqual(["3"]);
    const done = choose(second, ["2"]);
    expect(done.opponentBench[0].currentDamage).toBe(10);
    expect(done.playerHand).toHaveLength(2);
  });
  it("no damaged Pokémon: nothing", () => {
    expect(attack(vs(gym(57), dummy()), "Mano Amiga").pendingAttackChoice).toBeUndefined();
  });
});

describe("Pranks (Blaine's Mankey)", () => {
  it("heads: a card of their discard pile on top of their deck", () => {
    const card = gameCard("Bill", "base");
    const after = attack(vs(gym(63), dummy(), { opponent: { discard: [energy(Fire), card] } }), "Bromas", [H]);
    const done = choose(after, [card.id]);
    expect(done.opponentDeck[0].id).toBe(card.id);
    expect(done.opponentDiscard).toHaveLength(1);
  });
  it("tails: nothing", () => {
    expect(attack(vs(gym(63), dummy(), { opponent: { discard: [energy(Fire)] } }), "Bromas", [T]).pendingAttackChoice).toBeUndefined();
  });
});

describe("Group Attack (Koga's Zubat)", () => {
  it("asks for the search before the damage, then 10 × Koga's Zubat in play", () => {
    const z1 = gymCard(83);
    const z2 = gymCard(83);
    const state = deepFreeze(vs(gym(83), dummy(), { player: { deck: [z1, energy(Grass), z2] } }));
    const asked = attack(state, "Ataque en Grupo");
    expect(asked.pendingAttackChoice!.reaction).toBeDefined();
    expect(asked.opponentActivePokemon!.currentDamage).toBe(0);
    expect(step(asked).options.filter((o) => !o.disabled).map((o) => o.id)).toEqual([z1.id, z2.id]);
    expect([step(asked).minSelections, step(asked).maxSelections]).toEqual([0, 2]);
    expect(answerAttackChoiceForAI(asked)).toEqual([z1.id, z2.id]);
    const done = choose(asked, [z1.id, z2.id]);
    expect(done.playerBench.map((p) => p.pokemon.id)).toEqual([z1.id, z2.id]);
    expect(done.playerDeck).toHaveLength(1);
    expect(done.opponentActivePokemon!.currentDamage).toBe(30);
  });
  it("declined, or nothing to find: 10 × the ones in play", () => {
    const z1 = gymCard(83);
    const asked = attack(vs(gym(83), dummy(), { player: { deck: [z1] } }), "Ataque en Grupo");
    expect(choose(asked, []).opponentActivePokemon!.currentDamage).toBe(10);
    const none = attack(vs(gym(83), dummy(), { player: { bench: [gym(83)] } }), "Ataque en Grupo");
    expect(none.pendingAttackChoice).toBeUndefined();
    expect(none.opponentActivePokemon!.currentDamage).toBe(20);
  });
});

describe("Amnesia (Misty's Poliwag, Base Set Poliwhirl)", () => {
  it.each([
    ["Misty's Poliwag", () => gym(89)],
    ["Poliwhirl", () => inPlay("Poliwhirl", { set: "base" })],
  ])("%s: the chosen attack can't be used during the opponent's next turn", (_name, make) => {
    const defender = inPlay("Charmander", { set: "base", energy: [Fire, Fire] });
    const [scratch, ember] = (defender.pokemon as PokemonCard).attacks.map((a) => a.name);
    const after = attack(vs(make(), defender), "Amnesia");
    expect(step(after).options.map((o) => o.id)).toEqual([scratch, ember]);
    const done = choose(after, [ember]);
    const next = swapSides(endTurn(done));
    expect(canExecuteAttack(next, attackIndex(next.playerActivePokemon!, ember))).not.toBeNull();
    expect(canExecuteAttack(next, attackIndex(next.playerActivePokemon!, scratch))).toBeNull();
  });
});

describe("ESP (Misty's Psyduck)", () => {
  it("exactly 1 heads: draw a card", () => {
    const after = attack(vs(gym(90), dummy()), "Percepción Extrasensorial", [H, T, T]);
    expect(after.playerHand).toHaveLength(1);
    expect(after.opponentActivePokemon!.currentDamage).toBe(0);
  });
  it("exactly 2 heads: 20 damage", () => {
    const after = attack(vs(gym(90), dummy()), "Percepción Extrasensorial", [H, T, H]);
    expect(after.opponentActivePokemon!.currentDamage).toBe(20);
    expect(after.playerHand).toHaveLength(0);
  });
  it("3 heads: copy an attack of the Defending Pokémon (Psyduck stays Water)", () => {
    const defender = inPlay("Charmander", { set: "base" });
    const [scratch, ember] = (defender.pokemon as PokemonCard).attacks.map((a) => a.name);
    const after = attack(vs(gym(90), defender), "Percepción Extrasensorial", [H, H, H]);
    expect(step(after).options.map((o) => o.id)).toEqual([scratch, ember]);
    const done = choose(after, [scratch]);
    // Scratch 10, doubled by Charmander's Water Weakness
    expect(done.opponentActivePokemon!.currentDamage).toBe(20);
    expect(done.pendingAttackChoice).toBeUndefined();
  });
  it("3 heads: the copied attack's coins come with the answer", () => {
    const defender = inPlay("Pikachu", { set: "base" });
    const thunderJolt = (defender.pokemon as PokemonCard).attacks[1].name;
    const after = attack(vs(gym(90), defender), "Percepción Extrasensorial", [H, H, H]);
    const plan = getAttackChoiceCoinPlan(after, [thunderJolt]);
    expect(plan?.attack).toBe(1);
    expect(plan?.smokescreen).toBe(0);
    expect(() => choose(after, [thunderJolt])).toThrow();
    const done = choose(after, [thunderJolt], [T]);
    expect(done.opponentActivePokemon!.currentDamage).toBe(30);
    expect(done.playerActivePokemon!.currentDamage).toBe(10);
  });
});
