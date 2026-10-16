import { describe, it, expect } from "vitest";
import {
  runBatch,
  checkInvariants,
  ownedCardIds,
  buildRandomDeck,
  mulberry32,
  withRandom,
  playAIGame,
  randomLegalPolicy,
  createGreedyPolicy,
  DECK_SIZE,
  ExploreMemory,
  createExplorePolicy,
  stalemateTurn,
} from "@/domain/simulation";
import type { Deck } from "@/domain/decks";
import { ALL_CARDS } from "@/domain/catalog";
import { CardSet, PokemonStage } from "@/domain/constants";
import { buildDeckFromEntries } from "@/lib/gameState";
import { hasBasicPokemon } from "@/lib/gameState";
import { makeState, inPlay } from "./helpers/state";

describe("invariant checker", () => {
  it("flags a Pokémon left in play with damage >= HP, bad damage values and lost cards", () => {
    const state = makeState({ player: { active: inPlay("Machop", { damage: 50 }) }, opponent: { active: inPlay("Onix", { damage: 15 }) } });
    const ids = { player: [...ownedCardIds(state, "player")].sort(), opponent: [...ownedCardIds(state, "opponent")].sort() };
    const problems = checkInvariants(state, { initialIds: ids, before: state });
    expect(problems.join("\n")).toMatch(/50 damage >= 50 HP/);
    expect(problems.join("\n")).toMatch(/damage 15/);

    const lost = { ...state, playerHand: [], playerDeck: state.playerDeck.slice(1) };
    expect(checkInvariants(lost, { initialIds: ids, before: state }).join("\n")).toMatch(/card conservation \(player\)/);
  });

  it("flags pending flags carried across a turn change", () => {
    const state = makeState({ player: { active: inPlay("Machop") }, opponent: { active: inPlay("Onix") } });
    const ids = { player: [...ownedCardIds(state, "player")].sort(), opponent: [...ownedCardIds(state, "opponent")].sort() };
    const next = { ...state, turnNumber: state.turnNumber + 1, pendingForceSwitch: true };
    expect(checkInvariants(next, { initialIds: ids, before: state }).join("\n")).toMatch(/pendingForceSwitch/);
  });
});

describe("random decks", () => {
  it("are 60 cards with a Basic, max 4 copies, from the chosen sets plus Base Set Energy", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rng = mulberry32(seed);
      const deck = buildRandomDeck(rng, ["jungle"]);
      const cards = withRandom(rng, () => buildDeckFromEntries(deck.cards));
      expect(cards).toHaveLength(DECK_SIZE);
      expect(hasBasicPokemon(cards)).toBe(true);
      const counts = new Map<string, number>();
      for (const card of cards) if (card.kind !== "energy" || !card.isBasic) counts.set(card.name, (counts.get(card.name) ?? 0) + 1);
      expect(Math.max(...counts.values())).toBeLessThanOrEqual(4);
      expect(cards.every((c) => c.set === "Jungle" || c.kind === "energy")).toBe(true);
    }
  });
});

describe("headless games (Base Set + Jungle)", () => {
  it("are deterministic for a seed", () => {
    const play = () => {
      const rng = mulberry32(42);
      const deckA = buildRandomDeck(rng, ["base-set", "jungle"]);
      const deckB = buildRandomDeck(rng, ["base-set", "jungle"]);
      return playAIGame(deckA, deckB, { rng, policyA: randomLegalPolicy, policyB: createGreedyPolicy() });
    };
    expect(play()).toEqual(play());
  });

  it.each(["greedy", "random", "mixed"] as const)("30 seeded games (%s) finish without invariant violations", (policy) => {
    const result = runBatch({ games: 30, seed: 1000, sets: ["base-set", "jungle"], policy });
    const report = result.failures.map((f) => `seed ${f.seed}: ${f.problem} after "${f.action}"\n  ${f.lastEvents.slice(-8).join("\n  ")}`);
    expect(report).toEqual([]);
    expect(result.outcomes).toHaveLength(30);
  }, 120_000);
});

describe("headless games with Fossil", () => {
  it.each([
    ["fossil", "greedy"],
    ["fossil", "random"],
    ["fossil", "mixed"],
    ["base-set,jungle,fossil", "greedy"],
    ["base-set,jungle,fossil", "random"],
    ["base-set,jungle,fossil", "mixed"],
  ] as const)("30 seeded games (%s, %s) finish without invariant violations", (sets, policy) => {
    const result = runBatch({ games: 30, seed: 2000, sets: sets.split(",") as ("base-set" | "jungle" | "fossil")[], policy });
    const report = result.failures.map((f) => `seed ${f.seed}: ${f.problem} after "${f.action}"\n  ${f.lastEvents.slice(-8).join("\n  ")}`);
    expect(report).toEqual([]);
    expect(result.outcomes).toHaveLength(30);
  }, 120_000);
});

describe("headless games with Team Rocket", () => {
  it.each([
    ["team-rocket", "greedy"],
    ["team-rocket", "random"],
    ["team-rocket", "mixed"],
    ["base-set,jungle,fossil,team-rocket", "greedy"],
    ["base-set,jungle,fossil,team-rocket", "random"],
    ["base-set,jungle,fossil,team-rocket", "mixed"],
  ] as const)("30 seeded games (%s, %s) finish without invariant violations", (sets, policy) => {
    const result = runBatch({ games: 30, seed: 3000, sets: sets.split(",") as ("base-set" | "jungle" | "fossil" | "team-rocket")[], policy });
    const report = result.failures.map((f) => `seed ${f.seed}: ${f.problem} after "${f.action}"\n  ${f.lastEvents.slice(-8).join("\n  ")}`);
    expect(report).toEqual([]);
    expect(result.outcomes).toHaveLength(30);
  }, 120_000);

  it("random Team Rocket decks may hold special Energy (at most 4 copies each)", () => {
    let specials = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const deck = buildRandomDeck(mulberry32(seed), ["team-rocket"]);
      const cards = withRandom(mulberry32(seed), () => buildDeckFromEntries(deck.cards));
      const special = cards.filter((c) => c.kind === "energy" && !c.isBasic);
      specials += special.length;
      const counts = new Map<string, number>();
      for (const c of special) counts.set(c.name, (counts.get(c.name) ?? 0) + 1);
      expect(Math.max(0, ...counts.values())).toBeLessThanOrEqual(4);
    }
    expect(specials).toBeGreaterThan(0);
  });
});

describe("stalemates (Psychic Exchange keeps the deck size)", () => {
  // Erika's Exeggcute (Deflector) / Exeggutor (Psychic Exchange: shuffle the hand into the deck,
  // draw 5) with only Psychic Energy never deal damage, and with 6+ dead cards in hand Psychic
  // Exchange gives back the turn's draw: the deck never shrinks (the smart AI uses it to refill a
  // deck about to run out). 48 Stage 2 cards whose Stage 1 isn't in the deck stay dead in the hand.
  // The runner stops asking the policies at stalemateTurn: the deck-out then ends the game.
  const stallDeck = (): Deck => {
    const dead = ALL_CARDS.filter((c) => c.kind === "pokemon" && c.stage === PokemonStage.Stage2)
      .filter((c, i, all) => all.findIndex((o) => o.name === c.name) === i)
      .slice(0, 12);
    const entry = (c: { number: number; set: CardSet }, quantity: number) => ({ cardNumber: c.number, quantity, set: c.set === CardSet.BaseSet ? undefined : c.set });
    return {
      id: "stall",
      name: "Stall",
      image: "",
      cards: [
        { cardNumber: 43, quantity: 4, set: CardSet.GymHeroes },
        { cardNumber: 44, quantity: 4, set: CardSet.GymHeroes },
        { cardNumber: 101, quantity: 4 },
        ...dead.map((c) => entry(c, 4)),
      ],
    };
  };

  it.each(["random", "explore", "greedy"] as const)("%s bots still end the game (deck-out) before the turn cap", (name) => {
    for (let seed = 1; seed <= 6; seed++) {
      const rng = mulberry32(seed);
      const memory = new ExploreMemory();
      const policy = () => (name === "random" ? randomLegalPolicy : name === "explore" ? createExplorePolicy(memory) : createGreedyPolicy());
      const outcome = playAIGame(stallDeck(), stallDeck(), { rng, policyA: policy(), policyB: policy() });
      expect(outcome.turns).toBeLessThan(stalemateTurn(300) + 2 * DECK_SIZE);
    }
  }, 120_000);
});
