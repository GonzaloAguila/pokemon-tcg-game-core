import { describe, it, expect } from "vitest";
import { decks, resolveDeck } from "@/domain/decks";
import { buildDeckFromEntries, hasBasicPokemon } from "@/lib/gameState";
import { isLimitedInDeck } from "@/domain/cards";

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
