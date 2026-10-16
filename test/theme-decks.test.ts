import { describe, it, expect } from "vitest";
import { decks, gymLeaderDecks, getDeckById, resolveDeck } from "@/domain/decks";
import { buildDeckFromEntries, hasBasicPokemon } from "@/lib/gameState";
import { isLimitedInDeck } from "@/domain/cards";
import { ownerOf } from "@/domain/cards/owner";
import { CardSet } from "@/domain/constants";
import { createGreedyPolicy, mulberry32, playAIGame } from "@/domain/simulation";

describe("system (theme) decks are legal 60-card decks", () => {
  it.each(decks.map((d) => [d.name, d] as const))("%s", (_name, deck) => {
    // every entry resolves to a catalog card
    expect(resolveDeck(deck)).toHaveLength(deck.cards.length);

    const cards = buildDeckFromEntries(deck.cards);
    expect(cards).toHaveLength(60);

    // at most 4 copies by name (basic Energy excepted), across sets
    const copies = new Map<string, number>();
    for (const card of cards) {
      if (!isLimitedInDeck(card)) continue;
      copies.set(card.name, (copies.get(card.name) ?? 0) + 1);
    }
    const overLimit = [...copies].filter(([, n]) => n > 4);
    expect(overLimit).toEqual([]);

    expect(hasBasicPokemon(cards)).toBe(true);
  });
});

describe("Gym Heroes Gym Leader decks", () => {
  const leaders = [
    ["gym-heroes-brock", "Mazo de Brock", "Brock"],
    ["gym-heroes-misty", "Mazo de Misty", "Misty"],
    ["gym-heroes-erika", "Mazo de Erika", "Erika"],
    ["gym-heroes-lt-surge", "Mazo de Lt. Surge", "Lt. Surge"],
    ["gym-heroes-sabrina", "Mazo de Sabrina", "Sabrina"],
    ["gym-heroes-blaine", "Mazo de Blaine", "Blaine"],
  ] as const;

  it("one per leader of the set, found by id", () => {
    expect(gymLeaderDecks.map((d) => [d.id, d.name])).toEqual(leaders.map(([id, name]) => [id, name]));
    for (const [id] of leaders) expect(getDeckById(id)?.id).toBe(id);
    // The classic theme decks stay as they were
    expect(decks.some((d) => d.id.startsWith("gym-heroes-"))).toBe(false);
  });

  it.each(leaders)("%s: legal 60 cards from the Gym Heroes catalog (+ basic Energy), the leader's Pokémon only", (id, _name, leader) => {
    const deck = getDeckById(id)!;
    expect(resolveDeck(deck)).toHaveLength(deck.cards.length);
    const cards = buildDeckFromEntries(deck.cards);
    expect(cards).toHaveLength(60);
    expect(hasBasicPokemon(cards)).toBe(true);
    const copies = new Map<string, number>();
    for (const card of cards) if (isLimitedInDeck(card)) copies.set(card.name, (copies.get(card.name) ?? 0) + 1);
    expect([...copies].filter(([, n]) => n > 4)).toEqual([]);
    expect(cards.filter((c) => c.set !== CardSet.GymHeroes && !(c.kind === "energy" && c.isBasic)).map((c) => c.name)).toEqual([]);
    expect(cards.filter((c) => c.kind === "pokemon" && ownerOf(c) !== leader).map((c) => c.name)).toEqual([]);
    // Every evolution can come into play: its lower stage is in the deck
    const names = new Set(cards.map((c) => c.name));
    expect(cards.filter((c) => c.kind === "pokemon" && c.evolvesFrom && !names.has(c.evolvesFrom)).map((c) => c.name)).toEqual([]);
  });

  it("the AI plays them: seeded smart-vs-smart games end without invariant violations", () => {
    for (let i = 0; i < gymLeaderDecks.length; i++) {
      const rng = mulberry32(100 + i);
      const a = gymLeaderDecks[i];
      const b = gymLeaderDecks[(i + 1) % gymLeaderDecks.length];
      const outcome = playAIGame(a, b, { rng, policyA: createGreedyPolicy(), policyB: createGreedyPolicy() });
      expect(outcome.turns).toBeGreaterThan(0);
    }
  }, 120_000);
});
